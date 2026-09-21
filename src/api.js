import { validateState, emptyState } from "../dist/schedule.js";
const response = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function scheduleApi(request, db, userId) {
  if (!userId) return response({ error: "unauthorized" }, 401);
  if (!db) return response({ error: "storage_unavailable" }, 503);
  try {
    if (request.method === "GET") {
      const row = await db
        .prepare("SELECT payload, revision FROM schedules WHERE user_id = ?")
        .bind(userId)
        .first();
      return response({
        state: row ? JSON.parse(row.payload) : emptyState(),
        revision: row?.revision || 0,
      });
    }
    if (request.method !== "PUT")
      return response({ error: "method_not_allowed" }, 405);
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin)
      return response({ error: "forbidden_origin" }, 403);
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return response({ error: "invalid_content_type" }, 415);
    if (Number(request.headers.get("Content-Length")) > 1000000)
      return response({ error: "too_large" }, 413);
    const body = await request.text();
    if (body.length > 1000000) return response({ error: "too_large" }, 413);
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return response({ error: "invalid_json" }, 400);
    }
    if (
      !Number.isSafeInteger(data.revision) ||
      data.revision < 0 ||
      !validateState(data.state)
    )
      return response({ error: "invalid_state" }, 400);
    const result = await db
      .prepare(
        "INSERT INTO schedules (user_id, payload, revision) VALUES (?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, revision = schedules.revision + 1 WHERE schedules.revision = ?",
      )
      .bind(userId, JSON.stringify(data.state), data.revision)
      .run();
    if (!result.meta.changes) return response({ error: "conflict" }, 409);
    return response({ revision: data.revision + 1 });
  } catch (error) {
    console.error("Schedule storage:", error);
    return response({ error: "storage_unavailable" }, 503);
  }
}
