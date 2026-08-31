export interface AxisGeometryInput {
  readonly axisEnabled: boolean;
  readonly measurable: boolean;
  readonly viewportLength: number;
  readonly contentLength: number;
  readonly trackLength: number;
  readonly position: number;
  readonly minThumbSize: number;
}

export interface AxisGeometry {
  readonly viewportLength: number;
  readonly contentLength: number;
  readonly position: number;
  readonly maxPosition: number;
  readonly overflow: boolean;
  readonly thumbLength: number;
  readonly thumbOffset: number;
}

function normalizeMetric(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizePosition(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function zeroGeometry(
  viewportLength: number,
  contentLength: number,
): AxisGeometry {
  return Object.freeze({
    viewportLength,
    contentLength,
    position: 0,
    maxPosition: 0,
    overflow: false,
    thumbLength: 0,
    thumbOffset: 0,
  });
}

export function calculateAxisGeometry(
  input: AxisGeometryInput,
): AxisGeometry {
  const viewportLength = normalizeMetric(input.viewportLength);
  const contentLength = normalizeMetric(input.contentLength);
  const trackLength = normalizeMetric(input.trackLength);
  const measurable =
    input.measurable && viewportLength > 0 && trackLength > 0;

  if (!measurable) {
    return zeroGeometry(0, 0);
  }

  const rawMaxPosition = Math.max(contentLength - viewportLength, 0);
  const overflow = input.axisEnabled && rawMaxPosition > 0;

  if (!overflow) {
    return zeroGeometry(viewportLength, contentLength);
  }

  const idealThumbLength =
    trackLength === contentLength
      ? viewportLength
      : trackLength * (viewportLength / contentLength);
  const minThumbSize = normalizeMetric(input.minThumbSize);
  const thumbLength = Math.min(
    trackLength,
    Math.max(minThumbSize, idealThumbLength),
  );
  const travel = trackLength - thumbLength;
  const maxPosition = rawMaxPosition;
  const position = Math.min(
    Math.max(normalizePosition(input.position), 0),
    maxPosition,
  );

  return Object.freeze({
    viewportLength,
    contentLength,
    position,
    maxPosition,
    overflow: true,
    thumbLength,
    thumbOffset: travel * (position / maxPosition),
  });
}
