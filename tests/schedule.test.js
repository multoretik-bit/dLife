import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeBlock,
  blockDate,
  overlaps,
  validateBlock,
  validateState,
  emptyState,
} from "../dist/schedule.js";
const sport = {
  id: "a",
  name: "Спорт",
  start: "09:00",
  end: "10:00",
  sphereId: "2",
};
test("start inclusive, end exclusive, idle becomes rest", () => {
  assert.equal(activeBlock([sport], new Date(2026, 8, 21, 9)), sport);
  assert.equal(activeBlock([sport], new Date(2026, 8, 21, 10)), null);
});
test("midnight block belongs to previous start date", () => {
  const b = { ...sport, start: "23:00", end: "01:00" };
  assert.equal(activeBlock([b], new Date(2026, 8, 22, 0, 30)), b);
  assert.equal(blockDate(b, new Date(2026, 8, 22, 0, 30)), "2026-09-21");
});
test("adjacent blocks allowed and midnight conflicts prevented", () => {
  assert.equal(overlaps(sport, { start: "10:00", end: "11:00" }), false);
  assert.equal(
    overlaps(
      { start: "23:00", end: "01:00" },
      { start: "00:30", end: "02:00" },
    ),
    true,
  );
  assert.ok(validateBlock({ ...sport, id: "b", start: "09:30" }, [sport]));
});
test("reject malformed times, arbitrary palette, dangling tasks", () => {
  assert.ok(validateBlock({ ...sport, start: "25:00" }));
  assert.ok(validateBlock({ ...sport, sphereId: "neon" }));
  assert.equal(
    validateState({
      ...emptyState(),
      items: [
        { id: "i", blockId: "missing", type: "task", sphereId: "2", name: "x" },
      ],
    }),
    false,
  );
  assert.equal(validateState(emptyState()), true);
});
