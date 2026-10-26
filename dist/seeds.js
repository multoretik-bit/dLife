import { validateBlock } from "./schedule.js";

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

/** Возвращает состояние с добавленной вечерней учёбой или null, если она уже добавлялась. */
export function applySeeds(state) {
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
