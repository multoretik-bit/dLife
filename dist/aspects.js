import { SPHERES, dateKey, sphereFor } from "./schedule.js";
import { ScheduleStore } from "./store.js";
import { normalize, progressMinutes, escapeHTML as esc } from "./development.js";

const groups = [["1", "2"], ["3", "4", "5"], ["6", "7"], ["8", "9", "10"]];
const aspectNames = ["Физический", "Эмоциональный", "Духовный", "Ментальный"];
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
const $ = (selector) => document.querySelector(selector);
const store = new ScheduleStore();
let state = null, selected = 0, busy = false, stopAt = null, lastDay = dateKey(), historyDate = dateKey(), historyOpen = false;

function setupTimer() {
  $(".timer-controls").innerHTML = `<p id="timer-caption">Нажми play, когда начинаешь занятие.</p><div class="timer-icon-actions" aria-label="Управление таймером"><button id="timer-play" type="button" aria-label="Запустить таймер" title="Play">▶</button><button id="timer-pause" type="button" aria-label="Поставить таймер на паузу" title="Пауза">Ⅱ</button><button id="timer-stop" type="button" aria-label="Остановить таймер" title="Стоп">■</button><button id="manual-log" type="button" aria-label="Добавить время вручную" title="Добавить время">＋</button></div>`;
  $("#session-form").innerHTML = `<label for="log-note">Что делал</label><input id="log-note" name="note" maxlength="300" required placeholder="Например, чтение" autocomplete="off"/><label for="log-minutes">Сколько минут</label><input id="log-minutes" name="minutes" type="number" min="1" max="1440" required inputmode="numeric"/><p class="field-hint">Сфера, цвет и нужная цель определятся автоматически по названию.</p><p id="session-match" class="session-match" aria-live="polite"></p><p id="session-error" role="alert"></p><button class="add-block" type="submit">Засчитать время</button><button type="button" class="quiet-button" id="session-discard">Сбросить без записи</button>`;
}
setupTimer();

const clean = (value) => String(value || "").toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^а-яa-z0-9]+/g, " ").trim();
const sphereRules = [
  ["10", /чтен|книг|истори|англ|учеб|урок|курс|лекц|язык|экзам/],
  ["2", /ходьб|хожден|шаг|спорт|трен|бег|отжим|зал|заряд/],
  ["9", /финанс|бюдж|деньг|инвест|капитал/],
  ["8", /работ|бизнес|проект|клиент|концепц/],
  ["6", /отдых|сон|восстанов|перерыв/], ["3", /отношен|свидан|партнер/],
  ["4", /семь|родител|ребен/], ["5", /друз|окружен|общен/], ["1", /внешност|уход|стиль/],
];

function matchActivity(title) {
  const value = clean(title);
  let best = null;
  for (const practice of state.practices) {
    const name = clean(practice.name);
    let score = value === name ? 1000 : value.includes(name) || name.includes(value) ? 700 - Math.abs(value.length - name.length) : value.split(" ").filter((word) => word.length > 2 && name.includes(word)).length * 100;
    if (!best || score > best.score) best = { practice, score };
  }
  if (best?.score > 0) return { practice: best.practice, sphere: sphereFor(best.practice.sphereId) };
  return { practice: null, sphere: sphereFor(sphereRules.find(([, pattern]) => pattern.test(value))?.[0] || "7") };
}

function timerElapsedMs(now = Date.now()) {
  if (!state?.timer) return 0;
  const accumulated = Number(state.timer.accumulatedMs || 0);
  return state.timer.paused ? accumulated : accumulated + Math.max(0, (stopAt || now) - state.timer.startedAt);
}

function renderRhythm() {
  const root = $("#practice-progress");
  if (!state.practices.length) { root.innerHTML = '<p class="empty-line">Добавь занятие внутри сферы — оно появится на общей линии дня.</p>'; return; }
  root.innerHTML = `<div class="aspect-rhythm" aria-label="Дневной прогресс по четырём аспектам">${groups.map((ids, index) => {
    const practices = state.practices.filter((practice) => ids.includes(practice.sphereId));
    const target = practices.reduce((sum, practice) => sum + practice.target, 0);
    const actual = practices.reduce((sum, practice) => sum + progressMinutes(state, practice.id), 0);
    const segments = practices.length ? practices.map((practice) => {
      const value = progressMinutes(state, practice.id), sphere = sphereFor(practice.sphereId), width = practice.target / target * 100, fill = Math.min(100, value / practice.target * 100);
      return `<span class="rhythm-segment" style="width:${width}%;--segment-color:${sphere.color}" title="${esc(practice.name)}: ${value} / ${practice.target} мин"><i style="width:${fill}%"></i></span>`;
    }).join("") : '<span class="rhythm-empty"></span>';
    const legend = practices.map((practice) => { const value = progressMinutes(state, practice.id), sphere = sphereFor(practice.sphereId); return `<a href="/sphere/?id=${practice.sphereId}" class="rhythm-label"><i style="background:${sphere.color}"></i><span>${esc(practice.name)}</span><b>${value}/${practice.target}</b></a>`; }).join("");
    return `<section class="aspect-rhythm-group"><header><span>0${index + 1}</span><strong>${aspectNames[index]}</strong><b>${actual}/${target || 0} мин</b></header><div class="rhythm-hotbar">${segments}</div><div class="rhythm-legend">${legend || '<small>Нет занятий</small>'}</div></section>`;
  }).join("")}</div>`;
}

