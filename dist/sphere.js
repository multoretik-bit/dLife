import { SPHERES, sphereFor, dateKey } from "./schedule.js";
import { ScheduleStore } from "./store.js";
import {
  normalize,
  progressMinutes,
  escapeHTML as esc,
} from "./development.js";
const $ = (s) => document.querySelector(s),
  params = new URLSearchParams(location.search),
  id = params.get("id"),
  sphere = SPHERES.find((s) => s.id === id),
  store = new ScheduleStore();
let state = null,
  busy = false,
  editing = null,
  draggedPractice = null,
  draggedTool = null;
const blank = () => ({ vision: "", deadline: "", tools: "", results: "" });
function message(s) {
  $("#sphere-error").textContent = s;
}
async function save(next) {
  if (busy) return false;
  busy = true;
  document
    .querySelectorAll('button[type="submit"]')
    .forEach((b) => (b.disabled = true));
  try {
    state = normalize(await store.save(next));
    message("Сохранено");
    renderPractices();
    renderTools();
    return true;
  } catch (e) {
    message(e.message);
    return false;
  } finally {
    busy = false;
    document
      .querySelectorAll('button[type="submit"]')
      .forEach((b) => (b.disabled = false));
  }
}
function renderPractices() {
  const list = state.practices.filter((p) => p.sphereId === id);
  $("#sphere-practices").innerHTML = list.length
    ? list
        .map(
          (p) =>
            `<div class="practice-edit-row" draggable="true" data-practice-id="${esc(p.id)}"><button type="button" class="quiet-button drag-grip" aria-label="Перетащить ${esc(p.name)}">⋮⋮</button><div><strong>${esc(p.name)}</strong><small>${progressMinutes(state, p.id)} / ${p.target} мин сегодня · ${p.coinRate ?? 1} монет/мин</small></div><div class="reorder-controls"><button type="button" class="quiet-button" data-move-practice="up" data-move-id="${esc(p.id)}" aria-label="Поднять выше">↑</button><button type="button" class="quiet-button" data-move-practice="down" data-move-id="${esc(p.id)}" aria-label="Опустить ниже">↓</button></div><button type="button" class="quiet-button" data-edit-practice="${esc(p.id)}">Изменить</button><button type="button" class="quiet-button" data-remove-practice="${esc(p.id)}" aria-label="Удалить ${esc(p.name)}">×</button></div>`,
        )
        .join("")
    : '<p class="empty-line">Добавь отдельную норму для каждого занятия.</p>';
  $("#sphere-history").innerHTML =
    "<h3>Записанные занятия</h3>" +
    state.logs
      .filter((l) => l.sphereId === id)
      .slice(-30)
      .reverse()
      .map(
        (l) =>
          `<div class="history-row"><div><strong>${esc(l.note || state.practices.find((p) => p.id === l.practiceId)?.name || sphere.name)}</strong><small>${l.date}</small></div><b>${l.minutes} мин</b></div>`,
      )
      .join("");
}
const toolLines = () => String($("#tools")?.value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
function renderTools() {
  const root = $("#tools-sort-list"); if (!root) return;
  const tools = toolLines();
  root.innerHTML = tools.map((tool, index) => `<div class="tool-sort-row" draggable="true" data-tool-index="${index}"><button type="button" class="quiet-button drag-grip" aria-label="Перетащить инструмент">⋮⋮</button><span>${esc(tool)}</span><div class="reorder-controls"><button type="button" class="quiet-button" data-move-tool="up" data-tool-index="${index}" aria-label="Поднять выше">↑</button><button type="button" class="quiet-button" data-move-tool="down" data-tool-index="${index}" aria-label="Опустить ниже">↓</button></div></div>`).join("");
}
async function persistTools(tools) {
  const next = structuredClone(state), plan = { ...blank(), ...next.spherePlans[id], tools: tools.join("\n") };
  next.spherePlans[id] = plan; $("#tools").value = plan.tools; await save(next);
}
function swapSpherePractices(next, firstId, secondId) {
  const visible = next.practices.filter((entry) => entry.sphereId === id), a = visible.findIndex((entry) => entry.id === firstId), b = visible.findIndex((entry) => entry.id === secondId);
  if (a < 0 || b < 0 || a === b) return false; [visible[a], visible[b]] = [visible[b], visible[a]];
  let cursor = 0; next.practices = next.practices.map((entry) => entry.sphereId === id ? visible[cursor++] : entry); return true;
}
if (!sphere) {
  $("#sphere-name").textContent = "Сфера не найдена";
  document
    .querySelectorAll(".development-panel")
    .forEach((el) => (el.hidden = true));
} else {
  $("#sphere-name").textContent = sphere.name;
  $("#sphere-color").style.background = sphere.color;
  document.documentElement.style.setProperty("--sphere-accent", sphere.color);
  document.title = `dLife — ${sphere.name}`;
  if (
    location.pathname.startsWith("/embed/") &&
    ["vision", "tools", "results"].includes(params.get("section"))
  ) {
    document
      .querySelectorAll("[data-section]")
      .forEach(
        (el) => (el.hidden = el.dataset.section !== params.get("section")),
      );
  }
  for (const b of document.querySelectorAll("[data-copy-section]"))
    b.addEventListener("click", async () => {
      const url = new URL("/embed/sphere/", location.origin);
      url.searchParams.set("id", id);
      url.searchParams.set("section", b.dataset.copySection);
      try {
        await navigator.clipboard.writeText(url.href);
        message("Ссылка на блок скопирована");
      } catch {
        prompt("Ссылка на блок", url.href);
      }
    });
  for (const form of document.querySelectorAll("[data-plan]"))
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state || busy) return;
      const next = structuredClone(state),
        plan = { ...blank(), ...next.spherePlans[id] },
        field = form.dataset.plan;
      plan[field] = form.elements[field].value;
      if (field === "vision") plan.deadline = form.elements.deadline.value;
      next.spherePlans[id] = plan;
      await save(next);
    });
  $("#practice-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state || busy) return;
    const name = $("#practice-name").value.trim(),
      target = Number($("#practice-target").value),
      coinRate = Number($("#practice-rate")?.value || 1);
    if (!name || !Number.isInteger(target) || target < 1 || target > 1440)
      return message("Укажи название и норму от 1 до 1440 минут.");
    const next = structuredClone(state),
      entry = {
        id: editing || crypto.randomUUID(),
        sphereId: id,
        name,
        target,
        coinRate: Number.isFinite(coinRate) && coinRate >= 0 ? coinRate : 1,
      },
      index = next.practices.findIndex((p) => p.id === entry.id);
    if (index < 0) next.practices.push(entry);
    else next.practices[index] = entry;
    if (await save(next)) resetPractice();
  });
  function resetPractice() {
    editing = null;
    $("#practice-form").reset();
    if ($("#practice-rate")) $("#practice-rate").value = "1";
    $("#practice-save").textContent = "Добавить";
    $("#practice-cancel").hidden = true;
  }
  $("#practice-cancel").addEventListener("click", resetPractice);
  document.querySelectorAll(".practice-rate-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const rateInput = $("#practice-rate");
      if (rateInput && chip.dataset.rate) {
        rateInput.value = chip.dataset.rate;
      }
    });
  });
  $("#sphere-practices").addEventListener("click", async (e) => {
    if (busy) return;
    const move = e.target.dataset.movePractice, moveId = e.target.dataset.moveId;
    if (move && moveId) { const visible = state.practices.filter((entry) => entry.sphereId === id), index = visible.findIndex((entry) => entry.id === moveId), other = visible[index + (move === "up" ? -1 : 1)]; if (other) { const next = structuredClone(state); if (swapSpherePractices(next, moveId, other.id)) await save(next); } return; }
    const edit = e.target.dataset.editPractice,
      remove = e.target.dataset.removePractice;
    if (edit) {
      const p = state.practices.find((p) => p.id === edit);
      editing = p.id;
      $("#practice-name").value = p.name;
      $("#practice-target").value = p.target;
      if ($("#practice-rate")) $("#practice-rate").value = p.coinRate ?? 1;
      $("#practice-save").textContent = "Сохранить";
      $("#practice-cancel").hidden = false;
      $("#practice-name").focus();
    }
    if (
      remove &&
      confirm("Удалить дневную норму? Записанные занятия сохранятся.")
    ) {
      const next = structuredClone(state);
      next.practices = next.practices.filter((p) => p.id !== remove);
      await save(next);
      resetPractice();
    }
  });
  $("#sphere-practices").addEventListener("dragstart", (event) => { const row = event.target.closest("[data-practice-id]"); if (!row) return; draggedPractice = row.dataset.practiceId; row.classList.add("is-dragging"); event.dataTransfer.setData("text/plain", draggedPractice); });
  $("#sphere-practices").addEventListener("dragover", (event) => { const row = event.target.closest("[data-practice-id]"); if (!row || row.dataset.practiceId === draggedPractice) return; event.preventDefault(); row.classList.add("drag-over"); });
  $("#sphere-practices").addEventListener("drop", async (event) => { const row = event.target.closest("[data-practice-id]"); event.preventDefault(); if (!row || !draggedPractice || busy) return; const next = structuredClone(state); if (swapSpherePractices(next, draggedPractice, row.dataset.practiceId)) await save(next); });
  $("#sphere-practices").addEventListener("dragend", () => { draggedPractice = null; $("#sphere-practices").querySelectorAll(".is-dragging,.drag-over").forEach((node) => node.classList.remove("is-dragging", "drag-over")); });
  $("#tools").addEventListener("input", renderTools);
  $("#tools-sort-list").addEventListener("click", async (event) => { const direction = event.target.dataset.moveTool, index = Number(event.target.dataset.toolIndex); if (!direction || busy) return; const tools = toolLines(), other = index + (direction === "up" ? -1 : 1); if (other < 0 || other >= tools.length) return; [tools[index], tools[other]] = [tools[other], tools[index]]; await persistTools(tools); });
  $("#tools-sort-list").addEventListener("dragstart", (event) => { const row = event.target.closest("[data-tool-index]"); if (!row) return; draggedTool = Number(row.dataset.toolIndex); row.classList.add("is-dragging"); event.dataTransfer.setData("text/plain", String(draggedTool)); });
  $("#tools-sort-list").addEventListener("dragover", (event) => { const row = event.target.closest("[data-tool-index]"); if (!row || Number(row.dataset.toolIndex) === draggedTool) return; event.preventDefault(); row.classList.add("drag-over"); });
  $("#tools-sort-list").addEventListener("drop", async (event) => { const row = event.target.closest("[data-tool-index]"); event.preventDefault(); const target = Number(row?.dataset.toolIndex); if (!Number.isInteger(target) || !Number.isInteger(draggedTool) || target === draggedTool || busy) return; const tools = toolLines(); [tools[draggedTool], tools[target]] = [tools[target], tools[draggedTool]]; await persistTools(tools); });
  $("#tools-sort-list").addEventListener("dragend", () => { draggedTool = null; $("#tools-sort-list").querySelectorAll(".is-dragging,.drag-over").forEach((node) => node.classList.remove("is-dragging", "drag-over")); });
  try {
    state = normalize(await store.load());
    const p = { ...blank(), ...state.spherePlans[id] };
    for (const f of ["vision", "deadline", "tools", "results"])
      $("#" + f).value = p[f];
    renderPractices();
    renderTools();
  } catch (e) {
    message(e.message);
  }
}
