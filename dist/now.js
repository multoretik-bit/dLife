import {
  SPHERES,
  sphereFor,
  activeBlock,
  validateBlock,
  remainingMinutes,
  dateKey,
} from "./schedule.js";
import { ScheduleStore } from "./store.js";
import {
  escapeHTML as esc,
  occurs,
  completionKey,
  itemDate,
  habitBar,
  setReward,
} from "./development.js";
const $ = (s) => document.querySelector(s),
  store = new ScheduleStore();
let state = null,
  busy = false,
  kind = "block",
  editing = null,
  view = "now",
  selectedDate = dateKey(),
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const selectedId = new URLSearchParams(location.search).get("id");
const dateLabel = (key) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(new Date(key + "T12:00:00"));
function notice(message, error = false) {
  $("#notice").textContent = message;
  $("#notice").classList.toggle("error", error);
}
async function load() {
  try {
    state = await store.load();
    $("#load-error").hidden = true;
    render();
  } catch (e) {
    $("#load-error").hidden = false;
    $("#load-error-text").textContent = e.message;
    $("#now-card").hidden = true;
  }
}
function row(item, date = itemDate(item, state.blocks)) {
  const key = completionKey(item, date),
    done = state.done[key],
    s = sphereFor(item.sphereId);
  return `<div class="activity-wrap" style="--item-color:${s.color}"><label class="activity-row"><input type="checkbox" data-item="${esc(item.id)}" data-date="${date}" ${done ? "checked" : ""} ${busy || date > dateKey() ? "disabled" : ""}><span class="activity-check"></span><span class="activity-name">${esc(item.name)}${item.time ? `<small>${item.time}${item.weekly ? " · каждую неделю" : ""}</small>` : ""}</span><span class="sphere-dot" title="${esc(s.name)}"></span></label>${item.type === "habit" ? habitBar(item, state.done, date) : ""}</div>`;
}
const rows = (items, date) =>
  items.length
    ? items.map((i) => row(i, date)).join("")
    : '<p class="empty-line">Пока ничего не запланировано</p>';
