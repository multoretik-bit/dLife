// Живая библиотека из Notion: читает базу книг и отдаёт список с текущими статусами.
// Переменные окружения Vercel:
//   NOTION_TOKEN    — ключ внутренней интеграции Notion (только чтение), база должна быть ей открыта;
//   NOTION_LIBRARY  — необязательно: другая база книг (ссылка или ID). По умолчанию — «Библиотека» 📕 Дениса.
// Необязательные NOTION_STATUS_PROPERTY / NOTION_AUTHOR_PROPERTY / NOTION_CATEGORY_PROPERTY задают колонки явно.

const API = 'https://api.notion.com/v1/';
const VERSION = '2022-06-28';
const MAX_BOOKS = 2000;
const DEFAULT_LIBRARY = 'https://app.notion.com/p/1da8171a481c805f85bbefdff2f5a443';

const plain = (rich) => (Array.isArray(rich) ? rich : []).map((t) => t.plain_text ?? t.text?.content ?? '').join('').trim();

/** ID базы или страницы из ссылки Notion, UUID или 32 hex-символов. */
export function notionId(value) {
  const raw = String(value || '').trim();
  const dashed = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (dashed) return dashed[0].replaceAll('-', '').toLowerCase();
  let path = raw;
  try { path = new URL(raw).pathname; } catch {}
  const segment = path.split(/[/-]/).filter((s) => /^[0-9a-f]{32}$/i.test(s)).pop();
  return segment ? segment.toLowerCase() : '';
}

/** Статус книги по названию варианта: reading, read, planned или null, если не распознан. */
export function statusFromText(value) {
  const v = String(value || '').toLowerCase().trim();
  if (!v) return null;
  if (/не\s*(начат|прочит|чита)|прочитать|к\s*прочтению|not\s*started|хочу|план|to\s*read|to-?do|backlog|очеред|отлож|позже|later/.test(v)) return 'planned';
  if (/читаю|чита(ем|ется|ю сейчас)|в\s*процессе|процесс|progress|reading|начат|current|сейчас|doing/.test(v)) return 'reading';
  if (/прочит|готов|заверш|закончен|done|complete|finished|\bread\b/.test(v)) return 'read';
  return null;
}

/** Находит нужные колонки базы по типу и названию. */
export function detectSchema(properties, env = {}) {
  const entries = Object.entries(properties || {});
  const byName = (name) => (name && properties[name] ? name : null);
  const find = (test) => entries.find(([name, p]) => test(name, p))?.[0] ?? null;
  const textual = ['rich_text', 'select', 'multi_select', 'people', 'relation', 'formula'];
  return {
    title: find((_, p) => p.type === 'title'),
    status:
      byName(env.NOTION_STATUS_PROPERTY) ||
      find((n, p) => p.type === 'status' && /статус|status|состоя|прогресс|чтени/i.test(n)) ||
      find((_, p) => p.type === 'status') ||
      find((n, p) => p.type === 'select' && /статус|status|состоя|прогресс|чтени/i.test(n)) ||
      find((n, p) => p.type === 'checkbox' && /прочит|read|готов|done|заверш/i.test(n)),
    author: byName(env.NOTION_AUTHOR_PROPERTY) || find((n, p) => textual.includes(p.type) && /автор|author|писател/i.test(n)),
    category:
      byName(env.NOTION_CATEGORY_PROPERTY) ||
      find((n, p) => ['select', 'multi_select'].includes(p.type) && /категор|category|жанр|genre|раздел|тег|tag|тема|полк|shelf/i.test(n)),
    year: find((n, p) => ['number', 'rich_text', 'select', 'date'].includes(p.type) && /^(год|year)|год изд|publication/i.test(n)),
  };
}

/** Текстовое значение любой простой колонки страницы. */
function valueOf(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title': case 'rich_text': return plain(prop[prop.type]);
    case 'select': case 'status': return prop[prop.type]?.name ?? '';
    case 'multi_select': return prop.multi_select.map((o) => o.name).join(', ');
    case 'people': return prop.people.map((p) => p.name).filter(Boolean).join(', ');
    case 'number': return prop.number == null ? '' : String(prop.number);
    case 'date': return prop.date?.start?.slice(0, 4) ?? '';
    case 'checkbox': return prop.checkbox;
    case 'formula': return String(prop.formula?.[prop.formula?.type] ?? '');
    default: return '';
  }
}

