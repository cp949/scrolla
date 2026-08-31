# 아키텍처 개요

## 모듈 경계

`packages/react/src/core/`는 React를 import하지 않는 private controller입니다. DOM 측정, scheduler, RTL, interaction, auto-hide와 resource lifetime을 소유합니다. React component와 hook은 이 동작을 복제하지 않고 controller를 연결합니다.

구조는 다음과 같습니다.

```text
core controller -> React adapter -> @cp949/scrolla-react
                                  -> 사용자 application
```

core는 public package나 public subpath로 배포하지 않습니다. 공개 entry는 React adapter이며 내부에서 `'use client'` 경계를 선언합니다.

## DOM 책임

```text
holder
├─ wrapper
│  └─ scroller
│     └─ content
├─ trackVertical
│  └─ thumbVertical
└─ trackHorizontal
   └─ thumbHorizontal
```

`scroller`가 native `scrollTop`/`scrollLeft`와 실제 overflow를 소유합니다. `content`는 extent 측정 대상이며, track과 thumb는 geometry를 표현하는 visual element입니다. overlay element는 wheel target이 아니고, wheel 동작은 browser native scrolling과 chaining에 맡깁니다.

## 핵심 불변 조건

- module import와 SSR 첫 render에서 `window`·`document`를 읽지 않습니다.
- 측정 이후에도 element를 mount/unmount하지 않고 state attribute, ARIA와 style만 갱신합니다.
- RTL raw `scrollLeft` 모델은 runtime probe로 감지하고 public state에는 logical position만 노출합니다.
- pointer와 keyboard 입력은 core의 동일한 geometry/command 경로를 사용합니다.
- observer, RAF, timer, pointer capture와 listener는 controller dispose에서 멱등적으로 정리합니다.
- 기본 style은 `SCSS -> Dart Sass -> PostCSS -> Autoprefixer`로 생성합니다.
