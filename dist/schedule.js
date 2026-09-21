export const SPHERES = [
  { id: "1", name: "Моя внешность", color: "#73EBFE" },
  { id: "2", name: "Здоровье", color: "#1101FF" },
  { id: "3", name: "Отношения", color: "#FF118B" },
  { id: "4", name: "Семья", color: "#FF8A00" },
  { id: "5", name: "Окружение", color: "#85FE4F" },
  { id: "6", name: "Отдых", color: "#FFB7B9" },
  { id: "7", name: "Стремления", color: "#44007E" },
  { id: "8", name: "Бизнес и работа", color: "#FF0006" },
  { id: "9", name: "Финансы", color: "#003900" },
  { id: "10", name: "Учёба", color: "#FFDD19" },
];
export const sphereFor = (id) => SPHERES.find((s) => s.id === id) || SPHERES[5];
export function minutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return null;
  const [h, m] = value.split(":").map(Number);
  return h < 24 && m < 60 ? h * 60 + m : null;
}
export function segments(block) {
  const a = minutes(block.start),
    b = minutes(block.end);
  if (a === null || b === null || a === b) return [];
  return a < b
    ? [[a, b]]
    : [
        [a, 1440],
        [0, b],
      ];
}
export function overlaps(a, b) {
  return segments(a).some(([s, e]) =>
    segments(b).some(([x, y]) => s < y && x < e),
  );
}
export function activeBlock(blocks, now = new Date()) {
  const n = now.getHours() * 60 + now.getMinutes();
  return (
    blocks.find((b) => segments(b).some(([s, e]) => n >= s && n < e)) || null
  );
}
export function blockDate(block, now = new Date()) {
  const d = new Date(now);
  const a = minutes(block.start),
    b = minutes(block.end);
  if (b < a && now.getHours() * 60 + now.getMinutes() < b)
    d.setDate(d.getDate() - 1);
  return dateKey(d);
}
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validateBlock(block, blocks = []) {
  if (!String(block.name || "").trim()) return "Введите название блока.";
  if (!SPHERES.some((s) => s.id === block.sphereId))
    return "Выберите сферу жизни.";
  if (!segments(block).length)
    return "Укажите разное время начала и окончания.";
  const conflict = blocks.find((b) => b.id !== block.id && overlaps(block, b));
  return conflict ? `Это время пересекается с блоком «${conflict.name}».` : "";
}
export function remainingMinutes(block, now = new Date()) {
  const n = now.getHours() * 60 + now.getMinutes();
  return (minutes(block.end) - n + 1440) % 1440;
}
export function validateState(state) {
  if (
    !state ||
    !Array.isArray(state.blocks) ||
    !Array.isArray(state.items) ||
    typeof state.done !== "object" ||
    !state.done ||
    Array.isArray(state.done)
  )
    return false;
  if (
    state.blocks.length > 100 ||
    state.items.length > 2000 ||
    Object.keys(state.done).length > 50000
  )
    return false;
  const ids = new Set();
  for (const b of state.blocks) {
    if (
      typeof b.id !== "string" ||
      b.id.length > 80 ||
      ids.has(b.id) ||
      typeof b.name !== "string" ||
      b.name.length > 100 ||
      validateBlock(b, state.blocks)
    )
      return false;
    ids.add(b.id);
  }
  const itemIds = new Set();
  for (const i of state.items) {
    if (
      typeof i.id !== "string" ||
      i.id.length > 80 ||
      itemIds.has(i.id) ||
      !ids.has(i.blockId) ||
      !["habit", "task"].includes(i.type) ||
      typeof i.name !== "string" ||
      !i.name.trim() ||
      i.name.length > 180 ||
      !SPHERES.some((s) => s.id === i.sphereId)
    )
      return false;
    itemIds.add(i.id);
  }
  return Object.entries(state.done).every(
    ([key, val]) => key.length < 200 && typeof val === "boolean",
  );
}
export const emptyState = () => ({ blocks: [], items: [], done: {} });
