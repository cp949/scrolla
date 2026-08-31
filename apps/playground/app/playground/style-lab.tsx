"use client";

import { useState } from "react";
import type * as React from "react";
import { Scrolla } from "@cp949/scrolla-react";
import styles from "./showcase.module.css";

type StyleVars = React.CSSProperties & Record<`--${string}`, string>;
const defaults = {
  size: 12,
  radius: 999,
  thumb: "#2563eb",
  hover: "#1d4ed8",
  active: "#1e3a8a",
  track: "#e8efff",
};

export function StyleLab() {
  const [values, setValues] = useState(defaults);
  const update = <K extends keyof typeof defaults>(
    key: K,
    value: (typeof defaults)[K],
  ) => setValues((current) => ({ ...current, [key]: value }));
  const vars: StyleVars = {
    "--scrolla-size": `${values.size}px`,
    "--scrolla-radius": `${values.radius}px`,
    "--scrolla-thumb-color": values.thumb,
    "--scrolla-thumb-hover-color": values.hover,
    "--scrolla-thumb-active-color": values.active,
    "--scrolla-track-color": values.track,
  };
  return (
    <div className={styles.styleLab}>
      <div className={styles.styleControls}>
        <label>
          Thumb thickness <output>{values.size}px</output>
          <input
            type="range"
            min="6"
            max="24"
            value={values.size}
            onChange={(event) => update("size", Number(event.target.value))}
          />
        </label>
        <label>
          Thumb radius{" "}
          <output>
            {values.radius === 999 ? "round" : `${values.radius}px`}
          </output>
          <input
            type="range"
            min="0"
            max="20"
            value={values.radius === 999 ? 20 : values.radius}
            onChange={(event) =>
              update(
                "radius",
                Number(event.target.value) === 20
                  ? 999
                  : Number(event.target.value),
              )
            }
          />
        </label>
        <label>
          Thumb color <output>{values.thumb}</output>
          <input
            type="color"
            value={values.thumb}
            onChange={(event) => update("thumb", event.target.value)}
          />
        </label>
        <label>
          Track color <output>{values.track}</output>
          <input
            type="color"
            value={values.track}
            onChange={(event) => update("track", event.target.value)}
          />
        </label>
        <button onClick={() => setValues(defaults)}>Reset styles</button>
      </div>
      <div>
        <div className={styles.stylePreview}>
          <Scrolla axis="both" style={{ ...vars, height: 300 }}>
            <div className={styles.styleContent}>
              <h3>Live preview</h3>
              <p>
                Drag the thumb or use the controls to change only the
                scrollbar's visual layer.
              </p>
              <div className={styles.styleGrid}>
                {Array.from({ length: 30 }, (_, index) => (
                  <span key={index}>
                    item {String(index + 1).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>
          </Scrolla>
        </div>
        <pre
          className={styles.variableCode}
        >{`--scrolla-size: ${vars["--scrolla-size"]};\n--scrolla-thumb-color: ${vars["--scrolla-thumb-color"]};\n--scrolla-track-color: ${vars["--scrolla-track-color"]};\n--scrolla-radius: ${vars["--scrolla-radius"]};`}</pre>
      </div>
    </div>
  );
}
