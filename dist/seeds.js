import { validateBlock, overlaps, minutes } from "./schedule.js";
import { barsIntoHabits } from "./habit-progress.js";

// Разовые добавления по просьбе Дениса. Каждое применяется один раз (id попадает в state.applied),
// поэтому удалённое потом не возвращается.

// 26.10.2026 — вечерняя учёба: блок 20:00–22:00 и три предмета-привычки, нормы занятий в сфере «Учёба».
export const STUDY_SEED = "study-evening-2026-10-26";
const BLOCK = { id: "study-evening", name: "Учёба", start: "20:00", end: "22:00", sphereId: "10" };
const SUBJECTS = [
  { id: "study-history", name: "История — 30 минут", time: "20:00", minutes: 30, practice: "История", match: /истори/i },
  { id: "study-spanish", name: "Испанский — 30 минут", time: "20:30", minutes: 30, practice: "Испанский", match: /испан/i },
  { id: "study-english", name: "Английский — 60 минут", time: "21:00", minutes: 60, practice: "Английский", match: /англ/i },
];

/** Все разовые добавления по порядку. Возвращает новое состояние или null, если менять нечего. */
export function applySeeds(state) {
  const a = addEveningStudy(state), b = moveStudyIntoBlock(a || state), c = addDayBars(b || a || state);
  // 28.10.2026: отдельные прогресс-бары переехали внутрь привычек (шкала в строке привычки).
  const d = barsIntoHabits(c || b || a || state);
  return d || c || b || a;
}

// 28.10.2026 — прогресс-бары на главной: 50 отжиманий в день и по 30 минут истории, испанского и английского
// (минуты идут из таймера). Норма английского — 30 минут («в каждом минимум 30»).
export const BARS_SEED = "day-bars-2026-10-28";
const BAR_SUBJECTS = [
  { key: "history", name: "История", match: /истори/i },
  { key: "spanish", name: "Испанский", match: /испан/i },
  { key: "english", name: "Английский", match: /англ/i },
];

export function addDayBars(state) {
  if (!state || (state.applied || []).includes(BARS_SEED)) return null;
  const next = structuredClone(state);
  next.applied = [...(next.applied || []), BARS_SEED];
  next.bars = [...(next.bars || [])];
  next.practices = (next.practices || []).map((p) => ({ ...p }));
  if (!next.bars.some((b) => /отжим/i.test(b.name))) next.bars.push({ id: "bar-pushups", kind: "count", name: "Отжимания", target: 50, unit: "раз", sphereId: "2" });
  const rate = next.practices.find((x) => x.sphereId === "10" && /англ/i.test(x.name))?.coinRate ?? 1;
  for (const s of BAR_SUBJECTS) {
    let p = next.practices.find((x) => x.sphereId === "10" && s.match.test(x.name));
    if (p) p.target = 30;
    else { p = { id: `practice-study-${s.key}`, sphereId: "10", name: s.name, target: 30, coinRate: rate }; next.practices.push(p); }
    const habit = next.items.find((i) => i.type === "habit" && s.match.test(i.name));
    if (habit && s.key === "english") habit.name = habit.name.replace(/\d+\s*минут\S*/i, "30 минут");
    if (!next.bars.some((b) => b.practiceId === p.id)) next.bars.push({ id: `bar-${s.key}`, kind: "minutes", name: s.name, sphereId: "10", practiceId: p.id, ...(habit ? { habitId: habit.id } : {}) });
  }
  return next;
}

// 26.10.2026 — предметы оказались «на весь день», потому что 20:00–22:00 уже занимал учебный блок Дениса:
// переносим их в этот блок и при возможности расширяем его до 20:00–22:00.
export const STUDY_MOVE_SEED = "study-into-block-2026-10-26";
const isStudyBlock = (b) => b.sphereId === "10" || /уч/i.test(b.name);

export function moveStudyIntoBlock(state) {
  if (!state || (state.applied || []).includes(STUDY_MOVE_SEED)) return null;
  const evening = { start: BLOCK.start, end: BLOCK.end };
  const blocks = state.blocks || [];
  const target = blocks.find((b) => isStudyBlock(b) && overlaps(b, evening)) || blocks.find((b) => isStudyBlock(b));
  if (!target) return null;
  const subjects = (i) => i.type === "habit" && (SUBJECTS.some((s) => s.id === i.id) || SUBJECTS.some((s) => s.name.toLowerCase() === i.name.trim().toLowerCase()));
  if (!state.items.some((i) => subjects(i) && i.blockId !== target.id)) return null;
  const next = structuredClone(state);
  next.applied = [...(next.applied || []), STUDY_MOVE_SEED];
  for (const i of next.items) if (subjects(i)) i.blockId = target.id;
  // Блок должен вмещать 20:00–22:00 («2 часа полноценно»), если это не заденет соседние блоки.
  const b = next.blocks.find((x) => x.id === target.id), [s, e] = [minutes(b.start), minutes(b.end)];
  if (s < e) {
    const wider = { ...b, start: s <= minutes(BLOCK.start) ? b.start : BLOCK.start, end: e >= minutes(BLOCK.end) ? b.end : BLOCK.end };
    if (!validateBlock(wider, next.blocks)) Object.assign(b, wider);
  }
  return next;
}

/** Вечерняя учёба (один раз). null — уже добавлялась. */
export function addEveningStudy(state) {
  if (!state || (state.applied || []).includes(STUDY_SEED)) return null;
  const next = structuredClone(state);
  next.applied = [...(next.applied || []), STUDY_SEED];

  // Блок 20:00–22:00; если это время уже занято другим блоком — привычки будут «на весь день» со своим временем.
  let blockId = "";
  if (next.blocks.some((b) => b.id === BLOCK.id)) blockId = BLOCK.id;
  else if (!validateBlock(BLOCK, next.blocks)) { next.blocks.push({ ...BLOCK }); blockId = BLOCK.id; }

  for (const s of SUBJECTS) {
    const exists = next.items.some((i) => i.id === s.id || (i.type === "habit" && i.name.trim().toLowerCase() === s.name.toLowerCase()));
    if (!exists) next.items.push({ id: s.id, type: "habit", name: s.name, sphereId: "10", blockId, time: s.time, coins: 0 });
  }

  // Нормы занятий в «Учёбе», чтобы таймер считал время по предметам.
  next.practices = (next.practices || []).map((p) => ({ ...p }));
  // Монеты за минуту — как у других предметов (английского), иначе 1.
  const rate = next.practices.find((x) => x.sphereId === "10" && /англ/i.test(x.name))?.coinRate ?? 1;
  for (const s of SUBJECTS) {
    const p = next.practices.find((x) => x.sphereId === "10" && s.match.test(x.name));
    if (p) p.target = s.minutes;
    else next.practices.push({ id: `practice-${s.id}`, sphereId: "10", name: s.practice, target: s.minutes, coinRate: rate });
  }
  return next;
}
