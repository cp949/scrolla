# @cp949/scrolla-react

native scrolling을 유지하면서 custom scrollbar를 제공하는 React 18/19 component입니다. 실제 `scrollTop`과 `scrollLeft`는 native scroller가 소유하고, track과 thumb는 그 위에 overlay로 표시됩니다.

## 설치

```bash
npm install @cp949/scrolla-react
```

CSS는 자동 주입되지 않으므로 애플리케이션의 전역 CSS 진입점 또는 component에서 명시적으로 import해야 합니다.

```tsx
import "@cp949/scrolla-react/styles.css";
```

## 기본 사용

```tsx
import { Scrolla } from "@cp949/scrolla-react";
import "@cp949/scrolla-react/styles.css";

export function Example() {
  return (
    <Scrolla axis="vertical" style={{ height: 240, width: 320 }}>
      <div style={{ height: 800 }}>내용</div>
    </Scrolla>
  );
}
```

`Scrolla` holder에는 overflow를 측정할 수 있는 명시적인 크기(`height`와 `width`, 또는 이를 결정하는 layout)가 필요합니다.

## 주요 props

| Prop              | 기본값           | 설명                                     |
| ----------------- | ---------------- | ---------------------------------------- |
| `axis`            | `"both"`         | `"both"`, `"horizontal"`, `"vertical"`   |
| `direction`       | `"auto"`         | `"auto"`, `"ltr"`, `"rtl"`               |
| `autoHide`        | `false`          | 유휴 상태에서 scrollbar를 숨김           |
| `autoHideDelay`   | `1000`           | 숨김 전 대기 시간(ms)                    |
| `scrollIdleDelay` | `120`            | 마지막 scroll 후 idle 판정 시간(ms)      |
| `minThumbSize`    | `24`             | thumb 최소 길이(px)                      |
| `initialPosition` | `{ x: 0, y: 0 }` | 최초 측정 뒤 한 번 적용할 위치           |
| `onStateChange`   | -                | 상태와 변경 원인을 받는 callback         |
| `slotProps`       | -                | 위 slot의 class, style, ref, 접근성 속성 |

## imperative API

```tsx
import { useRef } from "react";
import { Scrolla, type ScrollaHandle } from "@cp949/scrolla-react";

const ref = useRef<ScrollaHandle>(null);

<>
  <button onClick={() => ref.current?.scrollTo({ y: 200 })}>아래로 이동</button>
  <Scrolla ref={ref} style={{ height: 240, width: 320 }}>
    <div style={{ height: 800 }}>내용</div>
  </Scrolla>
</>;
```

- `refresh()`: geometry 갱신을 예약합니다.
- `scrollTo(position)`: logical absolute position으로 이동합니다.
- `scrollBy(delta)`: 현재 위치에서 이동합니다.
- `getState()`: 최신 `ScrollaState`를 반환합니다.

범위 밖의 유한한 위치는 clamp합니다. `NaN`, `Infinity`, `-Infinity`는 `RangeError`입니다. unmount 뒤의 이전 handle 명령은 no-op입니다.

## SSR과 hydration

공개 entry는 `'use client'` 경계를 포함합니다. Server render와 첫 client render는 같은 DOM 구조를 만들며, 측정·listener·observer·RAF는 mount 뒤 시작합니다. `direction="auto"`는 mount 전 `ltr`로 렌더링한 뒤 실제 computed direction을 반영합니다.

## customization

CSS custom property와 8개 slot(`holder`, `wrapper`, `scroller`, `content`, `trackHorizontal`, `thumbHorizontal`, `trackVertical`, `thumbVertical`)을 사용할 수 있습니다.

```css
.scrolla {
  --scrolla-size: 12px;
  --scrolla-thumb-color: rgba(0, 0, 0, 0.35);
  --scrolla-thumb-hover-color: rgba(0, 0, 0, 0.5);
}
```

Track과 thumb의 pointer/mouse/touch/wheel handler와 thumb의 library-owned ARIA 속성은 타입으로 제한됩니다. 전체 DOM 구조와 공개 타입은 [React 공개 API 계약](https://github.com/cp949/scrolla/blob/main/docs/contracts/react-v1.md)을 참고하세요.

## 브라우저 지원

- 하한 목표: Chrome Desktop 75
- 실제 검증: Linux 컨테이너 Chrome 83, 최신 Chrome Desktop

scrollbar 폭, classic/overlay scrollbar, touch, pointer capture, RTL과 `:focus-visible`은 browser·OS 환경에 따라 달라질 수 있습니다. 자세한 내용은 [브라우저 지원 문서](https://github.com/cp949/scrolla/blob/main/BROWSER-SUPPORT.md)를 확인하세요.

## License

MIT
