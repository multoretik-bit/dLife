// Система целей: маленькие желания, цели на текущий год и видение — идеальная картина будущего на несколько лет.
export const GOAL_TEXT_MAX = 2000;
export const goalYear = (now = new Date()) => now.getFullYear();
export const visionYear = (now = new Date()) => now.getFullYear() + 1;

export const KINDS = [
  { id: 'wish', icon: '✨', title: 'Маленькие желания', hint: 'Легко внедрить — сделать на этой неделе', add: 'Новое желание' },
  { id: 'goal', icon: '🎯', title: () => `Цели до конца ${goalYear()}`, hint: 'Конкретный результат к концу года', add: 'Новая цель' },
  { id: 'vision', icon: '🔭', title: 'Видение на несколько лет', hint: 'Моя идеальная картинка будущего', add: 'Каким я хочу стать' },
];
export const kindTitle = (k) => (typeof k.title === 'function' ? k.title() : k.title);

/** Все цели. До первой записи собираются из старых целей аспектов и текста «Моё видение». */
export function goalList(state) {
  if (Array.isArray(state.goals)) return state.goals;
  const list = [];
  for (const [sphereId, plan] of Object.entries(state.spherePlans || {})) {
    for (const g of plan?.goals || [])
      list.push({ id: g.id, sphereId, kind: 'goal', text: g.text, done: !!g.done, year: goalYear() });
    String(plan?.vision || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line, i) => list.push({ id: `vision-${sphereId}-${i}`, sphereId, kind: 'vision', text: line.slice(0, GOAL_TEXT_MAX), done: false, year: visionYear() }));
  }
  return list;
}

/** Копия состояния с изменённым списком целей и групп желаний (change(goals, groups)); старые цели аспектов переносятся один раз. */
export function changeGoals(state, change) {
  const next = structuredClone(state);
  next.goals = structuredClone(goalList(state));
  next.wishGroups = structuredClone(state.wishGroups || []);
  for (const plan of Object.values(next.spherePlans || {})) delete plan.goals;
  change(next.goals, next.wishGroups);
  return next;
}

export function goalStats(state) {
  const list = goalList(state), of = (kind) => list.filter((g) => g.kind === kind);
  return {
    total: list.length,
    wish: { total: of('wish').length, done: of('wish').filter((g) => g.done).length },
    goal: { total: of('goal').length, done: of('goal').filter((g) => g.done).length },
    vision: { total: of('vision').length, done: of('vision').filter((g) => g.done).length },
  };
}

/** Уровни дохода в месяц ($). Уровень — последний, чей порог достигнут; пока доход не указан, стою на 4-м. */
export const INCOME_LEVELS = [
  { n: 1, from: 100, to: 500, name: 'Старт' },
  { n: 2, from: 500, to: 1000, name: 'База' },
  { n: 3, from: 1000, to: 2500, name: 'Стабильность' },
  { n: 4, from: 2500, to: 5000, name: 'Комфорт' },
  { n: 5, from: 5000, to: 10000, name: 'Достаток' },
  { n: 6, from: 10000, to: 25000, name: 'Финансовая свобода' },
  { n: 7, from: 25000, to: 50000, name: 'Высокий доход' },
  { n: 8, from: 50000, to: 100000, name: 'Крупный капитал' },
  { n: 9, from: 100000, to: null, name: 'Финансовая элита' },
];
export const INCOME_DEFAULT_LEVEL = 4;
export const monthlyIncome = (state) => (Number.isFinite(state.income?.monthly) ? state.income.monthly : null);
export function incomeLevel(state) {
  const income = monthlyIncome(state);
  if (income === null) return INCOME_DEFAULT_LEVEL;
  return INCOME_LEVELS.filter((l) => income >= l.from).at(-1)?.n || 0;
}
