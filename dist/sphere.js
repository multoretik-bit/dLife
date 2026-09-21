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
  editing = null;
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
            `<div class="practice-edit-row"><div><strong>${esc(p.name)}</strong><small>${progressMinutes(state, p.id)} / ${p.target} мин сегодня · ${p.coinRate ?? 1} монет/мин</small></div><button type="button" class="quiet-button" data-edit-practice="${esc(p.id)}">Изменить</button><button type="button" class="quiet-button" data-remove-practice="${esc(p.id)}" aria-label="Удалить ${esc(p.name)}">×</button></div>`,
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
  try {
    state = normalize(await store.load());
    const p = { ...blank(), ...state.spherePlans[id] };
    for (const f of ["vision", "deadline", "tools", "results"])
      $("#" + f).value = p[f];
    renderPractices();
  } catch (e) {
    message(e.message);
  }
}
