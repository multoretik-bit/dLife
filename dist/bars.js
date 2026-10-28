import { SPHERES, sphereFor, dateKey } from "./schedule.js";
import { escapeHTML as esc, progressMinutes, completionKey, itemDate, setReward } from "./development.js";

// Прогресс-бары дня на главной (по просьбе Дениса, 28.10.2026).
// Два вида: «количество» — например, 50 отжиманий, считается кнопками +1/+5/+10;
// «минуты» — бар привязан к занятию (state.practices), минуты идут из таймера и записей времени.
// Хранение: state.bars = [{ id, kind: "count"|"minutes", name, sphereId, target?, unit?, practiceId?, habitId? }],
// state.counts = { "YYYY-MM-DD": { [barId]: число } }. У минутного бара норма — practice.target.

export const BARS_LIMIT = 30;
const COUNT_MAX = 100000;
const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е").trim();

export const practiceOf = (s, bar) => (s.practices || []).find((p) => p.id === bar.practiceId);
export const barTarget = (s, bar) => (bar.kind === "minutes" ? practiceOf(s, bar)?.target || 0 : bar.target || 0);
export const barUnit = (bar) => (bar.kind === "minutes" ? "мин" : bar.unit || "раз");

/** Миллисекунды на общем таймере (тот же таймер, что на странице «Время с пользой»). */
export function timerMs(s, now = Date.now()) {
  const t = s.timer;
  if (!t) return 0;
  return Number(t.accumulatedMs || 0) + (t.paused ? 0 : Math.max(0, now - t.startedAt));
}

/** Значение бара за сегодня; live — добавить минуты идущего таймера этого занятия. */
export function barValue(s, bar, { live = false, now = Date.now(), date = dateKey() } = {}) {
  if (bar.kind === "count") return s.counts?.[date]?.[bar.id] || 0;
  const done = progressMinutes(s, bar.practiceId, date);
  return live && s.timer?.practiceId === bar.practiceId ? done + timerMs(s, now) / 60000 : done;
}

/** Заполненный бар отмечает связанную привычку (например, «История — 30 минут»). Снять отметку бар не может. */
export function markHabits(s) {
  for (const bar of s.bars || []) {
    const habit = bar.habitId && s.items.find((i) => i.id === bar.habitId);
    const target = barTarget(s, bar);
    if (!habit || !target || barValue(s, bar) < target) continue;
    const key = completionKey(habit, itemDate(habit, s.blocks));
    if (!s.done[key]) { s.done[key] = true; setReward(s, key, true, habit.coins); }
  }
  return s;
}

export function addCount(s, barId, delta, date = dateKey()) {
  const next = structuredClone(s);
  next.counts ??= {};
  const day = (next.counts[date] ??= {});
  day[barId] = Math.max(0, Math.min(COUNT_MAX, (day[barId] || 0) + delta));
  return markHabits(next);
}
export function setCount(s, barId, total, date = dateKey()) {
  const next = structuredClone(s);
  next.counts ??= {};
  (next.counts[date] ??= {})[barId] = Math.max(0, Math.min(COUNT_MAX, total));
  return markHabits(next);
}

/** Запуск таймера для занятия бара. Если идёт таймер другого занятия — ошибка с понятным текстом. */
export function startTimer(s, practiceId, now = Date.now()) {
  const t = s.timer;
  if (t && t.practiceId !== practiceId) throw Error("Уже идёт другой таймер — сначала останови его.");
  const next = structuredClone(s);
  next.timer = t?.paused ? { ...t, startedAt: now, paused: false } : t || { startedAt: now, accumulatedMs: 0, paused: false, practiceId };
  return next;
}
export function pauseTimer(s, now = Date.now()) {
  if (!s.timer || s.timer.paused) return s;
  const next = structuredClone(s);
  next.timer = { ...next.timer, accumulatedMs: timerMs(s, now), paused: true };
  return next;
}
/** Стоп: минуты записываются в занятие бара (как «Засчитать время» на странице таймера). Меньше минуты — не записывается. */
export function stopTimer(s, now = Date.now()) {
  const next = structuredClone(s), practice = (s.practices || []).find((p) => p.id === s.timer?.practiceId);
  const minutes = Math.min(1440, Math.round(timerMs(s, now) / 60000));
  next.timer = null;
  if (practice && minutes >= 1) {
    next.logs = [...(next.logs || []), { id: crypto.randomUUID(), sphereId: practice.sphereId, practiceId: practice.id, note: practice.name, date: dateKey(new Date(now)), minutes, coinRate: practice.coinRate ?? 1 }];
  }
  return { next: markHabits(next), minutes: practice ? minutes : 0 };
}

