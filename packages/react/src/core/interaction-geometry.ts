import type { ScrollaPhysicalAxis } from "../value-types.js";
import { mirrorOffset } from "./rtl/mirror.js";

export interface InteractionRectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface AxisInteractionGeometry {
  readonly track: InteractionRectangle;
  readonly thumbLength: number;
  readonly thumbOffset: number;
  readonly maxPosition: number;
  readonly overflow: boolean;
}

export interface InteractionGeometry {
  readonly horizontal: AxisInteractionGeometry;
  readonly vertical: AxisInteractionGeometry;
}

export type InteractionHit = Readonly<{
  axis: ScrollaPhysicalAxis;
  kind: "thumb" | "track";
  pointerCoordinate: number;
}>;

export interface InteractionRectangleSource {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function zeroRectangle(): InteractionRectangle {
  return Object.freeze({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  });
}

export function normalizeInteractionRectangle(
  source: InteractionRectangleSource,
): InteractionRectangle {
  if (
    !Number.isFinite(source.left) ||
    !Number.isFinite(source.top) ||
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    source.width < 0 ||
    source.height < 0
  ) {
    return zeroRectangle();
  }

  return Object.freeze({
    left: source.left,
    top: source.top,
    right: source.left + source.width,
    bottom: source.top + source.height,
    width: source.width,
    height: source.height,
  });
}

function isWithin(value: number, start: number, end: number): boolean {
  return value >= start && value < end;
}

function axisTrackLength(
  axis: ScrollaPhysicalAxis,
  track: InteractionRectangle,
): number {
  return axis === "horizontal" ? track.width : track.height;
}

function axisPointerCoordinate(
  axis: ScrollaPhysicalAxis,
  coordinate: Readonly<{ x: number; y: number }>,
): number {
  return axis === "horizontal" ? coordinate.x : coordinate.y;
}

function hasUsableAxisGeometry(
  axis: ScrollaPhysicalAxis,
  geometry: AxisInteractionGeometry,
): boolean {
  const trackLength = axisTrackLength(axis, geometry.track);
  return (
    geometry.overflow &&
    Number.isFinite(geometry.maxPosition) &&
    geometry.maxPosition > 0 &&
    Number.isFinite(trackLength) &&
    trackLength > 0 &&
    Number.isFinite(geometry.track.width) &&
    geometry.track.width > 0 &&
    Number.isFinite(geometry.track.height) &&
    geometry.track.height > 0
  );
}

function containsTrack(
  axis: ScrollaPhysicalAxis,
  track: InteractionRectangle,
  coordinate: Readonly<{ x: number; y: number }>,
): boolean {
  if (axis === "horizontal") {
    return (
      isWithin(coordinate.x, track.left, track.right) &&
      isWithin(coordinate.y, track.top, track.bottom)
    );
  }
  return (
    isWithin(coordinate.x, track.left, track.right) &&
    isWithin(coordinate.y, track.top, track.bottom)
  );
}

// WCAG 2.5.8 AA(최소 24 CSS px target size). along-axis(thumb 길이)는 이미
// minThumbSize(기본 24px)로 소비자가 통제하므로 넓히지 않고, cross-axis(두께,
// 기본 12px)만 실측 track rect 기준으로 대칭 padding한다. Track의 jump-hit
// 영역(containsTrack)은 이 확장과 무관하게 그대로 유지한다.
//
// 알려진 한계: v1에는 corner element가 없고(react-v1.md) 두 track이 각각 전체 길이로
// 그려지므로(_layout.scss) 두 thumb가 모두 끝(예: content 우하단)까지 스크롤되면 원래도
// 코너 부근에서 두 thumb rect가 겹칠 수 있었다. 이 padding은 그 코너 모호 구간을 몇 px
// 더 넓힐 뿐이며, resolveInteractionHit의 기존 "두 thumb 겹침은 선택하지 않는다" 규칙이
// 그대로 적용돼 결과는 (오조작이 아니라) null이다 — 사용자가 코너에서 살짝 벗어나 다시
// 누르면 grab된다. 별도 public prop 없이 이 트레이드오프를 사용한다.
const MIN_THUMB_HIT_THICKNESS = 24;

function crossAxisPad(
  axis: ScrollaPhysicalAxis,
  track: InteractionRectangle,
): number {
  const crossAxisLength = axis === "horizontal" ? track.height : track.width;
  return Math.max(0, (MIN_THUMB_HIT_THICKNESS - crossAxisLength) / 2);
}

function containsThumb(
  axis: ScrollaPhysicalAxis,
  geometry: AxisInteractionGeometry,
  coordinate: Readonly<{ x: number; y: number }>,
): boolean {
  const trackLength = axisTrackLength(axis, geometry.track);
  const travel = trackLength - geometry.thumbLength;
  if (
    !Number.isFinite(geometry.thumbLength) ||
    !Number.isFinite(geometry.thumbOffset) ||
    geometry.thumbLength <= 0 ||
    geometry.thumbLength > trackLength ||
    geometry.thumbOffset < 0 ||
    geometry.thumbOffset > travel
  ) {
    return false;
  }

  const pad = crossAxisPad(axis, geometry.track);
  if (axis === "horizontal") {
    return (
      isWithin(
        coordinate.x,
        geometry.track.left + geometry.thumbOffset,
        geometry.track.left + geometry.thumbOffset + geometry.thumbLength,
      ) &&
      isWithin(
        coordinate.y,
        geometry.track.top - pad,
        geometry.track.bottom + pad,
      )
    );
  }
  return (
    isWithin(
      coordinate.x,
      geometry.track.left - pad,
      geometry.track.right + pad,
    ) &&
    isWithin(
      coordinate.y,
      geometry.track.top + geometry.thumbOffset,
      geometry.track.top + geometry.thumbOffset + geometry.thumbLength,
    )
  );
}

export function resolveInteractionHit(
  geometry: InteractionGeometry,
  coordinate: Readonly<{ x: number; y: number }>,
): InteractionHit | null {
  if (!Number.isFinite(coordinate.x) || !Number.isFinite(coordinate.y)) {
    return null;
  }

  const axes: readonly ScrollaPhysicalAxis[] = ["horizontal", "vertical"];
  const thumbs = axes.flatMap((axis) => {
    const axisGeometry = geometry[axis];
    if (
      !hasUsableAxisGeometry(axis, axisGeometry) ||
      !containsThumb(axis, axisGeometry, coordinate)
    ) {
      return [];
    }
    return [
      {
        axis,
        kind: "thumb" as const,
        pointerCoordinate: axisPointerCoordinate(axis, coordinate),
      },
    ];
  });
  if (thumbs.length === 1) {
    return Object.freeze(thumbs[0]!);
  }
  if (thumbs.length > 1) {
    return null;
  }

  const tracks = axes.flatMap((axis) => {
    const axisGeometry = geometry[axis];
    if (
      !hasUsableAxisGeometry(axis, axisGeometry) ||
      !containsTrack(axis, axisGeometry.track, coordinate)
    ) {
      return [];
    }
    return [
      {
        axis,
        kind: "track" as const,
        pointerCoordinate: axisPointerCoordinate(axis, coordinate),
      },
    ];
  });
  return tracks.length === 1 ? Object.freeze(tracks[0]!) : null;
}

export function logicalPositionForThumbStart(
  desiredThumbStart: number,
  trackLength: number,
  thumbLength: number,
  maxPosition: number,
  mirror = false,
): number {
  if (
    !Number.isFinite(desiredThumbStart) ||
    !Number.isFinite(trackLength) ||
    !Number.isFinite(thumbLength) ||
    !Number.isFinite(maxPosition) ||
    trackLength <= 0 ||
    thumbLength < 0 ||
    maxPosition <= 0
  ) {
    return 0;
  }
  const travel = trackLength - thumbLength;
  if (!Number.isFinite(travel) || travel <= 0) {
    return 0;
  }
  const clamped = Math.min(Math.max(desiredThumbStart, 0), travel);
  const ratio = mirror ? mirrorOffset(clamped, travel) : clamped;
  return (ratio / travel) * maxPosition;
}

export function logicalPositionForCenteredTrackPointer(
  pointerCoordinate: number,
  trackStart: number,
  trackLength: number,
  thumbLength: number,
  maxPosition: number,
  mirror = false,
): number {
  return logicalPositionForThumbStart(
    pointerCoordinate - trackStart - thumbLength / 2,
    trackLength,
    thumbLength,
    maxPosition,
    mirror,
  );
}
