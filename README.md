# Scrolla

`Scrolla`는 native scrolling을 유지하면서 시각적인 custom scrollbar를 제공하는 React library입니다.

## 제공 기능

- 수직·수평 native scrolling과 overflow 기반 thumb 표시
- pointer drag, track click, wheel, keyboard 조작
- RTL logical coordinate, 중첩 scrollbar와 기본 scroll chaining
- `ResizeObserver` 자동 갱신과 `refresh()`
- `scrollTo()`, `scrollBy()`, `getState()` imperative API
- auto-hide, focus, keyboard와 ARIA 접근성
- React 18/19, SSR과 hydration에 안정적인 초기 마크업
- SCSS 기반 기본 스타일과 CSS custom property/slot customization

## 설치

```bash
npm install @cp949/scrolla-react
```

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

상세 설치·사용법은 [npm package 문서](packages/react/README.md)를 참고하세요.

## 브라우저 지원

| 구분 | 범위 |
| --- | --- |
| 하한 목표 | Chrome Desktop 75 |
| 실제 검증 | Linux 컨테이너 Chrome 83, 최신 Chrome Desktop |

지원 범위와 알려진 제한은 [브라우저 지원 문서](BROWSER-SUPPORT.md)에서 확인하세요.

## 문서

- [npm 사용 문서](packages/react/README.md)
- [공개 API 계약](docs/contracts/react-v1.md)
- [현재 기능과 범위](docs/requirements/v1.md)
- [브라우저 지원](BROWSER-SUPPORT.md)
- [전체 문서 안내](docs/README.md)

## License

MIT
