import { icon as ic } from "./icons.js";
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
  chevron: '<svg viewBox="0 0 24 24"><path d="m8 10 4 4 4-4"/></svg>',
};
// /goals/ — три раздела; ?kind=wish|goal|vision — раздел со всеми аспектами; ?sphere=ID — один аспект целиком.
const params = new URLSearchParams(location.search);
const focus = SPHERES.find((s) => s.id === params.get("sphere"));
const section = focus ? null : KINDS.find((k) => k.id === params.get("kind"));
let state = null, busy = false, editing = null, adding = null, groupEditing = null, groupAdding = null, toastTimer;

// Открытые аспекты в разделах и свёрнутые группы запоминаются на этом устройстве.
const remembered = (key) => {
  const set = new Set((() => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } })());
  set.save = () => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch {} };
  return set;
};
const collapsed = remembered("dlife-goal-groups-collapsed");
const openAspects = remembered("dlife-goal-aspects-open");

// Группы желаний и категории видения устроены одинаково, отличаются только словами.
const GROUP_TEXT = {
  wish: { one: "группа", add: "＋ Новая группа", none: "Без группы", label: "Группа", name: "Название группы, например «Утро» или «Дом»", empty: "В этой группе пока пусто — добавь первое желание.", item: (n) => `Новое желание в «${n}»`, remove: "Удалить группу? Желания из неё останутся, просто без группы." },
  vision: { one: "категория", add: "＋ Новая категория", none: "Без категории", label: "Категория", name: "Название категории, например «Дом», «Карьера», «Путешествия»", empty: "В этой категории пока пусто — опиши, какой ты видишь эту часть жизни.", item: (n) => `Новая картина в «${n}»…`, remove: "Удалить категорию? Записи видения из неё останутся, просто без категории." },
};
const EMPTY = {
  wish: "Что маленькое и приятное можно сделать уже на этой неделе? Желания можно собирать в группы.",
  goal: "Какой конкретный результат в этом аспекте ты хочешь к концу года?",
  vision: "Какой ты хочешь видеть свою идеальную картину в этом аспекте через несколько лет? Опиши её так, будто всё уже случилось. Записи можно разложить по категориям — «Дом», «Карьера», «Путешествия».",
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

/* ---------- Общие кусочки: записи, группы, формы ---------- */
const groupKind = (grp) => grp?.kind || "wish";
const groupsOf = (sphereId, kind = "wish") => (state.wishGroups || []).filter((x) => x.sphereId === sphereId && groupKind(x) === kind);
const sorted = (list) => [...list].sort((a, b) => a.done - b.done);
const itemsOf = (sphereId, kind) => sorted(goalList(state).filter((g) => g.sphereId === sphereId && g.kind === kind));
const countOf = (kind, list) => (kind === "vision" ? `${list.length}` : `${list.filter((g) => g.done).length}/${list.length}`);
const actions = (g) => `<button type="button" class="sp-icon" data-edit="${esc(g.id)}" aria-label="Изменить">${icon.edit}</button><button type="button" class="sp-icon sp-danger" data-remove="${esc(g.id)}" aria-label="Удалить">${icon.remove}</button>`;
const groupSelect = (g) => {
  const t = GROUP_TEXT[g.kind], groups = t ? groupsOf(g.sphereId, g.kind) : [];
  return groups.length ? `<select name="group" aria-label="${t.label}"><option value="">${t.none}</option>${groups.map((x) => `<option value="${esc(x.id)}"${g.groupId === x.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : "";
};
const editForm = (g, rows = 3) => `<form class="gl-edit" data-edit-form="${esc(g.id)}"><textarea name="text" rows="${rows}" maxlength="${GOAL_TEXT_MAX}" required aria-label="Текст">${esc(g.text)}</textarea>${groupSelect(g)}<div><button class="sp-primary">Сохранить</button><button type="button" class="sp-ghost" data-cancel>Отмена</button></div></form>`;
const addForm = (sphereId, kind) => `<form class="gd-add" data-add-form="${sphereId}:${kind.id}">
    ${kind.id === "vision" ? `<textarea name="text" rows="3" maxlength="${GOAL_TEXT_MAX}" placeholder="${kind.add}…" aria-label="${kind.add}" required></textarea>` : `<input name="text" maxlength="${GOAL_TEXT_MAX}" placeholder="${kind.add}" aria-label="${kind.add}" autocomplete="off" required>`}
    <button class="sp-primary">Добавить</button></form>`;

const chip = (g) => editing === g.id ? `<li class="gd-chip-edit">${editForm(g, 2)}</li>` : `<li class="gd-chip${g.done ? " is-done" : ""}">
    <button type="button" data-toggle="${esc(g.id)}" role="checkbox" aria-checked="${g.done}"><i>${icon.check}</i>${esc(g.text)}</button>${actions(g)}</li>`;
const chips = (list, hint) => `<ul class="gd-chips">${list.map(chip).join("") || (hint ? `<li class="gd-empty">${hint}</li>` : "")}</ul>`;
const visionCard = (g) => editing === g.id ? `<figure class="gd-vision is-editing">${editForm(g, 5)}</figure>` : `<figure class="gd-vision${g.done ? " is-done" : ""}">
    <blockquote>${esc(g.text)}</blockquote>
    <figcaption><button type="button" class="gd-came-true" data-toggle="${esc(g.id)}" aria-pressed="${g.done}">${g.done ? `${ic("check")} Сбылось` : "Отметить, когда сбудется"}</button><span class="gd-actions">${actions(g)}</span></figcaption></figure>`;
const visionList = (list, hint) => `<div class="gd-visions">${list.map(visionCard).join("") || (hint ? `<p class="gd-empty">${hint}</p>` : "")}</div>`;
const goalCards = (list, hint) => `<div class="gd-goals">${list.map((g) => editing === g.id ? `<article class="gd-goal is-editing">${editForm(g)}</article>` : `<article class="gd-goal${g.done ? " is-done" : ""}">
    <button type="button" class="sp-check" data-toggle="${esc(g.id)}" role="checkbox" aria-checked="${g.done}" aria-label="${esc(g.text)}">${icon.check}</button>
    <p>${esc(g.text)}</p><div class="gd-actions">${actions(g)}</div></article>`).join("") || (hint ? `<p class="gd-empty">${hint}</p>` : "")}</div>`;
const view = { wish: chips, vision: visionList, goal: goalCards };

function groupHead(grp, list) {
  const t = GROUP_TEXT[groupKind(grp)];
  if (groupEditing === grp.id) return `<form class="gd-group-form" data-group-form="${esc(grp.id)}"><input name="name" value="${esc(grp.name)}" maxlength="60" required aria-label="Название: ${t.one}"><button class="sp-primary">Сохранить</button><button type="button" class="sp-ghost" data-group-cancel>Отмена</button></form>`;
  return `<header class="gd-group-head"><button type="button" class="gd-group-toggle" data-group-toggle="${esc(grp.id)}" aria-expanded="${!collapsed.has(grp.id)}" aria-label="Свернуть или развернуть «${esc(grp.name)}»">${icon.chevron}</button>
    <h3 data-group-toggle="${esc(grp.id)}">${esc(grp.name)}</h3><small>${list.filter((g) => g.done).length}/${list.length}</small>
    <span class="gd-actions"><button type="button" class="sp-icon" data-group-edit="${esc(grp.id)}" aria-label="Переименовать">${icon.edit}</button><button type="button" class="sp-icon sp-danger" data-group-remove="${esc(grp.id)}" aria-label="Удалить">${icon.remove}</button></span></header>`;
}

function groupBlock(grp, items) {
  const kind = groupKind(grp), t = GROUP_TEXT[kind], list = items.filter((g) => g.groupId === grp.id), hint = esc(t.item(grp.name));
  const field = kind === "vision"
    ? `<textarea name="text" rows="2" maxlength="${GOAL_TEXT_MAX}" placeholder="${hint}" aria-label="${hint}" required></textarea>`
    : `<input name="text" maxlength="${GOAL_TEXT_MAX}" placeholder="${hint}" aria-label="${hint}" autocomplete="off" required>`;
  return `<section class="gd-group${collapsed.has(grp.id) ? " is-collapsed" : ""}">${groupHead(grp, list)}
    <div class="gd-group-body">${view[kind](list, t.empty)}
      <form class="gd-add gd-add-mini" data-add-form="${grp.sphereId}:${kind}" data-group="${esc(grp.id)}">${field}<button class="sp-primary" aria-label="Добавить">＋</button></form></div></section>`;
}

// Записи аспекта с группами: кнопки «новая группа» / «свернуть все», сами группы и записи без группы.
function grouped(sphereId, kind, items) {
  const t = GROUP_TEXT[kind], groups = groupsOf(sphereId, kind), loose = items.filter((g) => !groups.some((x) => x.id === g.groupId));
  const tools = groupAdding === `${kind}:${sphereId}`
    ? `<form class="gd-group-form gd-group-new" data-group-form="new:${kind}:${sphereId}"><input name="name" maxlength="60" placeholder="${t.name}" aria-label="${t.name}" autocomplete="off" required><button class="sp-primary">Создать</button><button type="button" class="sp-ghost" data-group-cancel>Отмена</button></form>`
    : `<button type="button" class="gd-group-add" data-group-add="${kind}" data-sphere="${sphereId}">${t.add}</button>${groups.length > 1 ? `<button type="button" class="gd-group-all" data-group-all="${kind}" data-sphere="${sphereId}">${groups.every((x) => collapsed.has(x.id)) ? "Развернуть все" : "Свернуть все"}</button>` : ""}`;
  return `<div class="gd-group-tools">${tools}</div>
    ${groups.length ? `<div class="gd-groups">${groups.map((grp) => groupBlock(grp, items)).join("")}</div>` : ""}
    ${groups.length && loose.length ? `<h3 class="gd-loose">${t.none}</h3>` : ""}
    ${!groups.length || loose.length ? view[kind](loose, groups.length ? "" : EMPTY[kind]) : ""}`;
}

function daysLeft() {
  const now = new Date(), end = new Date(now.getFullYear(), 11, 31, 23, 59);
  return Math.max(0, Math.ceil((end - now) / 86400000));
}
const progress = (list) => {
  const done = list.filter((g) => g.done).length, pct = list.length ? (done / list.length) * 100 : 0;
  return `<div class="gd-progress"><i><em style="width:${pct}%"></em></i><span>${list.length ? `Выполнено ${done} из ${list.length}` : "Целей пока нет"} · до конца ${goalYear()} года ${daysLeft()} дн.</span></div>`;
};

/* ---------- /goals/: три раздела ---------- */
function renderHome() {
  const stats = goalStats(state), all = goalList(state);
  $("#goal-tiers").innerHTML = KINDS.map((k) => {
    const spheres = new Set(all.filter((g) => g.kind === k.id).map((g) => g.sphereId)).size;
    const count = k.id === "vision" ? stats.vision.total : `${stats[k.id].done}/${stats[k.id].total}`;
    return `<a class="gl-tier gl-${k.id}" href="/goals/?kind=${k.id}">
      <span class="gl-tier-icon">${k.icon}</span><strong>${kindTitle(k)}</strong><small>${k.hint}</small>
      <span class="gl-tier-foot">${spheres ? `${spheres} из ${SPHERES.length} аспектов` : "Пока пусто"}<i>${icon.open}</i></span><b>${count}</b></a>`;
  }).join("");
}

/* ---------- ?kind=…: раздел со списком аспектов ---------- */
function renderSection() {
  const kind = section, all = goalList(state).filter((g) => g.kind === kind.id);
  const others = KINDS.filter((k) => k !== kind);
  const hero = `<header class="gk-hero gl-${kind.id}">
      <div class="gd-hero-top"><a href="/goals/" class="sp-back">← Мои цели</a><nav class="gk-switch" aria-label="Другие разделы">${others.map((k) => `<a href="/goals/?kind=${k.id}">${k.icon} ${kindTitle(k)}</a>`).join("")}</nav></div>
      <div class="gk-title"><span class="gd-ico">${kind.icon}</span><div><h1>${kindTitle(kind)}</h1><p>${kind.hint}</p></div><b>${countOf(kind.id, all)}</b></div>
      ${kind.id === "goal" ? progress(all) : kind.id === "vision" ? '<p class="gk-tip">Открой аспект, чтобы увидеть его картину будущего.</p>' : '<p class="gk-tip">Открой аспект, чтобы увидеть его желания.</p>'}
      ${kind.id === "goal" ? "" : `<button type="button" class="gd-group-all gk-all" data-aspects-all>${SPHERES.every((s) => openAspects.has(`${kind.id}:${s.id}`)) ? "Свернуть все аспекты" : "Развернуть все аспекты"}</button>`}
    </header>`;

  const aspect = (sphere) => {
    const items = itemsOf(sphere.id, kind.id), key = `${sphere.id}:${kind.id}`, pageLink = `<a class="gk-page" href="/goals/?sphere=${sphere.id}" title="Всё по аспекту «${esc(sphere.name)}»">Весь аспект ${icon.open}</a>`;
    if (kind.id === "goal") {
      // Цели на год: все аспекты открыты сразу, пустые — одной строкой.
      const open = items.length || adding === key;
      return `<section class="gk-aspect gk-goal${open ? "" : " is-empty"}" style="--accent:${sphere.color}">
        <header class="gk-head"><span class="sp-dot" style="background:${sphere.color}"></span><h2>${esc(sphere.name)}</h2>${items.length ? `<small>${countOf("goal", items)}</small>` : ""}
          ${adding === key ? "" : `<button type="button" class="gl-plus" data-add="${key}">＋ Цель</button>`}${pageLink}</header>
        ${items.length ? goalCards(items) : ""}${adding === key ? addForm(sphere.id, kind) : ""}</section>`;
    }
    const openKey = `${kind.id}:${sphere.id}`, isOpen = openAspects.has(openKey);
    return `<section class="gk-aspect gk-fold${isOpen ? " is-open" : ""}" style="--accent:${sphere.color}">
      <header class="gk-head"><button type="button" class="gk-toggle" data-aspect-toggle="${openKey}" aria-expanded="${isOpen}">
        <span class="sp-dot" style="background:${sphere.color}"></span><h2>${esc(sphere.name)}</h2><small>${items.length ? countOf(kind.id, items) : "пусто"}</small><i>${icon.chevron}</i></button></header>
      ${isOpen ? `<div class="gk-body gd-b-${kind.id}">${grouped(sphere.id, kind.id, items)}${addForm(sphere.id, kind)}<div class="gk-body-foot">${pageLink}</div></div>` : ""}</section>`;
  };
  $("#goal-grid").innerHTML = hero + `<div class="gk-list gl-${kind.id}">${SPHERES.map(aspect).join("")}</div>`;
}

/* ---------- ?sphere=ID: один аспект целиком ---------- */
function block(kind, list, body, form, extra = "") {
  return `<section class="gd-block gd-b-${kind.id}">
      <header class="gd-block-head"><span class="gd-ico">${kind.icon}</span><div><h2>${kindTitle(kind)}</h2><p>${kind.hint}</p></div>${list.length ? `<b>${countOf(kind.id, list)}</b>` : ""}</header>
      ${extra}${body}${form}
    </section>`;
}

function renderDetail() {
  const [wishKind, goalKind, visionKind] = KINDS, of = (id) => itemsOf(focus.id, id);
  const wishes = of("wish"), goals = of("goal"), visions = of("vision");
  const i = SPHERES.indexOf(focus), prev = SPHERES[(i + SPHERES.length - 1) % SPHERES.length], next = SPHERES[(i + 1) % SPHERES.length];
  $("#goal-detail").innerHTML = `
    <header class="gd-hero">
      <div class="gd-hero-top"><a href="/goals/" class="sp-back">← Мои цели</a><a class="gd-sphere-link" href="/sphere/?id=${focus.id}">Страница аспекта ↗</a></div>
      <div class="gd-title"><span class="gd-dot"></span><h1>${esc(focus.name)}</h1></div>
      <p class="gd-stats"><span>${ic("sparkle")} ${wishes.filter((g) => g.done).length}/${wishes.length} желаний</span><span>${ic("target")} ${goals.filter((g) => g.done).length}/${goals.length} целей</span><span>${ic("vision")} ${visions.length} в видении</span></p>
      <nav class="gd-nav" aria-label="Другие аспекты"><a href="/goals/?sphere=${prev.id}" style="--c:${prev.color}">← ${esc(prev.name)}</a><a href="/goals/?sphere=${next.id}" style="--c:${next.color}">${esc(next.name)} →</a></nav>
    </header>
    ${block(visionKind, visions, grouped(focus.id, "vision", visions), addForm(focus.id, visionKind))}
    ${block(goalKind, goals, goalCards(goals, EMPTY.goal), addForm(focus.id, goalKind), progress(goals))}
    ${block(wishKind, wishes, grouped(focus.id, "wish", wishes), addForm(focus.id, wishKind))}`;
}

function render() {
  if (!state) return;
  if (focus) renderDetail();
  else if (section) renderSection();
  else renderHome();
}

if (focus) {
  document.title = `dLife — Цели · ${focus.name}`;
  document.documentElement.style.setProperty("--sphere-accent", focus.color);
  for (const id of ["#goal-head", "#goal-tiers", "#goal-grid", "#goal-back"]) $(id).hidden = true;
  $("#goal-detail").hidden = false;
} else if (section) {
  document.title = `dLife — ${kindTitle(section)}`;
  for (const id of ["#goal-head", "#goal-tiers", "#goal-back"]) $(id).hidden = true;
  $("#goal-grid").className = "gk";
} else {
  $("#goal-grid").hidden = true;
}

function toggleGroup(id) {
  collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
  collapsed.save();
  render();
}

const main = $("main");
main.addEventListener("click", (e) => {
  // Группу можно открыть и закрыть и кликом по её названию.
  const title = e.target.closest("h3[data-group-toggle]");
  if (title && !busy) return toggleGroup(title.dataset.groupToggle);
  const b = e.target.closest("button");
  if (!b || busy) return;
  const d = b.dataset;
  if (d.aspectToggle) { openAspects.has(d.aspectToggle) ? openAspects.delete(d.aspectToggle) : openAspects.add(d.aspectToggle); openAspects.save(); render(); }
  else if (d.aspectsAll !== undefined) {
    const keys = SPHERES.map((s) => `${section.id}:${s.id}`), close = keys.every((k) => openAspects.has(k));
    for (const k of keys) close ? openAspects.delete(k) : openAspects.add(k);
    openAspects.save(); render();
  }
  else if (d.add) { adding = d.add; editing = null; render(); $(`[data-add-form="${d.add}"] input`)?.focus(); }
  else if (d.edit) { editing = d.edit; adding = null; render(); $(`[data-edit-form="${d.edit}"] textarea`)?.focus(); }
  else if (d.cancel !== undefined) { editing = null; render(); }
  else if (d.groupAdd) { groupAdding = `${d.groupAdd}:${d.sphere}`; groupEditing = null; render(); $(`[data-group-form="new:${d.groupAdd}:${d.sphere}"] input`)?.focus(); }
  else if (d.groupAll) {
    const ids = groupsOf(d.sphere, d.groupAll).map((x) => x.id), close = !ids.every((id) => collapsed.has(id));
    for (const id of ids) close ? collapsed.add(id) : collapsed.delete(id);
    collapsed.save();
    render();
  }
  else if (d.groupEdit) { groupEditing = d.groupEdit; groupAdding = null; render(); $(`[data-group-form="${d.groupEdit}"] input`)?.focus(); }
  else if (d.groupCancel !== undefined) { groupAdding = groupEditing = null; render(); }
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
    const id = f.dataset.groupForm, name = text, [, kind, sphereId] = id.startsWith("new:") ? id.split(":") : [];
    groupAdding = groupEditing = null;
    if (kind) await update((list, groups) => groups.push({ id: crypto.randomUUID(), sphereId, name, ...(kind === "wish" ? {} : { kind }) }));
    else await update((list, groups) => (groups.find((x) => x.id === id).name = name));
    return;
  }
  if (f.dataset.addForm) {
    const key = f.dataset.addForm, [sphereId, kind] = key.split(":"), groupId = f.dataset.group || "";
    const ok = await update((list) => list.push({ id: crypto.randomUUID(), sphereId, kind, text, done: false, year: kind === "vision" ? visionYear() : goalYear(), ...(groupId ? { groupId } : {}) }));
    if (ok) {
      // В разделе целей поле остаётся открытым — можно записать несколько подряд.
      adding = section?.id === "goal" ? key : null;
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
  if (e.key === "Escape") { editing = adding = groupEditing = groupAdding = null; render(); }
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
