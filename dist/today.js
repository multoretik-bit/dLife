import { icon } from "./icons.js";
import { SPHERES, sphereFor, dateKey } from "./schedule.js";
import { escapeHTML as esc, occurs, repeatOf, completionKey, itemDate, streak, shiftDate, setReward } from "./development.js";
import { progressTarget, progressUnit, progressValue, timerMs, addCount, setCount, startTimer, pauseTimer, stopTimer, setProgress, removeProgress, baseName } from "./habit-progress.js";

const num = (n) => new Intl.NumberFormat("ru-RU").format(Math.floor(n));
const clock = (ms) => { const sec = Math.floor(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const SPHERE_KEY = "dlife-today-sphere";

/** «Сегодня» на главной: привычки и цели (задачи) на сегодня с отметкой в одно касание. Показатели дня — в плитках (tiles.js). */
export function mountToday({ root, getState, save, onMessage }) {
  let busy = false, adding = false;
  // Шкала привычки: hb = { kind: "setup" | "count", id } — открытая форма настройки или ввода числа.
  let hb = null;
  const today = () => dateKey();

  const habits = (s) => s.items.filter((i) => i.type === "habit");
  const tasks = (s) => s.items.filter((i) => i.type === "task" && occurs(i, today(), s.done));
  const isDone = (s, item, date = itemDate(item, s.blocks)) => !!s.done[completionKey(item, date)];

  function render() {
    const s = getState();
    if (!s) return;
    const hs = habits(s), ts = tasks(s);

    root.innerHTML = `
      <div class="td-cols">
        <section class="td-card" id="td-habits" aria-labelledby="td-habits-title">
          <header><h2 id="td-habits-title">Привычки на сегодня</h2><a class="td-more" href="/now/">Все →</a></header>
          ${hs.length ? habitGroups(s, hs) : `<p class="td-empty">Привычек пока нет. Создай первую в «Задачах» → настройки → «Привычки»: 21 день подряд — и она станет частью тебя.</p><a class="td-cta" href="/now/">Создать привычку</a>`}
        </section>
        <section class="td-card" id="td-tasks" aria-labelledby="td-tasks-title">
          <header><h2 id="td-tasks-title">Цели на сегодня</h2><a class="td-more" href="/now/">План дня →</a></header>
          ${ts.length ? `<ul class="td-list">${[...ts].sort((a, b) => isDone(s, a, today()) - isDone(s, b, today()) || (a.time || "99").localeCompare(b.time || "99")).map((i) => taskRow(s, i)).join("")}</ul>` : '<p class="td-empty">На сегодня целей нет. Запиши 1–3 главных дела — так день становится управляемым.</p>'}
          ${adding ? `<form class="td-add" data-add-form>
              <input name="name" maxlength="180" required placeholder="Что важно сделать сегодня?" aria-label="Новая цель на сегодня" autocomplete="off">
              <select name="sphere" aria-label="Сфера">${SPHERES.map((x) => `<option value="${x.id}" ${x.id === lastSphere() ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
              <div><button class="sp-primary">Добавить</button><button type="button" class="sp-ghost" data-cancel>Отмена</button></div>
            </form>` : `<button type="button" class="td-add-btn" data-add>＋ Цель на сегодня</button>`}
        </section>
      </div>`;
    if (adding) root.querySelector(".td-add input")?.focus();
  }

  const lastSphere = () => { try { return localStorage.getItem(SPHERE_KEY) || "7"; } catch { return "7"; } };

  function habitGroups(s, hs) {
    const groups = [{ id: "", name: "В течение дня", time: "" }, ...[...s.blocks].sort((a, b) => a.start.localeCompare(b.start)).map((b) => ({ id: b.id, name: b.name, time: `${b.start}–${b.end}` }))];
    return groups.map((g) => {
      const list = hs.filter((h) => (h.blockId || "") === g.id);
      if (!list.length) return "";
      return `<div class="td-group"><h3>${esc(g.name)}${g.time ? ` <small>${g.time}</small>` : ""}</h3><ul class="td-list">${list.map((h) => habitRow(s, h)).join("")}</ul></div>`;
    }).join("");
  }

  function habitRow(s, h) {
    const date = itemDate(h, s.blocks), done = isDone(s, h, date), n = streak(h, s.done, date), color = sphereFor(h.sphereId).color;
    const week = Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 6)).map((d) => `<i class="${s.done[completionKey(h, d)] ? "on" : ""}" title="${d}"></i>`).join("");
    return `<li class="td-item td-habit${done ? " is-done" : ""}${h.progress ? " has-hb" : ""}" style="--c:${color}">
      <button type="button" class="td-check" data-toggle="${esc(h.id)}" data-date="${date}" role="checkbox" aria-checked="${done}" aria-label="${esc(h.name)}">${CHECK}</button>
      <div class="td-text"><strong>${h.time ? `<time>${h.time}</time> ` : ""}${esc(h.name)}</strong><span class="td-week" aria-label="Последние 7 дней">${week}</span></div>
      <span class="td-streak${n ? "" : " is-zero"}" title="Дней подряд, цель — 21">${n >= 21 ? `${icon("check")} внедрена` : `${icon("flame")} ${n}<small>/21</small>`}</span>
      ${h.coins ? `<span class="td-coins">+${h.coins}</span>` : ""}
      ${hotbar(s, h)}</li>`;
  }

  /** Хот-бар привычки: шкала + действия (количество: +1/+5/+10; минуты: старт/пауза/стоп таймера). */
  function hotbar(s, h) {
    const id = esc(h.id);
    if (hb?.id === h.id && hb.kind === "setup") return setupForm(h);
    if (!h.progress) return `<button type="button" class="hb-add" data-hb-setup="${id}">${icon("plus")} шкала прогресса</button>`;
    const target = progressTarget(s, h), value = progressValue(s, h, { live: true }), pct = target ? Math.min(100, (value / target) * 100) : 0;
    const full = target && value >= target, running = h.progress.kind === "minutes" && s.timer?.practiceId === h.progress.practiceId;
    let actions;
    if (hb?.id === h.id && hb.kind === "count") {
      actions = `<form class="hb-form" data-hb-form="count" data-id="${id}"><input name="amount" type="number" inputmode="numeric" min="0" max="100000" required placeholder="сколько" aria-label="Количество"><button class="bar-btn" name="mode" value="add">Добавить</button><button class="bar-btn is-quiet" name="mode" value="set" title="Заменить итог за день">Итог</button><button type="button" class="bar-x" data-hb-cancel aria-label="Отмена">×</button></form>`;
    } else if (h.progress.kind === "count") {
      actions = `${[1, 5, 10].map((k) => `<button type="button" class="bar-btn" data-hb-plus="${k}" data-id="${id}">+${k}</button>`).join("")}<button type="button" class="bar-btn is-quiet" data-hb-count="${id}" title="Своё число или итог">своё</button><button type="button" class="bar-more" data-hb-setup="${id}" aria-label="Настроить шкалу">⋯</button>`;
    } else {
      const paused = running && s.timer.paused;
      actions = `${running && !paused ? `<button type="button" class="bar-btn bar-icon" data-hb-pause>${icon("pause")}<span>Пауза</span></button>` : `<button type="button" class="bar-btn bar-icon is-go" data-hb-play="${id}">${icon("play")}<span>${paused ? "Дальше" : "Старт"}</span></button>`}
        ${running ? `<button type="button" class="bar-btn bar-icon" data-hb-stop>${icon("stop")}<span>Стоп</span></button><span class="bar-clock" data-hb-clock>${clock(timerMs(s))}</span>` : ""}
        <button type="button" class="bar-more" data-hb-setup="${id}" aria-label="Настроить шкалу">⋯</button>`;
    }
    return `<div class="hb${full ? " is-full" : ""}${running ? " is-running" : ""}" data-hb="${id}">
      <div class="hb-line"><div class="hb-track" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.floor(value)}" aria-label="${esc(h.name)}"><i data-hb-fill style="width:${pct}%"></i></div><b class="hb-num" data-hb-num>${num(value)} <small>/ ${num(target)} ${esc(progressUnit(h))}</small></b></div>
      <div class="hb-actions">${actions}</div></div>`;
  }

  /** Настройка шкалы: минуты по таймеру или количество; цель по умолчанию — число из названия («— 50 раз», «— 30 минут»). */
  function setupForm(h) {
    const s = getState(), p = h.progress, fromName = Number((h.name.match(/(\d+)/) || [])[1]) || "";
    const kind = p?.kind || (/мин/i.test(h.name) ? "minutes" : "count"), target = p ? progressTarget(s, h) : fromName;
    return `<form class="hb-form hb-setup" data-hb-form="setup" data-id="${esc(h.id)}">
      <select name="kind" aria-label="Что считать"><option value="minutes"${kind === "minutes" ? " selected" : ""}>Минуты по таймеру</option><option value="count"${kind === "count" ? " selected" : ""}>Количество (+1, +5, +10)</option></select>
      <input name="target" type="number" inputmode="numeric" min="1" required value="${target}" placeholder="Цель в день" aria-label="Цель в день">
      <input name="unit" maxlength="16" value="${esc(p?.unit || "раз")}" aria-label="Единица" class="bar-unit"${kind === "minutes" ? " hidden" : ""}>
      <button class="bar-btn is-go">Сохранить</button>${p ? '<button type="button" class="bar-btn is-quiet" data-hb-remove="' + esc(h.id) + '">Убрать шкалу</button>' : ""}<button type="button" class="bar-x" data-hb-cancel aria-label="Отмена">×</button>
      <small class="hb-hint">${kind === "minutes" ? `Минуты берутся из таймера занятия «${esc(baseName(h.name))}».` : "Например, 50 отжиманий: отмечай кнопками +1, +5, +10."}</small></form>`;
  }

  function taskRow(s, t) {
    const done = isDone(s, t, today()), color = sphereFor(t.sphereId).color, rep = repeatOf(t);
    const meta = [t.time, rep === "daily" ? "каждый день" : rep === "weekly" ? "каждую неделю" : rep === "until" ? "пока не сделаю" : "", sphereFor(t.sphereId).name].filter(Boolean).join(" · ");
    return `<li class="td-item td-task${done ? " is-done" : ""}" style="--c:${color}">
      <button type="button" class="td-check td-square" data-toggle="${esc(t.id)}" data-date="${today()}" role="checkbox" aria-checked="${done}" aria-label="${esc(t.name)}">${CHECK}</button>
      <div class="td-text"><strong>${esc(t.name)}</strong><small>${esc(meta)}</small></div>
      ${t.coins ? `<span class="td-coins">+${t.coins}</span>` : ""}</li>`;
  }

  async function toggle(id, date) {
    const s = getState(), item = s.items.find((i) => i.id === id);
    if (!item || busy) return;
    const next = structuredClone(s), key = completionKey(item, date), checked = !s.done[key];
    next.done[key] = checked;
    setReward(next, key, checked, item.coins);
    if (item.type === "task" && repeatOf(item) === "until") {
      const stored = next.items.find((i) => i.id === id);
      if (checked) stored.doneOn = date; else delete stored.doneOn;
    }
    busy = true;
    try { await save(next); } finally { busy = false; render(); }
  }

  async function commit(next) {
    if (busy || !next) return false;
    busy = true;
    try { return await save(next); } finally { busy = false; render(); }
  }

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || busy) return;
    const d = b.dataset, s = getState();
    try {
      if (d.hbSetup) { hb = { kind: "setup", id: d.hbSetup }; render(); return; }
      if (d.hbCancel !== undefined) { hb = null; render(); return; }
      if (d.hbCount) { hb = { kind: "count", id: d.hbCount }; render(); return; }
      if (d.hbPlus) { await commit(addCount(s, d.id, Number(d.hbPlus))); return; }
      if (d.hbPlay) { const h = s.items.find((i) => i.id === d.hbPlay); await commit(startTimer(s, h.progress.practiceId)); return; }
      if (d.hbPause !== undefined) { await commit(pauseTimer(s)); return; }
      if (d.hbStop !== undefined) { const { next, minutes } = stopTimer(s); if (await commit(next)) onMessage?.(minutes ? `Засчитано ${minutes} мин.` : "Меньше минуты — не засчитано."); return; }
      if (d.hbRemove) { hb = null; await commit(removeProgress(s, d.hbRemove)); return; }
    } catch (err) { onMessage?.(err.message || String(err)); return; }
    if (b.dataset.toggle) await toggle(b.dataset.toggle, b.dataset.date);
    else if (b.dataset.add !== undefined) { adding = true; render(); }
    else if (b.dataset.cancel !== undefined) { adding = false; render(); }
  });

  root.addEventListener("change", (e) => {
    if (e.target.name !== "kind" || !e.target.form?.dataset.hbForm) return;
    e.target.form.unit.hidden = e.target.value === "minutes";
  });

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.dataset.hbForm) {
      const fd = new FormData(f), s = getState();
      try {
        if (f.dataset.hbForm === "setup") { if (await commit(setProgress(s, f.dataset.id, { kind: fd.get("kind"), target: fd.get("target"), unit: fd.get("unit") }))) { hb = null; render(); } }
        else {
          const k = Math.round(Number(fd.get("amount")));
          if (!Number.isFinite(k) || k < 0) return;
          if (await commit(e.submitter?.value === "set" ? setCount(s, f.dataset.id, k) : addCount(s, f.dataset.id, k))) { hb = null; render(); }
        }
      } catch (err) { onMessage?.(err.message || String(err)); }
      return;
    }
    const d = new FormData(e.target), name = String(d.get("name") || "").trim(), sphereId = String(d.get("sphere"));
    if (!name || busy) return;
    try { localStorage.setItem(SPHERE_KEY, sphereId); } catch {}
    const next = structuredClone(getState());
    next.items.push({ id: crypto.randomUUID(), type: "task", name, sphereId, blockId: "", date: today(), time: "", coins: 0 });
    busy = true;
    try { if (await save(next)) adding = true; } finally { busy = false; render(); }
  });

  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && (adding || hb)) { adding = false; hb = null; render(); } });

  // Идущий таймер: обновляем только цифры и шкалу этой привычки, не трогая формы.
  setInterval(() => {
    const s = getState(), t = s?.timer;
    if (!t || t.paused) return;
    for (const h of s.items.filter((i) => i.type === "habit" && i.progress?.practiceId === t.practiceId)) {
      const el = root.querySelector(`[data-hb="${CSS.escape(h.id)}"]`);
      if (!el) continue;
      const target = progressTarget(s, h), value = progressValue(s, h, { live: true });
      el.querySelector("[data-hb-num]").innerHTML = `${num(value)} <small>/ ${num(target)} мин</small>`;
      el.querySelector("[data-hb-fill]").style.width = `${target ? Math.min(100, (value / target) * 100) : 0}%`;
      const c = el.querySelector("[data-hb-clock]");
      if (c) c.textContent = clock(timerMs(s));
    }
  }, 1000);

  // В полночь и при возвращении на вкладку «сегодня» меняется.
  document.addEventListener("visibilitychange", () => !document.hidden && render());
  render();
  return { render };
}