/** Статус книги: по имени варианта, затем по группе статуса Notion (To-do / In progress / Complete). */
function bookStatus(prop, groups) {
  if (!prop) return 'planned';
  if (prop.type === 'checkbox') return prop.checkbox ? 'read' : 'planned';
  const option = prop[prop.type];
  return statusFromText(option?.name) || statusFromText(groups.get(option?.id)) || 'planned';
}

export function toBooks(pages, schema, groups = new Map()) {
  return pages
    .filter((p) => !p.archived && !p.in_trash)
    .map((p) => ({
      id: p.id,
      title: valueOf(p.properties[schema.title]),
      author: schema.author ? String(valueOf(p.properties[schema.author])) : '',
      category: schema.category ? String(valueOf(p.properties[schema.category])) : '',
      year: schema.year ? String(valueOf(p.properties[schema.year])) : '',
      status: bookStatus(p.properties[schema.status], groups),
      url: p.url,
      edited: p.last_edited_time,
    }))
    .filter((b) => b.title);
}

async function notion(token, path, body) {
  const response = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Notion ответил ${response.status}`);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

/** База по ID; если это страница — первая вложенная в неё база (предпочтительно с «книг»/«библиотек» в названии). */
async function findDatabase(token, id) {
  try {
    return await notion(token, `databases/${id}`);
  } catch (e) {
    if (e.status !== 404 && e.status !== 400) throw e;
    const children = await notion(token, `blocks/${id}/children?page_size=100`);
    const bases = children.results.filter((b) => b.type === 'child_database');
    const pick = bases.find((b) => /книг|библиот|book|library|чита/i.test(b.child_database.title)) || bases[0];
    if (!pick) throw Object.assign(new Error('По ссылке нет базы книг. Укажи ссылку на саму базу Notion.'), { status: 404, code: 'no_database' });
    return notion(token, `databases/${pick.id}`);
  }
}

export async function loadLibrary(token, target) {
  const id = notionId(target);
  if (!id) throw Object.assign(new Error('NOTION_LIBRARY должен быть ссылкой на базу Notion.'), { status: 500 });
  const database = await findDatabase(token, id);
  const schema = detectSchema(database.properties, process.env);
  if (!schema.title) throw Object.assign(new Error('В базе нет колонки с названием.'), { status: 500 });
  const groups = new Map();
  const statusProp = database.properties[schema.status];
  if (statusProp?.type === 'status')
    for (const g of statusProp.status.groups || []) for (const optionId of g.option_ids || []) groups.set(optionId, g.name);
  const pages = [];
  let cursor;
  do {
    const result = await notion(token, `databases/${database.id}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    pages.push(...result.results);
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor && pages.length < MAX_BOOKS);
  return { title: plain(database.title) || 'Библиотека', url: database.url, schema, books: toBooks(pages, schema, groups) };
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ message: 'Только чтение.' });
  const { NOTION_TOKEN, NOTION_LIBRARY = DEFAULT_LIBRARY } = process.env;
  if (!NOTION_TOKEN) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ connected: false });
  }
  try {
    const library = await loadLibrary(NOTION_TOKEN, NOTION_LIBRARY);
    // Короткий кэш на CDN: Notion не перегружается, а изменения видны в течение полуминуты.
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ connected: true, ...library, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    const message =
      e.status === 401 ? 'Ключ Notion недействителен. Проверь NOTION_TOKEN.' :
      e.status === 404 || e.code === 'object_not_found' ? 'Интеграция не видит базу. В Notion: ••• → Connections → добавь интеграцию dLife.' :
      e.status === 429 ? 'Notion ограничил частоту запросов. Попробуй через минуту.' :
      e.message || 'Не удалось прочитать Notion.';
    return res.status(502).json({ connected: true, error: message });
  }
}
