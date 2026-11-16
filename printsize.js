/* Print sizes on a wall, true to scale: a sofa and a person 175 cm tall give the measure.
   PrintSize.open({ src, title, size, sizes: [{ w, h, price }], contact(size) → href }) */
(function () {
  const T = s => (window.I18N ? I18N.t(s) : s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const WALL_W = 340, WALL_H = 270, FLOOR = 250;      // cm: what the scene shows, and where the floor starts
  let box = null, opt = null, cur = null, portrait = false, onKey = null;

  // the scene, drawn in centimetres (viewBox units = cm), so every size is true to scale
  function scene() {
    const [a, b] = [cur.w, cur.h].sort((x, y) => x - y);          // 20×30 → short 20, long 30
    const pw = portrait ? a : b, ph = portrait ? b : a;
    // centred at eye level (150 cm), but always at least 20 cm above the sofa back, and never off the wall
    const cx = 160, eye = FLOOR - 150, maxBottom = FLOOR - 85 - 20;
    let y = eye - ph / 2; if (y + ph > maxBottom) y = maxBottom - ph; if (y < 14) y = 14;
    const x = cx - pw / 2;
    return `<svg viewBox="0 0 ${WALL_W} ${WALL_H}" preserveAspectRatio="xMidYMax meet" role="img" aria-label="${esc(`${cur.w} × ${cur.h} cm`)}">
      <defs>
        <linearGradient id="psWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ece7df"/><stop offset="1" stop-color="#ddd6cb"/></linearGradient>
        <linearGradient id="psFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a88a6c"/><stop offset="1" stop-color="#8c6f54"/></linearGradient>
        <filter id="psSh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="#000" flood-opacity=".32"/></filter>
        <clipPath id="psClip"><rect x="${x}" y="${y}" width="${pw}" height="${ph}"/></clipPath>
      </defs>
      <rect width="${WALL_W}" height="${FLOOR}" fill="url(#psWall)"/>
      <rect y="${FLOOR}" width="${WALL_W}" height="${WALL_H - FLOOR}" fill="url(#psFloor)"/>
      <rect y="${FLOOR - 8}" width="${WALL_W}" height="8" fill="#f4f1ec"/>
      <!-- the print: matte paper on aluminium -->
      <g filter="url(#psSh)"><rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="#222"/></g>
      <image href="${esc(opt.src)}" x="${x}" y="${y}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice" clip-path="url(#psClip)"/>
      <rect x="${x}" y="${y}" width="${pw}" height="${ph}" class="ps-edge"/>
      <!-- its measure -->
      <g class="ps-m"><path d="M${x} ${y - 6}h${pw}M${x} ${y - 8.5}v5M${x + pw} ${y - 8.5}v5"/></g>
      <text x="${cx}" y="${y - 9}" text-anchor="middle" font-size="${Math.max(6, Math.min(9, pw / 4))}" font-family="DM Sans, system-ui, sans-serif" font-weight="600" fill="#4f483f" class="ps-t">${esc(`${cur.w} × ${cur.h} cm`)}</text>
      <!-- a sofa, 210 cm wide -->
      <g fill="#5d6b78"><rect x="55" y="${FLOOR - 85}" width="210" height="44" rx="7"/><rect x="45" y="${FLOOR - 62}" width="26" height="54" rx="7"/><rect x="249" y="${FLOOR - 62}" width="26" height="54" rx="7"/>
        <rect x="64" y="${FLOOR - 46}" width="192" height="30" rx="5" fill="#6b7a88"/><rect x="58" y="${FLOOR - 18}" width="204" height="10" rx="3"/></g>
      <g fill="#3b434c"><rect x="62" y="${FLOOR - 8}" width="5" height="8"/><rect x="253" y="${FLOOR - 8}" width="5" height="8"/></g>
      <!-- a person, 175 cm -->
      <g fill="#4a4f57" opacity=".9" transform="translate(300 ${FLOOR - 175})">
        <circle cx="0" cy="11" r="10.5"/>
        <path d="M-17 30q0-7 7-8h20q7 1 7 8l3 58q0 4-4 4h-4l-2 83h-9l-2-70h-2l-2 70h-9l-2-83h-4q-4 0-4-4z"/>
      </g>
    </svg>`;
  }

  function paint() {
    box.querySelector(".ps-stage").innerHTML = scene();
    box.querySelectorAll("[data-pssize]").forEach(b => b.classList.toggle("on", b.dataset.pssize === `${cur.w}x${cur.h}`));
    box.querySelectorAll("[data-psor]").forEach(b => b.classList.toggle("on", (b.dataset.psor === "p") === portrait));
    box.querySelector("[data-psprice]").textContent = cur.price ? `€${cur.price}` : "";
    box.querySelector("[data-psprice]").hidden = !cur.price;
    const go = box.querySelector("[data-psgo]"); go.href = opt.contact ? opt.contact(cur) : "#prices";
  }

  function close() {
    if (!box) return;
    document.removeEventListener("keydown", onKey, true);
    box.remove(); box = null;
    document.documentElement.classList.remove("ps-open");
  }

  function open(o) {
    close(); opt = o;
    cur = o.sizes.find(s => o.size && s.w === o.size.w && s.h === o.size.h) || o.sizes[1] || o.sizes[0];
    portrait = false;
    box = document.createElement("div");
    box.className = "ps"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", T("Print sizes"));
    box.innerHTML = `<div class="ps-card">
      <header><div><small>${esc(T("Print sizes, true to scale"))}</small><b>${esc(o.title || "")}</b></div><button type="button" class="ps-x" data-psx aria-label="${esc(T("Close"))}">✕</button></header>
      <div class="ps-stage"></div>
      <p class="ps-scale">${esc(T("The sofa is 210 cm wide and the person 175 cm tall."))}</p>
      <div class="ps-sizes">${o.sizes.map(s => `<button type="button" data-pssize="${s.w}x${s.h}">${s.w}×${s.h}${s.price ? `<small>€${s.price}</small>` : ""}</button>`).join("")}</div>
      <div class="ps-row">
        <span class="ps-or"><button type="button" data-psor="l">${esc(T("Landscape"))}</button><button type="button" data-psor="p">${esc(T("Portrait"))}</button></span>
        <b class="ps-price" data-psprice></b>
        <a class="ps-go" data-psgo href="#prices">${esc(T(o.goLabel || "Ask for this print"))}</a>
      </div>
      <p class="ps-note">${esc(T(o.note || "Formats are 2:3."))}</p>
    </div>`;
    // above an open dialog (the photo viewer) too
    (document.querySelector("dialog[open]") || document.body).appendChild(box);
    document.documentElement.classList.add("ps-open");
    box.addEventListener("click", e => {
      if (e.target === box || e.target.closest("[data-psx]")) return close();
      const s = e.target.closest("[data-pssize]");
      if (s) { const [w, h] = s.dataset.pssize.split("x").map(Number); cur = o.sizes.find(z => z.w === w && z.h === h); paint(); window.fcTrack?.("Prints: size viewed", { size: s.dataset.pssize }); return; }
      const r = e.target.closest("[data-psor]"); if (r) { portrait = r.dataset.psor === "p"; paint(); return; }
      if (e.target.closest("[data-psgo]")) { window.fcTrack?.("Prints: ask", { size: `${cur.w}x${cur.h}` }); if (e.target.closest("[data-psgo]").getAttribute("href").startsWith("#")) close(); }
    });
    onKey = e => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } };
    document.addEventListener("keydown", onKey, true);
    paint();
    // the photo's own shape decides the orientation
    const im = new Image(); im.onload = () => { if (!box || opt !== o) return; portrait = im.naturalHeight > im.naturalWidth * 1.02; paint(); }; im.src = o.src;
  }
  window.PrintSize = { open, close };
})();
