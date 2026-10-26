// Шаги и активные калории с Apple Watch: «Команды» на iPhone присылают их сюда (POST),
// dLife при открытии забирает (GET) и записывает в свои данные.
// Хранение — приватный Vercel Blob (BLOB_READ_WRITE_TOKEN), файл на каждый токен: health/<sha256(token)>.json.
// Токен генерирует сам dLife («Здоровье» → Apple Watch); без него ни записать, ни прочитать нельзя.
import { get, put } from "@vercel/blob";
import { createHash } from "node:crypto";

const TZ = "Asia/Krasnoyarsk";
const KEEP_DAYS = 120;
const TOKEN = /^[A-Za-z0-9_-]{24,80}$/;

export const blobPath = (token) => `health/${createHash("sha256").update(token).digest("hex")}.json`;
export const todayIn = (tz = TZ, now = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(now);

/** Число из того, что прислали «Команды»: «8 432», «245,7», «245.7 ккал», 245.7.
    Список записей (массив или строки через перенос) складывается — так команда может слать образцы «как есть». */
export function number(value) {
  if (Array.isArray(value)) return value.length ? value.map(number).reduce((a, b) => a + b, 0) : NaN;
  if (typeof value === "string" && /\n/.test(value.trim())) return number(value.trim().split(/\r?\n/).filter((l) => l.trim()));
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const cleaned = String(value ?? "").replace(/[\s\u00a0]/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : NaN;
}

/** Проверяет и нормализует присланный день. Возвращает { date, steps?, kcal? } или текст ошибки. */
export function parseDay(body, now = new Date()) {
  const date = body?.date ? String(body.date).slice(0, 10) : todayIn(TZ, now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00Z"))) return "Дата должна быть в виде ГГГГ-ММ-ДД.";
  const out = { date };
  const steps = number(body?.steps), kcal = number(body?.kcal ?? body?.calories ?? body?.activeEnergy);
  if (body?.steps !== undefined && body.steps !== "") {
    if (!(steps >= 0 && steps <= 200000)) return "Шаги — число от 0 до 200 000.";
    out.steps = Math.round(steps);
  }
  const rawKcal = body?.kcal ?? body?.calories ?? body?.activeEnergy;
  if (rawKcal !== undefined && rawKcal !== "") {
    if (!(kcal >= 0 && kcal <= 20000)) return "Калории — число от 0 до 20 000.";
    out.kcal = Math.round(kcal);
  }
  if (out.steps === undefined && out.kcal === undefined) return "Пришли steps и/или kcal.";
  return out;
}

/** Вливает день в сохранённые данные; хранит последние KEEP_DAYS дней. */
export function mergeDay(data, day, at = new Date().toISOString()) {
  const days = { ...(data?.days || {}) };
  const { date, ...values } = day;
  days[date] = { ...days[date], ...values, at };
  const keep = Object.keys(days).sort().slice(-KEEP_DAYS);
  return { days: Object.fromEntries(keep.map((d) => [d, days[d]])), updatedAt: at };
}

async function readData(path, blob) {
  try {
    const res = await blob.get(path, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return { days: {} };
    return JSON.parse(await new Response(res.stream).text());
  } catch (e) {
    if (e?.name === "BlobNotFoundError" || /not.?found/i.test(e?.message || "")) return { days: {} };
    throw e;
  }
}

export default async function handler(req, res, deps = {}) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  const env = deps.env || process.env, blob = deps.blob || { get, put };
  if (!env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: "Хранилище для Apple Watch не подключено (BLOB_READ_WRITE_TOKEN)." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { return res.status(400).json({ error: "Тело запроса должно быть JSON." }); } }
  // Токен (и при желании steps/kcal/date) можно передать прямо в адресе: ?token=…
  // Так в «Командах» не нужны заголовки — достаточно вставить одну ссылку.
  const query = Object.fromEntries(new URL(req.url || "/", "http://local").searchParams);
  body = { ...query, ...(body && typeof body === "object" ? body : {}) };
  const token = String(req.headers["x-health-token"] || body.token || "").trim();
  if (!TOKEN.test(token)) return res.status(401).json({ error: "Нужен токен Apple Watch из dLife («Здоровье» → Apple Watch)." });
  const path = blobPath(token);
  try {
    if (req.method === "GET") return res.status(200).json(await readData(path, blob));
    if (req.method !== "POST") return res.status(405).json({ error: "Только GET и POST." });
    const day = parseDay(body || {});
    // Что пришло на самом деле — чтобы по ответу в «Командах» было видно пустую или лишнюю переменную.
    const preview = (v) => (v === undefined ? "нет поля" : v === "" ? "пусто" : String(Array.isArray(v) ? v.join(" | ") : v).replace(/\s+/g, " ").slice(0, 80));
    const received = { steps: preview(body.steps), kcal: preview(body.kcal ?? body.calories ?? body.activeEnergy) };
    if (typeof day === "string") return res.status(400).json({ error: day, received });
    const hints = [];
    // Калории ровно равны шагам — значит, во втором действии тоже стоит тип «Шаги». Такие калории не записываем.
    if (day.kcal !== undefined && day.steps !== undefined && day.kcal === day.steps && day.steps > 0) {
      delete day.kcal;
      hints.push("kcal совпали с шагами — во втором «Find Health Samples» выбери тип Active Energy (Активная энергия); калории не записаны");
    }
    const data = mergeDay(await readData(path, blob), day);
    await blob.put(path, JSON.stringify(data), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", token: env.BLOB_READ_WRITE_TOKEN });
    if (day.steps === undefined) hints.push("шаги не пришли — справа у steps должна быть переменная от действия с шагами");
    if (/\|/.test(received.steps) || /\|/.test(received.kcal) || /\n/.test(String(body.steps ?? "") + String(body.kcal ?? ""))) hints.push("пришло несколько записей — в каждом «Find Health Samples»: Group By: Day, Fill Missing выключить, Sort by Start Date · Latest First, Limit 1");
    return res.status(200).json({ ok: true, ...day, message: `dLife: ${day.date}${day.steps !== undefined ? ` · шаги ${day.steps}` : ""}${day.kcal !== undefined ? ` · ${day.kcal} ккал` : ""}`, received, ...(hints.length ? { hint: hints.join("; ") } : {}) });
  } catch (e) {
    return res.status(502).json({ error: "Хранилище недоступно, попробуй позже: " + (e?.message || e) });
  }
}
