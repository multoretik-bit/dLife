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

function setupTimerControls() {
  const timerControls = $(".timer-controls");
  if (!timerControls) return;

  // Insert sphere selector if not present
  if (!$("#timer-sphere")) {
    const rateLabel = timerControls.querySelector(".coin-rate-label");
    const sphereHtml = `
      <div class="timer-sphere-row">
        <label class="timer-sphere-label" for="timer-sphere">
          <i class="timer-sphere-dot" id="timer-sphere-dot"></i>
          Сфера
        </label>
        <select id="timer-sphere">
          ${SPHERES.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
        </select>
      </div>
      <div class="timer-preset-row" id="timer-presets">
        <button type="button" class="timer-preset-chip is-study" data-sphere="10" data-minutes="30" title="30 минут учёбы">⚡ 30 мин (Учёба)</button>
        <button type="button" class="timer-preset-chip" data-minutes="15">15 мин</button>
        <button type="button" class="timer-preset-chip" data-minutes="30">30 мин</button>
        <button type="button" class="timer-preset-chip" data-minutes="45">45 мин</button>
      </div>
    `;
    if (rateLabel) {
      rateLabel.insertAdjacentHTML("beforebegin", sphereHtml);
    } else {
      timerControls.insertAdjacentHTML("afterbegin", sphereHtml);
    }
  }

  // Wrap or insert action buttons
  if (!$("#timer-reset")) {
    const toggleBtn = $("#timer-toggle");
    const manualBtn = $("#manual-log");
    const resetBtn = document.createElement("button");
    resetBtn.id = "timer-reset";
    resetBtn.type = "button";
    resetBtn.className = "quiet-button timer-reset-btn";
    resetBtn.textContent = "Сбросить таймер";

    if (toggleBtn && manualBtn && toggleBtn.parentNode) {
      toggleBtn.insertAdjacentElement("afterend", resetBtn);
    }
  }

  // Ensure discard button exists in session dialog
  const sessionForm = $("#session-form");
  if (sessionForm && !$("#session-discard")) {
    const discardBtn = document.createElement("button");
    discardBtn.id = "session-discard";
    discardBtn.type = "button";
    discardBtn.className = "quiet-button";
    discardBtn.textContent = "Сбросить таймер без сохранения";
    sessionForm.appendChild(discardBtn);
  }
}

setupTimerControls();

function currentSphereId() {
  return state?.timer?.sphereId || $("#timer-sphere")?.value || "10";
}

function updateTimerTheme() {
  const sphere = sphereFor(currentSphereId());
  const studio = $(".time-studio");
  if (studio) {
    studio.style.setProperty("--timer-color", sphere.color);
  }
  const dot = $("#timer-sphere-dot");
  if (dot) {
    dot.style.background = sphere.color;
    dot.style.boxShadow = `0 0 10px ${sphere.color}`;
  }
  const toggle = $("#timer-toggle");
  if (toggle) {
    toggle.style.background = sphere.color;
  }
}

function render() {
  if (!state) return;
  const grid = $("#sphere-grid");
  if (grid) {
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
  }
  const prog = $("#practice-progress");
  if (prog) {
    prog.innerHTML = state.practices.length
      ? state.practices
          .map((p) => {
            const actual = progressMinutes(state, p.id),
              pct = Math.min(100, (actual / p.target) * 100),
              sphere = sphereFor(p.sphereId);
            return `<a class="practice-card" href="/sphere/?id=${p.sphereId}" style="--practice-color:${sphere.color}"><div><strong>${esc(p.name)}</strong><span>${actual} / ${p.target} мин</span></div><div class="minute-track" role="progressbar" aria-label="${esc(p.name)}" aria-valuenow="${Math.min(actual, p.target)}" aria-valuemin="0" aria-valuemax="${p.target}"><i style="width:${pct}%;background:${sphere.color}"></i></div><small style="color:${sphere.color};font-weight:700">${sphere.name}</small></a>`;
          })
          .join("")
      : '<p class="empty-line">Открой сферу и добавь занятие с дневной нормой — здесь появится его прогресс.</p>';
  }
  const hist = $("#time-history");
  if (hist) {
    const logs = state.logs
      .filter((l) => l.date === dateKey())
      .slice()
      .reverse();
    hist.innerHTML = logs.length
      ? logs
          .map(
            (l) => {
              const sp = sphereFor(l.sphereId);
              return `<div class="history-row" style="--row-color:${sp.color}"><i style="background:${sp.color};box-shadow:0 0 8px ${sp.color}"></i><div><strong>${esc(l.note || state.practices.find((p) => p.id === l.practiceId)?.name || sp.name)}</strong><small style="color:${sp.color};font-weight:700">${sp.name}</small></div><b>${l.minutes} мин</b></div>`;
            }
          )
          .join("")
      : '<p class="empty-line">Пока нет записанных занятий.</p>';
  }
  tick();
}

