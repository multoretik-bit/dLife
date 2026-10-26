// Иконки dLife: одна сетка 24×24, линия 1.8, скруглённые концы, цвет — currentColor.
// icon("flame") → строка <svg>; размер задаёт font-size родителя (1em) или класс.
const P = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  wallet: '<path d="M5 7.5V7a2.5 2.5 0 0 1 2.5-2.5H17"/><rect x="3.5" y="7.5" width="17" height="12" rx="3"/><path d="M15.5 13.5h2"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.3 1.6M9.5 2.8h5M18.6 6.4l1.2-1.2"/>',
  food: '<path d="M7 3.5v6a2 2 0 0 0 2 2v9M11 3.5v6a2 2 0 0 1-2 2M9 3.5v5"/><path d="M17 20.5v-17c-2.2 1.4-3.2 4.3-3.2 8.3H17"/>',
  flame: '<path d="M12 21a6 6 0 0 0 6-6c0-4.2-3.4-6.3-4.6-11-2.6 1.8-3.9 4.6-3.6 7.4-1.2-.5-2-1.7-2.3-3.1C6.3 9.6 6 11.7 6 13.4A6.6 6.6 0 0 0 12 21Z"/><path d="M12 21a2.6 2.6 0 0 1-2.6-2.6c0-1.8 1.6-2.7 2.6-4.4 1 1.7 2.6 2.6 2.6 4.4A2.6 2.6 0 0 1 12 21Z"/>',
  camera: '<path d="M4 9a2 2 0 0 1 2-2h2.2l1.4-2.2h4.8L15.8 7H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13.2" r="3.4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="9.5" r="1.6"/><path d="m4 17.5 4.6-4.6 3.4 3.4 2.6-2.6 5.4 5.4"/>',
  sparkle: '<path d="M12 3.5 13.5 9a2.2 2.2 0 0 0 1.5 1.5l5.5 1.5-5.5 1.5a2.2 2.2 0 0 0-1.5 1.5L12 20.5 10.5 15A2.2 2.2 0 0 0 9 13.5L3.5 12 9 10.5A2.2 2.2 0 0 0 10.5 9Z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  vision: '<path d="m3 19.5 6.2-8.8 4.1 5.6 2.6-3.2 5.1 6.4Z"/><circle cx="16.8" cy="6.2" r="2.2"/>',
  bulb: '<path d="M9.3 17.5h5.4M10.2 20.5h3.6M12 3.5a6 6 0 0 0-3.6 10.8c.7.5 1 1.3 1 2.2v1h5.2v-1c0-.9.3-1.7 1-2.2A6 6 0 0 0 12 3.5Z"/>',
  steps: '<path d="M8.6 3.5c1.6 0 2.5 1.8 2.5 4.2 0 2.3-.8 4.3-2.5 4.3S6 10 6 7.7c0-2.4.9-4.2 2.6-4.2ZM6.8 14.6l4.2-.6.3 2.1a2.1 2.1 0 1 1-4.2.6Z"/><path d="M15.4 7.5c1.7 0 2.6 1.8 2.6 4.2s-.9 4.3-2.6 4.3-2.5-2-2.5-4.3.9-4.2 2.5-4.2ZM13 18.6l4.2.6-.3 2a2.1 2.1 0 1 1-4.2-.5Z"/>',
  watch: '<rect x="6.5" y="6" width="11" height="12" rx="3.2"/><path d="M9 6V3.5h6V6M9 18v2.5h6V18M12 9.6V12l1.6 1.1"/>',
  book: '<path d="M4.5 6A2.5 2.5 0 0 1 7 3.5h12.5v14H7a2.5 2.5 0 0 0-2.5 2.5Z"/><path d="M4.5 20A2.5 2.5 0 0 0 7 22.5h12.5v-5"/>',
  play: '<path d="M8.5 5.8v12.4c0 .8.9 1.3 1.6.9l9.7-6.2c.6-.4.6-1.3 0-1.7l-9.7-6.2c-.7-.5-1.6 0-1.6.8Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 6.5v11M15 6.5v11"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.4" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
};

export const ICON_NAMES = Object.keys(P);

/** SVG-иконка по имени; extra — дополнительный класс. */
export function icon(name, extra = "") {
  return `<svg class="ic${extra ? " " + extra : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || ""}</svg>`;
}
