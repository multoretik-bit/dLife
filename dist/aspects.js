import { SPHERES, minutes } from "./schedule.js";
import { ScheduleStore } from "./store.js";
const groups = [
  ["1", "2"],
  ["3", "4", "5"],
  ["6", "7"],
  ["8", "9", "10"],
];
const paths = [
  "M12 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM12 17v4M8 21h8",
  "M4 8v8M7 6v12M17 6v12M20 8v8M7 12h10",
  "M12 20 4 12C-1 5 8 1 12 7c4-6 13-2 8 5Z",
  "M3 11 12 3l9 8M5 10v11h14V10M10 21v-7h4v7",
  "M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 21v-4a6 6 0 0 1 12 0v4M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2",
  "M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z",
  "M5 21V3M5 4c5-4 9 4 14 0v10c-5 4-9-4-14 0",
  "M3 7h18v14H3ZM8 7V3h8v4M3 12c6 3 12 3 18 0M10 13h4",
  "M4 6c0-4 16-4 16 0s-16 4-16 0ZM4 6v6c0 4 16 4 16 0V6M4 12v6c0 4 16 4 16 0v-6",
  "M12 5C9 2 5 2 2 3v17c4-1 7 0 10 2 3-2 6-3 10-2V3c-3-1-7-1-10 2ZM12 5v17",
];
let state = null,
  selected = 0;
function render() {
  const grid = document.querySelector("#sphere-grid");
  grid.style.gridTemplateColumns =
    window.innerWidth > 760 ? `repeat(${groups[selected].length},1fr)` : "1fr";
  grid.innerHTML = groups[selected]
    .map((id) => {
      const sphere = SPHERES.find((s) => s.id === id);
      const total =
        state?.blocks
          .filter((b) => b.sphereId === id)
          .reduce(
            (sum, b) =>
              sum + ((minutes(b.end) - minutes(b.start) + 1440) % 1440),
            0,
          ) || 0;
      const time = total
        ? `${Math.floor(total / 60) ? Math.floor(total / 60) + " ч " : ""}${total % 60 ? (total % 60) + " мин" : ""}`
        : "—";
      return `<section class="sphere-panel" style="--sphere-color:${sphere.color}"><div class="sphere-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[Number(id) - 1]}"/></svg></div><h2>${sphere.name}</h2><strong>${time}</strong><p>${total ? "в расписании на день" : "Пока нет блоков"}</p></section>`;
    })
    .join("");
}
for (const button of document.querySelectorAll("[data-aspect]"))
  button.addEventListener("click", () => {
    selected = Number(button.dataset.aspect);
    for (const b of document.querySelectorAll("[data-aspect]"))
      b.setAttribute("aria-selected", String(b === button));
    render();
  });
window.addEventListener("resize", render);
try {
  state = await new ScheduleStore().load();
  document.querySelector("#aspect-status").textContent =
    "Время складывается из твоих ежедневных блоков.";
} catch (e) {
  document.querySelector("#aspect-status").textContent = e.message;
}
render();
