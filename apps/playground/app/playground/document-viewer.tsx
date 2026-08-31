"use client";

import { Scrolla } from "@cp949/scrolla-react";
import { codeLines, documentParagraphs } from "./fixtures";
import styles from "./showcase.module.css";

export function DocumentViewer() {
  return (
    <div className={styles.demoFrame}>
      <Scrolla
        axis="both"
        autoHide
        autoHideDelay={700}
        slotProps={{
          scroller: { id: "document-scroll" },
          thumbVertical: { "aria-label": "Document vertical scrollbar" },
          thumbHorizontal: { "aria-label": "Document horizontal scrollbar" },
        }}
      >
        <article className={styles.document} aria-labelledby="document-title">
          <h3 id="document-title">A short note on deep modules</h3>
          {documentParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <pre>
            <code>{codeLines.join("\n")}</code>
          </pre>
        </article>
      </Scrolla>
      <p className={styles.hint}>
        Try: focus either thumb, use arrow keys, or click a track.
      </p>
    </div>
  );
}