function tick() {
  if (lastDay !== dateKey()) {
    lastDay = dateKey();
    render();
  }
  const hasTimer = Boolean(state?.timer);
  const sec = hasTimer
    ? Math.max(
        0,
        Math.floor(((stopAt || Date.now()) - state.timer.startedAt) / 1000),
      )
    : 0;

  const clockEl = $("#timer-clock");
  if (clockEl) {
    clockEl.textContent = [
      Math.floor(sec / 3600),
      Math.floor(sec / 60) % 60,
      sec % 60,
    ]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  }

  const toggleBtn = $("#timer-toggle");
  if (toggleBtn) {
    toggleBtn.textContent = hasTimer ? "Завершить занятие" : "Начать занятие";
    toggleBtn.disabled = !state || busy;
  }

  const caption = $("#timer-caption");
  if (caption) {
    const sp = sphereFor(currentSphereId());
    caption.textContent = hasTimer
      ? `Идёт занятие: ${sp.name}. Сосредоточься на процессе.`
      : `Выбери сферу и свой ритм. Каждая минута — в твою пользу.`;
  }

  const manualBtn = $("#manual-log");
  if (manualBtn) manualBtn.disabled = !state || busy;

  const resetBtn = $("#timer-reset");
  if (resetBtn) {
    resetBtn.disabled = (!hasTimer && !stopAt) || busy;
    resetBtn.style.display = (hasTimer || stopAt) ? "inline-block" : "none";
  }

  const sphereSelect = $("#timer-sphere");
  if (sphereSelect) {
    sphereSelect.disabled = hasTimer || busy;
    if (state?.timer?.sphereId && sphereSelect.value !== state.timer.sphereId) {
      sphereSelect.value = state.timer.sphereId;
    }
  }

  updateTimerTheme();
}

async function commit(next) {
  busy = true;
  tick();
  try {
    state = normalize(await store.save(next));
    const statusEl = $("#aspect-status");
    if (statusEl) statusEl.textContent = "Сохранено";
    render();
    return true;
  } catch (e) {
    const statusEl = $("#aspect-status");
    if (statusEl) statusEl.textContent = e.message;
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

$("#timer-toggle")?.addEventListener("click", async () => {
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
    const sphereId = $("#timer-sphere")?.value || "10";
    next.timer = {
      startedAt: Date.now(),
      sphereId,
    };
    await commit(next);
  }
});

// Setup sphere select event
const timerSphereEl = $("#timer-sphere");
if (timerSphereEl) {
  if (!timerSphereEl.value) timerSphereEl.value = "10";
  timerSphereEl.addEventListener("change", () => {
    updateTimerTheme();
    tick();
  });
}

// Reset button event (works anytime timer is active)
$("#timer-reset")?.addEventListener("click", async () => {
  if (busy || !state) return;
  const next = structuredClone(state);
  next.timer = null;
  stopAt = null;
  await commit(next);
  if ($("#timer-clock")) $("#timer-clock").textContent = "00:00:00";
});

// Discard button in session dialog
$("#session-discard")?.addEventListener("click", async () => {
  if (busy || !state) return;
  const next = structuredClone(state);
  next.timer = null;
  stopAt = null;
  await commit(next);
  if ($("#timer-clock")) $("#timer-clock").textContent = "00:00:00";
  $("#session-dialog")?.close();
});

// Preset buttons (e.g. 30 min Study, 15, 30, 45)
document.querySelectorAll(".timer-preset-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetSphere = btn.dataset.sphere;
    if (targetSphere && $("#timer-sphere")) {
      $("#timer-sphere").value = targetSphere;
      updateTimerTheme();
    }
    const mins = Number(btn.dataset.minutes) || 30;
    stopAt = null;
    openSession(mins);
  });
});

function detectAspectFromText(title) {
  const t = (title || "").toLowerCase().trim();
  if (
    t.includes("учеб") ||
    t.includes("англий") ||
    t.includes("чтен") ||
    t.includes("истори") ||
    t.includes("книг") ||
    t.includes("курс") ||
    t.includes("урок")
  ) return "10";
  if (
    t.includes("спорт") ||
    t.includes("ходьб") ||
    t.includes("силов") ||
    t.includes("трен")
  ) return "2";
  if (
    t.includes("работ") ||
    t.includes("бизнес") ||
    t.includes("проект")
  ) return "8";
  if (t.includes("деньг") || t.includes("финанс") || t.includes("бюджет")) return "9";
  if (t.includes("отдых") || t.includes("сон") || t.includes("прогулк")) return "6";
  return null;
}