/** Сфера по названию — если пользователь её не выбрал. */
export function guessSphere(name) {
  const n = norm(name);
  if (/англ|испан|истор|чтен|книг|учеб|язык|курс/.test(n)) return "10";
  if (/отжим|присед|пресс|подтяг|бег|шаг|спорт|трен|вод|растяж|планк/.test(n)) return "2";
  if (/медит|сон|отдых/.test(n)) return "6";
  return "7";
}

const findHabit = (s, name, sphereId) => {
  const n = norm(name);
  return s.items.find((i) => i.type === "habit" && i.sphereId === sphereId && n && norm(i.name).startsWith(n));
};

/** Новый бар. Для минут — находит занятие с таким названием в сфере или создаёт новое. */
export function addBar(s, { name, kind, target, unit, sphereId }) {
  name = String(name || "").trim().slice(0, 60);
  target = Math.round(Number(target));
  if (!name) throw Error("Назови прогресс-бар.");
  if (!Number.isFinite(target) || target < 1 || target > (kind === "minutes" ? 1440 : COUNT_MAX)) throw Error(kind === "minutes" ? "Норма — от 1 до 1440 минут." : "Цель — число от 1.");
  if ((s.bars || []).length >= BARS_LIMIT) throw Error(`Не больше ${BARS_LIMIT} прогресс-баров.`);
  sphereId = SPHERES.some((x) => x.id === sphereId) ? sphereId : guessSphere(name);
  const next = structuredClone(s);
  next.bars = [...(next.bars || [])];
  next.practices = [...(next.practices || [])];
  const bar = { id: crypto.randomUUID(), kind: kind === "minutes" ? "minutes" : "count", name, sphereId };
  if (bar.kind === "minutes") {
    let p = next.practices.find((x) => x.sphereId === sphereId && norm(x.name) === norm(name));
    if (p) p.target = target;
    else { p = { id: `practice-${bar.id}`, sphereId, name, target, coinRate: 1 }; next.practices.push(p); }
    bar.practiceId = p.id;
  } else {
    bar.target = target;
    bar.unit = String(unit || "").trim().slice(0, 16) || "раз";
  }
  const habit = findHabit(next, name, sphereId);
  if (habit) bar.habitId = habit.id;
  next.bars.push(bar);
  return markHabits(next);
}

export function updateBar(s, id, { name, target, unit }) {
  const next = structuredClone(s), bar = (next.bars || []).find((b) => b.id === id);
  if (!bar) return null;
  name = String(name || "").trim().slice(0, 60);
  target = Math.round(Number(target));
  if (!name) throw Error("Назови прогресс-бар.");
  if (!Number.isFinite(target) || target < 1 || target > (bar.kind === "minutes" ? 1440 : COUNT_MAX)) throw Error("Проверь цель.");
  bar.name = name;
  if (bar.kind === "minutes") {
    const p = (next.practices || []).find((x) => x.id === bar.practiceId);
    if (p) p.target = target;
  } else {
    bar.target = target;
    bar.unit = String(unit || "").trim().slice(0, 16) || "раз";
  }
  return markHabits(next);
}

/** Удаление бара. Занятие и записанные минуты остаются (они есть и на странице таймера). */
export function removeBar(s, id) {
  const next = structuredClone(s);
  next.bars = (next.bars || []).filter((b) => b.id !== id);
  for (const day of Object.values(next.counts || {})) delete day[id];
  return next;
}

