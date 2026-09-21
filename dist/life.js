export const TIME_ZONE = "Asia/Krasnoyarsk";
const birthDay = Date.UTC(2004, 8, 14);
export function getLifeState(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const day =
    Math.floor(
      (Date.UTC(+parts.year, +parts.month - 1, +parts.day) - birthDay) /
        86400000,
    ) + 1;
  const hour = +parts.hour;
  const greeting =
    hour < 5
      ? "Доброй ночи"
      : hour < 12
        ? "Доброе утро"
        : hour < 18
          ? "Доброго дня"
          : hour < 23
            ? "Доброго вечера"
            : "Доброй ночи";
  return { day, greeting };
}
