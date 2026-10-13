import { SPHERES } from "./schedule.js";
import { ScheduleStore } from "./store.js";
import { normalize, escapeHTML as esc } from "./development.js";
import { KINDS, kindTitle, goalList, changeGoals, goalStats, goalYear, visionYear, GOAL_TEXT_MAX } from "./goals-model.js";

const $ = (s) => document.querySelector(s);
const store = new ScheduleStore();
const icon = {
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4"/></svg>',
  remove: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>',
};
// ?sphere=ID открывает отдельную страницу аспекта, без него — сетка всех аспектов.
const focus = SPHERES.find((s) => s.id === new URLSearchParams(location.search).get("sphere"));
let state = null, busy = false, filter = "all", editing = null, adding = null, toastTimer;

function message(text, sticky = false) {
  clearTimeout(toastTimer);
  $("#sphere-error").textContent = text;
  if (!sticky && text) toastTimer = setTimeout(() => ($("#sphere-error").textContent = ""), 2200);
}

async function update(change) {
  if (busy || !state) return false;
  busy = true;
  try {
    state = normalize(await store.save(changeGoals(state, change)));
    window.dispatchEvent(new CustomEvent("dlife:state", { detail: state }));
    message("Сохранено");
    return true;
  } catch (e) {
    message(e.message, true);
    return false;
  } finally {
    busy = false;
    render();
  }
}

const sorted = (list) => [...list].sort((a, b) => a.done - b.done);
const actions = (g) => `<button type="button" class="sp-icon" data-edit="${esc(g.id)}" aria-label="Изменить">${icon.edit}</button><button type="button" class="sp-icon sp-danger" data-remove="${esc(g.id)}" aria-label="Удалить">${icon.remove}</button>`;
const editForm = (g, rows = 3) => `<form class="gl-edit" data-edit-form="${esc(g.id)}"><textarea name="text" rows="${rows}" maxlength="${GOAL_TEXT_MAX}" required aria-label="Текст">${esc(g.text)}</textarea><div><button class="sp-primary">Сохранить</button><button type="button" class="sp-ghost" data-cancel>Отмена</button></div></form>`;

/* ---------- Сетка всех аспектов ---------- */
function renderTiers() {
  const stats = goalStats(state);
  const tile = (id, ico, title, hint, count) => `<button type="button" class="gl-tier gl-${id}" data-filter="${id}" aria-pressed="${filter === id}">
      <span class="gl-tier-icon">${ico}</span><strong>${title}</strong><small>${hint}</small><b>${count}</b></button>`;
  $("#goal-tiers").innerHTML =
    tile("all", "◎", "Все цели", "Всё по аспектам", stats.total) +
    KINDS.map((k) => tile(k.id, k.icon, kindTitle(k), k.hint, k.id === "vision" ? stats.vision.total : `${stats[k.id].done}/${stats[k.id].total}`)).join("");
}

function itemRow(g) {
  if (editing === g.id) return `<li class="sp-row gl-item is-editing">${editForm(g)}</li>`;
  return `<li class="sp-row sp-goal gl-item${g.done ? " is-done" : ""}">
      <button type="button" class="sp-check" data-toggle="${esc(g.id)}" role="checkbox" aria-checked="${g.done}" aria-label="${esc(g.text)}">${icon.check}</button>
      <span>${esc(g.text)}</span>${actions(g)}</li>`;
}

function group(sphereId, kind, items, single) {
  const key = `${sphereId}:${kind.id}`, open = single || adding === key;
  const list = sorted(items.filter((g) => g.kind === kind.id));
  if (!single && !list.length && !open) return "";
  return `<section class="gl-group gl-${kind.id}">
      ${single ? "" : `<h3><span>${kind.icon}</span>${kindTitle(kind)}</h3>`}
      <ul class="sp-list">${list.map(itemRow).join("")}</ul>
      ${open ? `<form class="gl-form gl-add" data-add-form="${key}"><input name="text" maxlength="${GOAL_TEXT_MAX}" placeholder="${kind.add}" aria-label="${kind.add}" autocomplete="off" required><button class="sp-primary">＋</button></form>` : ""}
    </section>`;
}

