import { getLifeState } from "./life.js";
const embed = location.pathname.startsWith("/embed/");
document.body.classList.toggle("embedded", embed);

// Активный раздел в навигации: страницы сфер (в том числе «Здоровье») относятся к «Аспектам».
{
  const links = [...document.querySelectorAll(".header nav a")], path = location.pathname;
  const byHref = (href) => links.find((a) => a.getAttribute("href") === href);
  const current = path === "/" ? byHref("/")
    : path.startsWith("/sphere/") ? byHref("/aspects/")
    : links.find((a) => a.getAttribute("href") !== "/" && !a.getAttribute("href").includes("?") && path.startsWith(a.getAttribute("href")));
  for (const a of links) { a.classList.toggle("nav-current", a === current); a.toggleAttribute("aria-current", a === current); if (a === current) a.setAttribute("aria-current", "page"); }
}
function refresh() {
  if (!document.querySelector("#greeting")) return;
  const state = getLifeState();
  document.querySelector("#greeting").textContent = state.greeting + ",";
  document.querySelector("#life-day").textContent = new Intl.NumberFormat(
    "ru-RU",
  ).format(state.day);
}
refresh();
setInterval(refresh, 15000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
const dialog = document.querySelector("#share-dialog");
document.querySelector("#share").addEventListener("click", () => {
  const type = location.pathname.includes("/sphere")
    ? "sphere"
    : location.pathname.includes("/aspects")
      ? "aspects"
      : location.pathname.includes("/now")
        ? "now"
        : "profile";
  const suffix = type === "sphere" ? location.search : "";
  document.querySelector("#embed-url").value = new URL(
    "/embed/" + type + "/" + suffix,
    location.origin,
  ).href;
  document.querySelector("#standalone").href = "/blocks/" + type + "/" + suffix;
  dialog.showModal();
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  }
});
document.querySelector("#copy").addEventListener("click", async () => {
  const field = document.querySelector("#embed-url");
  try {
    await navigator.clipboard.writeText(field.value);
    document.querySelector("#copy-status").textContent = "Ссылка скопирована";
  } catch {
    field.focus();
    field.select();
    document.querySelector("#copy-status").textContent =
      "Выделенная ссылка готова к копированию";
  }
});
if (document.querySelector("#portrait"))
  import("./portrait.js")
    .then((m) =>
      m.mountPortrait(
        document.querySelector("#portrait"),
        document.querySelector("#motion"),
      ),
    )
    .catch(() => {
      document.querySelector("#motion").disabled = true;
    });

for (const el of document.querySelectorAll(".date-label"))
  el.textContent = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
