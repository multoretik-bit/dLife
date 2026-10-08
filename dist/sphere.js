import { SPHERES } from "./schedule.js";
import { ScheduleStore } from "./store.js";
import { mountStudy } from "./study.js";
import { mountCalories } from "./health.js";
import { normalize, progressMinutes, escapeHTML as esc } from "./development.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const id = params.get("id");
const sphere = SPHERES.find((s) => s.id === id);
const store = new ScheduleStore();
const year = new Date().getFullYear();
const icon = {
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4"/></svg>',
  remove: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};
let state = null, busy = false, editing = null, dragged = null, toastTimer;

function message(text, sticky = false) {
  const el = $("#sphere-error");
  clearTimeout(toastTimer);
  el.textContent = text;
  if (!sticky && text) toastTimer = setTimeout(() => (el.textContent = ""), 2500);
}

async function save(next) {
  if (busy) return false;
  busy = true;
  try {
    state = normalize(await store.save(next));
    message("Сохранено");
    render();
    return true;
  } catch (e) {
    message(e.message, true);
    return false;
  } finally {
    busy = false;
  }
}
const change = (fn) => { const next = structuredClone(state); fn(next); return save(next); };
const plan = (s) => (s.spherePlans[id] ??= { vision: "", deadline: "", tools: "", results: "" });

/* ---------- Ежедневные занятия ---------- */
const practices = () => state.practices.filter((p) => p.sphereId === id);

function practiceForm(p = { name: "", target: 30, coinRate: 1 }) {
  return `<li class="sp-row is-editing"><form class="sp-practice-form" data-practice-form="${esc(p.id || "")}">
    <label class="sp-sr" for="pf-name">Название занятия</label><input id="pf-name" name="name" value="${esc(p.name)}" maxlength="100" placeholder="Название, например «Чтение»" required>
    <label class="sp-num"><input name="target" type="number" min="1" max="1440" value="${p.target}" required aria-label="Минут в день"><span>мин/день</span></label>
    <label class="sp-num"><input name="rate" type="number" min="0" max="1000000" step="0.01" value="${p.coinRate ?? 1}" required aria-label="Монет за минуту"><span>монет/мин</span></label>
    <div class="sp-form-actions"><button class="sp-primary">${p.id ? "Сохранить" : "Добавить"}</button><button type="button" class="sp-ghost" data-cancel>Отмена</button></div>
  </form></li>`;
}

function renderPractices() {
  const list = practices();
  const done = list.reduce((n, p) => n + Math.min(progressMinutes(state, p.id), p.target), 0);
  const total = list.reduce((n, p) => n + p.target, 0);
  $("#practice-summary").textContent = list.length ? `Сегодня ${done} из ${total} мин` : "";
  const rows = list.map((p) => {
    if (editing === p.id) return practiceForm(p);
    const value = progressMinutes(state, p.id), pct = Math.min(100, (value / p.target) * 100), complete = value >= p.target;
    return `<li class="sp-row sp-practice${complete ? " is-done" : ""}" draggable="true" data-id="${esc(p.id)}">
      <span class="sp-grip" aria-hidden="true">⋮⋮</span>
      <div class="sp-practice-main"><div class="sp-practice-top"><strong>${esc(p.name)}</strong><span>${complete ? icon.check : ""}${value} / ${p.target} мин</span></div><div class="sp-bar"><i style="width:${pct}%"></i></div></div>
      <span class="sp-rate" title="Монет за минуту"><img src="/assets/coins.png" alt="" width="16" height="16">${p.coinRate ?? 1}/мин</span>
      <button type="button" class="sp-icon" data-edit="${esc(p.id)}" aria-label="Изменить ${esc(p.name)}">${icon.edit}</button>
      <button type="button" class="sp-icon sp-danger" data-remove="${esc(p.id)}" aria-label="Удалить ${esc(p.name)}">${icon.remove}</button>
    </li>`;
  });
  if (editing === "new") rows.push(practiceForm());
  $("#practice-list").innerHTML = rows.join("") || '<li class="sp-empty">Добавь занятия с дневной нормой — их прогресс появится здесь.</li>';
  $("#practice-add").hidden = editing !== null;
  $('#practice-list [name="name"]')?.focus();
}

function movePractice(fromId, toId) {
  const next = structuredClone(state), own = next.practices.filter((p) => p.sphereId === id);
  const a = own.findIndex((p) => p.id === fromId), b = own.findIndex((p) => p.id === toId);
  if (a < 0 || b < 0 || a === b) return;
  own.splice(b, 0, own.splice(a, 1)[0]);
  let i = 0;
  next.practices = next.practices.map((p) => (p.sphereId === id ? own[i++] : p));
  save(next);
}