function formatMinutes(value) {
  const hours = Math.floor(value / 60), minutes = value % 60;
  return hours ? `${hours} ч${minutes ? ` ${minutes} мин` : ""}` : `${minutes} мин`;
}

function groupedLogs(date) {
  const map = new Map();
  for (const log of state.logs.filter((entry) => entry.date === date)) {
    const practice = state.practices.find((entry) => entry.id === log.practiceId);
    const title = practice?.name || log.note?.trim() || sphereFor(log.sphereId).name;
    const key = practice ? `practice:${practice.id}` : `note:${clean(title)}`;
    const current = map.get(key) || { title, sphereId: log.sphereId, minutes: 0, count: 0 };
    current.minutes += log.minutes; current.count += 1; map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

function renderHistory() {
  const groups = groupedLogs(historyDate), total = groups.reduce((sum, entry) => sum + entry.minutes, 0), today = dateKey();
  $("#history-title").textContent = historyDate === today ? "Сегодня ты занимался" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(new Date(historyDate + "T12:00:00"));
  $("#useful-total").textContent = formatMinutes(total);
  $("#time-history").innerHTML = groups.length ? groups.map((entry) => { const sphere = sphereFor(entry.sphereId); return `<div class="history-row"><i style="background:${sphere.color}"></i><div><strong>${esc(entry.title)}</strong><small>${sphere.name}${entry.count > 1 ? ` · ${entry.count} записи` : ""}</small></div><b>${formatMinutes(entry.minutes)}</b></div>`; }).join("") : '<p class="empty-line">В этот день пока нет записанных занятий.</p>';
  const dates = [...new Set(state.logs.map((log) => log.date))].sort().reverse();
  $("#history-days").hidden = !historyOpen;
  $("#history-days").innerHTML = dates.length ? dates.map((date) => `<button type="button" data-history-date="${date}" class="${date === historyDate ? "is-selected" : ""}"><span>${date === today ? "Сегодня" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(date + "T12:00:00"))}</span><b>${formatMinutes(state.logs.filter((log) => log.date === date).reduce((sum, log) => sum + log.minutes, 0))}</b></button>`).join("") : '<p class="empty-line">История появится после первого занятия.</p>';
}

function render() {
  if (!state) return;
  const grid = $("#sphere-grid");
  if (grid) {
    grid.style.gridTemplateColumns = window.innerWidth > 760 ? `repeat(${groups[selected].length},1fr)` : "1fr";
    grid.innerHTML = groups[selected].map((id) => {
      const sphere = sphereFor(id), total = state.practices.filter((p) => p.sphereId === id).reduce((sum, p) => sum + p.target, 0), actual = state.logs.filter((log) => log.sphereId === id && log.date === dateKey()).reduce((sum, log) => sum + log.minutes, 0);
      return `<a class="sphere-panel sphere-link" href="/sphere/?id=${id}" style="--sphere-color:${sphere.color}"><div class="sphere-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[Number(id) - 1]}"/></svg></div><h2>${sphere.name} ↗</h2><strong>${actual} <small>мин</small></strong><p>${total ? `из ${total} мин на сегодня` : "Настроить занятия и цели"}</p></a>`;
    }).join("");
  }
  renderRhythm();
  renderHistory();
  tick();
}

function tick() {
  if (lastDay !== dateKey()) { lastDay = dateKey(); render(); return; }
  const seconds = Math.floor(timerElapsedMs() / 1000);
  $("#timer-clock").textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
  const active = Boolean(state?.timer), paused = Boolean(state?.timer?.paused);
  $("#timer-play").disabled = !state || busy || (active && !paused);
  $("#timer-pause").disabled = !active || paused || busy;
  $("#timer-stop").disabled = !active || busy;
  $("#manual-log").disabled = !state || busy;
  $("#timer-caption").textContent = !active ? "Нажми play, когда начинаешь занятие." : paused ? "Таймер на паузе." : "Время идёт. Сосредоточься на занятии.";
}

async function commit(next) {
  busy = true; tick();
  try { state = normalize(await store.save(next)); $("#aspect-status").textContent = "Сохранено"; render(); return true; }
  catch (error) { $("#aspect-status").textContent = error.message; return false; }
  finally { busy = false; tick(); }
}

$("#timer-play").addEventListener("click", async () => { if (busy || !state) return; const next = structuredClone(state); next.timer = next.timer?.paused ? { ...next.timer, startedAt: Date.now(), paused: false } : { startedAt: Date.now(), accumulatedMs: 0, paused: false }; await commit(next); });
$("#timer-pause").addEventListener("click", async () => { if (busy || !state?.timer || state.timer.paused) return; const next = structuredClone(state); next.timer.accumulatedMs = timerElapsedMs(); next.timer.paused = true; await commit(next); });
$("#timer-stop").addEventListener("click", () => { if (!state?.timer) return; stopAt = Date.now(); openSession(Math.max(1, Math.min(1440, Math.round(timerElapsedMs(stopAt) / 60000))), true); });
$("#manual-log").addEventListener("click", () => { stopAt = null; openSession(30, false); });

function openSession(minutes, stopping) {
  $("#session-form").reset(); $("#log-minutes").value = minutes; $("#session-match").textContent = ""; $("#session-error").textContent = ""; $("#session-discard").hidden = !stopping; $("#session-dialog").showModal(); $("#log-note").focus();
}
$("#log-note").addEventListener("input", (event) => { if (!event.target.value.trim()) { $("#session-match").textContent = ""; return; } const match = matchActivity(event.target.value); $("#session-match").textContent = match.practice ? `Будет засчитано: ${match.practice.name} · ${match.sphere.name}` : `Новая запись · ${match.sphere.name}`; $("#session-match").style.setProperty("--match-color", match.sphere.color); });
$("#session-discard").addEventListener("click", async () => { if (busy || !state?.timer) return; const next = structuredClone(state); next.timer = null; stopAt = null; if (await commit(next)) $("#session-dialog").close(); });
$("#session-dialog").addEventListener("close", () => { stopAt = null; tick(); });
$("#session-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (busy || !state) return;
  const data = new FormData(event.currentTarget), note = String(data.get("note") || "").trim(), minutes = Number(data.get("minutes"));
  if (!note || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440) { $("#session-error").textContent = "Введи название и минуты от 1 до 1440."; return; }
  const match = matchActivity(note), next = structuredClone(state);
  next.logs.push({ id: crypto.randomUUID(), sphereId: match.sphere.id, practiceId: match.practice?.id || "", note, date: dateKey(), minutes, coinRate: match.practice?.coinRate ?? 1 });
  if (stopAt || state.timer) next.timer = null;
  if (await commit(next)) { stopAt = null; $("#session-dialog").close(); } else $("#session-error").textContent = $("#aspect-status").textContent;
});

for (const button of document.querySelectorAll("[data-aspect]")) button.addEventListener("click", () => { selected = Number(button.dataset.aspect); for (const tab of document.querySelectorAll("[data-aspect]")) tab.setAttribute("aria-selected", String(tab === button)); render(); });
$("#history-toggle").addEventListener("click", () => { historyOpen = !historyOpen; $("#history-toggle").setAttribute("aria-expanded", String(historyOpen)); $("#history-toggle").textContent = historyOpen ? "Скрыть историю" : "Предыдущие дни"; renderHistory(); });
$("#history-days").addEventListener("click", (event) => { const button = event.target.closest("[data-history-date]"); if (!button) return; historyDate = button.dataset.historyDate; renderHistory(); });
window.addEventListener("resize", render);
setInterval(tick, 1000);
try { state = normalize(await store.load()); $("#aspect-status").textContent = "Нормы настраиваются внутри каждой сферы."; render(); } catch (error) { $("#aspect-status").textContent = error.message; }
document.addEventListener("visibilitychange", async () => { if (!document.hidden && !busy && !$("#session-dialog").open) try { state = normalize(await store.load()); render(); } catch (error) { $("#aspect-status").textContent = error.message; } });
$("#timer-share")?.addEventListener("click", async () => { const url = new URL("/embed/timer/", location.origin).href; try { await navigator.clipboard.writeText(url); $("#aspect-status").textContent = "Ссылка на таймер скопирована"; } catch { prompt("Ссылка на таймер", url); } });
if (location.pathname.includes("/timer/")) document.body.classList.add("timer-only");
