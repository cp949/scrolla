# 현재 검증 절차

## 일반 검증

package 변경 후 package directory에서 다음 순서로 실행합니다.

```bash
pnpm check-types
pnpm lint
pnpm test
pnpm build
pnpm audit
```

배포 package를 확인할 때는 tarball을 만들고 독립 consumer에서 React 18과 React 19를 각각 설치해 import, mount, hydrate, unmount를 확인합니다.

## 브라우저 검증

공식 하한 목표는 Chrome Desktop 75입니다. 자동화 실행 환경은 Linux 컨테이너의 Chrome 83이며, 최신 Chrome Desktop에서 같은 핵심 시나리오를 회귀 검증합니다. 검증 항목은 scrolling, drag, track click, wheel, keyboard, RTL, nested scroll, resize, auto-hide, React consumer와 dispose입니다.

실제 검증 결과를 실행하지 않은 환경으로 확대 해석하지 않습니다. 브라우저 지원의 사용자-facing 상태는 [브라우저 지원 문서](../../BROWSER-SUPPORT.md)를 기준으로 합니다.
