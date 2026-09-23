// Shared account UI: the coin balance in the header follows every loaded or saved state.
import { coinTotal } from "./development.js";

const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
let last = null;
window.addEventListener("dlife:state", (e) => {
  const el = document.querySelector("#coin-balance");
  if (!el || !e.detail) return;
  const total = coinTotal(e.detail);
  el.textContent = format.format(total);
  const pill = el.closest(".coin-pill");
  if (pill && last !== null && total !== last) {
    pill.classList.remove("is-bump");
    void pill.offsetWidth;
    pill.classList.add("is-bump");
  }
  last = total;
});
