import { SPHERES, minutes, dateKey, sphereFor } from "./schedule.js";
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

import {
  normalize,
  progressMinutes,
  escapeHTML as esc,
} from "./development.js";
const store = new ScheduleStore(),
  $ = (s) => document.querySelector(s);
let state = null,
  selected = 0,
  busy = false,
  stopAt = null,
  lastDay = dateKey();
function render() {
  if (!state) return;
  const grid = $("#sphere-grid");
  grid.style.gridTemplateColumns =
    window.innerWidth > 760 ? `repeat(${groups[selected].length},1fr)` : "1fr";
  grid.innerHTML = groups[selected]
    .map((id) => {
      const sphere = SPHERES.find((s) => s.id === id),
        total = state.practices
          .filter((p) => p.sphereId === id)
          .reduce((n, p) => n + p.target, 0),
        actual = state.logs
          .filter((l) => l.sphereId === id && l.date === dateKey())
          .reduce((n, l) => n + l.minutes, 0);
      return `<a class="sphere-panel sphere-link" href="/sphere/?id=${id}" style="--sphere-color:${sphere.color}"><div class="sphere-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[Number(id) - 1]}"/></svg></div><h2>${sphere.name} ↗</h2><strong>${actual} <small>мин</small></strong><p>${total ? "из " + total + " мин на сегодня" : "Настроить занятия и цели"}</p></a>`;
    })
    .join("");
  $("#practice-progress").innerHTML = state.practices.length
    ? state.practices
        .map((p) => {
          const actual = progressMinutes(state, p.id),
            pct = Math.min(100, (actual / p.target) * 100),
            sphere = sphereFor(p.sphereId);
          return `<a class="practice-card" href="/sphere/?id=${p.sphereId}" style="--practice-color:${sphere.color}"><div><strong>${esc(p.name)}</strong><span>${actual} / ${p.target} мин</span></div><div class="minute-track" role="progressbar" aria-label="${esc(p.name)}" aria-valuenow="${Math.min(actual, p.target)}" aria-valuemin="0" aria-valuemax="${p.target}"><i style="width:${pct}%"></i></div><small>${sphere.name}</small></a>`;
        })
        .join("")
    : '<p class="empty-line">Открой сферу и добавь занятие с дневной нормой — здесь появится его прогресс.</p>';
  const logs = state.logs
    .filter((l) => l.date === dateKey())
    .slice()
    .reverse();
  $("#time-history").innerHTML = logs.length
    ? logs
        .map(
          (l) =>
            `<div class="history-row"><i style="background:${sphereFor(l.sphereId).color}"></i><div><strong>${esc(l.note || state.practices.find((p) => p.id === l.practiceId)?.name || sphereFor(l.sphereId).name)}</strong><small>${sphereFor(l.sphereId).name}</small></div><b>${l.minutes} мин</b></div>`,
        )
        .join("")
    : '<p class="empty-line">Пока нет записанных занятий.</p>';
  tick();
}
function tick() {
  if (lastDay !== dateKey()) {
    lastDay = dateKey();
    render();
  }
  const sec = state?.timer
    ? Math.max(
        0,
        Math.floor(((stopAt || Date.now()) - state.timer.startedAt) / 1000),
      )
    : 0;
  $("#timer-clock").textContent = [
    Math.floor(sec / 3600),
    Math.floor(sec / 60) % 60,
    sec % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  $("#timer-toggle").textContent = state?.timer
    ? "Завершить занятие"
    : "Начать занятие";
  $("#timer-caption").textContent = state?.timer
    ? "Время идёт. Сосредоточься на своём занятии."
    : "Выбери свой ритм. Время сохраним после занятия.";
  $("#timer-toggle").disabled = !state || busy;
  $("#manual-log").disabled = !state || busy;
}
async function commit(next) {
  busy = true;
  tick();
  try {
    state = normalize(await store.save(next));
    $("#aspect-status").textContent = "Сохранено";
    render();
    return true;
  } catch (e) {
    $("#aspect-status").textContent = e.message;
    return false;
  } finally {
    busy = false;
    tick();
  }
}
for (const b of document.querySelectorAll("[data-aspect]"))
  b.addEventListener("click", () => {
    selected = Number(b.dataset.aspect);
    for (const t of document.querySelectorAll("[data-aspect]"))
      t.setAttribute("aria-selected", String(t === b));
    render();
  });
window.addEventListener("resize", render);
$("#timer-toggle").addEventListener("click", async () => {
  if (busy || !state) return;
  if (state.timer) {
    stopAt = Date.now();
    openSession(
      Math.max(
        1,
        Math.min(1440, Math.round((stopAt - state.timer.startedAt) / 60000)),
      ),
    );
  } else {
    const next = structuredClone(state);
    next.timer = { startedAt: Date.now() };
    await commit(next);
  }
});
function fillPractices() {
  const id = $("#log-sphere").value;
  $("#log-practice").innerHTML =
    '<option value="">Другое занятие</option>' +
    state.practices
      .filter((p) => p.sphereId === id)
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join("");
}
function openSession(value) {
  $("#session-form").reset();
  $("#log-sphere").innerHTML = SPHERES.map(
    (s) => `<option value="${s.id}">${s.name}</option>`,
  ).join("");
  fillPractices();
  $("#log-minutes").value = value;
  $("#log-date").value = dateKey();
  $("#log-date").max = dateKey();
  $("#session-error").textContent = "";
  $("#session-dialog").showModal();
}
$("#log-sphere").addEventListener("change", fillPractices);
$("#manual-log").addEventListener("click", () => {
  stopAt = null;
  openSession(30);
});
$("#session-dialog").addEventListener("close", () => {
  stopAt = null;
  tick();
});
$("#session-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  const d = new FormData(e.currentTarget),
    next = structuredClone(state),
    mins = Number(d.get("minutes"));
  if (
    !Number.isFinite(mins) ||
    mins <= 0 ||
    mins > 1440 ||
    d.get("date") > dateKey()
  ) {
    $("#session-error").textContent = "Проверь дату и длительность занятия.";
    return;
  }
  next.logs.push({
    id: crypto.randomUUID(),
    sphereId: d.get("sphereId"),
    practiceId: d.get("practiceId"),
    note: String(d.get("note")).trim(),
    date: d.get("date"),
    minutes: mins,
  });
  if (stopAt) next.timer = null;
  const ok = await commit(next);
  if (ok) {
    stopAt = null;
    $("#session-dialog").close();
  } else $("#session-error").textContent = $("#aspect-status").textContent;
});
setInterval(tick, 1000);
tick();
try {
  state = normalize(await store.load());
  $("#aspect-status").textContent = "Нормы настраиваются внутри каждой сферы.";
  render();
} catch (e) {
  $("#aspect-status").textContent = e.message;
}

document.addEventListener("visibilitychange", async () => {
  if (!document.hidden && !busy && !$("#session-dialog").open) {
    try {
      state = normalize(await store.load());
      render();
    } catch (e) {
      $("#aspect-status").textContent = e.message;
    }
  }
});