function render() {
  if (!state) return;
  const now = new Date(),
    today = dateKey(now),
    block = selectedId
      ? state.blocks.find((b) => b.id === selectedId)
      : activeBlock(state.blocks, now),
    sphere = sphereFor(block?.sphereId || "6"),
    card = $("#now-card");
  card.hidden = false;
  card.style.setProperty("--sphere", sphere.color);
  card.classList.toggle("is-rest", !block);
  const n = Number(sphere.id) - 1;
  $("#now-visual").style.cssText =
    `--sprite-x:${(n % 5) * 25}%;--sprite-y:${n < 5 ? 0 : 100}%`;
  $("#block-title").textContent =
    selectedId && !block ? "Блок не найден" : block?.name || "Время отдохнуть";
  $("#block-time").textContent = block ? `${block.start} — ${block.end}` : "";
  $("#block-sphere").textContent = sphere.name;
  $("#block-eyebrow").textContent = selectedId
    ? "ВАШ БЛОК"
    : block
      ? "СЕЙЧАС"
      : "СВОБОДНОЕ ВРЕМЯ";
  const rem = block ? remainingMinutes(block, now) : 0;
  $("#block-remainder").textContent =
    block && !selectedId
      ? `До конца ${Math.floor(rem / 60) ? Math.floor(rem / 60) + " ч " : ""}${rem % 60} мин`
      : "";
  $("#rest-copy").hidden = !!block;
  $("#rest-copy").textContent = selectedId
    ? "Этот блок был удалён."
    : state.blocks.length
      ? "Сейчас нет запланированного блока."
      : "Добавь первый блок и задай ритм своему дню.";
  $("#block-items").hidden = !block;
  $("#block-link").hidden = !block;
  if (block) {
    $("#block-link").dataset.blockId = block.id;
    for (const type of ["habit", "task"])
      $(`#${type}-list`).innerHTML = rows(
        state.items.filter(
          (i) =>
            i.blockId === block.id &&
            i.type === type &&
            occurs(i, itemDate(i, state.blocks)),
        ),
      );
  }
  const ordered = [...state.blocks].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  $("#day-timeline").innerHTML = ordered.length
    ? ordered
        .map(
          (b) =>
            `<a class="timeline-entry ${b.id === block?.id ? "is-current" : ""}" href="/blocks/now/?id=${encodeURIComponent(b.id)}" style="--entry-color:${sphereFor(b.sphereId).color}"><time>${b.start}</time><i></i><strong>${esc(b.name)}</strong><small>${b.end}</small></a>`,
        )
        .join("")
    : '<div class="timeline-empty"><time>Сейчас</time><i></i><strong>Свободное время</strong></div>';
  const next = ordered.find(
    (b) =>
      b.start >
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  );
  $("#next-block").textContent = next
    ? `Далее · ${next.start} · ${next.name}`
    : "";
  const daily = (type) =>
    state.items
      .filter((i) => !i.blockId && i.type === type && occurs(i, today))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  $("#daily-tasks").innerHTML = rows(daily("task"), today);
  $("#daily-habits").innerHTML = rows(daily("habit"), today);
  $("#full-day").innerHTML = ordered.length
    ? ordered
        .map(
          (b) =>
            `<article class="schedule-block" style="--sphere:${sphereFor(b.sphereId).color}"><div class="schedule-time"><strong>${b.start}</strong><span>${b.end}</span></div><div class="schedule-body"><div class="section-title"><h2>${esc(b.name)}</h2><span class="sphere-tag"><i></i>${esc(sphereFor(b.sphereId).name)}</span></div>${rows(
              state.items.filter((i) => i.blockId === b.id && occurs(i, today)),
              today,
            )}</div></article>`,
        )
        .join("")
    : '<p class="empty-line">Создай блок, чтобы увидеть расписание дня.</p>';
  $("#today-daily").innerHTML =
    `<section><h2>Задачи на день</h2>${rows(daily("task"), today)}</section><section><h2>Привычки на день</h2>${rows(daily("habit"), today)}</section>`;
  renderMonth();
}
function renderMonth() {
  const title = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(month);
  $("#month-title").textContent = title;
  const offset = (month.getDay() + 6) % 7,
    start = new Date(month.getFullYear(), month.getMonth(), 1 - offset),
    count =
      Math.ceil(
        (offset +
          new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
          7,
      ) * 7;
  $("#calendar-grid").innerHTML = Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = dateKey(d),
      tasks = state.items.filter(
        (t) => t.type === "task" && t.date && occurs(t, key),
      );
    return `<button class="calendar-day ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${key === dateKey() ? "is-today" : ""} ${key === selectedDate ? "selected" : ""}" data-calendar-date="${key}" aria-label="${dateLabel(key)}, задач: ${tasks.length}"><span>${d.getDate()}</span>${tasks
      .slice(0, 3)
      .map(
        (t) =>
          `<small style="--task-color:${sphereFor(t.sphereId).color}">${esc(t.name)}</small>`,
      )
      .join(
        "",
      )}${tasks.length > 3 ? `<em>+${tasks.length - 3}</em>` : ""}</button>`;
  }).join("");
  $("#selected-date").textContent = dateLabel(selectedDate);
  $("#date-tasks").innerHTML = rows(
    state.items
      .filter((t) => t.type === "task" && t.date && occurs(t, selectedDate))
      .sort((a, b) => (a.time || "").localeCompare(b.time || "")),
    selectedDate,
  );
}
document.querySelector("main").addEventListener("change", async (e) => {
  const id = e.target.dataset.item;
  if (!id || busy) return;
  const item = state.items.find((i) => i.id === id);
  const next = structuredClone(state);
  next.done[completionKey(item, e.target.dataset.date)] = e.target.checked;
  setReward(next,completionKey(item,e.target.dataset.date),e.target.checked,item.coins);
  busy = true;
  render();
  try {
    state = await store.save(next);
    notice("Сохранено");
  } catch (e) {
    notice(e.message, true);
  } finally {
    busy = false;
    render();
  }
});
for (const b of document.querySelectorAll("[data-view]"))
  b.addEventListener("click", () => {
    view = b.dataset.view;
    for (const v of ["now", "today", "month"])
      $(`#view-${v}`).hidden = v !== view;
    for (const t of document.querySelectorAll("[data-view]"))
      t.setAttribute("aria-selected", String(t === b));
    render();
  });
