# 현재 주의사항

## Node와 transitive dependency

frozen install은 직접 dependency뿐 아니라 child dependency의 Node engine 조건과 peer resolution도 확인합니다. 개발 환경의 기존 install이 성공해도 clean install이 실패할 수 있으므로 package manager가 요구하는 최소 Node와 lockfile을 함께 확인합니다.

## React 18/19 ref 차이

React 18과 React 19의 ref type과 callback ref cleanup 동작은 다를 수 있습니다. public type은 두 버전의 consumer fixture에서 각각 확인하고, callback ref는 반환값을 cleanup 함수로 오해하지 않도록 명시적으로 처리합니다.

## TypeScript mapped type key 검사

mapped type으로 금지 속성을 검사할 때 선택 속성을 그대로 추출하면 `undefined`가 포함될 수 있습니다. `-?`로 required key를 만든 뒤 `keyof`를 추출하고, 각 금지 속성을 독립 object literal로 검사해야 excess property check가 모든 항목을 확인합니다.

## React callback ref 정리

React 18에서는 callback ref가 반환하는 값이 cleanup으로 지원되지 않습니다. ref callback은 명시적으로 `null`을 처리하고, mount·unmount에서 library ref와 consumer ref를 정확히 한 번씩 호출합니다.

## 오래된 Chrome 자동화

Playwright의 CDP 요구사항 때문에 Chrome 75 같은 오래된 browser를 최신 자동화 방식으로 직접 실행하지 못할 수 있습니다. 하한 목표와 실제 실행 가능한 대체 browser를 문서에서 분리하고, 대체 결과를 원래 browser의 직접 검증으로 표현하지 않습니다.
