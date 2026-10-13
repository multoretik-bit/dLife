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
