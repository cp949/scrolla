import { describe, expect, test } from "vitest";
import {
  logicalPositionForCenteredTrackPointer,
  logicalPositionForThumbStart,
  normalizeInteractionRectangle,
  resolveInteractionHit,
  type InteractionGeometry,
} from "../src/core/interaction-geometry.js";

const geometry: InteractionGeometry = Object.freeze({
  horizontal: Object.freeze({
    track: Object.freeze({
      left: 10,
      top: 90,
      right: 110,
      bottom: 100,
      width: 100,
      height: 10,
    }),
    thumbLength: 25,
    thumbOffset: 25,
    maxPosition: 300,
    overflow: true,
  }),
  vertical: Object.freeze({
    track: Object.freeze({
      left: 100,
      top: -20,
      right: 110,
      bottom: 80,
      width: 10,
      height: 100,
    }),
    thumbLength: 25,
    thumbOffset: 50,
    maxPosition: 600,
    overflow: true,
  }),
});

describe("interaction geometry", () => {
  test.each([
    [
      "viewport 밖 유한 음수 origin",
      { left: -20, top: -10, width: 30, height: 40 },
      { left: -20, top: -10, right: 10, bottom: 30, width: 30, height: 40 },
    ],
    [
      "non-finite origin",
      { left: Number.NaN, top: 2, width: 30, height: 40 },
      { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
    ],
    [
      "non-finite size",
      { left: 1, top: 2, width: Number.POSITIVE_INFINITY, height: 40 },
      { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
    ],
    [
      "negative size",
      { left: 1, top: 2, width: -30, height: 40 },
      { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
    ],
  ])("%s을 canonical rectangle으로 만든다", (_name, source, expected) => {
    expect(normalizeInteractionRectangle(source)).toEqual(expected);
  });

  test("thumb와 track의 half-open hit region을 축 좌표와 함께 선택한다", () => {
    expect(resolveInteractionHit(geometry, { x: 40, y: 95 })).toEqual({
      axis: "horizontal",
      kind: "thumb",
      pointerCoordinate: 40,
    });
    expect(resolveInteractionHit(geometry, { x: 60, y: 95 })).toEqual({
      axis: "horizontal",
      kind: "track",
      pointerCoordinate: 60,
    });
    expect(resolveInteractionHit(geometry, { x: 110, y: 95 })).toBeNull();
    expect(resolveInteractionHit(geometry, { x: 105, y: -10 })).toEqual({
      axis: "vertical",
      kind: "track",
      pointerCoordinate: -10,
    });
  });

  test("한 축 thumb와 다른 축 track overlap은 thumb를 선택한다", () => {
    const overlap: InteractionGeometry = {
      horizontal: geometry.horizontal,
      vertical: {
        ...geometry.vertical,
        track: normalizeInteractionRectangle({
          left: 50,
          top: 90,
          width: 10,
          height: 100,
        }),
      },
    };

    expect(resolveInteractionHit(overlap, { x: 55, y: 95 })).toEqual({
      axis: "horizontal",
      kind: "thumb",
      pointerCoordinate: 55,
    });
  });

  test("두 thumb 또는 thumb 없는 두 track overlap은 선택하지 않는다", () => {
    const overlappingThumbs: InteractionGeometry = {
      horizontal: geometry.horizontal,
      vertical: {
        ...geometry.vertical,
        track: normalizeInteractionRectangle({
          left: 50,
          top: 90,
          width: 10,
          height: 100,
        }),
        thumbOffset: 0,
      },
    };
    const overlappingTracks: InteractionGeometry = {
      horizontal: geometry.horizontal,
      vertical: {
        ...geometry.vertical,
        track: normalizeInteractionRectangle({
          left: 70,
          top: 90,
          width: 10,
          height: 100,
        }),
      },
    };

    expect(
      resolveInteractionHit(overlappingThumbs, { x: 55, y: 95 }),
    ).toBeNull();
    expect(
      resolveInteractionHit(overlappingTracks, { x: 75, y: 95 }),
    ).toBeNull();
  });

  test.each([
    ["no-overflow", { ...geometry.horizontal, overflow: false }],
    [
      "zero geometry",
      {
        ...geometry.horizontal,
        track: normalizeInteractionRectangle({
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        }),
      },
    ],
  ] as const)("%s axis는 hit가 아니다", (_name, horizontal) => {
    expect(
      resolveInteractionHit(
        { horizontal, vertical: { ...geometry.vertical, overflow: false } },
        { x: 40, y: 95 },
      ),
    ).toBeNull();
  });

  test("thumb cross-axis 두께가 24px 미만이면 대칭 padding으로 hit 두께를 24px까지 넓힌다", () => {
    // horizontal thumb: track.top=90, track.bottom=100(두께 10) -> pad=(24-10)/2=7 -> [83,107)
    expect(resolveInteractionHit(geometry, { x: 40, y: 83 })).toEqual({
      axis: "horizontal",
      kind: "thumb",
      pointerCoordinate: 40,
    });
    expect(resolveInteractionHit(geometry, { x: 40, y: 82 })).toBeNull();

    // vertical thumb: track.left=100, track.right=110(두께 10) -> pad=7 -> [93,117)
    expect(resolveInteractionHit(geometry, { x: 93, y: 40 })).toEqual({
      axis: "vertical",
      kind: "thumb",
      pointerCoordinate: 40,
    });
    expect(resolveInteractionHit(geometry, { x: 92, y: 40 })).toBeNull();
  });

  test("thumb 확장은 cross-axis에만 적용하고 along-axis(thumb 길이)는 넓히지 않는다", () => {
    // x=34는 horizontal thumb의 along-axis 범위([35,60)) 밖이라 track hit로 남는다.
    expect(resolveInteractionHit(geometry, { x: 34, y: 95 })).toEqual({
      axis: "horizontal",
      kind: "track",
      pointerCoordinate: 34,
    });
  });

  test("track cross-axis 두께가 이미 24px 이상이면 padding을 추가하지 않는다", () => {
    const thickTrack: InteractionGeometry = {
      horizontal: {
        ...geometry.horizontal,
        track: normalizeInteractionRectangle({
          left: 10,
          top: 80,
          width: 100,
          height: 30,
        }),
      },
      vertical: geometry.vertical,
    };

    // thumb cross-axis(y)는 여전히 track 그대로([80,110)); pad 없으므로 바로 밖은 miss.
    expect(resolveInteractionHit(thickTrack, { x: 40, y: 79 })).toBeNull();
  });

  test("두 thumb가 모두 끝까지 스크롤되면 cross-axis padding이 코너 모호 구간을 넓혀 단일 thumb 판정을 null로 바꿀 수 있다(알려진 트레이드오프)", () => {
    // holder 100x100, 두께 12px 기본값, 두 thumb 모두 끝(우하단)까지 스크롤된 상태.
    const cornerGeometry: InteractionGeometry = {
      vertical: {
        track: normalizeInteractionRectangle({
          left: 88,
          top: 0,
          width: 12,
          height: 100,
        }),
        thumbLength: 20,
        thumbOffset: 80,
        maxPosition: 600,
        overflow: true,
      },
      horizontal: {
        track: normalizeInteractionRectangle({
          left: 0,
          top: 88,
          width: 100,
          height: 12,
        }),
        thumbLength: 20,
        thumbOffset: 80,
        maxPosition: 300,
        overflow: true,
      },
    };

    // padding 없이는 x=84,y=90이 horizontal thumb만 단일하게 가리켰다(vertical thumb의
    // 원래 x 범위 [88,100) 밖). padding(pad=6, x 범위 [82,106))이 vertical thumb까지
    // 걸치게 만들어 두 thumb 겹침이 되고, 기존 규칙대로 null이 된다.
    expect(resolveInteractionHit(cornerGeometry, { x: 84, y: 90 })).toBeNull();

    // vertical thumb의 padding 범위(x < 82) 밖이면 같은 thumb 안에서도 다시 단일 판정된다.
    expect(resolveInteractionHit(cornerGeometry, { x: 81, y: 90 })).toEqual({
      axis: "horizontal",
      kind: "thumb",
      pointerCoordinate: 81,
    });
  });

  test("non-finite client coordinate는 hit가 아니다", () => {
    expect(
      resolveInteractionHit(geometry, { x: Number.NaN, y: 95 }),
    ).toBeNull();
    expect(
      resolveInteractionHit(geometry, { x: 40, y: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });

  test.each([
    ["fractional", 37.5, 100, 25, 300, 150],
    ["lower clamp", -1, 100, 25, 300, 0],
    ["upper clamp", 99, 100, 25, 300, 300],
    ["zero travel", 10, 25, 25, 300, 0],
    ["non-finite input", Number.NaN, 100, 25, 300, 0],
    ["invalid thumb", 10, 100, -1, 300, 0],
    ["invalid range", 10, 100, 25, Number.POSITIVE_INFINITY, 0],
  ])(
    "thumb start %s을 logical position으로 mapping한다",
    (_name, desired, track, thumb, max, expected) => {
      expect(logicalPositionForThumbStart(desired, track, thumb, max)).toBe(
        expected,
      );
    },
  );

  test.each([
    ["lower clamp", -10, 0],
    ["middle", 60, 150],
    ["upper clamp", 120, 300],
  ])(
    "pointer-centered track %s을 logical position으로 mapping한다",
    (_name, pointerCoordinate, expected) => {
      expect(
        logicalPositionForCenteredTrackPointer(
          pointerCoordinate,
          10,
          100,
          25,
          300,
        ),
      ).toBe(expected);
    },
  );

  test.each([
    ["fractional", 20, 100, 25, 225, 165],
    ["lower clamp", -1, 100, 25, 225, 225],
    ["upper clamp", 99, 100, 25, 225, 0],
    ["zero travel은 mirror와 무관하게 0이다", 10, 25, 25, 225, 0],
  ])(
    "mirror=true는 thumb start %s을 반대쪽 끝 기준 logical position으로 mapping한다",
    (_name, desired, track, thumb, max, expected) => {
      expect(
        logicalPositionForThumbStart(desired, track, thumb, max, true),
      ).toBe(expected);
    },
  );

  test("mirror=true는 pointer-centered track hit도 반대쪽 끝 기준으로 mapping한다", () => {
    // desiredThumbStart = 42.5 - 10 - 25/2 = 20 -> mirror(20, travel=75) = 55 -> 55/75*225 = 165
    expect(
      logicalPositionForCenteredTrackPointer(42.5, 10, 100, 25, 225, true),
    ).toBe(165);
  });
});
