# 브라우저 지원

## 현재 범위

Scrolla의 browser 하한 목표는 Chrome Desktop 75입니다. 현재 자동화 검증은 Linux 컨테이너의 Chrome 83과 최신 Chrome Desktop에서 수행했으며, 두 환경에서 핵심 계약 시나리오 18건이 통과했습니다. Chrome Desktop 75 자체를 직접 실행한 결과는 포함하지 않습니다.

## 지원 구분

| 구분 | 범위 | 상태 |
| --- | --- | --- |
| 하한 목표 | Chrome Desktop 75 | 호환성 목표. 직접 실행 검증은 미실시 |
| 검증 환경 | Linux 컨테이너 Chrome 83 | 핵심 시나리오 검증 완료 |
| 지속 검증 | 최신 Chrome Desktop | 회귀 검증 환경 |
| 비공식 기대 | 다른 desktop Chromium | 동작을 기대할 수 있으나 보장하지 않음 |
| 지원 제외 | 모바일 browser, Android/iOS WebView, embedded WebView, Firefox, Safari | 공식 지원 범위 아님 |

## 검증한 동작

수직·수평 scrolling, pointer drag, track click, wheel, keyboard, RTL, nested scroll, resize/content 변화, auto-hide, React 18/19 consumer, SSR/hydration과 dispose를 검증 범위로 사용합니다.

## 알려진 제한

- scrollbar 폭과 classic/overlay scrollbar는 OS와 실행 환경에 따라 달라집니다.
- touch, pointer capture, wheel, focus와 RTL 동작은 browser version과 host 환경에 따라 달라질 수 있습니다.
- Chrome 83 검증 결과를 Chrome Desktop 75의 직접 실행 결과로 해석하지 않습니다.
- `:focus-visible`은 Chrome 75에서 지원되지 않으므로 해당 focus indicator가 나타나지 않을 수 있습니다.
- library는 소비자 전역을 변경하는 polyfill을 자동 주입하지 않습니다.

자세한 공개 동작은 [React 공개 API 계약](docs/contracts/react-v1.md), 사용 방법은 [npm 문서](packages/react/README.md)를 참고하세요.
