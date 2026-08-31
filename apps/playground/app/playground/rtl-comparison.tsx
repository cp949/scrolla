"use client";

import { useRef, useState } from "react";
import { Scrolla } from "@cp949/scrolla-react";
import type { ScrollaHandle } from "@cp949/scrolla-react";
import type { RefObject } from "react";
import { rtlLabels } from "./fixtures";
import styles from "./showcase.module.css";

function DirectionCard({
  direction,
  handle,
}: {
  direction: "ltr" | "rtl";
  handle: RefObject<ScrollaHandle | null>;
}) {
  return (
    <div className={styles.directionCard}>
      <strong>{direction.toUpperCase()}</strong>
      <Scrolla
        ref={handle}
        axis="horizontal"
        direction={direction}
        style={{ height: 120 }}
      >
        <div className={styles.rtlContent} dir={direction}>
          {rtlLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </Scrolla>
    </div>
  );
}

export function RtlComparison() {
  const ltr = useRef<ScrollaHandle>(null);
  const rtl = useRef<ScrollaHandle>(null);
  const [position, setPosition] = useState(0);
  const move = (x: number) => {
    setPosition(x);
    ltr.current?.scrollTo({ x });
    rtl.current?.scrollTo({ x });
  };
  return (
    <div className={styles.rtlGrid}>
      <DirectionCard direction="ltr" handle={ltr} />
      <DirectionCard direction="rtl" handle={rtl} />
      <div className={styles.rtlControls}>
        <button onClick={() => move(0)}>Inline start</button>
        <button onClick={() => move(180)}>x: 180</button>
        <button onClick={() => move(500)}>Inline end</button>
        <span>logical x = {position}px</span>
      </div>
    </div>
  );
}
