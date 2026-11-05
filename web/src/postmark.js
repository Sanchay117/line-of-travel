// A circular date stamp with cancellation bars: the mark of a piece of mail that has been
// sorted and sent on its way. Used as the logo, and as the stamp that lands on a route once
// it has been re-sequenced. The cancellation bars are drawn as the route's own wiggle.

let uid = 0;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function bars(x0, w, y0, gap, count, amp) {
  let d = "";
  for (let b = 0; b < count; b++) {
    const y = y0 + b * gap;
    d += `M${x0} ${y}`;
    for (let x = 0; x <= w; x += 12) d += ` Q${x0 + x + 6} ${y + (b % 2 ? amp : -amp)} ${x0 + x + 12} ${y}`;
  }
  return d;
}

/** Full postmark: ring text, a big centre line, cancellation bars to the right. */
export function postmarkSVG({ top = "LINE OF TRAVEL", bottom = "", big = "", small = "" } = {}) {
  const id = `pm${++uid}`;
  return `
<svg class="postmark" viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(`${big} ${small}`)}">
  <defs>
    <filter id="${id}-ink" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.25 1.62" result="mask"/>
      <feComposite in="SourceGraphic" in2="mask" operator="in"/>
    </filter>
    <path id="${id}-top" d="M 26 80 A 54 54 0 0 1 134 80"/>
    <path id="${id}-bot" d="M 22 80 A 58 58 0 0 0 138 80"/>
  </defs>
  <g filter="url(#${id}-ink)" fill="none" stroke="#c4352b" stroke-linecap="round">
    <circle cx="80" cy="80" r="70" stroke-width="3.5"/>
    <circle cx="80" cy="80" r="48" stroke-width="2"/>
    <path d="${bars(156, 132, 46, 17, 5, 5)}" stroke-width="3.2"/>
    <g fill="#c4352b" stroke="none" font-family="IBM Plex Mono, monospace" font-weight="500">
      <text font-size="12.5" letter-spacing="2.2"><textPath href="#${id}-top" startOffset="50%" text-anchor="middle">${esc(top)}</textPath></text>
      <text font-size="${bottom.length > 15 ? 10 : 11}" letter-spacing="${bottom.length > 15 ? 1 : 1.6}"><textPath href="#${id}-bot" startOffset="50%" text-anchor="middle" dominant-baseline="hanging">${esc(bottom)}</textPath></text>
      <text x="80" y="85" text-anchor="middle" font-family="Public Sans, sans-serif" font-weight="600" font-size="${big.length > 6 ? 19 : 23}">${esc(big)}</text>
      <text x="80" y="100" text-anchor="middle" font-size="${small.length > 14 ? 8 : 9.5}" letter-spacing="${small.length > 14 ? 0.2 : 0.6}">${esc(small)}</text>
    </g>
  </g>
</svg>`;
}

/** Small mark: ring + two cancellation bars crossing it. Logo, favicon, divider. */
export function markSVG(color = "#c4352b") {
  return `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle class="m-ring" cx="26" cy="32" r="21" fill="none" stroke="${color}" stroke-width="4" pathLength="1" transform="rotate(-90 26 32)"/>
  <path class="m-wave" d="M8 26 Q15 21 22 26 T36 26 T50 26 T62 26" fill="none" stroke="${color}" stroke-width="3.6" stroke-linecap="round" pathLength="1"/>
  <path class="m-wave" d="M8 38 Q15 43 22 38 T36 38 T50 38 T62 38" fill="none" stroke="${color}" stroke-width="3.6" stroke-linecap="round" pathLength="1"/>
</svg>`;
}

/** Put a stamp into a slot with the stamping motion (or a soft 'inking' state while solving). */
export function stamp(slot, opts, mode = "in") {
  slot.innerHTML = postmarkSVG(opts);
  const el = slot.querySelector(".postmark");
  el.classList.add(mode === "inking" ? "inking" : "stamp-in");
}
