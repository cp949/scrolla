"use client";

import { useRef, useState } from "react";
import { Scrolla } from "@cp949/scrolla-react";
import type {
  ScrollaChangeMeta,
  ScrollaHandle,
  ScrollaState,
} from "@cp949/scrolla-react";
import styles from "./showcase.module.css";

const initialState: ScrollaState = {
  position: { x: 0, y: 0 },
  maxPosition: { x: 0, y: 0 },
  viewportSize: { width: 0, height: 0 },
  contentSize: { width: 0, height: 0 },
  overflow: { horizontal: false, vertical: false },
  scrolling: false,
  draggingAxis: null,
  visibility: "visible",
};

export function StateInspector() {
  const handle = useRef<ScrollaHandle>(null);
  const [state, setState] = useState(initialState);
  const [events, setEvents] = useState<string[]>([]);
  const [extra, setExtra] = useState(8);
  const onStateChange = (next: ScrollaState, meta: ScrollaChangeMeta) => {
    setState(next);
    setEvents((current) =>
      [
        `${meta.reasons.join("+")} · y=${Math.round(next.position.y)}`,
        ...current,
      ].slice(0, 10),
    );
  };

  return (
    <div className={styles.inspectorGrid}>
      <div className={styles.demoFrame}>
        <Scrolla
          ref={handle}
          axis="both"
          onStateChange={onStateChange}
          slotProps={{ scroller: { "aria-labelledby": "inspector-title" } }}
        >
          <div className={styles.inspectorContent}>
            <h3 id="inspector-title">Observable state</h3>
            {Array.from({ length: extra }, (_, index) => (
              <p key={index}>
                Content row {index + 1}: geometry changes are visible in the
                state panel.
              </p>
            ))}
          </div>
        </Scrolla>
        <div className={styles.controls}>
          <button onClick={() => setExtra((value) => value + 5)}>
            Change content
          </button>
          <button onClick={() => handle.current?.refresh()}>Refresh</button>
          <button onClick={() => handle.current?.scrollBy({ y: 100 })}>
            scrollBy +100
          </button>
        </div>
      </div>
      <div className={styles.inspectorPanel}>
        <h3>Latest snapshot</h3>
        <dl>
          <dt>position</dt>
          <dd>
            {Math.round(state.position.x)}, {Math.round(state.position.y)}
          </dd>
          <dt>maxPosition</dt>
          <dd>
            {Math.round(state.maxPosition.x)}, {Math.round(state.maxPosition.y)}
          </dd>
          <dt>overflow</dt>
          <dd>
            {state.overflow.horizontal ? "horizontal" : "—"} /{" "}
            {state.overflow.vertical ? "vertical" : "—"}
          </dd>
          <dt>activity</dt>
          <dd>
            {state.scrolling ? "scrolling" : "idle"} ·{" "}
            {state.draggingAxis ?? "not dragging"}
          </dd>
          <dt>visibility</dt>
          <dd>{state.visibility}</dd>
        </dl>
        <h3>Recent events</h3>
        <Scrolla axis="vertical" style={{ height: 180 }}>
          <ul className={styles.eventList}>
            {events.length ? (
              events.map((event, index) => (
                <li key={`${event}-${index}`}>{event}</li>
              ))
            ) : (
              <li>Interact with the panel to collect events.</li>
            )}
          </ul>
        </Scrolla>
      </div>
    </div>
  );
}
