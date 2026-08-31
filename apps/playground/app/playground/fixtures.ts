export const documentParagraphs = [
  "Scrolla keeps native scrolling underneath a custom visual scrollbar. That means browser wheel, keyboard, focus, and scroll chaining behavior remain familiar.",
  "The content below intentionally combines prose, long lines, and nested sections. Use the vertical thumb, click the track, then focus a scrollbar thumb and try the arrow keys.",
  "A consumer can choose an axis, direction, auto-hide timing, minimum thumb size, and slot styles without taking ownership of measurement or pointer routing.",
];

export const codeLines = Array.from(
  { length: 18 },
  (_, index) =>
    `const frame${String(index + 1).padStart(2, "0")} = runtime.schedule({ dirty: ["geometry", "scroll"] }); // retained state and one RAF`,
);

export const initialMessages = [
  {
    id: 1,
    author: "Mina",
    time: "09:41",
    text: "The new scrollbar keeps the native wheel feel.",
  },
  {
    id: 2,
    author: "Joon",
    time: "09:42",
    text: "Try the nested panel too. Its wheel input chains naturally.",
  },
  {
    id: 3,
    author: "Mina",
    time: "09:43",
    text: "I am reading the earlier messages before jumping back to the latest.",
  },
  {
    id: 4,
    author: "Joon",
    time: "09:44",
    text: "The state panel shows when scrolling becomes idle.",
  },
  {
    id: 5,
    author: "Mina",
    time: "09:45",
    text: "Add a few messages and watch the content extent update.",
  },
  {
    id: 6,
    author: "Joon",
    time: "09:46",
    text: "The button uses the public scrollTo handle.",
  },
];

export const rtlLabels = [
  "البيانات",
  "استكشاف",
  "الرسائل",
  "المستندات",
  "الإعدادات",
  "المساعدة",
];
