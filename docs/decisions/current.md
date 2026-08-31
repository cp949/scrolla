# 현재 설계 결정

## React와 분리된 private core

core는 React를 import하지 않는 controller이며 DOM 측정, scheduler, RTL, interaction, auto-hide와 resource lifetime을 소유합니다. React adapter는 core 동작을 복제하지 않습니다.

## Native wheel과 overlay input

track과 thumb는 visual overlay입니다. pointer hit-test는 geometry로 판정하고 wheel은 native scroller가 처리하도록 둡니다. library는 wheel delta를 재전파하지 않습니다.

## RTL

browser의 raw `scrollLeft` 모델 차이는 controller 내부 runtime probe가 흡수합니다. public state와 command는 logical 좌표를 사용합니다.

## CSS

기본 style은 SCSS, Dart Sass, PostCSS, Autoprefixer pipeline으로 생성하고 CSS는 package consumer가 명시적으로 import합니다. Tailwind와 자동 polyfill은 사용하지 않습니다.

## Browser 기준

Chrome Desktop 75를 하한 목표로 삼고, 실제 자동화는 Linux 컨테이너 Chrome 83과 최신 Chrome Desktop에서 수행합니다. 직접 검증하지 않은 browser·OS 조합은 공식 지원으로 확대하지 않습니다.
