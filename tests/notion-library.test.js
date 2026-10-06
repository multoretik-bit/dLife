import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { notionId, statusFromText, detectSchema, loadLibrary } from '../api/notion-library.js';

const ID = '0123456789abcdef0123456789abcdef';
const rich = (text) => [{ plain_text: text }];
const database = {
  id: ID,
  url: `https://www.notion.so/${ID}`,
  title: rich('Моя библиотека'),
  properties: {
    'Название': { type: 'title' },
    'Автор': { type: 'rich_text' },
    'Категория': { type: 'select' },
    'Статус': { type: 'status', status: { groups: [{ name: 'Complete', option_ids: ['s3'] }] } },
  },
};
const page = (id, title, status, extra = {}) => ({
  id, url: `https://www.notion.so/${id}`, last_edited_time: '2026-10-06T10:00:00.000Z', ...extra,
  properties: {
    'Название': { type: 'title', title: rich(title) },
    'Автор': { type: 'rich_text', rich_text: rich('Автор ' + title) },
    'Категория': { type: 'select', select: { name: 'Классика' } },
    'Статус': { type: 'status', status: status && { id: status[0], name: status[1] } },
  },
});

function mockNotion(routes) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const path = url.replace('https://api.notion.com/v1/', '');
    calls.push([init.method, path, init.headers.Authorization]);
    const route = routes[path];
    const [status, body] = typeof route === 'function' ? route(JSON.parse(init.body || '{}')) : route || [404, { code: 'object_not_found', message: 'nope' }];
    return { ok: status < 300, status, json: async () => body };
  };
  return calls;
}

test('notion ids are taken from links, uuids and view links', () => {
  assert.equal(notionId(`https://www.notion.so/ws/Books-abcdef-${ID}?v=ffffffffffffffffffffffffffffffff`), ID);
  assert.equal(notionId('https://app.notion.com/p/24c8171a481c80cb8553e9ca2723c9c0?source=copy_link'), '24c8171a481c80cb8553e9ca2723c9c0');
  assert.equal(notionId('01234567-89ab-cdef-0123-456789abcdef'), ID);
  assert.equal(notionId('не ссылка'), '');
});

test('status names map to reading, read and planned', () => {
  for (const s of ['Читаю', 'В процессе', 'Reading', 'In progress', 'Читаю сейчас']) assert.equal(statusFromText(s), 'reading', s);
  for (const s of ['Прочитано', 'Прочитана', 'Done', 'Read', 'Завершено']) assert.equal(statusFromText(s), 'read', s);
  for (const s of ['Не начато', 'Хочу прочитать', 'Прочитать', 'Not started', 'To read', 'Не прочитано']) assert.equal(statusFromText(s), 'planned', s);
  assert.equal(statusFromText('Что-то своё'), null);
});

test('schema detection finds title, status, author and category; checkbox works as status', () => {
  assert.deepEqual(detectSchema(database.properties), { title: 'Название', status: 'Статус', author: 'Автор', category: 'Категория', year: null });
  assert.equal(detectSchema({ Name: { type: 'title' }, 'Прочитано': { type: 'checkbox' } }).status, 'Прочитано');
});

test('library loads every page, maps statuses (including by status group) and skips trashed or untitled pages', async () => {
  const calls = mockNotion({
    [`databases/${ID}`]: [200, database],
    [`databases/${ID}/query`]: (body) => body.start_cursor
      ? [200, { results: [page('p4', 'Бесы', ['s3', 'Своё название'])], has_more: false }]
      : [200, { results: [page('p1', 'Идиот', ['s1', 'Читаю']), page('p2', 'Обломов', ['s2', 'Прочитано']), page('p3', 'Мы', null), page('px', 'Удалена', null, { in_trash: true }), page('py', '', null)], has_more: true, next_cursor: 'c2' }],
  });
  const lib = await loadLibrary('secret', `https://www.notion.so/${ID}`);
  assert.equal(lib.title, 'Моя библиотека');
  assert.deepEqual(lib.books.map((b) => [b.title, b.status]), [['Идиот', 'reading'], ['Обломов', 'read'], ['Мы', 'planned'], ['Бесы', 'read']]);
  assert.equal(lib.books[0].url, 'https://www.notion.so/p1');
  assert.equal(lib.books[0].author, 'Автор Идиот');
  assert.ok(calls.every(([, , auth]) => auth === 'Bearer secret'));
});

test('a page link is resolved to the books database inside it', async () => {
  const PAGE = 'ffffffffffffffffffffffffffffffff';
  mockNotion({
    [`blocks/${PAGE}/children?page_size=100`]: [200, { results: [{ id: 'other', type: 'child_database', child_database: { title: 'Цитаты' } }, { id: ID, type: 'child_database', child_database: { title: 'Книги' } }] }],
    [`databases/${ID}`]: [200, database],
    [`databases/${ID}/query`]: [200, { results: [page('p1', 'Идиот', ['s1', 'Читаю'])], has_more: false }],
  });
  const lib = await loadLibrary('secret', PAGE);
  assert.equal(lib.books.length, 1);
});

function response() {
  const res = { headers: {}, statusCode: 0, body: null };
  res.setHeader = (k, v) => (res.headers[k] = v);
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('handler reports a missing setup, hides the token and explains access errors', async () => {
  delete process.env.NOTION_TOKEN; delete process.env.NOTION_LIBRARY;
  let res = await handler({ method: 'GET' }, response());
  assert.deepEqual(res.body, { connected: false });

  process.env.NOTION_TOKEN = 'secret_token'; process.env.NOTION_LIBRARY = ID;
  mockNotion({});
  res = await handler({ method: 'GET' }, response());
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /Connections/);
  assert.ok(!JSON.stringify(res.body).includes('secret_token'));

  mockNotion({ [`databases/${ID}`]: [200, database], [`databases/${ID}/query`]: [200, { results: [page('p1', 'Идиот', ['s1', 'Читаю'])], has_more: false }] });
  res = await handler({ method: 'GET' }, response());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.books[0].status, 'reading');
  assert.match(res.headers['Cache-Control'], /s-maxage=30/);
  assert.equal((await handler({ method: 'POST' }, response())).statusCode, 405);
  delete process.env.NOTION_TOKEN; delete process.env.NOTION_LIBRARY;
});