/* ---------- Цели на год ---------- */
function renderGoals() {
  const goals = state.spherePlans[id]?.goals || [];
  const done = goals.filter((g) => g.done).length;
  $("#goal-year").textContent = year;
  $("#goal-summary").textContent = goals.length ? `${done} из ${goals.length} выполнено` : "";
  $("#goal-list").innerHTML = goals.map((g) => `<li class="sp-row sp-goal${g.done ? " is-done" : ""}">
      <button type="button" class="sp-check" data-goal-toggle="${esc(g.id)}" role="checkbox" aria-checked="${g.done}" aria-label="${esc(g.text)}">${icon.check}</button>
      <span>${esc(g.text)}</span>
      <button type="button" class="sp-icon sp-danger" data-goal-remove="${esc(g.id)}" aria-label="Удалить цель">${icon.remove}</button>
    </li>`).join("") || '<li class="sp-empty">Чего хочешь достичь в этой сфере к концу года?</li>';
}

function render() {
  renderPractices();
  renderGoals();
}

if (!sphere) {
  $("#sphere-name").textContent = "Сфера не найдена";
  document.querySelectorAll("[data-section]").forEach((el) => (el.hidden = true));
} else {
  $("#sphere-name").textContent = sphere.name;
  $("#sphere-color").style.background = sphere.color;
  document.documentElement.style.setProperty("--sphere-accent", sphere.color);
  document.title = `dLife — ${sphere.name}`;

  // Встраивание отдельного блока: /embed/sphere/?id=10&section=practices|goals|tools
  const legacy = { vision: "goals", results: "practices" }, section = legacy[params.get("section")] || params.get("section");
  if (location.pathname.startsWith("/embed/") && ["practices", "goals", "tools"].includes(section))
    document.querySelectorAll("[data-section]").forEach((el) => (el.hidden = el.dataset.section !== section));

  $("#practice-add").addEventListener("click", () => { editing = "new"; renderPractices(); });

  $("#practice-list").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || busy) return;
    if (b.dataset.edit) { editing = b.dataset.edit; renderPractices(); }
    if (b.dataset.cancel !== undefined) { editing = null; renderPractices(); }
    if (b.dataset.remove && confirm("Удалить занятие? Записанное время сохранится.")) {
      const removeId = b.dataset.remove;
      change((s) => (s.practices = s.practices.filter((p) => p.id !== removeId)));
    }
  });

  $("#practice-list").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, d = new FormData(f), name = d.get("name").trim(), target = Number(d.get("target")), coinRate = Number(d.get("rate"));
    if (!name || !Number.isInteger(target) || target < 1 || target > 1440) return message("Укажи название и норму от 1 до 1440 минут.", true);
    const entry = { id: f.dataset.practiceForm || crypto.randomUUID(), sphereId: id, name, target, coinRate: Number.isFinite(coinRate) && coinRate >= 0 ? coinRate : 1 };
    const prev = editing;
    editing = null;
    const ok = await change((s) => {
      const i = s.practices.findIndex((p) => p.id === entry.id);
      if (i < 0) s.practices.push(entry); else s.practices[i] = { ...s.practices[i], ...entry };
    });
    if (!ok) { editing = prev; renderPractices(); }
  });

  $("#practice-list").addEventListener("keydown", (e) => {
    if (e.key === "Escape" && editing) { editing = null; renderPractices(); }
  });

  const list = $("#practice-list");
  list.addEventListener("dragstart", (e) => { const row = e.target.closest("[data-id]"); if (!row) return; dragged = row.dataset.id; row.classList.add("is-dragging"); e.dataTransfer.effectAllowed = "move"; });
  list.addEventListener("dragover", (e) => { const row = e.target.closest("[data-id]"); if (!row || row.dataset.id === dragged) return; e.preventDefault(); list.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over")); row.classList.add("drag-over"); });
  list.addEventListener("drop", (e) => { e.preventDefault(); const row = e.target.closest("[data-id]"); if (row && dragged && !busy) movePractice(dragged, row.dataset.id); });
  list.addEventListener("dragend", () => { dragged = null; list.querySelectorAll(".is-dragging,.drag-over").forEach((n) => n.classList.remove("is-dragging", "drag-over")); });

  $("#goal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#goal-text"), text = input.value.trim();
    if (!text || !state || busy) return;
    if (await change((s) => (plan(s).goals ??= []).push({ id: crypto.randomUUID(), text, done: false }))) { input.value = ""; input.focus(); }
  });

  $("#goal-list").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || busy) return;
    if (b.dataset.goalToggle) change((s) => { const g = plan(s).goals.find((x) => x.id === b.dataset.goalToggle); g.done = !g.done; });
    if (b.dataset.goalRemove && confirm("Удалить цель?")) change((s) => (plan(s).goals = plan(s).goals.filter((x) => x.id !== b.dataset.goalRemove)));
  });

  try {
    state = normalize(await store.load());
    render();
    if (id === "2") mountCalories({ before: $('[data-section="practices"]'), getState: () => state, save });
    mountStudy({ root: $("#sphere-tools"), sphereId: id, getState: () => state, save, getBackend: () => store.backend });
  } catch (e) {
    message(e.message, true);
  }
}
