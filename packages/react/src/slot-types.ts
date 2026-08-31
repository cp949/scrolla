import type * as React from "react";

/**
 * 계약(`docs/contracts/react-v1.md`, "Slot customization" 절)의 TypeScript 선언을
 * 그대로 보존한다. Track/thumb visual slot은 pointer, mouse, click, touch, wheel 계열
 * handler를 타입에서부터 제거해 런타임 차단이 아닌 타입 차단으로 invariant를 강제한다.
 */
export type ScrollaBlockedInputEventProp = {
  [K in keyof React.HTMLAttributes<HTMLDivElement>]-?: K extends `on${
    | "Pointer"
    | "Mouse"
    | "Click"
    | "DoubleClick"
    | "AuxClick"
    | "ContextMenu"
    | "Drag"
    | "GotPointer"
    | "LostPointer"
    | "Touch"
    | "Wheel"}${string}`
    ? K
    : never;
}[keyof React.HTMLAttributes<HTMLDivElement>];

/**
 * `React.RefAttributes<HTMLDivElement>` 대신 `ref`를 직접 선언한다. `@types/react@18`의
 * `RefAttributes["ref"]`는 legacy string ref(`LegacyRef<T>`)를 포함하는데, string ref는
 * React 19에서 제거됐고 이 파일의 ref 합성(`composeRefs`)도 지원할 수 없으므로 처음부터
 * 타입에서 배제한다(계약의 "Slot customization" 절 형태를 유지하되 이 부분만 좁힌다).
 */
export type ScrollaElementSlotProps = React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>;
};

export type ScrollaVisualSlotProps = Omit<
  ScrollaElementSlotProps,
  ScrollaBlockedInputEventProp
>;

/**
 * Thumb는 접근성 트리에 있어 library가 `role`/`tabIndex`/ARIA value model을 소유한다
 * (`aria-label`/`aria-labelledby`/`aria-describedby`는 예외로 소비자가 교체할 수 있다).
 * `ScrollaBlockedInputEventProp`와 같은 타입 차단 패턴이며, PIT-005 교훈에 따라
 * `-?`로 optional modifier를 제거한 뒤 조건부 key union을 뽑는다.
 */
export type ScrollaAriaOwnedProp = {
  [K in keyof React.HTMLAttributes<HTMLDivElement>]-?: K extends
    | "role"
    | "tabIndex"
    | "aria-controls"
    | "aria-valuenow"
    | "aria-valuemin"
    | "aria-valuemax"
    | "aria-orientation"
    | "aria-hidden"
    ? K
    : never;
}[keyof React.HTMLAttributes<HTMLDivElement>];

export type ScrollaThumbSlotProps = Omit<
  ScrollaVisualSlotProps,
  ScrollaAriaOwnedProp
>;

export interface ScrollaSlotProps {
  holder?: ScrollaElementSlotProps;
  wrapper?: ScrollaElementSlotProps;
  scroller?: ScrollaElementSlotProps;
  content?: ScrollaElementSlotProps;
  trackHorizontal?: ScrollaVisualSlotProps;
  thumbHorizontal?: ScrollaThumbSlotProps;
  trackVertical?: ScrollaVisualSlotProps;
  thumbVertical?: ScrollaThumbSlotProps;
}
