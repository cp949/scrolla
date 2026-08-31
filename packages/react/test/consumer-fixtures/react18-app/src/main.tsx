import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Scrolla } from "@cp949/scrolla-react";
import type {
  ScrollaHandle,
  ScrollaProps,
  ScrollaState,
} from "@cp949/scrolla-react";
import "@cp949/scrolla-react/styles.css";

function App() {
  const handleRef = useRef<ScrollaHandle>(null);
  const [lastPositionY, setLastPositionY] = useState(0);

  const props: ScrollaProps = {
    axis: "vertical",
    direction: "auto",
    autoHide: true,
    onStateChange: (state: ScrollaState) => {
      setLastPositionY(state.position.y);
    },
    slotProps: {
      holder: { "aria-label": "React 18 consumer fixture" },
    },
  };

  return (
    <>
      <button
        type="button"
        data-testid="scroll-to-200"
        onClick={() => handleRef.current?.scrollTo({ y: 200 })}
      >
        scrollTo 200
      </button>
      <div data-testid="last-position-y">{lastPositionY}</div>
      <Scrolla ref={handleRef} {...props} style={{ height: 200, width: 300 }}>
        <div style={{ height: 800 }}>content</div>
      </Scrolla>
    </>
  );
}

const container = document.getElementById("root");
if (container === null) {
  throw new Error("root element를 찾을 수 없습니다.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