function renderGrid() {
  renderTiers();
  const all = goalList(state), kinds = filter === "all" ? KINDS : KINDS.filter((k) => k.id === filter), single = filter !== "all";
  $("#goal-grid").innerHTML = SPHERES.map((sphere) => {
    const items = all.filter((g) => g.sphereId === sphere.id && kinds.some((k) => k.id === g.kind));
    const done = items.filter((g) => g.done).length;
    const missing = KINDS.filter((k) => !single && !items.some((g) => g.kind === k.id) && adding !== `${sphere.id}:${k.id}`);
    return `<article class="sp-card gl-card" style="--accent:${sphere.color}">
        <header class="gl-card-head"><a href="/goals/?sphere=${sphere.id}" title="Открыть ${esc(sphere.name)} на всю страницу"><span class="sp-dot" style="background:${sphere.color}"></span>${esc(sphere.name)}<i class="gl-open">${icon.open}</i></a>${items.length ? `<small>${done}/${items.length}</small>` : ""}</header>
        ${kinds.map((k) => group(sphere.id, k, items, single)).join("")}
        ${missing.length ? `<div class="gl-quick">${missing.map((k) => `<button type="button" class="gl-plus" data-add="${sphere.id}:${k.id}">＋ ${k.icon} ${k.id === "wish" ? "желание" : k.id === "goal" ? `цель ${goalYear()}` : `видение ${visionYear()}`}</button>`).join("")}</div>` : ""}
      </article>`;
  }).join("");
}

/* ---------- Отдельная страница аспекта ---------- */
function daysLeft() {
  const now = new Date(), end = new Date(now.getFullYear(), 11, 31, 23, 59);
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

function block(kind, list, body, form, extra = "") {
  const done = list.filter((g) => g.done).length;
  return `<section class="gd-block gd-b-${kind.id}">
      <header class="gd-block-head"><span class="gd-ico">${kind.icon}</span><div><h2>${kindTitle(kind)}</h2><p>${kind.hint}</p></div>${list.length ? `<b>${kind.id === "vision" ? list.length : `${done}/${list.length}`}</b>` : ""}</header>
      ${extra}${body}${form}
    </section>`;
}

function renderDetail() {
  const items = goalList(state).filter((g) => g.sphereId === focus.id), of = (id) => sorted(items.filter((g) => g.kind === id));
  const [wishKind, goalKind, visionKind] = KINDS, wishes = of("wish"), goals = of("goal"), visions = of("vision");
  const i = SPHERES.indexOf(focus), prev = SPHERES[(i + SPHERES.length - 1) % SPHERES.length], next = SPHERES[(i + 1) % SPHERES.length];
  const addForm = (kind, multiline) => `<form class="gd-add" data-add-form="${focus.id}:${kind.id}">
      ${multiline ? `<textarea name="text" rows="3" maxlength="${GOAL_TEXT_MAX}" placeholder="${kind.add}…" aria-label="${kind.add}" required></textarea>` : `<input name="text" maxlength="${GOAL_TEXT_MAX}" placeholder="${kind.add}" aria-label="${kind.add}" autocomplete="off" required>`}
      <button class="sp-primary">Добавить</button></form>`;

  const wishBody = `<ul class="gd-chips">${wishes.map((g) => editing === g.id ? `<li class="gd-chip-edit">${editForm(g, 2)}</li>` : `<li class="gd-chip${g.done ? " is-done" : ""}">
      <button type="button" data-toggle="${esc(g.id)}" role="checkbox" aria-checked="${g.done}"><i>${icon.check}</i>${esc(g.text)}</button>${actions(g)}</li>`).join("") || '<li class="gd-empty">Что маленькое и приятное можно сделать уже на этой неделе?</li>'}</ul>`;

  const goalDone = goals.filter((g) => g.done).length, pct = goals.length ? (goalDone / goals.length) * 100 : 0;
  const goalBody = `<div class="gd-goals">${goals.map((g) => editing === g.id ? `<article class="gd-goal is-editing">${editForm(g)}</article>` : `<article class="gd-goal${g.done ? " is-done" : ""}">
      <button type="button" class="sp-check" data-toggle="${esc(g.id)}" role="checkbox" aria-checked="${g.done}" aria-label="${esc(g.text)}">${icon.check}</button>
      <p>${esc(g.text)}</p><div class="gd-actions">${actions(g)}</div></article>`).join("") || '<p class="gd-empty">Какой конкретный результат в этом аспекте ты хочешь к концу года?</p>'}</div>`;
  const goalExtra = `<div class="gd-progress"><i><em style="width:${pct}%"></em></i><span>${goals.length ? `Выполнено ${goalDone} из ${goals.length}` : "Целей пока нет"} · до конца ${goalYear()} года ${daysLeft()} дн.</span></div>`;

  const visionBody = `<div class="gd-visions">${visions.map((g) => editing === g.id ? `<figure class="gd-vision is-editing">${editForm(g, 5)}</figure>` : `<figure class="gd-vision${g.done ? " is-done" : ""}">
      <blockquote>${esc(g.text)}</blockquote>
      <figcaption><button type="button" class="gd-came-true" data-toggle="${esc(g.id)}" aria-pressed="${g.done}">${g.done ? "✓ Сбылось" : "Отметить, когда сбудется"}</button><span class="gd-actions">${actions(g)}</span></figcaption></figure>`).join("") || `<p class="gd-empty">Кем ты хочешь быть в этом аспекте к концу ${visionYear()}? Опиши это так, будто уже случилось.</p>`}</div>`;

  $("#goal-detail").innerHTML = `
    <header class="gd-hero">
      <div class="gd-hero-top"><a href="/goals/" class="sp-back">← Все цели</a><a class="gd-sphere-link" href="/sphere/?id=${focus.id}">Страница аспекта ↗</a></div>
      <div class="gd-title"><span class="gd-dot"></span><h1>${esc(focus.name)}</h1></div>
      <p class="gd-stats"><span>✨ ${wishes.filter((g) => g.done).length}/${wishes.length} желаний</span><span>🎯 ${goalDone}/${goals.length} целей</span><span>🔭 ${visions.length} в видении</span></p>
      <nav class="gd-nav" aria-label="Другие аспекты"><a href="/goals/?sphere=${prev.id}" style="--c:${prev.color}">← ${esc(prev.name)}</a><a href="/goals/?sphere=${next.id}" style="--c:${next.color}">${esc(next.name)} →</a></nav>
    </header>
    ${block(visionKind, visions, visionBody, addForm(visionKind, true))}
    ${block(goalKind, goals, goalBody, addForm(goalKind), goalExtra)}
    ${block(wishKind, wishes, wishBody, addForm(wishKind))}`;
}

function render() {
  if (!state) return;
  if (focus) renderDetail(); else renderGrid();
}

if (focus) {
  document.title = `dLife — Цели · ${focus.name}`;
  document.documentElement.style.setProperty("--sphere-accent", focus.color);
  for (const id of ["#goal-head", "#goal-tiers", "#goal-grid", "#goal-back"]) $(id).hidden = true;
  $("#goal-detail").hidden = false;
}

$("#goal-tiers").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  filter = b.dataset.filter;
  editing = adding = null;
  render();
});

