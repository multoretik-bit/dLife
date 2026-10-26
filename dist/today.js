import { SPHERES, sphereFor, dateKey } from "./schedule.js";
import { escapeHTML as esc, occurs, repeatOf, completionKey, itemDate, streak, shiftDate, setReward } from "./development.js";
import { targets, dayTotals, weightStatus, WATER_GOAL } from "./nutrition-model.js";

const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const SPHERE_KEY = "dlife-today-sphere";
const ring = (value, max, color, label, sub, href) => {
  const r = 26, c = 2 * Math.PI * r, pct = max ? Math.max(0, Math.min(1, value / max)) : 0;
  return `<a class="td-ring${pct >= 1 ? " is-full" : ""}" href="${href}" style="--c:${color}">
    <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="td-ring-track"/><circle cx="32" cy="32" r="${r}" class="td-ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>
    <span><b>${label}</b><small>${sub}</small></span></a>`;
};

/** «Сегодня» на главной: кольца дня, привычки и цели (задачи) на сегодня с отметкой в одно касание. */
export function mountToday({ root, getState, save }) {
  let busy = false, adding = false;
  const today = () => dateKey();

  const habits = (s) => s.items.filter((i) => i.type === "habit");
  const tasks = (s) => s.items.filter((i) => i.type === "task" && occurs(i, today(), s.done));
  const isDone = (s, item, date = itemDate(item, s.blocks)) => !!s.done[completionKey(item, date)];

  function render() {
    const s = getState();
    if (!s) return;
    const hs = habits(s), ts = tasks(s);
    const hDone = hs.filter((h) => isDone(s, h)).length, tDone = ts.filter((t) => isDone(s, t, today())).length;
    const n = s.nutrition, ws = n?.profile ? weightStatus(n, today()) : null, t = n?.profile ? targets(n.profile, ws.current || n.profile.weight) : null;
    const eaten = dayTotals(n, today()).k, water = n?.water?.[today()] || 0;
    const all = hs.length + ts.length, doneAll = hDone + tDone;

    root.innerHTML = `
      <div class="td-rings">
        ${ring(hDone, hs.length, "#22b07d", hs.length ? `${hDone}/${hs.length}` : "—", "привычки", "#td-habits")}
        ${ring(tDone, ts.length, "#3a8fe0", ts.length ? `${tDone}/${ts.length}` : "—", "цели дня", "#td-tasks")}
        ${t ? ring(eaten, t.kcal, eaten > t.kcal * 1.05 ? "#ef5a4c" : "#f29b38", fmt(eaten), `из ${fmt(t.kcal)} ккал`, "/sphere/?id=2#nutrition") : ring(0, 1, "#f29b38", "Питание", "настроить норму", "/sphere/?id=2#nutrition")}
        ${ring(water, WATER_GOAL, "#41b8e8", `${(water / 1000).toLocaleString("ru-RU")} л`, "вода из 2 л", "/sphere/?id=2#nutrition")}
      </div>
      ${all ? `<p class="td-day">${doneAll === all ? "🎉 Всё на сегодня сделано — отличный день." : `Сделано ${doneAll} из ${all}. ${doneAll ? "Продолжай в том же темпе." : "Начни с самого простого."}`}</p>` : ""}
      <div class="td-cols">
        <section class="td-card" id="td-habits" aria-labelledby="td-habits-title">
          <header><h2 id="td-habits-title">Привычки на сегодня</h2><a class="td-more" href="/now/">Все →</a></header>
          ${hs.length ? habitGroups(s, hs) : `<p class="td-empty">Привычек пока нет. Создай первую в «Задачах» → ⚙ → «Привычки»: 21 день подряд — и она станет частью тебя.</p><a class="td-cta" href="/now/">Создать привычку</a>`}
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
    return `<li class="td-item td-habit${done ? " is-done" : ""}" style="--c:${color}">
      <button type="button" class="td-check" data-toggle="${esc(h.id)}" data-date="${date}" role="checkbox" aria-checked="${done}" aria-label="${esc(h.name)}">${CHECK}</button>
      <div class="td-text"><strong>${esc(h.name)}</strong><span class="td-week" aria-label="Последние 7 дней">${week}</span></div>
      <span class="td-streak${n ? "" : " is-zero"}" title="Дней подряд, цель — 21">${n >= 21 ? "✓ внедрена" : `🔥 ${n}<small>/21</small>`}</span>
      ${h.coins ? `<span class="td-coins">+${h.coins}</span>` : ""}</li>`;
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

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || busy) return;
    if (b.dataset.toggle) await toggle(b.dataset.toggle, b.dataset.date);
    else if (b.dataset.add !== undefined) { adding = true; render(); }
    else if (b.dataset.cancel !== undefined) { adding = false; render(); }
  });

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = new FormData(e.target), name = String(d.get("name") || "").trim(), sphereId = String(d.get("sphere"));
    if (!name || busy) return;
    try { localStorage.setItem(SPHERE_KEY, sphereId); } catch {}
    const next = structuredClone(getState());
    next.items.push({ id: crypto.randomUUID(), type: "task", name, sphereId, blockId: "", date: today(), time: "", coins: 0 });
    busy = true;
    try { if (await save(next)) adding = true; } finally { busy = false; render(); }
  });

  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && adding) { adding = false; render(); } });

  // В полночь и при возвращении на вкладку «сегодня» меняется.
  document.addEventListener("visibilitychange", () => !document.hidden && render());
  render();
  return { render };
}
