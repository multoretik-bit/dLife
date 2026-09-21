import { dateKey, blockDate } from "./schedule.js";
export const escapeHTML = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function shiftDate(key, days) {
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
export function occurs(item, date) {
  if (item.type === "habit" || !item.date) return true;
  if (date < item.date) return false;
  if (!item.weekly) return date === item.date;
  const a = new Date(item.date + "T12:00:00");
  const b = new Date(date + "T12:00:00");
  return a.getDay() === b.getDay();
}
export function completionKey(item, date = dateKey()) {
  return item.type === "habit" || item.date
    ? `${date}:${item.id}`
    : `task:${item.id}`;
}
export function streak(item, done, date = dateKey()) {
  let day = done[completionKey(item, date)] ? date : shiftDate(date, -1),
    count = 0;
  while (count < 21 && done[completionKey(item, day)]) {
    count++;
    day = shiftDate(day, -1);
  }
  return count;
}
export function itemDate(item, blocks, now = new Date()) {
  const b = blocks.find((b) => b.id === item.blockId);
  return item.type === "habit" && b ? blockDate(b, now) : dateKey(now);
}
export function habitBar(item, done, date) {
  const n = streak(item, done, date);
  return `<div class="habit-progress" role="progressbar" aria-label="Внедрение привычки" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="21"><div class="habit-segments">${Array.from({ length: 21 }, (_, i) => `<i class="${i < n ? "filled" : ""}"></i>`).join("")}</div><small>${n === 21 ? "Привычка внедрена" : `${n} / 21 день подряд`}</small></div>`;
}
export function normalize(state) {
  return {
    ...state,
    rewards: state.rewards || {},
    steps: state.steps || {},
    practices: state.practices || [],
    logs: state.logs || [],
    spherePlans: state.spherePlans || {},
    timer: state.timer || null,
  };
}
export function progressMinutes(state, id, date = dateKey()) {
  return state.logs
    .filter((l) => l.practiceId === id && l.date === date)
    .reduce((n, l) => n + l.minutes, 0);
}

export function coinTotal(state){return Math.round((Object.values(state.rewards||{}).reduce((a,b)=>a+b,0)+(state.logs||[]).reduce((n,l)=>n+l.minutes*(l.coinRate||0),0))*100)/100;}
export function setReward(state,key,checked,coins){state.rewards??={};if(checked){if(!(key in state.rewards))state.rewards[key]=coins||0;}else delete state.rewards[key];}
