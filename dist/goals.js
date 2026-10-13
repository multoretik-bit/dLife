import { SPHERES } from "./schedule.js";
import { ScheduleStore } from "./store.js";
import { normalize, escapeHTML as esc } from "./development.js";
import { KINDS, kindTitle, goalList, changeGoals, goalStats, goalYear, visionYear } from "./goals-model.js";

const $ = (s) => document.querySelector(s);
const store = new ScheduleStore();
const icon = {
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4"/></svg>',
  remove: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
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

function renderTiers() {
  const stats = goalStats(state);
  const tile = (id, ico, title, hint, count) => `<button type="button" class="gl-tier gl-${id}" data-filter="${id}" aria-pressed="${filter === id}">
      <span class="gl-tier-icon">${ico}</span><strong>${title}</strong><small>${hint}</small><b>${count}</b></button>`;
  $("#goal-tiers").innerHTML =
    tile("all", "◎", "Все цели", "Всё по аспектам", stats.total) +
    KINDS.map((k) => tile(k.id, k.icon, kindTitle(k), k.hint, k.id === "vision" ? stats.vision.total : `${stats[k.id].done}/${stats[k.id].total}`)).join("");
}

function itemRow(g) {
  if (editing === g.id)
    return `<li class="sp-row gl-item is-editing"><form class="gl-form" data-edit-form="${esc(g.id)}"><input name="text" value="${esc(g.text)}" maxlength="300" required aria-label="Текст"><button class="sp-primary">Сохранить</button><button type="button" class="sp-ghost" data-cancel>Отмена</button></form></li>`;
  return `<li class="sp-row sp-goal gl-item${g.done ? " is-done" : ""}">
      <button type="button" class="sp-check" data-toggle="${esc(g.id)}" role="checkbox" aria-checked="${g.done}" aria-label="${esc(g.text)}">${icon.check}</button>
      <span>${esc(g.text)}</span>
      <button type="button" class="sp-icon" data-edit="${esc(g.id)}" aria-label="Изменить">${icon.edit}</button>
      <button type="button" class="sp-icon sp-danger" data-remove="${esc(g.id)}" aria-label="Удалить">${icon.remove}</button>
    </li>`;
}

function group(sphereId, kind, items, single) {
  const key = `${sphereId}:${kind.id}`, open = single || adding === key;
  const list = items.filter((g) => g.kind === kind.id).sort((a, b) => a.done - b.done);
  if (!single && !list.length && !open) return "";
  return `<section class="gl-group gl-${kind.id}">
      ${single ? "" : `<h3><span>${kind.icon}</span>${kindTitle(kind)}</h3>`}
      <ul class="sp-list">${list.map(itemRow).join("")}</ul>
      ${open ? `<form class="gl-form gl-add" data-add-form="${key}"><input name="text" maxlength="300" placeholder="${kind.add}" aria-label="${kind.add}" autocomplete="off" required><button class="sp-primary">＋</button></form>` : ""}
    </section>`;
}

function render() {
  if (!state) return;
  renderTiers();
  const all = goalList(state), kinds = filter === "all" ? KINDS : KINDS.filter((k) => k.id === filter), single = filter !== "all";
  $("#goal-grid").innerHTML = SPHERES.map((sphere) => {
    const items = all.filter((g) => g.sphereId === sphere.id && kinds.some((k) => k.id === g.kind));
    const done = items.filter((g) => g.done).length;
    const missing = KINDS.filter((k) => !single && !items.some((g) => g.kind === k.id) && adding !== `${sphere.id}:${k.id}`);
    return `<article class="sp-card gl-card" style="--accent:${sphere.color}">
        <header class="gl-card-head"><a href="/sphere/?id=${sphere.id}"><span class="sp-dot" style="background:${sphere.color}"></span>${esc(sphere.name)}</a>${items.length ? `<small>${done}/${items.length}</small>` : ""}</header>
        ${kinds.map((k) => group(sphere.id, k, items, single)).join("")}
        ${missing.length ? `<div class="gl-quick">${missing.map((k) => `<button type="button" class="gl-plus" data-add="${sphere.id}:${k.id}">＋ ${k.icon} ${k.id === "wish" ? "желание" : k.id === "goal" ? `цель ${goalYear()}` : `видение ${visionYear()}`}</button>`).join("")}</div>` : ""}
      </article>`;
  }).join("");
}

$("#goal-tiers").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  filter = b.dataset.filter;
  editing = adding = null;
  render();
});

$("#goal-grid").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || busy) return;
  const d = b.dataset;
  if (d.add) { adding = d.add; editing = null; render(); $(`[data-add-form="${d.add}"] input`)?.focus(); }
  else if (d.edit) { editing = d.edit; adding = null; render(); $(`[data-edit-form="${d.edit}"] input`)?.focus(); }
  else if (d.cancel !== undefined) { editing = null; render(); }
  else if (d.toggle) update((list) => { const g = list.find((x) => x.id === d.toggle); g.done = !g.done; });
  else if (d.remove && confirm("Удалить?")) update((list) => list.splice(list.findIndex((x) => x.id === d.remove), 1));
});

$("#goal-grid").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, text = new FormData(f).get("text").trim();
  if (!text) return;
  if (f.dataset.addForm) {
    const [sphereId, kind] = f.dataset.addForm.split(":");
    const ok = await update((list) => list.push({ id: crypto.randomUUID(), sphereId, kind, text, done: false, year: kind === "vision" ? visionYear() : goalYear() }));
    if (ok) { adding = filter === "all" ? f.dataset.addForm : null; render(); $(`[data-add-form="${f.dataset.addForm}"] input`)?.focus(); }
  } else if (f.dataset.editForm) {
    const id = f.dataset.editForm;
    editing = null;
    await update((list) => (list.find((x) => x.id === id).text = text));
  }
});

$("#goal-grid").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { editing = adding = null; render(); }
});

try {
  state = normalize(await store.load());
  window.dispatchEvent(new CustomEvent("dlife:state", { detail: state }));
  render();
} catch (e) {
  message(e.message, true);
}
