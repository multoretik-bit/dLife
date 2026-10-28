import { dateKey } from "./schedule.js";
import { progressMinutes, completionKey, itemDate, setReward } from "./development.js";

// Шкала прогресса внутри привычки (хот-бар). Два вида:
//   item.progress = { kind: "count", target, unit } — например, 50 отжиманий: +1 / +5 / +10, своё число;
//   item.progress = { kind: "minutes", practiceId } — минуты занятия из таймера (норма — practice.target).
// Количество за день: state.counts[дата][id привычки]. Полная шкала сама отмечает привычку.

const COUNT_MAX = 100000;
const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е").trim();
export const baseName = (name) => String(name || "").split(/\s+[—–-]\s+/)[0].trim();

export const practiceOf = (s, h) => (s.practices || []).find((p) => p.id === h.progress?.practiceId);
export const progressTarget = (s, h) => (h.progress?.kind === "minutes" ? practiceOf(s, h)?.target || 0 : h.progress?.target || 0);
export const progressUnit = (h) => (h.progress?.kind === "minutes" ? "мин" : h.progress?.unit || "раз");
const habitDay = (s, h) => itemDate(h, s.blocks || []);

/** Миллисекунды на общем таймере (тот же, что на странице «Время с пользой»). */
export function timerMs(s, now = Date.now()) {
  const t = s.timer;
  if (!t) return 0;
  return Number(t.accumulatedMs || 0) + (t.paused ? 0 : Math.max(0, now - t.startedAt));
}

/** Значение шкалы за день привычки; live — плюс минуты идущего таймера этого занятия. */
export function progressValue(s, h, { live = false, now = Date.now(), date = habitDay(s, h) } = {}) {
  if (!h.progress) return 0;
  if (h.progress.kind === "count") return s.counts?.[date]?.[h.id] || 0;
  const done = s.logs ? progressMinutes(s, h.progress.practiceId, date) : 0;
  return live && s.timer?.practiceId === h.progress.practiceId ? done + timerMs(s, now) / 60000 : done;
}

/** Полная шкала отмечает привычку выполненной (снять отметку шкала не может). */
export function markDone(s) {
  for (const h of s.items) {
    if (h.type !== "habit" || !h.progress) continue;
    const target = progressTarget(s, h);
    if (!target || progressValue(s, h) < target) continue;
    const key = completionKey(h, habitDay(s, h));
    if (!s.done[key]) { s.done[key] = true; setReward(s, key, true, h.coins); }
  }
  return s;
}

export function addCount(s, habitId, delta) {
  const next = structuredClone(s), h = next.items.find((i) => i.id === habitId), date = habitDay(next, h);
  next.counts ??= {};
  const day = (next.counts[date] ??= {});
  day[habitId] = Math.max(0, Math.min(COUNT_MAX, (day[habitId] || 0) + Math.round(delta)));
  return markDone(next);
}
export function setCount(s, habitId, total) {
  const next = structuredClone(s), h = next.items.find((i) => i.id === habitId), date = habitDay(next, h);
  next.counts ??= {};
  (next.counts[date] ??= {})[habitId] = Math.max(0, Math.min(COUNT_MAX, Math.round(total)));
  return markDone(next);
}

/** Таймер для занятия привычки. Если идёт таймер другого занятия — понятная ошибка. */
export function startTimer(s, practiceId, now = Date.now()) {
  const t = s.timer;
  if (t && t.practiceId !== practiceId) throw Error("Уже идёт другой таймер — сначала останови его.");
  const next = structuredClone(s);
  next.timer = t?.paused ? { ...t, startedAt: now, paused: false } : t || { startedAt: now, accumulatedMs: 0, paused: false, practiceId };
  return next;
}
export function pauseTimer(s, now = Date.now()) {
  if (!s.timer || s.timer.paused) return s;
  const next = structuredClone(s);
  next.timer = { ...next.timer, accumulatedMs: timerMs(s, now), paused: true };
  return next;
}
/** Стоп: минуты записываются в занятие (как «Засчитать время» на странице таймера). Меньше минуты — не записывается. */
export function stopTimer(s, now = Date.now()) {
  const next = structuredClone(s), practice = (s.practices || []).find((p) => p.id === s.timer?.practiceId);
  const minutes = Math.min(1440, Math.round(timerMs(s, now) / 60000));
  next.timer = null;
  if (practice && minutes >= 1) {
    next.logs = [...(next.logs || []), { id: crypto.randomUUID(), sphereId: practice.sphereId, practiceId: practice.id, note: practice.name, date: dateKey(new Date(now)), minutes, coinRate: practice.coinRate ?? 1 }];
  }
  return { next: markDone(next), minutes: practice ? minutes : 0 };
}

/** Настроить шкалу привычки. Для минут — занятие с тем же названием в сфере привычки (или новое), его норма = цель. */
export function setProgress(s, habitId, { kind, target, unit }) {
  target = Math.round(Number(target));
  if (!Number.isFinite(target) || target < 1 || target > (kind === "minutes" ? 1440 : COUNT_MAX)) throw Error(kind === "minutes" ? "Минут в день — от 1 до 1440." : "Цель — число от 1.");
  const next = structuredClone(s), h = next.items.find((i) => i.id === habitId);
  if (!h) return null;
  if (kind === "minutes") {
    next.practices = [...(next.practices || [])];
    const name = baseName(h.name);
    let p = next.practices.find((x) => x.id === h.progress?.practiceId) || next.practices.find((x) => x.sphereId === h.sphereId && norm(x.name) === norm(name));
    if (p) p.target = target;
    else { p = { id: `practice-${h.id}`, sphereId: h.sphereId, name, target, coinRate: 1 }; next.practices.push(p); }
    h.progress = { kind: "minutes", practiceId: p.id };
  } else {
    h.progress = { kind: "count", target, unit: String(unit || "").trim().slice(0, 16) || "раз" };
  }
  return markDone(next);
}

/** Убрать шкалу. Записанные минуты остаются у занятия, количество за прошлые дни — в истории. */
export function removeProgress(s, habitId) {
  const next = structuredClone(s), h = next.items.find((i) => i.id === habitId);
  if (h) delete h.progress;
  return next;
}

/** Перенос отдельных прогресс-баров (state.bars, 28.10.2026) в шкалы привычек. null — переносить нечего. */
export function barsIntoHabits(s) {
  if (!s?.bars) return null;
  const next = structuredClone(s);
  for (const bar of next.bars) {
    let h = next.items.find((i) => i.id === bar.habitId && i.type === "habit")
      || next.items.find((i) => i.type === "habit" && norm(baseName(i.name)) === norm(bar.name))
      || next.items.find((i) => i.type === "habit" && norm(i.name).startsWith(norm(bar.name)));
    if (!h) {
      const practice = bar.kind === "minutes" && (next.practices || []).find((p) => p.id === bar.practiceId);
      const goal = bar.kind === "count" ? `${bar.target} ${bar.unit || "раз"}` : `${practice?.target || 30} минут`;
      h = { id: `habit-${bar.id}`.slice(0, 80), type: "habit", name: `${bar.name} — ${goal}`, sphereId: bar.sphereId, blockId: "", coins: 0 };
      next.items.push(h);
    }
    h.progress = bar.kind === "count" ? { kind: "count", target: bar.target, unit: bar.unit || "раз" } : { kind: "minutes", practiceId: bar.practiceId };
    for (const day of Object.values(next.counts || {})) {
      if (bar.id in day) { day[h.id] = Math.max(day[h.id] || 0, day[bar.id]); delete day[bar.id]; }
    }
  }
  delete next.bars;
  return markDone(next);
}
