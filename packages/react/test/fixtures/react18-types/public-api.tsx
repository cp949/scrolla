/**
 * 공개 `.d.ts`가 `@types/react@18`에서도 type-check를 통과하는지 확인하는 fixture다.
 * `tsconfig.json`의 `paths`가 "react"/"react/jsx-runtime"을 이 devDependency로 aliasing한
 * `types-react-18`(`@types/react@18.3.31`)로 돌린다. 실행하지 않고 `tsc --noEmit`으로만 검증한다.
 * 일반 lint/test 대상에서는 `test/fixtures/**` 규칙으로 제외된다.
 */
import { useRef } from "react";
import { Scrolla } from "../../../src/index.js";
import type {
  ScrollaHandle,
  ScrollaProps,
  ScrollaSlotProps,
  ScrollaState,
} from "../../../src/index.js";

function ExampleConsumer(): React.JSX.Element {
  const handleRef = useRef<ScrollaHandle>(null);
  const holderRef = useRef<HTMLDivElement>(null);

  const slotProps: ScrollaSlotProps = {
    holder: { ref: holderRef, "aria-label": "example" },
    trackVertical: { className: "custom-track" },
  };

  const props: ScrollaProps = {
    axis: "vertical",
    direction: "auto",
    autoHide: true,
    initialPosition: { x: 0, y: 0 },
    onStateChange: (state: ScrollaState) => {
      void state.position;
    },
    slotProps,
  };

  return (
    <Scrolla ref={handleRef} {...props}>
      content
    </Scrolla>
  );
}

void ExampleConsumer;