function fillPractices() {
  const id = $("#log-sphere")?.value || "10";
  const practiceSelect = $("#log-practice");
  if (!practiceSelect) return;
  const list = (state?.practices || []).filter((p) => p.sphereId === id);
  practiceSelect.innerHTML =
    '<option value="" data-rate="1">Другое занятие (1 🪙/мин)</option>' +
    list
      .map((p) => {
        const rate = p.coinRate ?? 1;
        return `<option value="${esc(p.id)}" data-rate="${rate}">${esc(p.name)} (${rate} 🪙/мин)</option>`;
      })
      .join("");
  syncPracticeRate();
  updateDialogTheme();
}

function syncPracticeRate() {
  const practiceSelect = $("#log-practice");
  const selectedOption = practiceSelect?.selectedOptions?.[0];
  const rateInput = $("#log-rate");
  if (rateInput) {
    const r = selectedOption?.dataset?.rate;
    rateInput.value = r !== undefined && r !== "" ? r : "1";
  }
}

function updateDialogTheme() {
  const id = $("#log-sphere")?.value || "10";
  const sphere = sphereFor(id);
  const dialog = $("#session-dialog");
  if (dialog) {
    dialog.style.setProperty("--dialog-sphere-color", sphere.color);
    dialog.style.borderColor = sphere.color;
  }
}

function openSession(value) {
  $("#session-form")?.reset();
  const sphereSelect = $("#log-sphere");
  if (sphereSelect) {
    sphereSelect.innerHTML = SPHERES.map(
      (s) => `<option value="${s.id}">${s.name}</option>`,
    ).join("");
    sphereSelect.value = state?.timer?.sphereId || $("#timer-sphere")?.value || "10";
  }
  fillPractices();
  if ($("#log-minutes")) $("#log-minutes").value = value;
  if ($("#log-date")) {
    $("#log-date").value = dateKey();
    $("#log-date").max = dateKey();
  }
  if ($("#session-error")) $("#session-error").textContent = "";
  updateDialogTheme();
  $("#session-dialog")?.showModal();
}

$("#log-sphere")?.addEventListener("change", fillPractices);
$("#log-practice")?.addEventListener("change", syncPracticeRate);
$("#log-note")?.addEventListener("input", (e) => {
  const detected = detectAspectFromText(e.target.value);
  if (detected && $("#log-sphere") && $("#log-sphere").value !== detected) {
    $("#log-sphere").value = detected;
    fillPractices();
  }
});

$("#manual-log")?.addEventListener("click", () => {
  stopAt = null;
  openSession(30);
});

$("#session-dialog")?.addEventListener("close", () => {
  stopAt = null;
  tick();
});

$("#session-form")?.addEventListener("submit", async (e) => {
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
    coinRate: Number(d.get("coinRate")) || 0,
  });
  if (stopAt || state?.timer) next.timer = null;
  const ok = await commit(next);
  if (ok) {
    stopAt = null;
    $("#session-dialog")?.close();
  } else {
    $("#session-error").textContent = $("#aspect-status")?.textContent || "Ошибка сохранения";
  }
});

setInterval(tick, 1000);

try {
  state = normalize(await store.load());
  const statusEl = $("#aspect-status");
  if (statusEl) statusEl.textContent = "Нормы настраиваются внутри каждой сферы.";
  render();
} catch (e) {
  const statusEl = $("#aspect-status");
  if (statusEl) statusEl.textContent = e.message;
}

document.addEventListener("visibilitychange", async () => {
  if (!document.hidden && !busy && !$("#session-dialog")?.open) {
    try {
      state = normalize(await store.load());
      render();
    } catch (e) {
      const statusEl = $("#aspect-status");
      if (statusEl) statusEl.textContent = e.message;
    }
  }
});

$("#timer-share")?.addEventListener("click", async () => {
  const url = new URL("/embed/timer/", location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    const statusEl = $("#aspect-status");
    if (statusEl) statusEl.textContent = "Ссылка на таймер скопирована";
  } catch {
    prompt("Ссылка на таймер", url);
  }
});

if (location.pathname.includes("/timer/")) document.body.classList.add("timer-only");
