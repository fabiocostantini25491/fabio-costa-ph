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
    "Signed here": "Firmati qui", "♡ I want to go back": "♡ Voglio tornarci", "Your dreams here": "I tuoi sogni qui", "A dream place": "Posto sognato",
    "1 folk has been nearby": "1 folk c'è stato vicino", "{n} folk have been nearby": "{n} folk ci sono stati vicino",
    "No dreams yet. Save places on the map or add a dream: it turns green when you sign there.": "Ancora nessun sogno. Salva posti sulla mappa o aggiungi un sogno: diventa verde quando firmi lì.",
    "＋ Add a dream": "＋ Aggiungi un sogno", "A place or a country: Roccascalegna, Lofoten, Japan…": "Un posto o un Paese: Roccascalegna, Lofoten, Giappone…",
    "Where do you dream of going?": "Dove sogni di andare?", "Been somewhere before SpotFolk?": "Sei stato da qualche parte prima di SpotFolk?",
    "The whole country": "Tutto il Paese", "A region": "Una regione", "{n} min ago": "{n} min fa", "{n} h ago": "{n} h fa", "yesterday": "ieri", "{n} days ago": "{n} giorni fa",
    "now": "adesso", "last report": "ultima notizia", "How it is now, from the folk": "Com'è adesso, dai folk", "No folk has said how it is here yet.": "Nessun folk ha ancora detto com'è qui.",
    "📣 Tell the folk how it is now": "📣 Racconta ai folk com'è adesso", "Group by": "Raggruppa", "All": "Tutti", "Country": "Paese", "Region": "Regione", "My lists": "Le mie liste",
    "Not in a list": "Senza lista", "Add to a list": "Metti in una lista", "List": "Lista", "e.g. Summer 2027, Weekends": "es. Estate 2027, Weekend", "Searching…": "Cerco…", "Nothing found: try another name, e.g. «Cascata delle Marmore».": "Nessun risultato: prova con un altro nome, es. «Cascata delle Marmore».", "Already in your dreams.": "È già tra i tuoi sogni.",
    "Your dreams are private: only you see them. The countries you declare show in your passport to the folk. A dream comes true when you sign there: for a place, within 15 km.": "I tuoi sogni sono privati: li vedi solo tu. I Paesi che dichiari si vedono nel tuo passaporto, solo dai folk. Un sogno si realizza quando firmi lì: per un posto, entro 15 km.", "In your dreams": "Nei tuoi sogni", "Done.": "Fatto."
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
.fa-map .pin{fill:#f28c28;stroke:#fff8e6;stroke-width:1.2;vector-effect:non-scaling-stroke;cursor:pointer}.fa-map .pin.ok{fill:#2fbf71}
.fa-legend i.pinkey{border-radius:50%;background:#f28c28;box-shadow:0 0 0 1.5px #fff8e6 inset}
.fa-found{list-style:none;margin:0;padding:0;display:grid;gap:4px}.fa-found:empty{display:none}
.fa-nowrow{grid-column:2/4}
.fa-now{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);text-align:left}
.fa-now.live{border-color:rgba(47,191,113,.55);background:rgba(47,191,113,.08)}
.fa-now .i{font-size:20px;line-height:1}.fa-now b{display:block;font-size:13.5px}.fa-now small{display:block;font-size:11.5px;color:rgba(243,234,216,.66)}
.fa-now em{display:block;margin-top:3px;font-size:12.5px;color:rgba(243,234,216,.88)}
.fa-now img{width:52px;height:52px;object-fit:cover;border-radius:9px}
.fa-pulse{grid-column:1/4;margin-top:8px;padding:12px;border-radius:14px;background:rgba(5,11,20,.55);border:1px solid rgba(255,255,255,.1);display:grid;gap:8px;min-width:0}
.fa-ph{margin:0;font-weight:700;font-size:13.5px;color:#ffd27a}.fa-ph2{margin:4px 0 0;font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(243,234,216,.6)}
.fa-nowb{display:block;width:100%;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.fa-wx{min-width:0}.fa-wx .pc-wx,.fa-wx .pc-cams{margin:0}
.fa-group{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 6px;font-size:12.5px;color:rgba(243,234,216,.7)}
.fa-group button{border:1px solid rgba(255,255,255,.14);background:none;color:#f3ead8;border-radius:99px;padding:6px 11px;font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.fa-group button.on{background:#f28c28;border-color:#f28c28;color:#1a1206}
.fa-gh{margin:14px 0 2px;font-size:14px;font-weight:700;color:#ffd27a}.fa-gh small{font-weight:500;color:rgba(243,234,216,.6);margin-left:4px}
.fa-listin{flex:1 1 160px;min-width:0;padding:7px 10px;border-radius:10px;border:1px solid #f28c28;background:rgba(5,11,20,.6);color:#f3ead8;font-family:inherit;font-size:13px}.fa-none{font-size:12.5px;color:rgba(243,234,216,.65);padding:4px 2px}
.fa-found button{width:100%;text-align:left;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#f3ead8;border-radius:12px;padding:9px 12px;cursor:pointer;font-family:inherit}
.fa-found button:hover{border-color:#f28c28}.fa-found b{display:block;font-size:14px;font-weight:600}.fa-found small{font-size:12px;color:rgba(243,234,216,.65)}
.fa-h2{margin:12px 0 2px}.fa-been{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
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
  const RADIUS = 15;   // km: a dream of a precise place comes true when you sign within this distance of it
  const kmBetween = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const ms = v => { const n = Date.parse(v); return Number.isFinite(n) ? n : 0; };

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
    const S = { sel: null, view: "world", folk: {}, confirm: null, found: [], editList: null, group: "none", pulse: new Set(), now: {}, nowPh: {} };
    try { const gm = localStorage.getItem("fa-group"); if (["none", "country", "region", "list"].includes(gm)) S.group = gm; } catch {}
    const isPlace = w => w.lat != null && w.lon != null;

    // stamps → countries
    const stamps = (opts.stamps || []).map(s => ({ ...s, cc: countryAt(s.lat ?? s.clat, s.lon ?? s.clon) })).filter(s => s.cc);
    const byC = new Map();
    stamps.forEach(s => { const o = byC.get(s.cc) || { n: 0, on: 0, list: [] }; o.n++; if (s.on_spot) o.on++; o.list.push(s); byC.set(s.cc, o); });

    // saved places → countries (only yours)
    const savedBy = new Map();
    if (own) (K.saved?.() || []).forEach(sp => { const c = countryAt(sp.lat, sp.lon); if (!c) return; const a = savedBy.get(c) || []; a.push(sp); savedBy.set(c, a); });

    // when a dream comes true: a signature after the dream, near the place (precise dream) or in the country
    const doneAt = w => {
      const t0 = ms(w.at), hits = stamps.filter(s => ms(s.at) >= t0 && (isPlace(w) ? s.lat != null && kmBetween(+s.lat, +s.lon, +w.lat, +w.lon) <= RADIUS : s.cc === w.country));
      return hits.length ? hits.slice().sort((a, b) => ms(a.at) - ms(b.at))[0] : null;
    };
    const status = id => {
      const s = byC.get(id); if (s) return s.on ? "onspot" : "signed";
      if (been.includes(id)) return "declared";
      if (own && (wish.some(w => w.country === id) || savedBy.has(id))) return "wish";
      return "none";
    };
    // the dreams: each one you added (a country or a place) + the countries of your saved places you haven't been to
    const wishes = () => {
      const out = wish.map(w => { const d = doneAt(w); return { key: "w" + w.id, id: w.country, w, sv: isPlace(w) ? [] : savedBy.get(w.country) || [], done: !!d, doneAt: d?.at || null, doneSpot: d?.id ?? null }; });
      [...savedBy.keys()].forEach(id => { if (!wish.some(w => w.country === id && !isPlace(w)) && !byC.has(id) && !been.includes(id)) out.push({ key: "c" + id, id, w: null, sv: savedBy.get(id), done: false, doneAt: null }); });
      return out.sort((a, b) => (a.done - b.done) || (ms(a.w?.at) || 9e15) - (ms(b.w?.at) || 9e15));
    };

    // folk counts for the dreams: other folk who signed places near the place or in the country (numbers only)
    async function loadFolk() {
      if (!own || !dbOk) return;
      const open = wishes().filter(x => !x.done); if (!open.length) return;
      const all = (K.allSpots?.() || []).filter(sp => sp.lat != null), groups = {};
      open.forEach(x => {
        const ids = x.w && isPlace(x.w) ? all.filter(sp => kmBetween(+sp.lat, +sp.lon, +x.w.lat, +x.w.lon) <= RADIUS).map(sp => sp.id)
          : all.filter(sp => countryAt(sp.lat, sp.lon) === x.id).map(sp => sp.id);
        if (ids.length) groups[x.key] = ids.slice(0, 2000); else S.folk[x.key] = 0;
      });
      if (!Object.keys(groups).length) { draw(); return; }
      const [fk, nw] = await Promise.all([
        K.api("/rest/v1/rpc/atlas_folk", { method: "POST", body: { p_groups: groups } }).then(r => r.data || {}).catch(() => null),
        K.api("/rest/v1/rpc/atlas_now", { method: "POST", body: { p_groups: groups } }).then(r => r.data || {}).catch(() => ({}))]);
      if (fk) Object.keys(groups).forEach(k => { S.folk[k] = +fk[k] || 0; });
      S.now = nw || {};
      const paths = Object.values(S.now).flat().map(c => c.photo_path).filter(Boolean);
      if (paths.length && K.signPhotos) try { S.nowPh = await K.signPhotos(paths, true); } catch {}
      draw();
    }

    // dreams added before: find their position (only a name) and their region, once
    async function placeOldDreams() {
      if (!own || !dbOk || !K.findPlace) return;
      let tried = []; try { tried = JSON.parse(sessionStorage.getItem("fa-tried2") || "[]"); } catch {}
      let moved = false;
      for (const w of wish.filter(w => w.label && (!isPlace(w) || !w.region) && !tried.includes(w.id)).slice(0, 8)) {
        try {
          tried.push(w.id); try { sessionStorage.setItem("fa-tried2", JSON.stringify(tried)); } catch {}
          const res = await K.findPlace(`${w.label}, ${nameOf(w.country)}`);
          const r = isPlace(w) ? res.filter(p => !p.isCountry && p.lat != null).sort((a, b) => kmBetween(a.lat, a.lon, +w.lat, +w.lon) - kmBetween(b.lat, b.lon, +w.lat, +w.lon))[0]
            : res.find(p => !p.isCountry && countryAt(p.lat, p.lon) === w.country);
          if (!r) continue;
          const body = {};
          if (!isPlace(w) && !r.big) { body.lat = +r.lat.toFixed(5); body.lon = +r.lon.toFixed(5); }   // a region (Patagonia) stays a dream of the country
          if (!w.region && r.region && r.region !== w.label) body.region = String(r.region).slice(0, 80);
          if (!Object.keys(body).length) continue;
          await K.api(`/rest/v1/atlas_marks?id=eq.${w.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body });
          Object.assign(w, body); moved = true;
        } catch {}
      }
      if (moved) { draw(); loadFolk(); }
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
      const pins = own ? wishes().filter(x => x.w && isPlace(x.w)).map(x => `<circle class="pin${x.done ? " ok" : ""}" cx="${X(+x.w.lon).toFixed(1)}" cy="${Y(+x.w.lat).toFixed(1)}" r="3.4" data-c="${x.id}"><title>${esc(x.w.label || "")}</title></circle>`).join("") : "";
      const vb = (views()[S.view] || views().world).map(n => n.toFixed(1)).join(" ");
      return `<svg class="fa-map" viewBox="${vb}" role="img" aria-label="${esc(t("Folk Atlas"))}">${p}${sm}${dots}${pins}</svg>`;
    };

    function info() {
      const id = S.sel; if (!id) return `<p class="fa-note">${esc(own ? t("Tap a country to see it, add it to your dreams or declare you've been.") : t("Tap a country to see it."))}</p>`;
      const sc = byC.get(id), st = status(id), cw = wish.find(x => x.country === id && !isPlace(x)), dec = been.includes(id);
      const here = own ? wishes().filter(x => x.id === id && x.w && isPlace(x.w)) : [];
      let line = sc ? [sc.n === 1 ? t("1 place signed") : t("{n} places signed", { n: sc.n }), sc.on ? `📍 ${t("{n} on the spot", { n: sc.on })}` : ""].filter(Boolean).join(" · ")
        : dec ? (own ? t("You declared you've been here: sign a place to make it yours.") : t("Declared, not signed yet."))
        : st === "wish" ? t("In your dreams") : t("Not on this atlas yet.");
      const list = sc ? sc.list.filter(s => s.id != null && s.name).slice(0, 6) : [];
      const conf = (k, on, a, b) => S.confirm === k ? t("Tap again to remove") : on ? a : b;
      return `<div class="fa-info"><b class="fa-cn">${flag(id)} ${esc(nameOf(id))}</b><p>${esc(line)}</p>
        ${list.length ? `<div class="fa-stamps">${list.map(s => `<button type="button" data-fastamp="${s.id}">${s.on_spot ? "📍" : "✍"} ${esc(s.name)}</button>`).join("")}</div>` : ""}
        ${here.length ? `<p>${esc(t("Your dreams here"))}: ${here.map(x => `${x.done ? "✓" : "♡"} ${esc(x.w.label)}`).join(" · ")}</p>` : ""}
        ${own && dbOk ? `<div class="fa-acts">${!sc ? `<button type="button" class="fa-btn g${dec ? " on" : ""}" data-fabeen>${esc(conf("been", dec, t("✓ Declared"), t("✓ I've been here")))}</button>` : ""}
          <button type="button" class="fa-btn${cw ? " on" : ""}" data-fawish>${esc(conf("wish", !!cw, t("♥ In your dreams"), (sc || dec) ? t("♡ I want to go back") : t("♡ I want to go")))}</button></div>` : ""}</div>`;
    }

    const ago = v => { const m = Math.round((Date.now() - ms(v)) / 60e3); return m < 60 ? t("{n} min ago", { n: Math.max(m, 1) }) : m < 1440 ? t("{n} h ago", { n: Math.round(m / 60) }) : m < 2880 ? t("yesterday") : t("{n} days ago", { n: Math.round(m / 1440) }); };
    const condLine = (c, full) => { const k = (K.COND || {})[c.kind] || ["📣", c.kind], live = ms(c.expires_at) > Date.now(), ph = c.photo_path && S.nowPh?.[c.photo_path];
      return `<div class="fa-now${live ? " live" : ""}"><span class="i">${k[0]}</span><span><b>${esc(k[1])}</b><small>${esc([live ? t("now") : t("last report"), ago(c.at), c.on_spot ? "📍 " + t("on the spot") : "", c.name].filter(Boolean).join(" · "))}</small>${c.note && full ? `<em>«${K.ugc ? K.ugc(c.note) : esc(c.note)}»</em>` : ""}</span>${ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : ""}</div>`; };
    const pulsePoint = x => x.w && isPlace(x.w) ? { lat: +x.w.lat, lon: +x.w.lon } : x.sv[0] ? { lat: +x.sv[0].lat, lon: +x.sv[0].lon } : null;
    function pulseHtml(x) {
      const now = S.now?.[x.key] || [];
      return `<div class="fa-pulse"><p class="fa-ph">📡 Place pulse · ${esc(x.w?.label || nameOf(x.id))}</p>
        ${now.length ? `<p class="fa-ph2">${esc(t("How it is now, from the folk"))}</p>${now.map(c => `<button type="button" class="fa-nowb" data-fastamp="${c.spot_id}">${condLine(c, true)}</button>`).join("")}`
          : `<p class="fa-note">${esc(t("No folk has said how it is here yet."))}</p>`}
        ${pulsePoint(x) ? `<div class="fa-wx" data-fawx="${x.key}"></div>` : ""}</div>`;
    }
    function itemHtml(x) {
      const pl = x.w && isPlace(x.w), title = x.w?.label || nameOf(x.id);
      const sub = [x.w?.label ? [x.w.region, nameOf(x.id)].filter(Boolean).join(" · ") : "", x.sv.length ? (x.sv.length === 1 ? t("1 saved place") : t("{n} saved places", { n: x.sv.length })) : "", !x.w ? t("From your saved places") : ""].filter(Boolean).join(" · ");
      const f = S.folk[x.key], n = x.done ? `✓ ${esc(t("Dream come true"))}` : f ? esc(f === 1 ? t(pl ? "1 folk has been nearby" : "1 folk has been") : t(pl ? "{n} folk have been nearby" : "{n} folk have been", { n: f })) : "";
      const now = !x.done ? (S.now?.[x.key] || [])[0] : null;
      const listBtn = x.w ? (S.editList === String(x.w.id)
        ? `<input class="fa-listin" data-falistin="${x.w.id}" list="faLists" maxlength="40" value="${esc(x.w.list || "")}" placeholder="${esc(t("e.g. Summer 2027, Weekends"))}" aria-label="${esc(t("List"))}">`
        : `<button type="button" class="fa-x" data-falist="${x.w.id}">🏷 ${esc(x.w.list || t("Add to a list"))}</button>`) : "";
      return `<li class="${x.done ? "done" : ""}"><span class="f">${pl ? "📍" : flag(x.id)}</span><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}${x.done && x.doneAt ? `<small>${esc(t("Dream come true: {w}", { w: K.fmtWhen ? K.fmtWhen(x.doneAt) : String(x.doneAt).slice(0, 10) }))}</small>` : !x.done && f === 0 ? `<small>${esc(t("No folk there yet: you could be the first"))}</small>` : ""}</span><span class="n">${n}</span>
        ${now ? `<div class="fa-nowrow">${condLine(now, false)}</div>` : ""}
        <div class="fa-acts">${!x.done ? `<button type="button" class="fa-btn${S.pulse.has(x.key) ? " on" : ""}" data-fapulse="${x.key}">📡 Place pulse</button><button type="button" class="fa-btn" data-faask="${x.key}">${esc(t("🧭 Ask the folk"))}</button>${pl || x.sv.length ? `<button type="button" class="fa-btn" data-fashow="${x.key}">${esc(t("Show on the map"))}</button>` : ""}` : x.doneSpot != null ? `<button type="button" class="fa-btn on" data-fatell="${x.doneSpot}">${esc(t("📣 Tell the folk how it is now"))}</button>` : ""}${listBtn}${x.w ? `<button type="button" class="fa-x" data-faunwish="${x.w.id}">${esc(S.confirm === "un" + x.w.id ? t("Tap again to remove") : t("Remove"))}</button>` : ""}</div>${S.pulse.has(x.key) && !x.done ? pulseHtml(x) : ""}</li>`;
    }
    // groups: none · country · region · your own lists
    const groupOf = x => {
      if (S.group === "country") return [x.id, `${flag(x.id)} ${nameOf(x.id)}`];
      if (S.group === "region") return x.w?.region ? [x.id + "|" + x.w.region, `${x.w.region} · ${nameOf(x.id)}`] : [x.id + "|", `${flag(x.id)} ${nameOf(x.id)}`];
      if (S.group === "list") return x.w?.list ? ["l|" + x.w.list, `🏷 ${x.w.list}`] : x.w ? ["~", t("Not in a list")] : ["~~", t("From your saved places")];
      return ["", ""];
    };
    function wishHtml() {
      const ws = wishes();
      if (!ws.length) return `<p class="fa-note">${esc(t("No dreams yet. Save places on the map or add a dream: it turns green when you sign there."))}</p>`;
      const lists = [...new Set(wish.map(w => w.list).filter(Boolean))].sort((a, b) => a.localeCompare(b, lang));
      const bar = `<div class="fa-group" role="group"><span>${esc(t("Group by"))}</span>${[["none", t("All")], ["country", t("Country")], ["region", t("Region")], ["list", t("My lists")]].map(([k, l]) => `<button type="button" data-fagroup="${k}" class="${S.group === k ? "on" : ""}">${esc(l)}</button>`).join("")}</div>
        <datalist id="faLists">${lists.map(l => `<option value="${esc(l)}">`).join("")}</datalist>`;
      if (S.group === "none") return bar + `<ul class="fa-wish">${ws.map(itemHtml).join("")}</ul>`;
      const groups = new Map();
      ws.forEach(x => { const [k, l] = groupOf(x); if (!groups.has(k)) groups.set(k, { l, items: [] }); groups.get(k).items.push(x); });
      const keys = [...groups.keys()].sort((a, b) => (a.startsWith("~") - b.startsWith("~")) || (a.startsWith("~") ? a.length - b.length : 0) || groups.get(a).l.replace(/^\W+/u, "").localeCompare(groups.get(b).l.replace(/^\W+/u, ""), lang));
      return bar + keys.map(k => { const g = groups.get(k), done = g.items.filter(x => x.done).length;
        return `<p class="fa-gh">${esc(g.l)} <small>${g.items.length}${done ? ` · ✓ ${done}` : ""}</small></p><ul class="fa-wish">${g.items.map(itemHtml).join("")}</ul>`; }).join("");
    }

    function addForm() {
      return `<details class="fa-add"${S.addOpen ? " open" : ""}><summary>${esc(t("＋ Add a dream"))}</summary><div class="fa-form">
          <input type="search" data-faq maxlength="80" autocomplete="off" placeholder="${esc(t("A place or a country: Roccascalegna, Lofoten, Japan…"))}" aria-label="${esc(t("Where do you dream of going?"))}">
          <ul class="fa-found" data-fafound></ul>
          <p class="fa-h fa-h2">${esc(t("Been somewhere before SpotFolk?"))}</p>
          <div class="fa-been"><select data-fabeensel aria-label="${esc(t("Country"))}"><option value="">${esc(t("Choose a country"))}</option>${allIds().filter(id => !byC.has(id) && !been.includes(id)).map(id => [id, nameOf(id)]).sort((a, b) => a[1].localeCompare(b[1], lang)).map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join("")}</select>
          <button type="button" class="fa-btn g" data-fabeenadd>${esc(t("✓ I've been here"))}</button></div>
        </div></details>`;
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
        <div class="fa-legend">${[["onspot", t("Signed on the spot")], ["signed", t("Signed")], ["declared", t("Declared")], ...(own ? [["wish", t("I want to go")]] : [])].map(([k, l]) => `<span><i style="background:${COL[k]}"></i>${esc(l)} (${cnt(k)})</span>`).join("")}${own && declW.some(x => isPlace(x.w)) ? `<span><i class="pinkey"></i>${esc(t("A dream place"))}</span>` : ""}</div>
        <div data-fainfo>${info()}</div>
        <div class="fa-stats">
          <div><b>${ids.size}</b><small>${esc(t("Countries"))} · ${esc(t("{n} signed", { n: signedC }))}</small></div>
          <div><b>${stamps.length}</b><small>${esc(t("Signatures"))}</small></div>
          <div><b>${onC}</b><small>📍 ${esc(t("Countries"))} ${esc(t("on the spot"))}</small></div>
          ${own ? `<div><b>${doneW}</b><small>${esc(t("Dreams come true"))} · ${esc(t("{a} of {b}", { a: doneW, b: declW.length }))}</small><div class="fa-bar"><i style="width:${declW.length ? Math.round(doneW / declW.length * 100) : 0}%"></i></div></div>`
            : `<div><b>${been.filter(c => !byC.has(c)).length}</b><small>${esc(t("Declared"))}</small></div>`}
        </div>
        ${own ? `<p class="fa-h">♡ ${esc(t("I want to go"))}</p>${wishHtml()}
          ${dbOk ? `${addForm()}<p class="fa-note">${esc(t("Your dreams are private: only you see them. The countries you declare show in your passport to the folk. A dream comes true when you sign there: for a place, within 15 km."))}</p>`
            : `<p class="fa-note">${esc(t("The atlas arrives once the database is updated (supabase-folk-atlas.sql)."))}</p>`}` : ""}
      </section>`;
      wire();
    }

    const fail = err => K.toast(t("Could not save it: {e}", { e: err.message }), true);
    async function addWish(d) {
      if (wish.some(w => w.country === d.country && (w.label || "") === (d.label || ""))) { K.toast(t("Already in your dreams.")); return; }
      try {
        const r = (await K.api("/rest/v1/atlas_marks", { method: "POST", headers: { Prefer: "return=representation" }, body: { kind: "wish", country: d.country, ...(d.label ? { label: d.label.slice(0, 60) } : {}), ...(d.lat != null ? { lat: +(+d.lat).toFixed(5), lon: +(+d.lon).toFixed(5) } : {}), ...(d.region ? { region: String(d.region).slice(0, 80) } : {}), ...(S.group === "list" && S.lastList ? { list_name: S.lastList } : {}) } })).data;
        const row = Array.isArray(r) ? r[0] : r;
        wish.push({ id: row?.id, country: d.country, label: d.label || null, lat: d.lat ?? null, lon: d.lon ?? null, region: d.region || null, list: S.group === "list" && S.lastList ? S.lastList : null, at: row?.created_at || new Date().toISOString() });
        K.track?.(`Atlas: dream added (${d.lat != null ? "place" : "country"})`);
        S.confirm = null; S.sel = d.country; draw(); loadFolk();
      } catch (err) { fail(err); }
    }
    async function removeWish(id) {
      try { await K.api(`/rest/v1/atlas_marks?id=eq.${id}`, { method: "DELETE" }); wish = wish.filter(w => String(w.id) !== String(id)); S.confirm = null; draw(); }
      catch (err) { fail(err); }
    }
    async function setBeen(id, on) {
      try {
        if (on) await K.api("/rest/v1/atlas_marks", { method: "POST", headers: { Prefer: "return=minimal" }, body: { country: id, kind: "been" } }).catch(err => { if (err.status !== 409) throw err; });
        else await K.api(`/rest/v1/atlas_marks?country=eq.${id}&kind=eq.been&user_id=eq.${encodeURIComponent(opts.uid)}`, { method: "DELETE" });
        been = on ? [...new Set([...been, id])] : been.filter(c => c !== id);
        K.track?.(`Atlas: country ${on ? "declared" : "undeclared"}`);
        S.confirm = null; S.sel = id; draw();
      } catch (err) { fail(err); }
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
      const item = key => wishes().find(x => x.key === key);
      host.querySelectorAll("[data-faask]").forEach(b => b.addEventListener("click", () => {
        const x = item(b.dataset.faask); if (!x) return;
        const sp = x.sv[0], c = x.w && isPlace(x.w) ? { lat: +x.w.lat, lon: +x.w.lon } : sp ? { lat: +sp.lat, lon: +sp.lon } : centre(x.id);
        if (c) K.askFolk({ lat: c.lat, lon: c.lon, name: x.w?.label || nameOf(x.id) });
      }));
      host.querySelectorAll("[data-fashow]").forEach(b => b.addEventListener("click", () => {
        const x = item(b.dataset.fashow); if (!x) return;
        K.showOnMap(x.w && isPlace(x.w) ? [{ lat: +x.w.lat, lon: +x.w.lon }] : x.sv.map(s => ({ lat: +s.lat, lon: +s.lon })));
      }));
      host.querySelectorAll("[data-faunwish]").forEach(b => b.addEventListener("click", () => { const id = b.dataset.faunwish; if (S.confirm !== "un" + id) { S.confirm = "un" + id; b.textContent = t("Tap again to remove"); return; } removeWish(id); }));
      host.querySelectorAll("[data-fapulse]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.fapulse; S.pulse.has(k) ? S.pulse.delete(k) : S.pulse.add(k); if (S.pulse.has(k)) K.track?.("Atlas: dream pulse"); draw(); }));
      host.querySelectorAll("[data-fawx]").forEach(el => { const x = wishes().find(i => i.key === el.dataset.fawx), p = x && pulsePoint(x); if (p && K.pulse) K.pulse(el, p); });
      host.querySelectorAll(".fa-wish [data-fastamp]").forEach(b => b.addEventListener("click", () => K.openPlace(+b.dataset.fastamp)));
      host.querySelectorAll("[data-fatell]").forEach(b => b.addEventListener("click", () => { K.track?.("Atlas: tell after dream"); K.openPlace(+b.dataset.fatell, "pulse"); }));
      host.querySelectorAll("[data-fagroup]").forEach(b => b.addEventListener("click", () => { S.group = b.dataset.fagroup; try { localStorage.setItem("fa-group", S.group); } catch {} draw(); }));
      host.querySelectorAll("[data-falist]").forEach(b => b.addEventListener("click", () => { S.editList = b.dataset.falist; draw(); const i = host.querySelector(`[data-falistin="${S.editList}"]`); i?.focus(); }));
      host.querySelectorAll("[data-falistin]").forEach(inp => {
        let saved = false;
        const save = async () => {
          if (saved) return; saved = true;
          const w = wish.find(x => String(x.id) === inp.dataset.falistin), v = inp.value.trim().slice(0, 40) || null;
          S.editList = null;
          if (!w || (w.list || null) === v) { draw(); return; }
          try { await K.api(`/rest/v1/atlas_marks?id=eq.${w.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { list_name: v } }); w.list = v; if (v) S.lastList = v; K.track?.("Atlas: dream listed"); }
          catch (err) { fail(err); }
          draw();
        };
        inp.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); save(); } if (ev.key === "Escape") { saved = true; S.editList = null; draw(); } });
        inp.addEventListener("change", save); inp.addEventListener("blur", save);
      });
      const det = host.querySelector(".fa-add"); det?.addEventListener("toggle", () => { S.addOpen = det.open; });
      // find a place or a country for a dream
      const q = host.querySelector("[data-faq]"), list = host.querySelector("[data-fafound]");
      let timer = 0, seq = 0;
      const show = () => {
        list.innerHTML = S.found.map((p, i) => `<li><button type="button" data-fapick="${i}"><b>${p.isCountry ? flag(p.country) : "📍"} ${esc(p.name)}</b><small>${esc(p.isCountry ? t("The whole country") : [p.big ? t("A region") : "", p.context || nameOf(p.country)].filter(Boolean).join(" · "))}</small></button></li>`).join("");
        list.querySelectorAll("[data-fapick]").forEach(b => b.addEventListener("click", () => {
          const p = S.found[+b.dataset.fapick]; S.found = [];
          addWish(p.isCountry ? { country: p.country } : p.big ? { country: p.country, label: p.name, region: p.region && p.region !== p.name ? p.region : null } : { country: p.country, label: p.name, lat: p.lat, lon: p.lon, region: p.region });
        }));
      };
      q?.addEventListener("input", () => {
        clearTimeout(timer); const v = q.value.trim();
        if (v.length < 2) { S.found = []; show(); return; }
        list.innerHTML = `<li class="fa-none">${esc(t("Searching…"))}</li>`;
        timer = setTimeout(async () => {
          const my = ++seq, low = v.toLocaleLowerCase(lang);
          // a country typed by name comes first, then places (SpotFolk's search)
          const cs = allIds().filter(id => nameOf(id).toLocaleLowerCase(lang).startsWith(low)).slice(0, 2).map(id => ({ isCountry: true, country: id, name: nameOf(id) }));
          let ps = [];
          try { ps = (await K.findPlace(v)).filter(p => !p.isCountry).map(p => ({ ...p, country: countryAt(p.lat, p.lon) })).filter(p => p.country); } catch {}
          if (my !== seq) return;
          S.found = [...cs, ...ps].slice(0, 6); show();
          if (!S.found.length) list.innerHTML = `<li class="fa-none">${esc(t("Nothing found: try another name, e.g. «Cascata delle Marmore»."))}</li>`;
        }, 350);
      });
      host.querySelector("[data-fabeenadd]")?.addEventListener("click", () => { const sel = host.querySelector("[data-fabeensel]"); if (!sel.value) return sel.focus(); setBeen(sel.value, true); });
    }
    function wireInfo() {
      const box = host.querySelector("[data-fainfo]"), id = S.sel;
      box.querySelectorAll("[data-fastamp]").forEach(b => b.addEventListener("click", () => K.openPlace(+b.dataset.fastamp)));
      box.querySelector("[data-fabeen]")?.addEventListener("click", () => { const on = been.includes(id); if (on && S.confirm !== "been") { S.confirm = "been"; box.innerHTML = info(); return wireInfo(); } setBeen(id, !on); });
      box.querySelector("[data-fawish]")?.addEventListener("click", () => {
        const cw = wish.find(w => w.country === id && !isPlace(w));
        if (cw && S.confirm !== "wish") { S.confirm = "wish"; box.innerHTML = info(); return wireInfo(); }
        cw ? removeWish(cw.id) : addWish({ country: id });
      });
    }

    if (views().mine) S.view = "mine";   // start close to the countries that are coloured
    draw();
    loadFolk();
    placeOldDreams();
  }

  return { mount, countryAt, nameOf };
})();
