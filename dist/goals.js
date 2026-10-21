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
let state = null, busy = false, filter = "all", editing = null, adding = null, groupEditing = null, groupAdding = false, toastTimer;
// Свёрнутые группы и категории запоминаются на этом устройстве.
const COLLAPSED_KEY = "dlife-goal-groups-collapsed";
const collapsed = new Set((() => { try { return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]"); } catch { return []; } })());
const saveCollapsed = () => { try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed])); } catch {} };
// Группы желаний и категории видения устроены одинаково, отличаются только словами.
const GROUP_TEXT = {
  wish: { one: "группа", add: "＋ Новая группа", none: "Без группы", label: "Группа", name: "Название группы, например «Утро» или «Дом»", empty: "В этой группе пока пусто — добавь первое желание.", item: (n) => `Новое желание в «${n}»`, remove: "Удалить группу? Желания из неё останутся, просто без группы." },
  vision: { one: "категория", add: "＋ Новая категория", none: "Без категории", label: "Категория", name: "Название категории, например «Дом», «Карьера», «Путешествия»", empty: "В этой категории пока пусто — опиши, какой ты видишь эту часть жизни.", item: (n) => `Новая картина в «${n}»…`, remove: "Удалить категорию? Записи видения из неё останутся, просто без категории." },
};

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

