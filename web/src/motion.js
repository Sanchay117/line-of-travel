// Motion with a meaning. Each animation is something the real thing does: a van line is driven
// onto the map, mail drops into the carrier case, a stamp lands, an odometer rolls.
// Off for prefers-reduced-motion and for deck screenshots (?shot=...), where every element is
// already in its final state, so the first frame always reads.

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shot = new URLSearchParams(location.search).has("shot");
export const motionOn = !reduced && !shot;
if (motionOn) document.documentElement.classList.add("motion");

/** Run fn once, the first time el scrolls into view. */
export function onReveal(el, fn, threshold = 0.3) {
  if (!el) return;
  if (!motionOn || !("IntersectionObserver" in window)) { fn(el); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(el); }
  }, { threshold });
  io.observe(el);
}

/** Roll the number at the start of el like a van's odometer: each digit turns up from 0. */
export function roll(el, delay = 0) {
  if (!el || !motionOn) return;
  const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  if (!node) return;
  const text = node.textContent;
  let k = 0;
  const strip = "0123456789".split("").map((c) => `<span>${c}</span>`).join("");
  const cells = [...text].map((ch) => (/\d/.test(ch)
    ? `<span class="odo-d"><span class="odo-s" style="--d:${ch};--k:${k++}">${strip}</span></span>`
    : `<span>${ch === " " ? "&nbsp;" : ch}</span>`)).join("");
  const wrap = document.createElement("span");
  wrap.className = "odo";
  wrap.innerHTML = `<span class="sr">${text}</span><span class="odo-v" aria-hidden="true">${cells}</span>`;
  node.replaceWith(wrap);
  // Two frames so the starting position paints before the roll begins.
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => wrap.classList.add("go"), delay)));
}

/** Wire the scroll-driven pieces. Each adds one class; styles.css does the rest. */
export function wireMotion() {
  onReveal(document.getElementById("triptych"), (el) => el.classList.add("drawn"), 0.35);
  onReveal(document.getElementById("case"), (el) => el.classList.add("cased"), 0.35);
  onReveal(document.querySelector(".steps"), (el) => el.classList.add("ran"), 0.5);
  document.querySelectorAll(".chart").forEach((el) => onReveal(el, (c) => c.classList.add("grown"), 0.35));
  onReveal(document.querySelector(".close"), (el) => el.classList.add("inked"), 0.4);
}
