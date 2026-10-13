import test from 'node:test';
import assert from 'node:assert/strict';
import { occurs, completionKey, repeatOf } from '../dist/development.js';
import { goalList, changeGoals, goalStats, goalYear, visionYear } from '../dist/goals-model.js';
import { validateState, emptyState } from '../dist/schedule.js';

const task = (extra) => ({ id: 't1', type: 'task', name: 'Задача', sphereId: '1', blockId: '', ...extra });

test('daily tasks appear every day from their start date with a separate tick per day', () => {
  const t = task({ repeat: 'daily', date: '2026-10-10' });
  assert.equal(occurs(t, '2026-10-09'), false);
  assert.equal(occurs(t, '2026-10-10'), true);
  assert.equal(occurs(t, '2026-11-25'), true);
  assert.equal(completionKey(t, '2026-10-12'), '2026-10-12:t1');
  assert.equal(occurs(task({ repeat: 'daily' }), '2026-10-01'), true);
});

test('until-done tasks stay every day until ticked, show on the day they were done, then vanish', () => {
  const t = task({ repeat: 'until', date: '2026-10-10' });
  assert.equal(completionKey(t, '2026-10-15'), 'task:t1');
  assert.equal(occurs(t, '2026-10-09', {}), false);
  assert.equal(occurs(t, '2026-10-20', {}), true);
  const done = { 'task:t1': true };
  assert.equal(occurs({ ...t, doneOn: '2026-10-20' }, '2026-10-20', done), true);
  assert.equal(occurs({ ...t, doneOn: '2026-10-20' }, '2026-10-21', done), false);
});

test('legacy tasks keep their behaviour: dated = once, weekly = same weekday, undated = until done', () => {
  assert.equal(repeatOf(task({ date: '2026-10-10' })), 'once');
  assert.equal(occurs(task({ date: '2026-10-10' }), '2026-10-11'), false);
  assert.equal(repeatOf(task({ date: '2026-10-10', weekly: true })), 'weekly');
  assert.equal(occurs(task({ date: '2026-10-10', weekly: true }), '2026-10-17'), true);
  assert.equal(repeatOf(task({})), 'until');
  assert.equal(completionKey(task({})), 'task:t1');
});

test('task repeat fields are validated', () => {
  const with_ = (extra) => ({ ...emptyState(), items: [task(extra)] });
  assert.ok(validateState(with_({ repeat: 'daily' })));
  assert.ok(validateState(with_({ repeat: 'until', doneOn: '2026-10-13' })));
  assert.equal(validateState(with_({ repeat: 'hourly' })), false);
  assert.equal(validateState(with_({ repeat: 'until', doneOn: 'вчера' })), false);
});

test('goals collect old sphere goals and vision text once, then live in state.goals', () => {
  const old = { ...emptyState(), spherePlans: { '10': { vision: 'Читать каждый день\n\nГоворить по-английски', deadline: '', tools: '', results: '', goals: [{ id: 'g1', text: 'Прочитать 24 книги', done: true }] } } };
  const list = goalList(old);
  assert.deepEqual(list.map((g) => [g.kind, g.text, g.year]), [['goal', 'Прочитать 24 книги', goalYear()], ['vision', 'Читать каждый день', visionYear()], ['vision', 'Говорить по-английски', visionYear()]]);
  const next = changeGoals(old, (goals) => goals.push({ id: 'w1', sphereId: '2', kind: 'wish', text: 'Стакан воды утром', done: false, year: goalYear() }));
  assert.ok(validateState(next));
  assert.equal(next.spherePlans['10'].goals, undefined);
  assert.equal(goalList(next).length, 4);
  assert.deepEqual(goalStats(next).goal, { total: 1, done: 1 });
  assert.equal(validateState({ ...next, goals: [{ id: 'x', sphereId: '10', kind: 'dream', text: 'a', done: false, year: 2026 }] }), false);
});

test('wish groups are validated and deleting a group keeps its wishes', () => {
  const base = { ...emptyState(), goals: [{ id: 'w1', sphereId: '2', kind: 'wish', text: 'Стакан воды', done: false, year: 2026, groupId: 'g1' }], wishGroups: [{ id: 'g1', sphereId: '2', name: 'Утро' }] };
  assert.ok(validateState(base));
  assert.equal(validateState({ ...base, wishGroups: [{ id: 'g1', sphereId: '2', name: '  ' }] }), false);
  assert.equal(validateState({ ...base, wishGroups: [{ id: 'g1', sphereId: '99', name: 'Утро' }] }), false);
  assert.equal(validateState({ ...base, wishGroups: [{ id: 'g1', sphereId: '2', name: 'А' }, { id: 'g1', sphereId: '2', name: 'Б' }] }), false);
  assert.equal(validateState({ ...base, goals: [{ ...base.goals[0], groupId: 5 }] }), false);
  const next = changeGoals(base, (list, groups) => {
    groups.splice(0, 1);
    for (const g of list) if (g.groupId === 'g1') delete g.groupId;
  });
  assert.ok(validateState(next));
  assert.deepEqual(next.wishGroups, []);
  assert.equal(next.goals.length, 1);
  assert.equal(next.goals[0].groupId, undefined);
  assert.equal(changeGoals(emptyState(), () => {}).wishGroups.length, 0);
});

test('calorie periods: week is Monday-Sunday, month is calendar, future days are not counted', async () => {
  const { periodDays, periodSummary, CALORIE_GOAL } = await import('../dist/health.js');
  const { dateKey } = await import('../dist/schedule.js');
  const wed = new Date(2026, 9, 14, 15, 30); // среда, 14 октября 2026
  const week = periodDays('week', 0, wed);
  assert.deepEqual([dateKey(week[0]), dateKey(week[6])], ['2026-10-12', '2026-10-18']);
  assert.deepEqual([dateKey(periodDays('week', -1, wed)[0])], ['2026-10-05']);
  const month = periodDays('month', 0, wed);
  assert.equal(month.length, 31);
  assert.deepEqual([dateKey(month[0]), dateKey(month[30])], ['2026-10-01', '2026-10-31']);
  assert.equal(periodDays('month', -8, wed).length, 28); // февраль 2026
  assert.equal(periodDays('month', 3, wed)[0].getMonth(), 0); // январь 2027
  const calories = { '2026-10-12': 300, '2026-10-13': 100, '2026-10-14': 250, '2026-10-16': 900, '2026-10-05': 40 };
  const s = periodSummary(calories, week, '2026-10-14');
  assert.equal(s.total, 650); // 16-е ещё в будущем — не считается
  assert.equal(s.goldDays, 2);
  assert.equal(s.elapsed, 3);
  assert.equal(s.best, 300);
  assert.equal(Math.round(s.avg), 217);
  assert.equal(s.target, 7 * CALORIE_GOAL);
  assert.equal(s.gold, false);
  const full = periodSummary({ '2026-10-12': 2000 }, week, '2026-10-18');
  assert.equal(full.gold, true);
  assert.equal(periodSummary(undefined, month, '2026-10-14').total, 0);
});
