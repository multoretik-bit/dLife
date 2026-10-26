// Распознавание еды по фото: фото → Claude (vision) → список блюд с граммами, калориями и БЖУ.
// Переменные окружения Vercel:
//   ANTHROPIC_API_KEY — ключ Claude API (console.anthropic.com → API Keys);
//   FOOD_AI_CODE      — код доступа: сайт публичный, без кода любой мог бы тратить запросы.
//                       Тот же код один раз вводится в dLife на устройстве.
import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";

export const MODEL = "claude-opus-5-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // предел API для одного изображения
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export const FOOD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "note"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "grams", "kcal", "protein", "fat", "carbs", "confidence"],
        properties: {
          name: { type: "string", description: "Короткое название по-русски, например «Гречка варёная»" },
          grams: { type: "number", description: "Вес порции на фото, граммы (напитки — миллилитры)" },
          kcal: { type: "number", description: "Калории на всю порцию" },
          protein: { type: "number", description: "Белки на всю порцию, г" },
          fat: { type: "number", description: "Жиры на всю порцию, г" },
          carbs: { type: "number", description: "Углеводы на всю порцию, г" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    note: { type: "string", description: "Одно короткое предложение по-русски: что учтено или что стоит уточнить" },
  },
};

const SYSTEM = `Ты — внимательный нутрициолог. Тебе присылают фото еды из дневника питания.
Найди на фото каждое отдельное блюдо, продукт или напиток и оцени:
- вес порции в граммах — по размеру тарелки, приборов, рук, упаковки; не завышай и не занижай;
- калории и белки, жиры, углеводы на всю эту порцию (не на 100 г), учитывая видимое масло, соусы и способ приготовления.
Если блюдо составное (например, паста с соусом), записывай его одним пунктом. Названия — коротко и по-русски.
confidence: high — продукт и порция видны отчётливо, medium — есть сомнения, low — грубая оценка.
Если пользователь дал уточнение, оно важнее догадок по фото.
Если на фото нет еды, верни пустой список и объясни в note.`;

const clamp = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(+v) ? +v : 0));
const round1 = (v) => Math.round(v * 10) / 10;

/** data:URL или чистый base64 → блок изображения для Claude. */
export function imageBlock(image) {
  const m = String(image || "").match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !TYPES.includes(m[1])) throw Object.assign(new Error("Пришли фото в формате JPEG, PNG или WebP."), { status: 400 });
  if (Math.floor((m[2].length * 3) / 4) > MAX_IMAGE_BYTES) throw Object.assign(new Error("Фото слишком большое — до 5 МБ."), { status: 413 });
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

/** Чистит ответ модели: правдоподобные числа, не больше 12 блюд, короткие названия. */
export function cleanItems(parsed) {
  const items = (Array.isArray(parsed?.items) ? parsed.items : []).slice(0, 12).map((x) => ({
    name: String(x?.name || "Блюдо").trim().slice(0, 80) || "Блюдо",
    grams: Math.round(clamp(x?.grams, 1, 5000)),
    kcal: Math.round(clamp(x?.kcal, 0, 20000)),
    protein: round1(clamp(x?.protein, 0, 2000)),
    fat: round1(clamp(x?.fat, 0, 2000)),
    carbs: round1(clamp(x?.carbs, 0, 2000)),
    confidence: ["high", "medium", "low"].includes(x?.confidence) ? x.confidence : "medium",
  }));
  return { items, note: String(parsed?.note || "").trim().slice(0, 300) };
}

/** Один запрос к Claude. client — экземпляр Anthropic (в тестах подменяется). */
export async function analyzeFood({ client, image, hint = "" }) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Если модель отклонит запрос, API само повторит его на подходящей модели.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: FOOD_SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [imageBlock(image), { type: "text", text: hint.trim() ? `Уточнение от меня: ${hint.trim().slice(0, 300)}` : "Что на фото и сколько здесь калорий?" }],
    }],
  });
  if (response.stop_reason === "refusal") throw Object.assign(new Error("Нейросеть не стала разбирать это фото. Попробуй другое фото или запиши еду вручную."), { status: 422 });
  if (response.stop_reason === "max_tokens") throw Object.assign(new Error("Ответ получился слишком длинным — сфотографируй блюда по отдельности."), { status: 502 });
  const text = response.content.find((b) => b.type === "text")?.text;
  let parsed;
  try { parsed = JSON.parse(text || ""); } catch { throw Object.assign(new Error("Нейросеть ответила непонятно — попробуй ещё раз."), { status: 502 }); }
  return { ...cleanItems(parsed), model: response.model };
}

// Код может быть на кириллице: браузер присылает его через encodeURIComponent.
const decode = (v) => { try { return decodeURIComponent(String(v || "")); } catch { return String(v || ""); } };
const sameCode = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

export default async function handler(req, res, deps = {}) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST." });
  const env = deps.env || process.env;
  if (!env.ANTHROPIC_API_KEY || !env.FOOD_AI_CODE) return res.status(503).json({ error: "Распознавание еды ещё не подключено: добавь ANTHROPIC_API_KEY и FOOD_AI_CODE в настройках Vercel.", setup: true });
  if (!sameCode(decode(req.headers["x-dlife-ai-code"]), env.FOOD_AI_CODE)) return res.status(401).json({ error: "Нужен код доступа к распознаванию еды.", needCode: true });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  try {
    const client = deps.client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return res.status(200).json(await analyzeFood({ client, image: body.image, hint: String(body.hint || "") }));
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: "Ключ Claude API не подошёл — проверь ANTHROPIC_API_KEY в Vercel." });
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Слишком много фото подряд — подожди минуту." });
    if (error instanceof Anthropic.BadRequestError) return res.status(400).json({ error: "Claude не принял запрос: " + error.message });
    if (error instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API недоступен (${error.status ?? "сеть"}). Попробуй ещё раз.` });
    return res.status(error.status || 500).json({ error: error.message || "Не получилось распознать фото." });
  }
}
