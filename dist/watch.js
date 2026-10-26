// Apple Watch через «Команды» на iPhone: команда шлёт шаги и активные калории в api/health-sync,
// dLife при открытии забирает их и записывает в state.steps / state.calories.
const API = "/api/health-sync/";

/** Новый секретный токен (32 символа, base64url). Хранится в state.healthSync — общий для всех устройств. */
export function newWatchToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function fetchWatch(token) {
  const r = await fetch(API, { headers: { "X-Health-Token": token }, cache: "no-store" });
  const data = await r.json().catch(() => ({ error: r.status === 404 ? "Синхронизация работает только на dlife-tau.vercel.app." : `Ошибка сервера (${r.status}).` }));
  if (!r.ok) throw Error(data.error || `Ошибка ${r.status}.`);
  return data;
}

/** Вливает данные часов: шаги и калории за каждый присланный день. Возвращает новое состояние или null, если ничего не изменилось. */
export function applyWatch(state, data) {
  const next = structuredClone(state);
  next.steps = { ...next.steps };
  next.calories = { ...next.calories };
  let changed = false;
  for (const [date, v] of Object.entries(data?.days || {})) {
    if (Number.isInteger(v.steps) && next.steps[date] !== v.steps) { next.steps[date] = v.steps; changed = true; }
    if (Number.isInteger(v.kcal) && (next.calories[date] || 0) !== v.kcal) {
      if (v.kcal) next.calories[date] = v.kcal; else delete next.calories[date];
      changed = true;
    }
  }
  if (data?.updatedAt && next.healthSync && next.healthSync.lastAt !== data.updatedAt) { next.healthSync = { ...next.healthSync, lastAt: data.updatedAt }; changed = true; }
  return changed ? next : null;
}

/** Забирает данные часов и сохраняет, если есть новое. Возвращает { data } или { error }. */
export async function pullWatch(getState, save) {
  const token = getState()?.healthSync?.token;
  if (!token) return null;
  try {
    const data = await fetchWatch(token);
    const next = applyWatch(getState(), data);
    if (next) await save(next);
    return { data };
  } catch (e) {
    return { error: e.message };
  }
}