// ---------- разметка и события на главной ----------
const fmtNum = (n) => new Intl.NumberFormat("ru-RU").format(Math.floor(n));
const clock = (ms) => { const sec = Math.floor(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13M16 5.5v13"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>';

export function mountBars({ root, getState, save, onError }) {
  let busy = false, form = null; // form: { kind: "add" } | { kind: "edit", id } | { kind: "count", id }

  async function commit(next) {
    if (busy || !next) return false;
    busy = true;
    try { return await save(next); } finally { busy = false; render(); }
  }
  const fail = (e) => onError?.(e.message || String(e));

  function row(s, bar) {
    const target = barTarget(s, bar), value = barValue(s, bar, { live: true }), pct = target ? Math.min(100, (value / target) * 100) : 0;
    const full = target && value >= target, color = sphereFor(bar.sphereId).color;
    const running = bar.kind === "minutes" && s.timer?.practiceId === bar.practiceId;
    let actions;
    if (form?.id === bar.id && form.kind === "count") {
      actions = `<form class="bar-form" data-bar-form="count" data-id="${esc(bar.id)}"><input name="amount" type="number" inputmode="numeric" min="0" max="${COUNT_MAX}" required placeholder="сколько" aria-label="Количество"><button class="bar-btn" name="mode" value="add">Добавить</button><button class="bar-btn is-quiet" name="mode" value="set" title="Заменить сегодняшний итог">Итог</button><button type="button" class="bar-x" data-bar-cancel aria-label="Отмена">×</button></form>`;
    } else if (form?.id === bar.id && form.kind === "edit") {
      actions = `<form class="bar-form bar-edit" data-bar-form="edit" data-id="${esc(bar.id)}">
        <input name="name" maxlength="60" required value="${esc(bar.name)}" aria-label="Название">
        <input name="target" type="number" inputmode="numeric" min="1" required value="${target}" aria-label="Цель"><span>${barUnit(bar)}</span>
        ${bar.kind === "count" ? `<input name="unit" maxlength="16" value="${esc(bar.unit || "раз")}" aria-label="Единица" class="bar-unit">` : ""}
        <button class="bar-btn">Сохранить</button><button type="button" class="bar-btn is-danger" data-bar-remove="${esc(bar.id)}">Удалить</button><button type="button" class="bar-x" data-bar-cancel aria-label="Отмена">×</button></form>`;
    } else if (bar.kind === "count") {
      actions = `<div class="bar-actions">${[1, 5, 10].map((n) => `<button type="button" class="bar-btn" data-bar-add-n="${n}" data-id="${esc(bar.id)}">+${n}</button>`).join("")}<button type="button" class="bar-btn is-quiet" data-bar-count="${esc(bar.id)}" title="Своё число или итог">✎</button><button type="button" class="bar-more" data-bar-edit="${esc(bar.id)}" aria-label="Настроить">⋯</button></div>`;
    } else {
      const paused = running && s.timer.paused;
      actions = `<div class="bar-actions">
        ${running && !paused ? `<button type="button" class="bar-btn bar-icon" data-bar-pause aria-label="Пауза">${PAUSE}<span>Пауза</span></button>` : `<button type="button" class="bar-btn bar-icon is-go" data-bar-play="${esc(bar.id)}" aria-label="Старт">${PLAY}<span>${paused ? "Дальше" : "Старт"}</span></button>`}
        ${running ? `<button type="button" class="bar-btn bar-icon" data-bar-stop aria-label="Стоп и засчитать">${STOP}<span>Стоп</span></button><span class="bar-clock" data-bar-clock>${clock(timerMs(s))}</span>` : ""}
        <button type="button" class="bar-more" data-bar-edit="${esc(bar.id)}" aria-label="Настроить">⋯</button></div>`;
    }
    return `<article class="bar-row${full ? " is-full" : ""}${running ? " is-running" : ""}" style="--bc:${color}" data-bar="${esc(bar.id)}">
      <div class="bar-top"><span class="bar-name">${full ? "✓ " : ""}${esc(bar.name)}</span><b class="bar-num" data-bar-num>${fmtNum(value)} <small>/ ${fmtNum(target)} ${esc(barUnit(bar))}</small></b></div>
      <div class="bar-track" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.floor(value)}" aria-label="${esc(bar.name)}"><i data-bar-fill style="width:${pct}%"></i></div>
      ${actions}</article>`;
  }

  function addForm() {
    return `<form class="bar-form bar-new" data-bar-form="add">
      <input name="name" maxlength="60" required placeholder="Например: Отжимания" aria-label="Название" autocomplete="off">
      <select name="kind" aria-label="Что считать"><option value="count">Количество (+1, +5, +10)</option><option value="minutes">Минуты по таймеру</option></select>
      <input name="target" type="number" inputmode="numeric" min="1" required placeholder="Цель в день" aria-label="Цель в день">
      <input name="unit" maxlength="16" placeholder="раз" aria-label="Единица (для количества)" class="bar-unit">
      <select name="sphere" aria-label="Сфера"><option value="">Сфера — по названию</option>${SPHERES.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>
      <div><button class="sp-primary">Добавить</button><button type="button" class="sp-ghost" data-bar-cancel>Отмена</button></div></form>`;
  }

  function render() {
    const s = getState();
    if (!s || !root) return;
    const bars = s.bars || [];
    root.innerHTML = `<header><h2>Прогресс дня</h2>${form?.kind === "add" ? "" : '<button type="button" class="td-more bar-add-link" data-bar-new>＋ Добавить</button>'}</header>
      ${bars.length ? `<div class="bars-list">${bars.map((b) => row(s, b)).join("")}</div>` : '<p class="td-empty">Добавь то, что нужно сделать за день: например, 50 отжиманий или 30 минут английского по таймеру.</p>'}
      ${form?.kind === "add" ? addForm() : ""}`;
    root.querySelector("[data-bar-form] input")?.focus();
  }

  // Живой таймер: обновляем только цифры идущего бара, чтобы не сбивать формы.
  setInterval(() => {
    const s = getState(), bar = s?.timer && !s.timer.paused && (s.bars || []).find((b) => b.kind === "minutes" && b.practiceId === s.timer.practiceId);
    const el = bar && root.querySelector(`[data-bar="${CSS.escape(bar.id)}"]`);
    if (!el) return;
    const target = barTarget(s, bar), value = barValue(s, bar, { live: true });
    el.querySelector("[data-bar-num]").innerHTML = `${fmtNum(value)} <small>/ ${fmtNum(target)} мин</small>`;
    el.querySelector("[data-bar-fill]").style.width = `${target ? Math.min(100, (value / target) * 100) : 0}%`;
    const c = el.querySelector("[data-bar-clock]");
    if (c) c.textContent = clock(timerMs(s));
  }, 1000);

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || busy) return;
    const s = getState(), d = b.dataset;
    try {
      if (d.barNew !== undefined) { form = { kind: "add" }; render(); }
      else if (d.barCancel !== undefined) { form = null; render(); }
      else if (d.barEdit) { form = { kind: "edit", id: d.barEdit }; render(); }
      else if (d.barCount) { form = { kind: "count", id: d.barCount }; render(); }
      else if (d.barAddN) await commit(addCount(s, d.id, Number(d.barAddN)));
      else if (d.barPlay) { const bar = s.bars.find((x) => x.id === d.barPlay); await commit(startTimer(s, bar.practiceId)); }
      else if (d.barPause !== undefined) await commit(pauseTimer(s));
      else if (d.barStop !== undefined) {
        const { next, minutes } = stopTimer(s);
        if (await commit(next)) onError?.(minutes ? `Засчитано ${minutes} мин.` : "Меньше минуты — не засчитано.");
      } else if (d.barRemove) {
        const bar = s.bars.find((x) => x.id === d.barRemove);
        if (bar && confirm(`Удалить прогресс-бар «${bar.name}»?${bar.kind === "minutes" ? " Записанные минуты останутся на странице таймера." : ""}`)) { form = null; await commit(removeBar(s, bar.id)); }
      }
    } catch (err) { fail(err); }
  });

  root.addEventListener("change", (e) => {
    if (e.target.name !== "kind") return;
    const f = e.target.form;
    f.unit.hidden = e.target.value === "minutes";
    f.target.placeholder = e.target.value === "minutes" ? "Минут в день" : "Цель в день";
  });

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const f = e.target, d = new FormData(f), s = getState();
    try {
      if (f.dataset.barForm === "add") {
        if (await commit(addBar(s, { name: d.get("name"), kind: d.get("kind"), target: d.get("target"), unit: d.get("unit"), sphereId: d.get("sphere") }))) form = null;
      } else if (f.dataset.barForm === "edit") {
        if (await commit(updateBar(s, f.dataset.id, { name: d.get("name"), target: d.get("target"), unit: d.get("unit") }))) form = null;
      } else if (f.dataset.barForm === "count") {
        const n = Math.round(Number(d.get("amount")));
        if (!Number.isFinite(n) || n < 0) return;
        const next = e.submitter?.value === "set" ? setCount(s, f.dataset.id, n) : addCount(s, f.dataset.id, n);
        if (await commit(next)) form = null;
      }
      render();
    } catch (err) { fail(err); }
  });

  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && form) { form = null; render(); } });
  document.addEventListener("visibilitychange", () => !document.hidden && render());
  render();
  return { render };
}