$("#calendar-grid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-calendar-date]");
  if (b) {
    selectedDate = b.dataset.calendarDate;
    renderMonth();
  }
});
for (const [id, delta] of [
  ["month-prev", -1],
  ["month-next", 1],
])
  $("#" + id).addEventListener("click", () => {
    month = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    renderMonth();
  });
function setKind(value) {
  kind = value;
  editing = null;
  $("#entity-form").reset();
  for (const b of document.querySelectorAll("[data-kind]"))
    b.setAttribute("aria-selected", String(b.dataset.kind === kind));
  $("#editor-title").textContent =
    kind === "block"
      ? "Новый блок"
      : kind === "habit"
        ? "Новая привычка"
        : "Новая задача";
  $("#timing-fields").hidden = kind !== "block";
  $("#parent-field").hidden = kind === "block";
  $("#task-schedule").hidden = kind !== "task";
  $("#reward-field").hidden = kind === "block";
  $("#habit-explainer").hidden = kind !== "habit";
  $("#no-parent").hidden = true;
  $("#form-error").textContent = "";
  $("#save-entity").textContent = "Создать";
  $("#save-entity").disabled = false;
  $("#parent").innerHTML =
    '<option value="">На весь день · без блока</option>' +
    state.blocks
      .map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`)
      .join("");
  $("#sphere-options").innerHTML = SPHERES.map(
    (s, i) =>
      `<label class="sphere-option"><input type="radio" name="sphereId" value="${s.id}" ${i === 0 ? "checked" : ""}><span style="background:${s.color}"></span><b>${s.name}</b></label>`,
  ).join("");
  $("#name").placeholder =
    kind === "block"
      ? "Например, спортивный блок"
      : kind === "habit"
        ? "Например, отжимания"
        : "Что нужно сделать?";
  renderLibrary();
}
function renderLibrary() {
  const list =
    kind === "block"
      ? state.blocks
      : state.items.filter((i) => i.type === kind);
  $("#library-title").textContent =
    kind === "block"
      ? "Мои блоки"
      : kind === "habit"
        ? "Мои привычки"
        : "Мои задачи";
  $("#entity-library").innerHTML = list.length
    ? list
        .map(
          (i) =>
            `<div class="library-row"><span class="sphere-dot" style="background:${sphereFor(i.sphereId).color}"></span><div><strong>${esc(i.name)}</strong><small>${kind === "block" ? `${i.start} — ${i.end}` : esc(state.blocks.find((b) => b.id === i.blockId)?.name || "На весь день")}${i.date ? " · " + i.date : ""}${i.weekly ? " · еженедельно" : ""}</small></div><button type="button" data-edit="${esc(i.id)}" aria-label="Изменить ${esc(i.name)}">Изменить</button><button type="button" data-delete="${esc(i.id)}" class="delete" aria-label="Удалить ${esc(i.name)}">×</button></div>`,
        )
        .join("")
    : '<p class="empty-line">Здесь пока ничего нет.</p>';
}
function openEditor(type = "block", date = "") {
  if (!state) return notice("Дождись загрузки данных.", true);
  setKind(type);
  if (date) $("#task-date").value = date;
  $("#settings-dialog").showModal();
}
$("#settings").addEventListener("click", () => openEditor());
$(".add-block").addEventListener("click", () => openEditor());
for (const b of document.querySelectorAll("[data-add]")) {
  b.setAttribute(
    "aria-label",
    b.dataset.add === "task"
      ? "Добавить задачу на день"
      : "Добавить привычку на день",
  );
  b.addEventListener("click", () => openEditor(b.dataset.add));
}
$("#add-dated-task").addEventListener("click", () =>
  openEditor("task", selectedDate),
);
for (const b of document.querySelectorAll("[data-kind]"))
  b.addEventListener("click", () => setKind(b.dataset.kind));
$("#cancel-edit").addEventListener("click", () => setKind(kind));
$("#entity-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  const d = new FormData(e.currentTarget),
    entry = {
      id: editing || crypto.randomUUID(),
      name: String(d.get("name")).trim(),
      sphereId: String(d.get("sphereId")),
    };
  let error = "";
  if (kind === "block") {
    entry.start = d.get("start");
    entry.end = d.get("end");
    error = validateBlock(entry, state.blocks);
  } else {
    entry.type = kind;
    entry.coins = Number(d.get("coins")||0);
    entry.blockId = d.get("parent") || "";
    if (kind === "task") {
      entry.date = d.get("date") || "";
      entry.time = d.get("time") || "";
      entry.weekly = d.get("weekly") === "on";
      if (entry.weekly && !entry.date)
        error = "Выбери дату первого повторения.";
    }
    if (!entry.name) error = "Введи название.";
  }
  if (error) {
    $("#form-error").textContent = error;
    return;
  }
  const next = structuredClone(state),
    list = kind === "block" ? next.blocks : next.items,
    index = list.findIndex((i) => i.id === entry.id);
  if (index < 0) list.push(entry);
  else list[index] = entry;
  await saveEditor(next);
});
async function saveEditor(next) {
  busy = true;
  $("#save-entity").disabled = true;
  try {
    state = await store.save(next);
    setKind(kind);
    notice("Сохранено");
  } catch (e) {
    $("#form-error").textContent = e.message;
  } finally {
    busy = false;
    $("#save-entity").disabled = false;
    render();
  }
}
$("#entity-library").addEventListener("click", async (e) => {
  const edit = e.target.dataset.edit,
    remove = e.target.dataset.delete;
  if ((!edit && !remove) || busy) return;
  const entry = (kind === "block" ? state.blocks : state.items).find(
    (i) => i.id === (edit || remove),
  );
  if (edit) {
    editing = entry.id;
    $("#editor-title").textContent = "Редактирование";
    $("#name").value = entry.name;
    $(`#sphere-options input[value="${entry.sphereId}"]`).checked = true;
    if (kind === "block") {
      $("#start").value = entry.start;
      $("#end").value = entry.end;
    } else {
      $("#parent").value = entry.blockId;
      $("#item-coins").value=entry.coins||0;
      if (kind === "task") {
        $("#task-date").value = entry.date || "";
        $("#task-time").value = entry.time || "";
        $("#task-weekly").checked = !!entry.weekly;
      }
    }
    $("#save-entity").textContent = "Сохранить";
    $("#name").focus();
    return;
  }
  if (
    !confirm(
      kind === "block"
        ? "Удалить блок и его привычки и задачи?"
        : "Удалить запись?",
    )
  )
    return;
  const next = structuredClone(state),
    ids =
      kind === "block"
        ? next.items.filter((i) => i.blockId === remove).map((i) => i.id)
        : [remove];
  next.items = next.items.filter((i) => !ids.includes(i.id));
  if (kind === "block")
    next.blocks = next.blocks.filter((b) => b.id !== remove);
  for (const key of Object.keys(next.done))
    if (ids.some((id) => key.endsWith(":" + id))) { delete next.done[key]; if(next.rewards)delete next.rewards[key]; }
  await saveEditor(next);
});
$("#retry").addEventListener("click", load);
$("#block-link").addEventListener("click", async () => {
  const url = new URL("/embed/now/", location.origin);
  url.searchParams.set("id", $("#block-link").dataset.blockId);
  try {
    await navigator.clipboard.writeText(url.href);
    notice("Ссылка скопирована");
  } catch {
    prompt("Ссылка на блок", url.href);
  }
});
setInterval(() => {
  if (!document.hidden && !busy) render();
}, 15000);
setInterval(() => {
  if (!document.hidden && !busy && !$("#settings-dialog").open) load();
}, 45000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !busy && !$("#settings-dialog").open) load();
});
load();
