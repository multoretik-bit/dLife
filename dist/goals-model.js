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
