"use client";

import { Scrolla } from "@cp949/scrolla-react";
import styles from "./showcase.module.css";

const rows = Array.from(
  { length: 16 },
  (_, index) => `Outer page item ${index + 1}`,
);
const innerRows = Array.from(
  { length: 12 },
  (_, index) => `Inner panel record ${index + 1}`,
);

export function NestedScroll() {
  return (
    <div className={styles.nestedStage}>
      <Scrolla axis="vertical" style={{ height: 420 }}>
        <div className={styles.outerContent}>
          <p className={styles.callout}>
            Scroll the inner panel first. When it reaches an edge, the browser
            can continue scrolling this outer panel.
          </p>
          <Scrolla
            axis="both"
            style={{ height: 220 }}
            className={styles.customNested}
          >
            <div className={styles.innerPanel}>
              <h3>Custom themed panel</h3>
              {innerRows.map((row) => (
                <div className={styles.innerRow} key={row}>
                  {row}
                  <span>ready</span>
                </div>
              ))}
            </div>
          </Scrolla>
          {rows.map((row) => (
            <p className={styles.outerRow} key={row}>
              {row}
            </p>
          ))}
        </div>
      </Scrolla>
    </div>
  );
}
