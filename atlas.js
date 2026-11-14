/* Fabio Costa Ph / SpotFolk — atlas.js
   The Folk Atlas: the world map of a passport, coloured by signatures.
     · signed on the spot  · signed  · declared («I've been there», no signature)  · «I want to go» (only you see it)
   A dream comes true when you sign a place in that country. Loaded only with the passport (spots.js → mountAtlas),
   together with atlas-world.js (country outlines). Data: the passport stamps + supabase-folk-atlas.sql. No sample data. */
"use strict";

window.FolkAtlas = (() => {
  const lang = window.I18N?.lang || "en", it = lang === "it";
  const IT = {
    "Folk Atlas": "Folk Atlas", "The world you signed. And the one you dream of.": "Il mondo che hai firmato. E quello che sogni.",
    "The world {n} signed.": "Il mondo firmato da {n}.", "Signed on the spot": "Firmato sul posto", "Signed": "Firmato", "Declared": "Dichiarato", "I want to go": "Voglio andarci",
    "World": "Mondo", "Europe": "Europa", "Close-up": "Da vicino",
    "Countries": "Paesi", "{n} signed": "{n} firmati", "Signatures": "Firme", "on the spot": "sul posto", "Dreams come true": "Sogni realizzati", "{a} of {b}": "{a} su {b}",
    "{n} places signed": "{n} posti firmati", "1 place signed": "1 posto firmato", "{n} on the spot": "{n} sul posto",
    "You declared you've been here: sign a place to make it yours.": "Hai dichiarato di esserci stato: firma un posto per renderlo tuo.",
    "Declared, not signed yet.": "Dichiarato, ancora senza firme.", "Not on this atlas yet.": "Non ancora in questo atlante.",
    "✓ I've been here": "✓ Ci sono stato", "♡ I want to go": "♡ Voglio andarci", "✓ Declared": "✓ Dichiarato", "♥ In your dreams": "♥ Nei tuoi sogni",
    "Tap again to remove": "Tocca di nuovo per togliere",
    "Dream come true: {w}": "Sogno realizzato: {w}", "Dream come true": "Sogno realizzato",
    "{n} folk have been": "{n} folk ci sono stati", "1 folk has been": "1 folk c'è stato", "No folk there yet: you could be the first": "Nessun folk ancora: potresti essere il primo",
    "{n} saved places": "{n} posti salvati", "1 saved place": "1 posto salvato", "From your saved places": "Dai tuoi posti salvati",
    "🧭 Ask the folk": "🧭 Chiedi ai folk", "Show on the map": "Mostra sulla mappa", "Remove": "Togli",
    "＋ Add a dream or a country": "＋ Aggiungi un sogno o un Paese", "Country": "Paese", "Choose a country": "Scegli un Paese",
    "Name (optional)": "Nome (facoltativo)", "e.g. Patagonia, Lofoten": "es. Patagonia, Lofoten",
    "Your dreams are private: only you see them. The countries you declare show in your passport to the folk.": "I tuoi sogni sono privati: li vedi solo tu. I Paesi che dichiari si vedono nel tuo passaporto, solo dai folk.",
    "Tap a country to see it, add it to your dreams or declare you've been.": "Tocca un Paese per vederlo, metterlo tra i sogni o dichiarare che ci sei stato.",
    "Tap a country to see it.": "Tocca un Paese per vederlo.",
    "No dreams yet. Save places on the map or add a country: your dreams turn green when you sign there.": "Ancora nessun sogno. Salva posti sulla mappa o aggiungi un Paese: i sogni diventano verdi quando firmi lì.",
    "Could not save it: {e}": "Non salvato: {e}", "The atlas arrives once the database is updated (supabase-folk-atlas.sql).": "L'atlante arriva quando il database è aggiornato (supabase-folk-atlas.sql).",
    "Signed here": "Firmati qui", "In your dreams": "Nei tuoi sogni", "Done.": "Fatto."
  };
  const t = (s, v = {}) => (it ? IT[s] || s : s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

  const COL = { onspot: "#2fbf71", signed: "#8fe0a6", declared: "#d6eed6", wish: "#f28c28", none: "#1b2b42" };
  const W = 1000, H = 470, N = 84, S = -58;
  const X = lon => (lon + 180) / 360 * W, Y = lat => (N - lat) / (N - S) * H;

  /* ---------- geometry: built once ---------- */
  let G = null;
  function geo() {
    if (G) return G;
    const feats = (window.FA_WORLD || []).map(f => {
      const polys = f.t === "Polygon" ? [f.c] : f.c;
      let b = [180, 90, -180, -90], big = null, bigA = -1;
      polys.forEach(p => {
        let pb = [180, 90, -180, -90];
        p[0].forEach(([x, y]) => { pb = [Math.min(pb[0], x), Math.min(pb[1], y), Math.max(pb[2], x), Math.max(pb[3], y)]; });
        const a = (pb[2] - pb[0]) * (pb[3] - pb[1]); if (a > bigA) { bigA = a; big = pb; }
        b = [Math.min(b[0], pb[0]), Math.min(b[1], pb[1]), Math.max(b[2], pb[2]), Math.max(b[3], pb[3])];
      });
      const d = polys.map(p => p.map(r => "M" + r.map(([x, y]) => X(x).toFixed(1) + "," + Y(y).toFixed(1)).join("L") + "Z").join("")).join("");
      return { id: f.id, n: f.n, polys, b, big, d };
    });
    const byId = new Map();
    feats.forEach(f => { const o = byId.get(f.id); if (o) { o.polys = o.polys.concat(f.polys); o.d += f.d; o.b = [Math.min(o.b[0], f.b[0]), Math.min(o.b[1], f.b[1]), Math.max(o.b[2], f.b[2]), Math.max(o.b[3], f.b[3])]; } else byId.set(f.id, { ...f }); });
    G = { feats: [...byId.values()], byId, small: window.FA_SMALL || {}, cache: new Map() };
    return G;
  }
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  function countryAt(lat, lon) {
    lat = +lat; lon = +lon; if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const g = geo(), key = lat.toFixed(2) + "," + lon.toFixed(2);
    if (g.cache.has(key)) return g.cache.get(key);
    let hit = null;
    for (const [id, [la, lo, r]] of Object.entries(g.small)) if (Math.abs(lat - la) <= r && Math.abs(lon - lo) <= r * 1.4) { hit = id; break; }
    if (!hit) for (const f of g.feats) {
      if (lon < f.b[0] || lon > f.b[2] || lat < f.b[1] || lat > f.b[3]) continue;
      if (f.polys.some(p => p.reduce((c, r) => inRing(lon, lat, r) ? !c : c, false))) { hit = f.id; break; }
    }
    if (!hit) {   // on the coast or a small island the outline doesn't have: the nearest country within ~130 km
      let best = 1.2 * 1.2;
      for (const f of g.feats) {
        if (lon < f.b[0] - 1.2 || lon > f.b[2] + 1.2 || lat < f.b[1] - 1.2 || lat > f.b[3] + 1.2) continue;
        for (const p of f.polys) for (const [x, y] of p[0]) { const d = (x - lon) ** 2 + (y - lat) ** 2; if (d < best) { best = d; hit = f.id; } }
      }
    }
    g.cache.set(key, hit);
    return hit;
  }
  let DN = null;
  const nameOf = id => {
    const iso2 = (window.FA_ISO2 || {})[id];
    try { DN = DN || new Intl.DisplayNames([lang], { type: "region" }); const n = iso2 && DN.of(iso2); if (n && n !== iso2) return n; } catch {}
    return geo().byId.get(id)?.n || id;
  };
  const flag = id => { const c = (window.FA_ISO2 || {})[id]; return c && c.length === 2 && !/^X/.test(c) ? String.fromCodePoint(...[...c].map(ch => 127397 + ch.charCodeAt(0))) : "🏳"; };
  const centre = id => {
    const g = geo(), s = g.small[id]; if (s) return { lat: s[0], lon: s[1] };
    const f = g.byId.get(id); if (!f) return null; const b = f.big || f.b;
    return { lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2 };
  };
  const allIds = () => { const g = geo(); return [...new Set([...g.feats.map(f => f.id), ...Object.keys(g.small)].filter(id => (window.FA_ISO2 || {})[id]))]; };

  /* ---------- styles (once) ---------- */
  function css() {
    if (document.getElementById("faCss")) return;
    const st = document.createElement("style"); st.id = "faCss";
    st.textContent = `
.fa{margin:14px 0;padding:16px;border-radius:20px;background:rgba(16,29,46,.7);border:1px solid rgba(255,210,122,.28);color:#f3ead8}
.fa-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 14px;margin-bottom:10px}
.fa-head h3{margin:0;font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;font-size:30px;line-height:1.05;letter-spacing:.01em}
.fa-head h3 em{color:#ffbe7a;font-style:italic}
.fa-head p{margin:0;font-size:13px;color:rgba(243,234,216,.7)}
.fa-mapbox{position:relative;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:radial-gradient(ellipse at 50% 40%,#10233a,#08121f 72%);touch-action:pan-y}
.fa-map{display:block;width:100%;height:auto}
.fa-map path{stroke:#060d18;stroke-width:.6;vector-effect:non-scaling-stroke;cursor:pointer;transition:fill .25s}
.fa-map path:hover{filter:brightness(1.25)}
.fa-map path.sel{stroke:#ffd27a;stroke-width:1.6}
.fa-map .dot{fill:#fff8e6;opacity:.8;pointer-events:none}
.fa-map .sm{stroke:#060d18;stroke-width:.6;vector-effect:non-scaling-stroke;cursor:pointer}
.fa-zoom{position:absolute;top:10px;right:10px;display:flex;gap:3px;padding:3px;border-radius:99px;background:rgba(5,11,20,.82);border:1px solid rgba(255,255,255,.12)}
.fa-zoom button{border:0;background:none;color:#f3ead8;font-family:inherit;font-weight:600;font-size:12px;line-height:1;padding:7px 11px;border-radius:99px;cursor:pointer}
.fa-zoom button.on{background:#f28c28;color:#1a1206}
.fa-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 2px 0;font-size:12.5px;color:rgba(243,234,216,.85)}
.fa-legend span{display:inline-flex;align-items:center;gap:7px}.fa-legend i{width:11px;height:11px;border-radius:3px;display:inline-block}
.fa-info{margin-top:10px;padding:12px 14px;border-radius:14px;background:rgba(5,11,20,.6);border:1px solid rgba(255,255,255,.1);font-size:13.5px}
.fa-info b.fa-cn{font-size:16px}.fa-info p{margin:4px 0 0;color:rgba(243,234,216,.78)}
.fa-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.fa-btn{border:1px solid rgba(255,190,122,.5);background:none;color:#ffbe7a;border-radius:99px;padding:8px 14px;font-family:inherit;font-weight:600;font-size:13px;cursor:pointer}
.fa-btn.on{background:#f28c28;border-color:#f28c28;color:#1a1206}.fa-btn.g.on{background:#8fe0a6;border-color:#8fe0a6;color:#0b2414}
.fa-btn:disabled{opacity:.5}
.fa-stamps{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.fa-stamps button{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#f3ead8;border-radius:10px;padding:5px 9px;font-family:inherit;font-weight:500;font-size:12.5px;cursor:pointer}
.fa-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}
.fa-stats>div{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}
.fa-stats b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:28px;line-height:1;color:#ffd27a;font-weight:500}
.fa-stats small{font-size:12px;color:rgba(243,234,216,.72)}
.fa-bar{height:6px;border-radius:9px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:6px}.fa-bar i{display:block;height:100%;background:linear-gradient(90deg,#f28c28,#ffbe7a);border-radius:9px}
.fa-h{margin:18px 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(243,234,216,.7)}
.fa-wish{list-style:none;margin:0;padding:0;display:grid;gap:0}
.fa-wish li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:11px 2px;border-top:1px solid rgba(255,255,255,.07)}
.fa-wish li:first-child{border-top:0}
.fa-wish .f{font-size:22px;line-height:1}
.fa-wish b{display:block;font-size:14.5px}.fa-wish small{display:block;font-size:12px;color:rgba(243,234,216,.66)}
.fa-wish .n{font-size:12px;color:#ffbe7a;text-align:right;white-space:nowrap}
.fa-wish .fa-acts{grid-column:2/4;margin-top:2px}.fa-wish .fa-btn{padding:6px 12px;font-size:12.5px}
.fa-wish li.done{background:linear-gradient(90deg,rgba(47,191,113,.12),transparent);border-radius:12px;padding-left:8px}
.fa-wish li.done .n{color:#8fe0a6}
.fa-x{border:0;background:none;color:rgba(243,234,216,.55);font-family:inherit;font-weight:500;font-size:12.5px;cursor:pointer;padding:6px 4px}
.fa-add{margin-top:12px}.fa-add summary{cursor:pointer;color:#ffbe7a;font-weight:600;font-size:13.5px;list-style:none}
.fa-add summary::-webkit-details-marker{display:none}
.fa-form{display:grid;gap:8px;margin-top:10px}
.fa-form select,.fa-form input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(5,11,20,.6);color:#f3ead8;font:inherit;font-size:14px}
.fa-note{margin:10px 0 0;font-size:12px;color:rgba(243,234,216,.6)}
@media(max-width:560px){.fa{padding:12px}.fa-zoom{position:static;margin:8px;width:max-content}.fa-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.fa-head h3{font-size:26px}.fa-zoom button{padding:6px 9px}}
@media(prefers-reduced-motion:reduce){.fa-map path{transition:none}}`;
    document.head.append(st);
  }

  /* ---------- mount ---------- */
  // opts: { own, uid, name, stamps:[{id,name,lat,lon,clat,clon,on_spot,at}], been:[iso3]|undefined }
  async function mount(host, K, opts) {
    css();
    const esc = K.esc, own = !!opts.own;
    let been = Array.isArray(opts.been) ? opts.been.slice() : null, wish = [], dbOk = true;
    if (own || !been) {
      try { const r = (await K.api("/rest/v1/rpc/atlas_get", { method: "POST", body: { p_user: opts.uid } })).data; if (r) { been = r.been || []; wish = r.wish || []; } }
      catch (err) { dbOk = false; }
    }
    been = been || [];
    const S = { sel: null, view: "world", folk: {}, confirm: null };

    // stamps → countries
    const stamps = (opts.stamps || []).map(s => ({ ...s, cc: countryAt(s.lat ?? s.clat, s.lon ?? s.clon) })).filter(s => s.cc);
    const byC = new Map();
    stamps.forEach(s => { const o = byC.get(s.cc) || { n: 0, on: 0, first: null, list: [] }; o.n++; if (s.on_spot) o.on++; if (!o.first || s.at < o.first) o.first = s.at; o.list.push(s); byC.set(s.cc, o); });

    // saved places → countries (only yours)
    const savedBy = new Map();
    if (own) (K.saved?.() || []).forEach(sp => { const c = countryAt(sp.lat, sp.lon); if (!c) return; const a = savedBy.get(c) || []; a.push(sp); savedBy.set(c, a); });

    const status = id => { const s = byC.get(id); if (s) return s.on ? "onspot" : "signed"; if (been.includes(id)) return "declared"; if (own && (wish.some(w => w.country === id) || savedBy.has(id))) return "wish"; return "none"; };
    const wishes = () => {
      const ids = [...new Set([...wish.map(w => w.country), ...savedBy.keys()])];
      return ids.map(id => {
        const w = wish.find(x => x.country === id), sv = savedBy.get(id) || [], sc = byC.get(id);
        const doneAt = w && sc ? sc.list.map(s => s.at).filter(a => a && a >= w.at).sort()[0] || sc.first : null;
        return { id, w, sv, done: !!(w && sc), doneAt, hide: !w && (sc || been.includes(id)) };
      }).filter(x => !x.hide).sort((a, b) => (a.done - b.done) || String(a.w?.at || "~").localeCompare(String(b.w?.at || "~")));
    };

    // folk counts for the dreams: spots on the map in each dream country (numbers only)
    async function loadFolk() {
      if (!own || !dbOk) return;
      const want = new Set(wishes().filter(x => !x.done).map(x => x.id)); if (!want.size) return;
      const groups = {};
      (K.allSpots?.() || []).forEach(sp => { if (sp.lat == null) return; const c = countryAt(sp.lat, sp.lon); if (c && want.has(c)) (groups[c] = groups[c] || []).push(sp.id); });
      Object.keys(groups).forEach(k => { groups[k] = groups[k].slice(0, 2000); });
      want.forEach(k => { if (!groups[k]) S.folk[k] = 0; });
      if (!Object.keys(groups).length) { draw(); return; }
      try { const r = (await K.api("/rest/v1/rpc/atlas_folk", { method: "POST", body: { p_groups: groups } })).data || {}; Object.keys(groups).forEach(k => { S.folk[k] = +r[k] || 0; }); draw(); } catch {}
    }

    // map
    const g = geo();
    const views = () => {
      const v = { world: [0, 0, W, H], europe: [X(-25), Y(72), X(45) - X(-25), Y(34) - Y(72)] };
      const ids = g.feats.filter(f => status(f.id) !== "none").map(f => f.big || f.b);
      Object.keys(g.small).forEach(id => { if (status(id) !== "none") { const [la, lo] = g.small[id]; ids.push([lo - 1, la - 1, lo + 1, la + 1]); } });
      if (ids.length) {
        let [a, b, c, d] = ids.reduce((m, x) => [Math.min(m[0], x[0]), Math.min(m[1], x[1]), Math.max(m[2], x[2]), Math.max(m[3], x[3])], [180, 90, -180, -90]);
        let x0 = X(a), x1 = X(c), y0 = Y(d), y1 = Y(b); const pad = Math.max(20, (x1 - x0) * .08);
        x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
        let w = x1 - x0, h = y1 - y0; const r = W / H;
        if (w / h > r) { const nh = w / r; y0 -= (nh - h) / 2; h = nh; } else { const nw = h * r; x0 -= (nw - w) / 2; w = nw; }
        if (w < W) v.mine = [x0, y0, w, h];
      }
      return v;
    };
    const mapSvg = () => {
      const p = g.feats.map(f => `<path d="${f.d}" fill="${COL[status(f.id)]}" data-c="${f.id}"${S.sel === f.id ? ' class="sel"' : ""}><title>${esc(nameOf(f.id))}</title></path>`).join("");
      const sm = Object.keys(g.small).filter(id => status(id) !== "none").map(id => { const [la, lo] = g.small[id]; return `<circle class="sm" cx="${X(lo).toFixed(1)}" cy="${Y(la).toFixed(1)}" r="2.6" fill="${COL[status(id)]}" data-c="${id}"><title>${esc(nameOf(id))}</title></circle>`; }).join("");
      const dots = stamps.filter(s => s.lat != null).slice(0, 600).map(s => `<circle class="dot" cx="${X(+s.lon).toFixed(1)}" cy="${Y(+s.lat).toFixed(1)}" r="${s.on_spot ? 1.5 : 1.1}"/>`).join("");
      const vb = (views()[S.view] || views().world).map(n => n.toFixed(1)).join(" ");
      return `<svg class="fa-map" viewBox="${vb}" role="img" aria-label="${esc(t("Folk Atlas"))}">${p}${sm}${dots}</svg>`;
    };

    function info() {
      const id = S.sel; if (!id) return `<p class="fa-note">${esc(own ? t("Tap a country to see it, add it to your dreams or declare you've been.") : t("Tap a country to see it."))}</p>`;
      const sc = byC.get(id), st = status(id), w = wish.find(x => x.country === id), dec = been.includes(id);
      let line = sc ? [sc.n === 1 ? t("1 place signed") : t("{n} places signed", { n: sc.n }), sc.on ? `📍 ${t("{n} on the spot", { n: sc.on })}` : ""].filter(Boolean).join(" · ")
        : dec ? (own ? t("You declared you've been here: sign a place to make it yours.") : t("Declared, not signed yet."))
        : st === "wish" ? [t("In your dreams"), S.folk[id] ? (S.folk[id] === 1 ? t("1 folk has been") : t("{n} folk have been", { n: S.folk[id] })) : ""].filter(Boolean).join(" · ") : t("Not on this atlas yet.");
      const list = sc ? sc.list.filter(s => s.id != null && s.name).slice(0, 6) : [];
      const conf = (k, on, a, b) => S.confirm === k ? t("Tap again to remove") : on ? a : b;
      return `<div class="fa-info"><b class="fa-cn">${flag(id)} ${esc(nameOf(id))}</b><p>${esc(line)}</p>
        ${list.length ? `<div class="fa-stamps">${list.map(s => `<button type="button" data-fastamp="${s.id}">${s.on_spot ? "📍" : "✍"} ${esc(s.name)}</button>`).join("")}</div>` : ""}
        ${own && dbOk ? `<div class="fa-acts">${!sc ? `<button type="button" class="fa-btn g${dec ? " on" : ""}" data-fabeen>${esc(conf("been", dec, t("✓ Declared"), t("✓ I've been here")))}</button>` : ""}
          ${!sc && !dec || w ? `<button type="button" class="fa-btn${w ? " on" : ""}" data-fawish>${esc(conf("wish", !!w, t("♥ In your dreams"), t("♡ I want to go")))}</button>` : ""}</div>` : ""}</div>`;
    }

    function wishHtml() {
      const ws = wishes();
      if (!ws.length) return `<p class="fa-note">${esc(t("No dreams yet. Save places on the map or add a country: your dreams turn green when you sign there."))}</p>`;
      return `<ul class="fa-wish">${ws.map(x => {
        const title = x.w?.label || nameOf(x.id), sub = [x.w?.label ? nameOf(x.id) : "", x.sv.length ? (x.sv.length === 1 ? t("1 saved place") : t("{n} saved places", { n: x.sv.length })) : "", !x.w ? t("From your saved places") : ""].filter(Boolean).join(" · ");
        const f = S.folk[x.id], n = x.done ? `✓ ${esc(t("Dream come true"))}` : f == null ? "" : f ? esc(f === 1 ? t("1 folk has been") : t("{n} folk have been", { n: f })) : "";
        return `<li class="${x.done ? "done" : ""}"><span class="f">${flag(x.id)}</span><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}${x.done && x.doneAt ? `<small>${esc(t("Dream come true: {w}", { w: K.fmtWhen ? K.fmtWhen(x.doneAt) : String(x.doneAt).slice(0, 10) }))}</small>` : !x.done && f === 0 ? `<small>${esc(t("No folk there yet: you could be the first"))}</small>` : ""}</span><span class="n">${n}</span>
          ${!x.done ? `<div class="fa-acts"><button type="button" class="fa-btn" data-faask="${x.id}">${esc(t("🧭 Ask the folk"))}</button>${x.sv.length ? `<button type="button" class="fa-btn" data-fashow="${x.id}">${esc(t("Show on the map"))}</button>` : ""}${x.w ? `<button type="button" class="fa-x" data-faunwish="${x.id}">${esc(S.confirm === "un" + x.id ? t("Tap again to remove") : t("Remove"))}</button>` : ""}</div>` : ""}</li>`;
      }).join("")}</ul>`;
    }

    function draw() {
      const ids = new Set([...byC.keys(), ...been]), signedC = byC.size, onC = [...byC.values()].filter(x => x.on).length;
      const allW = wishes(), declW = allW.filter(x => x.w), doneW = declW.filter(x => x.done).length;
      const cnt = k => g.feats.filter(f => status(f.id) === k).length + Object.keys(g.small).filter(id => status(id) === k).length;
      const v = views();
      host.innerHTML = `<section class="fa">
        <div class="fa-head"><h3>Folk <em>Atlas</em></h3><p>${esc(own ? t("The world you signed. And the one you dream of.") : t("The world {n} signed.", { n: opts.name || "this folk" }))}</p></div>
        <div class="fa-mapbox">${mapSvg()}
          <div class="fa-zoom" role="group">${[["world", t("World")], ["europe", t("Europe")], ...(v.mine ? [["mine", t("Close-up")]] : [])].map(([k, l]) => `<button type="button" data-faview="${k}" class="${S.view === k ? "on" : ""}">${esc(l)}</button>`).join("")}</div></div>
        <div class="fa-legend">${[["onspot", t("Signed on the spot")], ["signed", t("Signed")], ["declared", t("Declared")], ...(own ? [["wish", t("I want to go")]] : [])].map(([k, l]) => `<span><i style="background:${COL[k]}"></i>${esc(l)} (${cnt(k)})</span>`).join("")}</div>
        <div data-fainfo>${info()}</div>
        <div class="fa-stats">
          <div><b>${ids.size}</b><small>${esc(t("Countries"))} · ${esc(t("{n} signed", { n: signedC }))}</small></div>
          <div><b>${stamps.length}</b><small>${esc(t("Signatures"))}</small></div>
          <div><b>${onC}</b><small>📍 ${esc(t("Countries"))} ${esc(t("on the spot"))}</small></div>
          ${own ? `<div><b>${doneW}</b><small>${esc(t("Dreams come true"))} · ${esc(t("{a} of {b}", { a: doneW, b: declW.length }))}</small><div class="fa-bar"><i style="width:${declW.length ? Math.round(doneW / declW.length * 100) : 0}%"></i></div></div>`
            : `<div><b>${been.filter(c => !byC.has(c)).length}</b><small>${esc(t("Declared"))}</small></div>`}
        </div>
        ${own ? `<p class="fa-h">♡ ${esc(t("I want to go"))}</p>${wishHtml()}
          ${dbOk ? `<details class="fa-add"><summary>${esc(t("＋ Add a dream or a country"))}</summary><form class="fa-form" novalidate>
            <select name="c" aria-label="${esc(t("Country"))}"><option value="">${esc(t("Choose a country"))}</option>${allIds().map(id => [id, nameOf(id)]).sort((a, b) => a[1].localeCompare(b[1], lang)).map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join("")}</select>
            <input name="l" maxlength="60" placeholder="${esc(t("e.g. Patagonia, Lofoten"))}" aria-label="${esc(t("Name (optional)"))}">
            <div class="fa-acts"><button type="submit" class="fa-btn on" value="wish">${esc(t("♡ I want to go"))}</button><button type="submit" class="fa-btn g" value="been">${esc(t("✓ I've been here"))}</button></div>
          </form></details>
          <p class="fa-note">${esc(t("Your dreams are private: only you see them. The countries you declare show in your passport to the folk."))}</p>`
            : `<p class="fa-note">${esc(t("The atlas arrives once the database is updated (supabase-folk-atlas.sql)."))}</p>`}` : ""}
      </section>`;
      wire();
    }

    async function mark(id, kind, on, label) {
      try {
        if (on) await K.api("/rest/v1/atlas_marks", { method: "POST", headers: { Prefer: "return=minimal,resolution=ignore-duplicates" }, body: { country: id, kind, ...(label ? { label } : {}) } });
        else await K.api(`/rest/v1/atlas_marks?country=eq.${id}&kind=eq.${kind}&user_id=eq.${encodeURIComponent(opts.uid)}`, { method: "DELETE" });
        if (kind === "been") been = on ? [...new Set([...been, id])] : been.filter(c => c !== id);
        else wish = on ? [...wish.filter(w => w.country !== id), { country: id, label: label || null, at: new Date().toISOString() }] : wish.filter(w => w.country !== id);
        K.track?.(`Atlas: ${kind} ${on ? "added" : "removed"}`);
        S.confirm = null; draw(); if (kind === "wish" && on) loadFolk();
      } catch (err) { K.toast(t("Could not save it: {e}", { e: err.message }), true); }
    }

    function wire() {
      const svg = host.querySelector(".fa-map");
      svg.addEventListener("click", ev => { const c = ev.target.closest("[data-c]")?.dataset.c; if (!c) return; S.sel = S.sel === c ? null : c; S.confirm = null; svg.querySelectorAll("path.sel").forEach(p => p.classList.remove("sel")); if (S.sel) svg.querySelector(`path[data-c="${S.sel}"]`)?.classList.add("sel"); host.querySelector("[data-fainfo]").innerHTML = info(); wireInfo(); });
      host.querySelectorAll("[data-faview]").forEach(b => b.addEventListener("click", () => {
        const to = views()[b.dataset.faview]; if (!to) return; S.view = b.dataset.faview;
        host.querySelectorAll("[data-faview]").forEach(x => x.classList.toggle("on", x === b));
        const from = svg.getAttribute("viewBox").split(" ").map(Number), t0 = performance.now(), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const step = now => { const k = still ? 1 : Math.min(1, (now - t0) / 550), e = 1 - Math.pow(1 - k, 3); svg.setAttribute("viewBox", from.map((f, i) => (f + (to[i] - f) * e).toFixed(1)).join(" ")); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }));
      wireInfo();
      host.querySelectorAll("[data-faask]").forEach(b => b.addEventListener("click", () => {
        const id = b.dataset.faask, w = wish.find(x => x.country === id), sp = (savedBy.get(id) || [])[0], c = sp ? { lat: +sp.lat, lon: +sp.lon } : centre(id);
        if (c) K.askFolk({ lat: c.lat, lon: c.lon, name: w?.label || nameOf(id) });
      }));
      host.querySelectorAll("[data-fashow]").forEach(b => b.addEventListener("click", () => K.showOnMap((savedBy.get(b.dataset.fashow) || []).map(s => ({ lat: +s.lat, lon: +s.lon })))));
      host.querySelectorAll("[data-faunwish]").forEach(b => b.addEventListener("click", () => { const id = b.dataset.faunwish; if (S.confirm !== "un" + id) { S.confirm = "un" + id; b.textContent = t("Tap again to remove"); return; } mark(id, "wish", false); }));
      const f = host.querySelector(".fa-form");
      f?.addEventListener("submit", ev => {
        ev.preventDefault(); const kind = ev.submitter?.value || "wish", id = f.elements.c.value, l = f.elements.l.value.trim();
        if (!id) return f.elements.c.focus();
        S.sel = id; mark(id, kind, true, kind === "wish" ? l : "");
      });
    }
    function wireInfo() {
      const box = host.querySelector("[data-fainfo]"), id = S.sel;
      box.querySelectorAll("[data-fastamp]").forEach(b => b.addEventListener("click", () => K.openPlace(+b.dataset.fastamp)));
      box.querySelector("[data-fabeen]")?.addEventListener("click", () => { const on = been.includes(id); if (on && S.confirm !== "been") { S.confirm = "been"; box.innerHTML = info(); return wireInfo(); } mark(id, "been", !on); });
      box.querySelector("[data-fawish]")?.addEventListener("click", () => { const on = wish.some(w => w.country === id); if (on && S.confirm !== "wish") { S.confirm = "wish"; box.innerHTML = info(); return wireInfo(); } mark(id, "wish", !on); });
    }

    if (views().mine) S.view = "mine";   // start close to the countries that are coloured
    draw();
    loadFolk();
  }

  return { mount, countryAt, nameOf };
})();
