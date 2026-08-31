"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import styles from "./showcase.module.css";
import { ChatTimeline } from "./chat-timeline";
import { DocumentViewer } from "./document-viewer";
import { NestedScroll } from "./nested-scroll";
import { RtlComparison } from "./rtl-comparison";
import { StateInspector } from "./state-inspector";
import { StyleLab } from "./style-lab";

const sections = [
  ["document", "Document Viewer"],
  ["style", "Scrollbar Style Lab"],
  ["chat", "Chat Timeline"],
  ["nested", "Nested Scroll"],
  ["rtl", "RTL Comparison"],
  ["inspector", "State Inspector"],
] as const;

function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

export function Showcase() {
  const [active, setActive] = useState("document");
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>S</span>
          <div>
            <strong>Scrolla</strong>
            <small>playground</small>
          </div>
        </div>
        <p className={styles.sidebarIntro}>
          Native scrolling with a custom, accessible scrollbar surface.
        </p>
        <nav aria-label="Examples" className={styles.nav}>
          {sections.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={active === id ? styles.activeNav : undefined}
              onClick={() => setActive(id)}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className={styles.sidebarNote}>
          <span>Try it</span>
          <p>
            Drag a thumb, click a track, then use the keyboard after focusing
            it.
          </p>
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>@cp949/scrolla-react</span>
            <h1>Scrolling, with the browser still in charge.</h1>
            <p>
              Six small scenarios that make Scrolla's public contract visible:
              native input, styling, nested content, RTL coordinates, dynamic
              geometry, and state.
            </p>
          </div>
          <div className={styles.heroBadge}>
            <strong>React 19</strong>
            <span>client playground</span>
          </div>
        </header>
        <Section
          id="document"
          eyebrow="01 / foundations"
          title="Document Viewer"
          description="Both axes stay native while the visual surface is customized."
        >
          <DocumentViewer />
        </Section>
        <Section
          id="style"
          eyebrow="02 / visual layer"
          title="Scrollbar Style Lab"
          description="Change the visual layer live while native scrolling stays intact."
        >
          <StyleLab />
        </Section>
        <Section
          id="chat"
          eyebrow="03 / commands"
          title="Chat Timeline"
          description="Only follow the latest message when the reader is already at the bottom."
        >
          <ChatTimeline />
        </Section>
        <Section
          id="nested"
          eyebrow="04 / input routing"
          title="Nested Scroll"
          description="An inner Scrolla and an outer Scrolla can coexist without a second wheel engine."
        >
          <NestedScroll />
        </Section>
        <Section
          id="rtl"
          eyebrow="05 / direction"
          title="RTL Comparison"
          description="The same logical x position is sent to LTR and RTL content."
        >
          <RtlComparison />
        </Section>
        <Section
          id="inspector"
          eyebrow="06 / observability"
          title="State Inspector"
          description="Public state and change reasons are useful when integrating a real screen."
        >
          <StateInspector />
        </Section>
      </div>
    </main>
  );
}