const groupKind = (grp) => grp?.kind || "wish";
const groupsOf = (sphereId, kind = "wish") => (state.wishGroups || []).filter((x) => x.sphereId === sphereId && groupKind(x) === kind);
const groupName = (id) => (state.wishGroups || []).find((x) => x.id === id)?.name;
const sorted = (list) => [...list].sort((a, b) => a.done - b.done);
const actions = (g) => `<button type="button" class="sp-icon" data-edit="${esc(g.id)}" aria-label="Изменить">${icon.edit}</button><button type="button" class="sp-icon sp-danger" data-remove="${esc(g.id)}" aria-label="Удалить">${icon.remove}</button>`;
const groupSelect = (g) => {
  const t = GROUP_TEXT[g.kind], groups = t ? groupsOf(g.sphereId, g.kind) : [];
  return groups.length ? `<select name="group" aria-label="${t.label}"><option value="">${t.none}</option>${groups.map((x) => `<option value="${esc(x.id)}"${g.groupId === x.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : "";
};
const editForm = (g, rows = 3) => `<form class="gl-edit" data-edit-form="${esc(g.id)}"><textarea name="text" rows="${rows}" maxlength="${GOAL_TEXT_MAX}" required aria-label="Текст">${esc(g.text)}</textarea>${groupSelect(g)}<div><button class="sp-primary">Сохранить</button><button type="button" class="sp-ghost" data-cancel>Отмена</button></div></form>`;

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
      <span>${esc(g.text)}</span>${g.groupId && groupName(g.groupId) ? `<em class="gl-tag">${esc(groupName(g.groupId))}</em>` : ""}${actions(g)}</li>`;
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
        ${missing.length ? `<div class="gl-quick">${missing.map((k) => `<button type="button" class="gl-plus" data-add="${sphere.id}:${k.id}">＋ ${k.icon} ${k.id === "wish" ? "желание" : k.id === "goal" ? `цель ${goalYear()}` : "видение"}</button>`).join("")}</div>` : ""}
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

  const chip = (g) => editing === g.id ? `<li class="gd-chip-edit">${editForm(g, 2)}</li>` : `<li class="gd-chip${g.done ? " is-done" : ""}">
      <button type="button" data-toggle="${esc(g.id)}" role="checkbox" aria-checked="${g.done}"><i>${icon.check}</i>${esc(g.text)}</button>${actions(g)}</li>`;
  const chips = (list, hint) => `<ul class="gd-chips">${list.map(chip).join("") || (hint ? `<li class="gd-empty">${hint}</li>` : "")}</ul>`;
  const visionCard = (g) => editing === g.id ? `<figure class="gd-vision is-editing">${editForm(g, 5)}</figure>` : `<figure class="gd-vision${g.done ? " is-done" : ""}">
      <blockquote>${esc(g.text)}</blockquote>
      <figcaption><button type="button" class="gd-came-true" data-toggle="${esc(g.id)}" aria-pressed="${g.done}">${g.done ? "✓ Сбылось" : "Отметить, когда сбудется"}</button><span class="gd-actions">${actions(g)}</span></figcaption></figure>`;
  const visionList = (list, hint) => `<div class="gd-visions">${list.map(visionCard).join("") || (hint ? `<p class="gd-empty">${hint}</p>` : "")}</div>`;
  const view = { wish: chips, vision: visionList };

  const groupHead = (grp, list) => {
    const done = list.filter((g) => g.done).length, t = GROUP_TEXT[groupKind(grp)];
    if (groupEditing === grp.id) return `<form class="gd-group-form" data-group-form="${esc(grp.id)}"><input name="name" value="${esc(grp.name)}" maxlength="60" required aria-label="Название: ${t.one}"><button class="sp-primary">Сохранить</button><button type="button" class="sp-ghost" data-group-cancel>Отмена</button></form>`;
    return `<header class="gd-group-head"><button type="button" class="gd-group-toggle" data-group-toggle="${esc(grp.id)}" aria-expanded="${!collapsed.has(grp.id)}" aria-label="Свернуть или развернуть «${esc(grp.name)}»"><svg viewBox="0 0 24 24"><path d="m8 10 4 4 4-4"/></svg></button>
      <h3 data-group-toggle="${esc(grp.id)}">${esc(grp.name)}</h3><small>${done}/${list.length}</small>
      <span class="gd-actions"><button type="button" class="sp-icon" data-group-edit="${esc(grp.id)}" aria-label="Переименовать">${icon.edit}</button><button type="button" class="sp-icon sp-danger" data-group-remove="${esc(grp.id)}" aria-label="Удалить">${icon.remove}</button></span></header>`;
  };
  const groupBlock = (grp, items) => {
    const kind = groupKind(grp), t = GROUP_TEXT[kind], list = sorted(items.filter((g) => g.groupId === grp.id)), hint = esc(t.item(grp.name));
    const field = kind === "vision"
      ? `<textarea name="text" rows="2" maxlength="${GOAL_TEXT_MAX}" placeholder="${hint}" aria-label="${hint}" required></textarea>`
      : `<input name="text" maxlength="${GOAL_TEXT_MAX}" placeholder="${hint}" aria-label="${hint}" autocomplete="off" required>`;
    return `<section class="gd-group${collapsed.has(grp.id) ? " is-collapsed" : ""}">${groupHead(grp, list)}
      <div class="gd-group-body">${view[kind](list, t.empty)}
        <form class="gd-add gd-add-mini" data-add-form="${focus.id}:${kind}" data-group="${esc(grp.id)}">${field}<button class="sp-primary" aria-label="Добавить">＋</button></form></div></section>`;
  };
  // Блок с группами: кнопки «новая группа» / «свернуть все», сами группы и записи без группы.
  const grouped = (kind, items, looseHint) => {
    const t = GROUP_TEXT[kind], groups = groupsOf(focus.id, kind), loose = items.filter((g) => !groups.some((x) => x.id === g.groupId));
    const tools = groupAdding === kind
      ? `<form class="gd-group-form gd-group-new" data-group-form="new:${kind}"><input name="name" maxlength="60" placeholder="${t.name}" aria-label="${t.name}" autocomplete="off" required><button class="sp-primary">Создать</button><button type="button" class="sp-ghost" data-group-cancel>Отмена</button></form>`
      : `<button type="button" class="gd-group-add" data-group-add="${kind}">${t.add}</button>${groups.length > 1 ? `<button type="button" class="gd-group-all" data-group-all="${kind}">${groups.every((x) => collapsed.has(x.id)) ? "Развернуть все" : "Свернуть все"}</button>` : ""}`;
    return `<div class="gd-group-tools">${tools}</div>
      ${groups.length ? `<div class="gd-groups">${groups.map((grp) => groupBlock(grp, items)).join("")}</div>` : ""}
      ${groups.length && loose.length ? `<h3 class="gd-loose">${t.none}</h3>` : ""}
      ${!groups.length || loose.length ? view[kind](loose, groups.length ? "" : looseHint) : ""}`;
  };
  const wishBody = grouped("wish", wishes, "Что маленькое и приятное можно сделать уже на этой неделе? Желания можно собирать в группы.");

  const goalDone = goals.filter((g) => g.done).length, pct = goals.length ? (goalDone / goals.length) * 100 : 0;
  const goalBody = `<div class="gd-goals">${goals.map((g) => editing === g.id ? `<article class="gd-goal is-editing">${editForm(g)}</article>` : `<article class="gd-goal${g.done ? " is-done" : ""}">
      <button type="button" class="sp-check" data-toggle="${esc(g.id)}" role="checkbox" aria-checked="${g.done}" aria-label="${esc(g.text)}">${icon.check}</button>
      <p>${esc(g.text)}</p><div class="gd-actions">${actions(g)}</div></article>`).join("") || '<p class="gd-empty">Какой конкретный результат в этом аспекте ты хочешь к концу года?</p>'}</div>`;
  const goalExtra = `<div class="gd-progress"><i><em style="width:${pct}%"></em></i><span>${goals.length ? `Выполнено ${goalDone} из ${goals.length}` : "Целей пока нет"} · до конца ${goalYear()} года ${daysLeft()} дн.</span></div>`;

  const visionBody = grouped("vision", visions, "Какой ты хочешь видеть свою идеальную картину в этом аспекте через несколько лет? Опиши её так, будто всё уже случилось. Записи можно разложить по категориям — «Дом», «Карьера», «Путешествия».");

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

function toggleGroup(id) {
  collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
  saveCollapsed();
  render();
}

const main = $("main");
main.addEventListener("click", (e) => {
  // Группу можно открыть и закрыть и кликом по её названию.
  const title = e.target.closest("h3[data-group-toggle]");
  if (title && !busy) return toggleGroup(title.dataset.groupToggle);
  const b = e.target.closest("button");
  if (!b || busy || b.closest("#goal-tiers")) return;
  const d = b.dataset;
  if (d.add) { adding = d.add; editing = null; render(); $(`[data-add-form="${d.add}"] input`)?.focus(); }
  else if (d.edit) { editing = d.edit; adding = null; render(); $(`[data-edit-form="${d.edit}"] textarea`)?.focus(); }
  else if (d.cancel !== undefined) { editing = null; render(); }
  else if (d.groupAdd) { groupAdding = d.groupAdd; groupEditing = null; render(); $(`[data-group-form="new:${d.groupAdd}"] input`)?.focus(); }
  else if (d.groupAll) {
    const ids = groupsOf(focus.id, d.groupAll).map((x) => x.id), close = !ids.every((id) => collapsed.has(id));
    for (const id of ids) close ? collapsed.add(id) : collapsed.delete(id);
    saveCollapsed();
    render();
  }
  else if (d.groupEdit) { groupEditing = d.groupEdit; groupAdding = false; render(); $(`[data-group-form="${d.groupEdit}"] input`)?.focus(); }
  else if (d.groupCancel !== undefined) { groupAdding = false; groupEditing = null; render(); }
  else if (d.groupToggle) toggleGroup(d.groupToggle);
  else if (d.groupRemove && confirm(GROUP_TEXT[groupKind(state.wishGroups.find((x) => x.id === d.groupRemove))].remove)) update((list, groups) => {
    groups.splice(groups.findIndex((x) => x.id === d.groupRemove), 1);
    for (const g of list) if (g.groupId === d.groupRemove) delete g.groupId;
  });
  else if (d.toggle) update((list) => { const g = list.find((x) => x.id === d.toggle); g.done = !g.done; });
  else if (d.remove && confirm("Удалить?")) update((list) => list.splice(list.findIndex((x) => x.id === d.remove), 1));
});

main.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, data = new FormData(f), text = String(data.get("text") || data.get("name") || "").trim();
  if (!text) return;
  if (f.dataset.groupForm) {
    const id = f.dataset.groupForm, name = text, kind = id.startsWith("new:") ? id.slice(4) : "";
    groupAdding = false;
    groupEditing = null;
    if (kind) await update((list, groups) => groups.push({ id: crypto.randomUUID(), sphereId: focus.id, name, ...(kind === "wish" ? {} : { kind }) }));
    else await update((list, groups) => (groups.find((x) => x.id === id).name = name));
    return;
  }
  if (f.dataset.addForm) {
    const key = f.dataset.addForm, [sphereId, kind] = key.split(":"), groupId = f.dataset.group || "";
    const ok = await update((list) => list.push({ id: crypto.randomUUID(), sphereId, kind, text, done: false, year: kind === "vision" ? visionYear() : goalYear(), ...(groupId ? { groupId } : {}) }));
    if (ok) {
      adding = !focus && filter === "all" ? key : null;
      render();
      const scope = groupId ? `[data-group="${groupId}"]` : ":not([data-group])";
      $(`[data-add-form="${key}"]${scope} input, [data-add-form="${key}"]${scope} textarea`)?.focus();
    }
  } else if (f.dataset.editForm) {
    const id = f.dataset.editForm, group = data.get("group");
    editing = null;
    await update((list) => {
      const g = list.find((x) => x.id === id);
      g.text = text;
      if (group !== null) group ? (g.groupId = group) : delete g.groupId;
    });
  }
});

main.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { editing = adding = groupEditing = null; groupAdding = false; render(); }
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
