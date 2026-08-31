export function mirrorOffset(offset: number, travel: number): number {
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(travel) ||
    travel <= 0
  ) {
    return 0;
  }
  return travel - offset;
}

// keyboard arrow 처리에서 재사용한다. 화면 방향을 보존한 physical delta를
// effective direction이 rtl인지에 따라 logical delta로 뒤집는다.
export function mirrorLogicalDelta(
  physicalDelta: number,
  mirror: boolean,
): number {
  if (!Number.isFinite(physicalDelta)) {
    return 0;
  }
  return mirror ? -physicalDelta : physicalDelta;
}
