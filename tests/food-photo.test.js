import test from "node:test";
import assert from "node:assert/strict";
import handler, { analyzeFood, cleanItems, imageBlock, MODEL } from "../api/food-photo.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const reply = (json, extra = {}) => ({ stop_reason: "end_turn", model: MODEL, content: [{ type: "text", text: JSON.stringify(json) }], ...extra });
const fakeClient = (answer) => {
  const calls = [];
  return { calls, beta: { messages: { create: async (params) => { calls.push(params); return answer; } } } };
};
const fakeRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => (r.headers[k] = v);
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const env = { ANTHROPIC_API_KEY: "test-key", FOOD_AI_CODE: "секрет-123" };

test("the request sends the photo to Claude with a strict JSON schema", async () => {
  const client = fakeClient(reply({ items: [{ name: "Гречка варёная", grams: 180, kcal: 198, protein: 7.6, fat: 2, carbs: 38.3, confidence: "high" }], note: "Масла не видно." }));
  const out = await analyzeFood({ client, image: PNG, hint: "без масла" });
  const p = client.calls[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.equal(p.output_config.format.type, "json_schema");
  assert.equal(p.output_config.format.schema.additionalProperties, false);
  assert.deepEqual(p.fallbacks, "default");
  assert.equal(p.messages[0].content[0].type, "image");
  assert.equal(p.messages[0].content[0].source.media_type, "image/png");
  assert.match(p.messages[0].content[1].text, /без масла/);
  assert.equal(p.thinking, undefined, "на Opus 5.5 thinking не отключается — параметр не передаём");
  assert.equal(out.items[0].kcal, 198);
  assert.equal(out.note, "Масла не видно.");
});

test("model answers are cleaned to plausible numbers", () => {
  const out = cleanItems({ items: [{ name: "  ", grams: -5, kcal: 1e9, protein: "12.345", fat: null, carbs: 3, confidence: "unsure" }], note: "x".repeat(500) });
  assert.deepEqual(out.items[0], { name: "Блюдо", grams: 1, kcal: 20000, protein: 12.3, fat: 0, carbs: 3, confidence: "medium" });
  assert.equal(out.note.length, 300);
  assert.equal(cleanItems({ items: Array.from({ length: 20 }, () => ({ name: "a" })) }).items.length, 12);
});

test("bad images and refusals become clear errors", async () => {
  assert.throws(() => imageBlock("data:text/html;base64,AAAA"), /JPEG, PNG или WebP/);
  assert.throws(() => imageBlock("data:image/jpeg;base64," + "A".repeat(7_100_000)), /до 5 МБ/);
  await assert.rejects(analyzeFood({ client: fakeClient(reply({}, { stop_reason: "refusal", content: [] })), image: PNG }), /не стала разбирать/);
  await assert.rejects(analyzeFood({ client: fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "не json" }] }), image: PNG }), /непонятно/);
});

test("the endpoint needs the key, the access code and POST", async () => {
  let res = fakeRes();
  await handler({ method: "GET", headers: {} }, res, { env });
  assert.equal(res.code, 405);
  res = fakeRes();
  await handler({ method: "POST", headers: {}, body: { image: PNG } }, res, { env: {} });
  assert.equal(res.code, 503); assert.equal(res.body.setup, true);
  res = fakeRes();
  await handler({ method: "POST", headers: { "x-dlife-ai-code": "неверный" }, body: { image: PNG } }, res, { env });
  assert.equal(res.code, 401); assert.equal(res.body.needCode, true);
  const client = fakeClient(reply({ items: [{ name: "Яблоко", grams: 180, kcal: 85, protein: 0.7, fat: 0.7, carbs: 17.6, confidence: "high" }], note: "" }));
  res = fakeRes();
  await handler({ method: "POST", headers: { "x-dlife-ai-code": encodeURIComponent(env.FOOD_AI_CODE) }, body: { image: PNG } }, res, { env, client });
  assert.equal(res.code, 200);
  assert.equal(res.body.items[0].name, "Яблоко");
  assert.equal(res.headers["Cache-Control"], "no-store");
});
