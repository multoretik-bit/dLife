import {
  SPHERES,
  sphereFor,
  activeBlock,
  blockDate,
  validateBlock,
  remainingMinutes,
} from "./schedule.js";
import { ScheduleStore } from "./store.js";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const store = new ScheduleStore();
let state = null,
  busy = false,
  kind = "block",
  editing = null;
const selectedId = new URLSearchParams(location.search).get("id");
const sprite = (id) => {
  const n = Number(id) - 1;
  return `--sprite-x:${(n % 5) * 25}%;--sprite-y:${n < 5 ? 0 : 100}%`;
};
const doneKey = (item, block) =>
  item.type === "habit" ? `${blockDate(block)}:${item.id}` : `task:${item.id}`;
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
function render() {
  if (!state) return;
  const now = new Date(),
    block = selectedId
      ? state.blocks.find((b) => b.id === selectedId)
      : activeBlock(state.blocks, now);
  const card = $("#now-card");
  card.hidden = false;
  const unknown = selectedId && !block;
  const timeline = $("#day-timeline");
  if (timeline)
    timeline.innerHTML = state.blocks.length
      ? [...state.blocks]
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(
            (b) =>
              `<a class="timeline-entry ${b.id === block?.id ? "is-current" : ""}" href="/blocks/now/?id=${encodeURIComponent(b.id)}" style="--entry-color:${sphereFor(b.sphereId).color}"><time>${b.start}</time><i></i><strong>${esc(b.name)}</strong><small>${b.end}</small></a>`,
          )
          .join("")
      : '<div class="timeline-empty"><time>Сейчас</time><i></i><strong>Свободное время</strong><p>Твой день начинается<br>с первого блока.</p></div>';

  const sphere = sphereFor(block?.sphereId || "6");
  card.style.setProperty("--sphere", sphere.color);
  card.classList.toggle("is-rest", !block);
  $("#now-visual").style.cssText = sprite(sphere.id);
  $("#block-title").textContent = unknown
    ? "Блок не найден"
    : block?.name || "Время отдохнуть";
  $("#block-time").textContent = block ? `${block.start} — ${block.end}` : "";
  $("#block-sphere").textContent = unknown ? "" : sphere.name;
  $("#block-eyebrow").textContent = selectedId
    ? "ВАШ БЛОК"
    : block
      ? "СЕЙЧАС"
      : "СВОБОДНОЕ ВРЕМЯ";
  $("#block-remainder").textContent =
    block && !selectedId ? `До конца ${remainingMinutes(block, now)} мин` : "";
  $("#rest-copy").hidden = !!block;
  $("#rest-copy").textContent = unknown
    ? "Этот блок был удалён."
    : state.blocks.length
      ? "Сейчас нет запланированного блока."
      : "Расписание пока пусто. Создайте первый блок через шестерёнку.";
  $("#block-items").hidden = !block;
  $("#block-link").hidden = !block;
  if (block) {
    $("#block-link").dataset.blockId = block.id;
    for (const type of ["habit", "task"]) {
      const items = state.items.filter(
        (i) => i.blockId === block.id && i.type === type,
      );
      $(`#${type}-list`).innerHTML = items.length
        ? items
            .map(
              (i) =>
                `<label class="activity-row" style="--item-color:${sphereFor(i.sphereId).color}"><input type="checkbox" data-item="${esc(i.id)}" ${state.done[doneKey(i, block)] ? "checked" : ""} ${busy ? "disabled" : ""}><span class="activity-check"></span><span class="activity-name">${esc(i.name)}</span><span class="sphere-dot" title="${esc(sphereFor(i.sphereId).name)}"></span></label>`,
            )
            .join("")
        : `<p class="empty-line">${type === "habit" ? "Привычек пока нет" : "Задач пока нет"}</p>`;
    }
  }
  const next = state.blocks
    .map((b) => ({
      ...b,
      distance:
        (Number(b.start.slice(0, 2)) * 60 +
          Number(b.start.slice(3)) -
          (now.getHours() * 60 + now.getMinutes()) +
          1440) %
        1440,
    }))
    .filter((b) => b.id !== block?.id)
    .sort((a, b) => a.distance - b.distance)[0];
  $("#next-block").textContent = next
    ? `Далее · ${next.start} · ${next.name}`
    : "";
}
$("#block-items").addEventListener("change", async (e) => {
  const id = e.target.dataset.item;
  if (!id || busy) return;
  const item = state.items.find((i) => i.id === id),
    block = state.blocks.find((b) => b.id === item.blockId);
  const next = structuredClone(state);
  next.done[doneKey(item, block)] = e.target.checked;
  busy = true;
  render();
  try {
    state = await store.save(next);
    notice("Сохранено");
  } catch (err) {
    notice(err.message, true);
  } finally {
    busy = false;
    render();
  }
});
function notice(message, error = false) {
  $("#notice").textContent = message;
  $("#notice").classList.toggle("error", error);
  clearTimeout(notice.timer);
  notice.timer = setTimeout(
    () => ($("#notice").textContent = ""),
    error ? 14000 : 2500,
  );
}
function setKind(value) {
  kind = value;
  editing = null;
  for (const b of document.querySelectorAll("[data-kind]"))
    b.setAttribute("aria-selected", String(b.dataset.kind === kind));
  $("#editor-title").textContent =
    kind === "block"
      ? "Новый блок"
      : kind === "habit"
        ? "Новая привычка"
        : "Новая задача";
  $("#entity-form").reset();
  $("#timing-fields").hidden = kind !== "block";
  $("#parent-field").hidden = kind === "block";
  $("#form-error").textContent = "";
  $("#save-entity").textContent = "Создать";
  renderParents();
  $("#sphere-options").innerHTML = SPHERES.map(
    (s, index) =>
      `<label class="sphere-option"><input type="radio" name="sphereId" value="${s.id}" ${index === 0 ? "checked" : ""}><span style="background:${s.color}"></span><b>${s.name}</b></label>`,
  ).join("");
  renderLibrary();
}
function renderParents() {
  const field = $("#parent");
  field.innerHTML = state.blocks
    .map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`)
    .join("");
  const current = activeBlock(state.blocks);
  if (current) field.value = current.id;
  $("#no-parent").hidden = kind === "block" || state.blocks.length > 0;
  $("#save-entity").disabled = kind !== "block" && !state.blocks.length;
}
function renderLibrary() {
  const items =
    kind === "block"
      ? state.blocks
      : state.items.filter((i) => i.type === kind);
  $("#library-title").textContent =
    kind === "block"
      ? "Мои блоки"
      : kind === "habit"
        ? "Мои привычки"
        : "Мои задачи";
  $("#entity-library").innerHTML = items.length
    ? items
        .map(
          (i) =>
            `<div class="library-row"><span class="sphere-dot" style="background:${sphereFor(i.sphereId).color}"></span><div><strong>${esc(i.name)}</strong><small>${kind === "block" ? `${i.start} — ${i.end}` : esc(state.blocks.find((b) => b.id === i.blockId)?.name || "")}</small></div><button type="button" data-edit="${esc(i.id)}" aria-label="Изменить ${esc(i.name)}">Изменить</button><button type="button" class="delete" data-delete="${esc(i.id)}" aria-label="Удалить ${esc(i.name)}">×</button></div>`,
        )
        .join("")
    : '<p class="empty-line">Здесь пока ничего нет.</p>';
}
$("#settings").addEventListener("click", () => {
  if (!state) {
    notice("Дождитесь загрузки расписания.", true);
    return;
  }
  setKind("block");
  $("#settings-dialog").showModal();
});
document
  .querySelectorAll("[data-kind]")
  .forEach((b) => b.addEventListener("click", () => setKind(b.dataset.kind)));
$("#cancel-edit").addEventListener("click", () => setKind(kind));
$("#entity-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  const data = new FormData(e.currentTarget);
  const next = structuredClone(state);
  const entry = {
    id: editing || crypto.randomUUID(),
    name: String(data.get("name")).trim(),
    sphereId: String(data.get("sphereId")),
  };
  let error = "";
  if (kind === "block") {
    entry.start = String(data.get("start"));
    entry.end = String(data.get("end"));
    error = validateBlock(entry, state.blocks);
  } else {
    entry.type = kind;
    entry.blockId = String(data.get("parent"));
    if (!state.blocks.some((b) => b.id === entry.blockId))
      error = "Сначала создайте блок.";
    if (!entry.name) error = "Введите название.";
  }
  if (error) {
    $("#form-error").textContent = error;
    return;
  }
  const list = kind === "block" ? next.blocks : next.items;
  const index = list.findIndex((i) => i.id === entry.id);
  if (index < 0) list.push(entry);
  else list[index] = entry;
  busy = true;
  $("#save-entity").disabled = true;
  $("#form-error").textContent = "";
  try {
    state = await store.save(next);
    setKind(kind);
    render();
    notice("Сохранено");
  } catch (err) {
    $("#form-error").textContent = err.message;
  } finally {
    busy = false;
    $("#save-entity").disabled = false;
    render();
  }
});
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
    } else $("#parent").value = entry.blockId;
    $("#save-entity").textContent = "Сохранить";
    $("#name").focus();
    return;
  }
  if (
    !confirm(
      kind === "block"
        ? "Удалить блок вместе с его привычками и задачами?"
        : "Удалить эту запись?",
    )
  )
    return;
  const next = structuredClone(state);
  const removedIds =
    kind === "block"
      ? next.items.filter((i) => i.blockId === remove).map((i) => i.id)
      : [remove];
  if (kind === "block") {
    next.blocks = next.blocks.filter((b) => b.id !== remove);
    next.items = next.items.filter((i) => i.blockId !== remove);
  } else next.items = next.items.filter((i) => i.id !== remove);
  for (const key of Object.keys(next.done))
    if (removedIds.some((id) => key.endsWith(":" + id))) delete next.done[key];
  busy = true;
  try {
    state = await store.save(next);
    setKind(kind);
    render();
  } catch (err) {
    $("#form-error").textContent = err.message;
  } finally {
    busy = false;
    render();
  }
});
$("#retry").addEventListener("click", load);
$("#block-link").addEventListener("click", async () => {
  const url = new URL("/embed/now/", location.origin);
  url.searchParams.set("id", $("#block-link").dataset.blockId);
  try {
    await navigator.clipboard.writeText(url.href);
    notice("Ссылка на этот блок скопирована");
  } catch {
    prompt("Ссылка на этот блок", url.href);
  }
});
setInterval(() => {
  if (!document.hidden) render();
}, 15000);
setInterval(async () => {
  if (!document.hidden && !busy && !$("#settings-dialog").open) await load();
}, 45000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !busy && !$("#settings-dialog").open) load();
});
load();

document
  .querySelector(".add-block")
  ?.addEventListener("click", () =>
    document.querySelector("#settings").click(),
  );
