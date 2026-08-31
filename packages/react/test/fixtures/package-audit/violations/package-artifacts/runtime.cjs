export function unsupportedRuntimeApis(values) {
  const first = values.at(0);
  const last = values.findLast(Boolean);
  const id = crypto.randomUUID();
  const copy = structuredClone({ first, last, id });
  document.addEventListener("scrollend", () => copy);
  return copy;
}
