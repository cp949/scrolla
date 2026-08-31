"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Scrolla } from "@cp949/scrolla-react";
import type { ScrollaHandle } from "@cp949/scrolla-react";
import { initialMessages } from "./fixtures";
import styles from "./showcase.module.css";

type Message = (typeof initialMessages)[number];

export function ChatTimeline() {
  const handle = useRef<ScrollaHandle>(null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [newCount, setNewCount] = useState(0);
  const [jumpRequested, setJumpRequested] = useState(false);
  const addMessages = (count: number, long = false) =>
    setMessages((current) => [
      ...current,
      ...Array.from({ length: count }, (_, index) => ({
        id: current.length + index + 1,
        author: index % 2 ? "Joon" : "Mina",
        time: `09:${50 + index}`,
        text: long
          ? "This longer message represents a notification or review thread that changes the content extent and lets ResizeObserver update the thumb geometry."
          : "A new message arrived while you were reading above.",
      })),
    ]);
  const jumpLatest = () => setJumpRequested(true);

  useLayoutEffect(() => {
    if (!jumpRequested) return undefined;
    handle.current?.refresh();
    const frame = requestAnimationFrame(() => {
      const state = handle.current?.getState();
      handle.current?.scrollTo({ y: state?.maxPosition.y ?? 0 });
      setNewCount(0);
      setJumpRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpRequested, messages]);

  return (
    <div className={styles.demoGrid}>
      <div className={styles.demoFrame}>
        <Scrolla ref={handle} axis="vertical" autoHide>
          <div className={styles.messages} aria-label="Chat messages">
            {messages.map((message) => (
              <article key={message.id} className={styles.message}>
                <div>
                  <strong>{message.author}</strong>
                  <time>{message.time}</time>
                </div>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
        </Scrolla>
        {newCount > 0 && (
          <button className={styles.floatingButton} onClick={jumpLatest}>
            {newCount} new messages · latest
          </button>
        )}
      </div>
      <div className={styles.controls}>
        <button
          onClick={() => {
            addMessages(10);
            setNewCount(10);
          }}
        >
          Add 10 messages
        </button>
        <button
          onClick={() => {
            addMessages(1, true);
            setNewCount((count) => count + 1);
          }}
        >
          Add long message
        </button>
        <button
          onClick={() => {
            addMessages(2);
            setNewCount((count) => count + 2);
          }}
        >
          Simulate new messages
        </button>
        <button className={styles.primaryButton} onClick={jumpLatest}>
          Jump to latest
        </button>
      </div>
    </div>
  );
}
