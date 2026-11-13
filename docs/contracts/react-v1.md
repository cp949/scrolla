# React 공개 API 계약

이 문서는 `@cp949/scrolla-react`의 현재 공개 interface와 observable behavior를 정의합니다.

## 용어와 DOM

`Scrolla`는 native scroller와 두 축의 custom scrollbar를 소유합니다.

```text
holder > wrapper > scroller > content
holder > trackVertical > thumbVertical
holder > trackHorizontal > thumbHorizontal
```

8개 element는 항상 같은 순서로 렌더링됩니다. 측정 전후에 element를 교체하지 않습니다. `direction="auto"`의 첫 render는 `ltr`이며 mount 후 computed direction을 반영합니다.

## 공개 타입

```ts
type ScrollaAxis = "both" | "horizontal" | "vertical";
type ScrollaDirection = "auto" | "ltr" | "rtl";
type ScrollaPhysicalAxis = "horizontal" | "vertical";

interface ScrollPosition {
  readonly x: number;
  readonly y: number;
}
interface ScrollaState {
  readonly position: ScrollPosition;
  readonly maxPosition: ScrollPosition;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly contentSize: { readonly width: number; readonly height: number };
  readonly overflow: {
    readonly horizontal: boolean;
    readonly vertical: boolean;
  };
  readonly scrolling: boolean;
  readonly draggingAxis: ScrollaPhysicalAxis | null;
  readonly visibility: "visible" | "hidden";
}
type ScrollaChangeReason =
  | "init"
  | "scroll"
  | "geometry"
  | "interaction"
  | "visibility";
interface ScrollaChangeMeta {
  readonly reasons: readonly ScrollaChangeReason[];
}
interface ScrollaHandle {
  refresh(): void;
  scrollTo(position: Partial<ScrollPosition>): void;
  scrollBy(delta: Partial<ScrollPosition>): void;
  getState(): ScrollaState;
}
```

`ScrollaProps`는 `children`, `id`, `className`, `style`, `axis`, `direction`, `autoHide`, `autoHideDelay`, `scrollIdleDelay`, `minThumbSize`, `initialPosition`, `onStateChange`, `slotProps`를 제공합니다. 정확한 TypeScript 선언은 package export를 기준으로 합니다.

## 기본값과 명령

| Prop              | 기본값           |
| ----------------- | ---------------- |
| `axis`            | `"both"`         |
| `direction`       | `"auto"`         |
| `autoHide`        | `false`          |
| `autoHideDelay`   | `1000`           |
| `scrollIdleDelay` | `120`            |
| `minThumbSize`    | `24`             |
| `initialPosition` | `{ x: 0, y: 0 }` |

`refresh()`는 비동기 geometry 갱신을 예약합니다. `scrollTo()`와 `scrollBy()`는 logical position을 사용하고 범위를 clamp합니다. non-finite 값은 동기 `RangeError`입니다. unmount 뒤 이전 handle의 이동 명령은 no-op이며 `getState()`는 마지막 snapshot을 반환합니다.

## 상태와 입력

- 최초 측정과 initial position 적용 뒤 `init` callback을 한 번 호출합니다.
- 같은 frame의 변경은 하나의 snapshot과 callback으로 합칩니다.
- Arrow, Page, Home, End keyboard command는 축과 RTL 방향을 반영합니다.
- thumb와 track의 pointer 입력은 geometry hit-test가 소유합니다.
- wheel은 listener로 가로채지 않고 native scroller와 browser chaining을 사용합니다.
- `autoHide`는 hover, focus, drag, scrolling 원인이 남아 있는 동안 표시합니다.
- focus와 ARIA value는 library가 소유하며, label 계열 ARIA 속성은 consumer가 지정할 수 있습니다.

## slot과 CSS

slot은 `holder`, `wrapper`, `scroller`, `content`, `trackHorizontal`, `thumbHorizontal`, `trackVertical`, `thumbVertical`입니다. consumer는 class, style, ref와 허용된 DOM/ARIA 속성을 전달할 수 있습니다. track/thumb의 pointer·mouse·touch·wheel handler와 thumb의 library-owned ARIA 속성은 타입으로 제한됩니다.

기본 style은 `@cp949/scrolla-react/styles.css`를 명시적으로 import해야 합니다. 공개 class는 `.scrolla`와 그 하위 slot class이며, CSS custom property로 색상·크기·radius·fade를 조정할 수 있습니다.
