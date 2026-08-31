// ADR-006: browser별 RTL scrollLeft raw 모델을 문헌으로 추정하지 않고
// 런타임 probe로 감지한다. reverse(IE/EdgeHTML) 패턴은 지원 계약 밖이라
// negative로 접는다 — 그래서 최초 읽기값이 양수인지만 판별하고,
// classic 3-way 감지의 두 번째(쓰기 후 읽기) 단계는 두지 않는다.

export type ScrollLeftModel = "default" | "negative";

export interface ScrollProbeElement {
  dir: string;
  readonly style: { cssText: string };
  scrollLeft: number;
  appendChild(child: ScrollProbeElement): void;
}

export interface ScrollProbeDocument {
  createElement(tagName: "div"): ScrollProbeElement;
  readonly body: {
    appendChild(node: ScrollProbeElement): void;
    removeChild(node: ScrollProbeElement): void;
  };
}

const modelCache = new WeakMap<ScrollProbeDocument, ScrollLeftModel>();

function measureScrollLeftModel(doc: ScrollProbeDocument): ScrollLeftModel {
  const outer = doc.createElement("div");
  outer.dir = "rtl";
  outer.style.cssText =
    "position:absolute;visibility:hidden;top:-9999px;left:-9999px;width:1px;height:1px;overflow:scroll;";
  const inner = doc.createElement("div");
  inner.style.cssText = "width:2px;height:1px;";
  outer.appendChild(inner);
  doc.body.appendChild(outer);

  const model: ScrollLeftModel = outer.scrollLeft > 0 ? "default" : "negative";

  doc.body.removeChild(outer);
  return model;
}

export function getScrollLeftModel(doc: ScrollProbeDocument): ScrollLeftModel {
  const cached = modelCache.get(doc);
  if (cached !== undefined) {
    return cached;
  }
  const model = measureScrollLeftModel(doc);
  modelCache.set(doc, model);
  return model;
}

// Document.body.appendChild는 <T extends Node>이라 구조적으로 ScrollProbeDocument에
// 대입할 수 없다(제네릭 variance). 실제 DOM은 런타임에 필요한 형태를 항상 만족하므로
// 이 경계에서만 단언한다 — 테스트는 getScrollLeftModel에 stub을 직접 주입한다.
export function getDocumentScrollLeftModel(doc: Document): ScrollLeftModel {
  return getScrollLeftModel(doc as unknown as ScrollProbeDocument);
}

function normalizeFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function toLogicalX(
  rawScrollLeft: number,
  model: ScrollLeftModel,
  maxPosition: number,
): number {
  const raw = normalizeFinite(rawScrollLeft);
  const max = normalizeFinite(maxPosition);
  return model === "default" ? max - raw : 0 - raw;
}

export function toRawScrollLeft(
  logicalX: number,
  model: ScrollLeftModel,
  maxPosition: number,
): number {
  const logical = normalizeFinite(logicalX);
  const max = normalizeFinite(maxPosition);
  return model === "default" ? max - logical : 0 - logical;
}
