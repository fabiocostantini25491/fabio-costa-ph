/* Fabio Costa Ph — PDF di una guida del Journal, impaginato nel browser (Paged.js) e salvato con «Salva come PDF».
   Struttura fissa, stile guida di viaggio: copertina · indice · mappa d'insieme · un capitolo per zona
   (introduzione, mappa, luoghi numerati su due colonne) · dove fermarsi · informazioni pratiche · retro. */
(() => {
  const SITE = "fabiocostaph.com";
  const COLORS = ["#b20d0d", "#1f5f8b", "#7a5a12", "#2d6a4f", "#6b3fa0", "#a0522d", "#3d5a80", "#8a1c7c"];
  const ICON = { "Sunrise": "◐", "Early morning": "◔", "Morning": "○", "Afternoon": "◑", "Sunset": "◒", "Blue hour": "◕", "Night": "●", "Any time": "◌" };
  const CANAL = [[45.4378,12.3172],[45.4398,12.3208],[45.4412,12.3228],[45.4424,12.3262],[45.4434,12.3296],[45.442,12.333],[45.44,12.335],[45.438,12.336],[45.4362,12.334],[45.435,12.3312],[45.4344,12.3275],[45.4334,12.3264],[45.4318,12.3287],[45.4316,12.332],[45.431,12.335],[45.4318,12.339]];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const media = u => (u ? String(u).trim().replace(/^\/(?!\/)/, "") : "");
  const md = t => {
    if (!t) return "";
    if (!window.marked?.parse) return String(t).split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join("");
    const tpl = document.createElement("template"); tpl.innerHTML = marked.parse(String(t));
    tpl.content.querySelectorAll("script,iframe,object,embed,style").forEach(n => n.remove());
    tpl.content.querySelectorAll("*").forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return tpl.innerHTML;
  };
  const inline = t => md(t).replace(/^<p>|<\/p>\s*$/g, "");
  const coord = (la, lo) => `${Math.abs(la).toFixed(4)}° ${la >= 0 ? "N" : "S"} · ${Math.abs(lo).toFixed(4)}° ${lo >= 0 ? "E" : "W"}`;
  const fmtDate = d => d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d + "T12:00:00")) : "";
  function mapSvg(points, { w = 640, h = 400, color = "#b20d0d", canal = false } = {}) {
    const pts = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (!pts.length) return "";
    const k = Math.cos(pts[0].lat * Math.PI / 180);
    let x0 = Math.min(...pts.map(p => p.lon)), x1 = Math.max(...pts.map(p => p.lon)), y0 = Math.min(...pts.map(p => p.lat)), y1 = Math.max(...pts.map(p => p.lat));
    const px = Math.max((x1 - x0) * .12, .0015), py = Math.max((y1 - y0) * .12, .0012);
    x0 -= px; x1 += px; y0 -= py; y1 += py;
    const s = Math.min((w - 40) / ((x1 - x0) * k), (h - 40) / (y1 - y0));
    const ox = (w - (x1 - x0) * k * s) / 2, oy = (h - (y1 - y0) * s) / 2;
    const X = lo => ox + (lo - x0) * k * s, Y = la => h - oy - (la - y0) * s;
    const m200 = s * 200 / 111320;
    return `<svg class="gm" viewBox="0 0 ${w} ${h}">
      <defs><clipPath id="c${w}${h}${pts.length}"><rect width="${w}" height="${h}"/></clipPath></defs>
      <rect width="${w}" height="${h}" fill="#e7edf0"/>
      ${canal ? `<g clip-path="url(#c${w}${h}${pts.length})"><path d="${CANAL.map(([la, lo], i) => `${i ? "L" : "M"}${X(lo).toFixed(1)} ${Y(la).toFixed(1)}`).join(" ")}" fill="none" stroke="#9cc3d6" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></g>
        <text x="${w - 12}" y="${h - 12}" text-anchor="end" class="gm-note">Grand Canal, schematic</text>` : ""}
      <path d="M14 ${h - 16}h${m200.toFixed(1)}" stroke="#333" stroke-width="2"/><text x="14" y="${h - 22}" class="gm-t">200 m</text>
      <text x="${w - 14}" y="22" text-anchor="end" class="gm-t">N ↑</text>
      ${pts.map(p => `<circle cx="${X(p.lon).toFixed(1)}" cy="${Y(p.lat).toFixed(1)}" r="11" fill="${p.color || color}" stroke="#fff" stroke-width="2.5"/><text x="${X(p.lon).toFixed(1)}" y="${(Y(p.lat) + 4).toFixed(1)}" text-anchor="middle" class="gm-num">${p.n}</text>`).join("")}
    </svg>`;
  }
  const params = new URLSearchParams(location.search);
  async function build() {
    const r = await (await fetch("content/guide.json", { cache: "no-store" })).json();
    const g = (r.guide || []).find(x => x.slug === params.get("g"));
    if (!g) throw new Error("guide not found");
    let n = 0;
    const zones = (g.zone || []).map((z, i) => ({ ...z, color: COLORS[i % COLORS.length], luoghi: (z.luoghi || []).filter(l => l && l.nome).map(l => ({ ...l, n: ++n, lat: parseFloat(l.lat), lon: parseFloat(l.lon) })) }));
    const venice = /venice|venezia/i.test(g.slug + g.titolo);
    const all = zones.flatMap(z => z.luoghi.map(l => ({ ...l, color: z.color })));
    document.title = `${g.titolo} — a travel guide · Fabio Costa Ph`;
    const st = document.createElement("style");
    st.textContent = `@page { @bottom-left { content: "${String(g.titolo).replace(/"/g, "")} · Field Notes guide · ${SITE}"; } }`;
    document.head.appendChild(st);
    document.getElementById("guide").innerHTML = `
      <section class="gp-cover${g.copertina ? "" : " no-img"}">
        ${g.copertina ? `<img src="${esc(media(g.copertina))}" alt="">` : ""}
        <div class="gp-cover-top"><span>Field Notes · Guide</span><span>${esc(SITE)}</span></div>
        <div class="gp-cover-t"><h1>${esc(g.titolo)}</h1>${g.sottotitolo ? `<p>${esc(g.sottotitolo)}</p>` : ""}
          <ul>${zones.map(z => `<li>${esc(z.nome)}</li>`).join("")}</ul></div>
      </section>
      <section class="gp-part gp-toc">
        <p class="gp-k">${esc(g.luogo || "")}</p><h2>Contents</h2>
        <ol>
          <li><a href="#gp-glance">At a glance</a></li>
          ${zones.map((z, i) => `<li><span class="gp-dot" style="background:${z.color}"></span><a href="#gp-z${i}">${esc(z.nome)}</a></li>`).join("")}
          ${(g.pause || []).length ? `<li><a href="#gp-pause">Where to stop</a></li>` : ""}
          ${g.pratiche ? `<li><a href="#gp-prac">Practical information</a></li>` : ""}
        </ol>
        ${g.intro ? `<p class="gp-intro">${esc(g.intro)}</p>` : ""}
        <p class="gp-legend">${Object.entries(ICON).map(([k, v]) => `<span>${v} ${k}</span>`).join("")}</p>
      </section>
      <section class="gp-part gp-glance" id="gp-glance">
        <h2>At a glance</h2>
        ${mapSvg(all, { w: 700, h: 760, canal: venice })}
        <ol class="gp-zl">${zones.map(z => `<li><span class="gp-dot" style="background:${z.color}"></span>${esc(z.nome)} <small>${z.luoghi[0]?.n || ""}–${z.luoghi[z.luoghi.length - 1]?.n || ""}</small></li>`).join("")}</ol>
      </section>
      ${zones.map((z, i) => `<section class="gp-part gp-zone" id="gp-z${i}" style="--zc:${z.color}">
        <p class="gp-k">Zone ${i + 1}</p><h2>${esc(z.nome)}</h2>
        ${z.intro ? `<p class="gp-zi">${esc(z.intro)}</p>` : ""}
        ${mapSvg(z.luoghi, { color: z.color, canal: venice })}
        <div class="gp-spots">${z.luoghi.map(l => `<div class="gp-spot">
          <h3><span class="gp-n" style="background:${z.color}">${l.n}</span>${esc(l.nome)}</h3>
          ${l.luce ? `<p class="gp-light">${ICON[l.luce] || "○"} Best time: <b>${esc(l.luce)}</b></p>` : ""}
          ${l.consiglio ? `<p>${inline(l.consiglio)}</p>` : ""}
          ${l.nota ? `<p class="gp-note">${esc(l.nota)}</p>` : ""}
          ${l.foto ? `<figure><img src="${esc(media(l.foto))}" alt=""></figure>` : ""}
          ${Number.isFinite(l.lat) ? `<p class="gp-c">${coord(l.lat, l.lon)}</p>` : ""}
        </div>`).join("")}</div>
      </section>`).join("")}
      ${(g.pause || []).length ? `<section class="gp-part gp-zone gp-pause" id="gp-pause"><p class="gp-k">Take a break</p><h2>Where to stop</h2>
        <div class="gp-spots">${g.pause.map(p => `<div class="gp-spot"><h3><span class="gp-n gp-cup">☕</span>${esc(p.nome)}</h3>${p.consiglio ? `<p>${esc(p.consiglio)}</p>` : ""}${p.nota ? `<p class="gp-note">${esc(p.nota)}</p>` : ""}
          ${Number.isFinite(parseFloat(p.lat)) ? `<p class="gp-c">${coord(parseFloat(p.lat), parseFloat(p.lon))}</p>` : ""}</div>`).join("")}</div></section>` : ""}
      ${g.pratiche ? `<section class="gp-part gp-prac" id="gp-prac"><p class="gp-k">Before you go</p><h2>Practical information</h2><div class="gp-rich">${md(g.pratiche)}</div></section>` : ""}
      <section class="gp-part gp-back">
        <h2>${esc(g.titolo)}<span>A Field Notes guide</span></h2>
        <p>Every place in this guide is on the map at <b>${esc(SITE)}</b>, together with sunrise and sunset times for the day of your visit.</p>
        <p class="gp-foot">${g.aggiornata ? `Updated ${esc(fmtDate(g.aggiornata))} · ` : ""}© ${new Date().getFullYear()} Fabio Costa Ph</p>
      </section>`;
    // foto: ridotte prima della stampa (PDF più leggero, sempre nitido)
    await Promise.all([...document.querySelectorAll("#guide img")].map(img => new Promise(res => { if (img.complete) res(); else { img.onload = img.onerror = res; } })));
    await document.fonts?.ready;
    return g;
  }
  window.GUIDA = {};
  build().then(() => {
    window.PagedConfig = { auto: false };
    const fs = document.createElement("style");
    fs.textContent = "@page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }";
    document.head.appendChild(fs);
    const sc = document.createElement("script");
    sc.src = "vendor/paged.polyfill.min.js";
    sc.onload = async () => {
      try { await window.PagedPolyfill.preview(); window.GUIDA.pages = document.querySelectorAll(".pagedjs_page").length; }
      catch (e) { console.error(e); window.GUIDA.error = String(e); }
      document.body.appendChild(Object.assign(document.createElement("button"), { className: "gp-printbtn", textContent: "Save as PDF", onclick: () => window.print() }));
      if (!params.has("noprint")) setTimeout(() => window.print(), 400);
    };
    sc.onerror = () => { window.GUIDA.error = "pagedjs"; window.print(); };
    document.head.appendChild(sc);
  }).catch(e => { document.getElementById("guide").innerHTML = `<p class="gp-loading">This guide is not available (${esc(e.message)}).</p>`; window.GUIDA.error = String(e); });
})();