const main = $("main");
main.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || busy || b.closest("#goal-tiers")) return;
  const d = b.dataset;
  if (d.add) { adding = d.add; editing = null; render(); $(`[data-add-form="${d.add}"] input`)?.focus(); }
  else if (d.edit) { editing = d.edit; adding = null; render(); $(`[data-edit-form="${d.edit}"] textarea`)?.focus(); }
  else if (d.cancel !== undefined) { editing = null; render(); }
  else if (d.toggle) update((list) => { const g = list.find((x) => x.id === d.toggle); g.done = !g.done; });
  else if (d.remove && confirm("Удалить?")) update((list) => list.splice(list.findIndex((x) => x.id === d.remove), 1));
});

main.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, text = String(new FormData(f).get("text") || "").trim();
  if (!text) return;
  if (f.dataset.addForm) {
    const key = f.dataset.addForm, [sphereId, kind] = key.split(":");
    const ok = await update((list) => list.push({ id: crypto.randomUUID(), sphereId, kind, text, done: false, year: kind === "vision" ? visionYear() : goalYear() }));
    if (ok) {
      adding = !focus && filter === "all" ? key : null;
      render();
      $(`[data-add-form="${key}"] input, [data-add-form="${key}"] textarea`)?.focus();
    }
  } else if (f.dataset.editForm) {
    const id = f.dataset.editForm;
    editing = null;
    await update((list) => (list.find((x) => x.id === id).text = text));
  }
});

main.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { editing = adding = null; render(); }
  // Ctrl/⌘+Enter отправляет многострочное поле
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.matches("textarea")) e.target.form?.requestSubmit();
});

try {
  state = normalize(await store.load());
  window.dispatchEvent(new CustomEvent("dlife:state", { detail: state }));
  render();
} catch (e) {
  message(e.message, true);
}
