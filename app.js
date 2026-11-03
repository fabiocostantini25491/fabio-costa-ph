/* Fabio Costa Ph — app.js
   Viaggi sulla mappa, Gallery, Journal, ricerca luoghi e archivio foto nel browser. */
"use strict";

/* =========================================================
   1. CONTENUTI — si modificano dal pannello Pages CMS (cartella content/)
   ========================================================= */
let HOME_BASE = { name: "Roma", lat: 41.9028, lon: 12.4964 }; // da qui partono le rotte tratteggiate
let trips = [];      // { id, name, country, lat, lon, start, end, description, article }
let addedOn = { articoli: {}, foto: {} };   // content/novita.json: quando è comparso ogni articolo e ogni foto (lo scrive GitHub)
let photos = [];     // { id, trip, title, src, date, category, lat, lon, description }
let articles = [];   // { id, title, category, date, minutes, cover, trip, excerpt, text }
let about = {};
let contentFailed = false;

/* =========================================================
   2. UTILITÀ
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "luogo";

const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(window.I18N?.locale || "en-GB", { month: "short" }).format(new Date(2026, i, 15)));
/* Le categorie restano in italiano nel pannello, sul sito si leggono in inglese */
const CATEGORY_EN = { Paesaggi: "Landscapes", Urban: "Urban", Viaggi: "Travel", Fotografia: "Photography", Tecnica: "Technique", Ispirazione: "Inspiration",
  "Attualità": "Current affairs", Luoghi: "Places", "Guide pratiche": "Field guides", Persone: "People", Natura: "Nature" };
const catLabel = c => (window.I18N?.t || (x => x))(CATEGORY_EN[c] || c || "");
function parseDate(d) { return d ? new Date(d + "T00:00:00") : null; }
function fmtDate(d) {
  const x = parseDate(d);
  return x ? `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}` : "Date not specified";
}
function fmtRange(a, b) {
  const s = parseDate(a), e = parseDate(b || a);
  if (!s) return "Dates not specified";
  if (!e || +s === +e) return fmtDate(a);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
    return `${s.getDate()}–${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  if (s.getFullYear() === e.getFullYear())
    return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}
function fmtCoord(lat, lon) {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}  |  ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
}
function distKm(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ICON = {
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  img: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9" r="1.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/></svg>',
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2zM9 4v14M15 6v14"/></svg>'
};

/* Immagine sostitutiva disegnata, usata se una foto non si carica (es. nell'anteprima) */
function placeholderFor(seedText, category) {
  let h = 0; for (const c of String(seedText)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const urban = category === "Urban";
  const skies = [["#0b2635", "#d58a5b"], ["#071c29", "#3d7a74"], ["#102f40", "#c9a072"], ["#0a1f30", "#7b5a8a"]];
  const [top, bottom] = skies[Math.floor(rnd() * skies.length)];
  let shapes = "";
  if (urban) {
    let x = 0;
    while (x < 1200) { const w = 40 + rnd() * 90, hh = 160 + rnd() * 360; shapes += `<rect x="${x.toFixed(0)}" y="${(800 - hh).toFixed(0)}" width="${w.toFixed(0)}" height="${hh.toFixed(0)}" fill="#06141e"/>`; x += w + 4; }
    for (let i = 0; i < 70; i++) shapes += `<rect x="${(rnd() * 1200).toFixed(0)}" y="${(400 + rnd() * 380).toFixed(0)}" width="5" height="7" fill="#e9c98f" opacity=".7"/>`;
  } else {
    const ridge = (base, amp, color) => { let d = `M0 800 L0 ${base}`; for (let x = 0; x <= 1200; x += 60) d += ` L${x} ${(base - rnd() * amp).toFixed(0)}`; return `<path d="${d} L1200 800Z" fill="${color}"/>`; };
    shapes = ridge(560, 240, "#1a3a4a") + ridge(640, 180, "#0f2a38") + ridge(720, 90, "#071c29");
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/>${shapes}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
document.addEventListener("error", e => {
  const el = e.target;
  if (el && el.tagName === "IMG" && !el.dataset.fallback) {
    el.dataset.fallback = "1";
    el.src = placeholderFor(el.alt || el.src, el.dataset.cat);
  }
}, true);

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 4200);
}

/* =========================================================
   3. CARICAMENTO DEI CONTENUTI
   ========================================================= */
/* Le immagini caricate dal pannello hanno percorsi tipo "/img/foto/x.jpg": li rendo relativi,
   così il sito funziona anche se non è nella cartella principale del dominio */
const mediaUrl = u => (u ? String(u).trim().replace(/^\/(?!\/)/, "") : "");
const num = (v, fallback) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);

async function getJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadContent() {
  const [v, a, c, nv] = await Promise.allSettled([
    getJSON("content/viaggi.json"), getJSON("content/articoli.json"), getJSON("content/chi-sono.json"), getJSON("content/novita.json")
  ]);
  addedOn = nv.status === "fulfilled" && nv.value ? nv.value : { articoli: {}, foto: {} };
  [v, a, c].forEach(r => r.status === "rejected" && console.error("[contenuti]", r.reason));
  contentFailed = [v, a, c].every(r => r.status === "rejected");

  // il file può essere un elenco [..] oppure { "viaggi": [..] } (formato del pannello)
  const listOf = (r, key) => r.status !== "fulfilled" || !r.value ? [] : Array.isArray(r.value) ? r.value : Array.isArray(r.value[key]) ? r.value[key] : [];
  const rawTrips = listOf(v, "viaggi");
  trips = []; photos = [];
  rawTrips.forEach((t, ti) => {
    if (!t || !t.nome) return;
    const id = slug(t.id || t.nome) + (trips.some(x => x.id === slug(t.id || t.nome)) ? "-" + ti : "");
    const trip = { id, name: t.nome, country: t.paese || "", lat: num(t.lat, 0), lon: num(t.lon, 0),
      start: t.inizio || "", end: t.fine || t.inizio || "", description: t.descrizione || "", article: slug(t.articolo || "") };
    trips.push(trip);
    (Array.isArray(t.foto) ? t.foto : []).forEach((f, fi) => {
      if (!f || !f.immagine) return;
      photos.push({ id: `${id}-${fi}`, trip: id, raw: f.immagine, title: f.titolo || trip.name, src: mediaUrl(f.immagine),
        date: f.data || trip.start, category: f.categoria || "Paesaggi",
        lat: num(f.lat, trip.lat), lon: num(f.lon, trip.lon), description: f.descrizione || "",
        ownCoords: Number.isFinite(parseFloat(f.lat)) && Number.isFinite(parseFloat(f.lon)) });
    });
    // se le date del viaggio mancano, le ricavo dalle foto
    const dates = photos.filter(p => p.trip === id && p.date).map(p => p.date).sort();
    if (!trip.start && dates.length) { trip.start = dates[0]; trip.end = dates[dates.length - 1]; }
  });

  const rawArticles = listOf(a, "articoli");
  articles = rawArticles.filter(x => x && x.titolo).map(x => ({
    id: slug(x.slug || x.titolo), title: x.titolo, category: x.categoria || "Viaggi", date: x.data || "",
    minutes: num(x.minuti, 0), cover: mediaUrl(x.copertina), trip: slug(x.viaggio || ""),
    excerpt: x.estratto || "", text: x.testo || "",
    type: /reportage/i.test(x.tipo || "") ? "reportage" : "guide", place: x.luogo || "", glance: x.in_breve && typeof x.in_breve === "object" ? x.in_breve : {},
    author: authorOf(x.autore) }));

  about = c.status === "fulfilled" && c.value ? c.value : {};
  if (about.partenza && Number.isFinite(parseFloat(about.partenza.lat)))
    HOME_BASE = { name: about.partenza.nome || "", lat: num(about.partenza.lat), lon: num(about.partenza.lon) };
}

/* Autore di un articolo: tu, oppure un contributor (campo «Autore» del pannello) */
function authorOf(a) {
  const nm = a && typeof a === "object" && String(a.nome || "").trim();
  if (!nm) return { name: about?.proprietario || "Fabio Costantini", slug: "fabio", own: true };
  return { name: nm, slug: slug(nm), own: false, instagram: String(a.instagram || "").replace(/^@/, "").trim(),
    site: /^https?:\/\//.test(a.sito || "") ? a.sito : "", bio: a.bio || "", photo: a.foto ? mediaUrl(a.foto) : "" };
}
const authorLink = a => `<a class="mag-author" href="#author-${esc(a.author.slug)}">${esc(a.author.name)}</a>`;

/* Testo con formattazione (grassetto, titoletti, elenchi, link) scritto nel pannello */
function md(text) {
  if (!text) return "";
  if (window.marked && typeof marked.parse === "function") {
    const html = marked.parse(String(text), { breaks: true });
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    tpl.content.querySelectorAll("script,iframe,object,embed,style").forEach(n => n.remove());
    tpl.content.querySelectorAll("*").forEach(n => [...n.attributes].forEach(at => {
      if (/^on/i.test(at.name) || /^\s*javascript:/i.test(at.value)) n.removeAttribute(at.name);
    }));
    tpl.content.querySelectorAll("a[href^='http']").forEach(l => { l.target = "_blank"; l.rel = "noopener"; });
    tpl.content.querySelectorAll("img").forEach(i => { i.src = mediaUrl(i.getAttribute("src")); i.loading = "lazy"; });
    return tpl.innerHTML;
  }
  return String(text).split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join("");
}

const tripById = id => trips.find(t => t.id === id);
const photosOfTrip = id => photos.filter(p => p.trip === id).sort((a, b) => (a.date || "").localeCompare(b.date || ""));

/* =========================================================
   4. MAPPE (Leaflet + continenti disegnati, nessuna tessera esterna)
   ========================================================= */
const maps = {};          // home, explore
const pinLayers = {};
let activeTripId = null;
let searchMarker = null;
let photoMarker = null;   // punto esatto dello scatto mostrato sulla mappa di Explore

const gmapsUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;
/* Riga con le coordinate della singola foto + link a Google Maps */
function photoCoordsHtml(p) {
  if (!p || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon)) return "";
  return `<span class="shot-coords">${ICON.pin}<span>${fmtCoord(+p.lat, +p.lon)}</span></span>` +
    (p.ownCoords ? "" : `<span class="shot-note">journey location</span>`) +
    `<a class="text-link" href="${gmapsUrl(p.lat, p.lon)}" target="_blank" rel="noopener">${ICON.ext}Open in Google Maps</a>`;
}
function showPhotoMarker(p) {
  const map = maps.explore;
  photoMarker?.remove(); photoMarker = null;
  if (!map || !p || !p.ownCoords) return;
  const t = tripById(p.trip);
  if (t && distKm(t, p) < 0.05) return;   // coincide con l'astronauta: non serve
  photoMarker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: '<div class="shot-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, keyboard: false })
    .addTo(map).bindTooltip("Where this photo was taken", { direction: "top", offset: [0, -6] });
}

function pinIcon(active) {
  return L.divIcon({ className: "", iconSize: [40, 52], iconAnchor: [20, 48], tooltipAnchor: [0, -44],
    html: `<div class="home-astro${active ? " is-active" : ""}">${ASTRO_SVG}</div>` });
}

/* Geometria dei continenti (Natural Earth). Prova più fonti in ordine e usa la prima valida.
   Se nessuna risponde, la mappa usa comunque uno sfondo di riserva (vedi createMap). */
const LAND_SOURCES = [
  { type: "topojson", url: "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json" },
  { type: "topojson", url: "https://unpkg.com/world-atlas@2.0.2/land-110m.json" },
  { type: "echarts",  url: "https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/js/world.js" },
  { type: "echarts",  url: "https://unpkg.com/echarts@4.9.0/map/js/world.js" }
];
let landPromise = null;
function loadLand() {
  if (landPromise) return landPromise;
  landPromise = (async () => {
    for (const src of LAND_SOURCES) {
      try {
        const geo = src.type === "topojson" ? await loadTopo(src.url) : await loadEchartsScript(src.url);
        const clean = cleanLand(geo);
        if (clean) { console.info("[mappa] continenti caricati da", src.url); return clean; }
        console.warn("[mappa] dati non validi da", src.url);
      } catch (err) { console.warn("[mappa] fonte non raggiungibile:", src.url, err); }
    }
    console.warn("[mappa] nessuna fonte per i continenti: uso lo sfondo di riserva");
    return null;
  })();
  return landPromise;
}
/* Tiene solo coordinate valide e toglie l'Antartide; restituisce null se il risultato è vuoto */
function cleanLand(geo) {
  if (!geo || !Array.isArray(geo.features)) return null;
  const okRing = r => Array.isArray(r) && r.length > 3 && r.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 181 && Math.abs(p[1]) <= 91);
  const keepPoly = poly => okRing(poly[0]) && Math.max(...poly[0].map(p => p[1])) > -58;
  const polys = [];
  geo.features.forEach(f => {
    const g = f && f.geometry;
    if (!g) return;
    if (g.type === "Polygon") polys.push(g.coordinates);
    else if (g.type === "MultiPolygon") polys.push(...g.coordinates);
  });
  const kept = polys.filter(keepPoly).map(poly => poly.filter(okRing));
  if (kept.length < 20) return null;
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: kept } }] };
}
function loadEchartsScript(url) {
  return new Promise(resolve => {
    const prev = window.echarts;
    let done = false;
    const finish = v => { if (done) return; done = true; window.echarts = prev; resolve(v); };
    window.echarts = { registerMap: (name, geo) => finish(decodeEcharts(geo)) };
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => setTimeout(() => finish(null), 50);
    s.onerror = () => finish(null);
    document.head.appendChild(s);
    setTimeout(() => finish(null), 8000);
  });
}
function decodeEcharts(json) {
  if (!json || !json.features) return null;
  if (!json.UTF8Encoding) return json;
  const scale = json.UTF8Scale || 1024;
  const ring = (str, off) => {
    const out = []; let px = off[0], py = off[1];
    for (let i = 0; i < str.length; i += 2) {
      let x = str.charCodeAt(i) - 64, y = str.charCodeAt(i + 1) - 64;
      x = (x >> 1) ^ -(x & 1); y = (y >> 1) ^ -(y & 1);
      x += px; y += py; px = x; py = y;
      out.push([x / scale, y / scale]);
    }
    return out;
  };
  json.features.forEach(f => {
    const g = f.geometry, off = g.encodeOffsets;
    if (g.type === "Polygon") g.coordinates = g.coordinates.map((r, i) => ring(r, off[i]));
    else if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map((poly, i) => poly.map((r, j) => ring(r, off[i][j])));
  });
  json.UTF8Encoding = false;
  return json;
}
async function loadTopo(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const topo = await res.json();
    const tf = topo.transform;
    const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(p => tf ? (x += p[0], y += p[1], [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]) : p); });
    const ring = ids => ids.reduce((pts, i) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return pts.concat(pts.length ? a.slice(1) : a); }, []);
    const features = topo.objects.land.geometries.map(g => ({ type: "Feature", properties: {},
      geometry: g.type === "Polygon" ? { type: "Polygon", coordinates: g.arcs.map(ring) }
              : { type: "MultiPolygon", coordinates: g.arcs.map(p => p.map(ring)) } }));
    return { type: "FeatureCollection", features };
  } finally { clearTimeout(timer); }
}

function curve(a, b) {
  const pts = [], dLat = b.lat - a.lat, dLon = b.lon - a.lon;
  const c = { lat: (a.lat + b.lat) / 2 + dLon * 0.16, lon: (a.lon + b.lon) / 2 - dLat * 0.16 };
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    pts.push([u * u * a.lat + 2 * u * t * c.lat + t * t * b.lat, u * u * a.lon + 2 * u * t * c.lon + t * t * b.lon]);
  }
  return pts;
}

/* Mappa a tutto schermo (Explore e Spots), da computer e telefono.
   Dove il browser lo permette usa il vero schermo intero; su iPhone, che non lo consente, la mappa riempie la finestra. */
const ICON_FULL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ICON_FULL_EXIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
function addMapFullscreen(map, stage) {
  if (!map || !stage) return;
  const Ctrl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const box = L.DomUtil.create("div", "leaflet-bar map-full-ctrl");
      const b = L.DomUtil.create("a", "", box);
      b.href = "#"; b.setAttribute("role", "button"); b.title = "Full screen"; b.setAttribute("aria-label", "Full screen");
      b.innerHTML = ICON_FULL;
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.on(b, "click", e => { L.DomEvent.preventDefault(e); toggle(); });
      const sync = () => {
        const on = stage.classList.contains("map-full");
        b.innerHTML = on ? ICON_FULL_EXIT : ICON_FULL;
        b.title = on ? "Exit full screen" : "Full screen";
        b.setAttribute("aria-label", b.title);
      };
      const set = on => {
        stage.classList.toggle("map-full", on);
        document.body.classList.toggle("map-full-open", on);
        sync();
        setTimeout(() => map.invalidateSize(), 60);
        setTimeout(() => map.invalidateSize(), 350);
      };
      const toggle = async () => {
        const on = !stage.classList.contains("map-full");
        if (on) {
          set(true);
          window.fcTrack?.("Map: full screen");
          try { if (stage.requestFullscreen && !document.fullscreenElement) await stage.requestFullscreen({ navigationUI: "hide" }); } catch {}
        } else {
          if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
          set(false);
        }
      };
      document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && stage.classList.contains("map-full")) set(false); });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && stage.classList.contains("map-full") && !document.fullscreenElement) set(false); });
      window.addEventListener("hashchange", () => { if (stage.classList.contains("map-full")) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); set(false); } });
      return box;
    }
  });
  map.addControl(new Ctrl());
}
window.addMapFullscreen = addMapFullscreen;

function createMap(kind) {
  if (maps[kind] || !window.L) return maps[kind];
  const interactive = kind === "explore";
  const map = L.map(kind === "home" ? "homeMap" : "exploreMap", {
    zoomControl: false, attributionControl: true, worldCopyJump: false,
    dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, touchZoom: interactive,
    boxZoom: false, keyboard: interactive, minZoom: 1.5, maxZoom: 18, zoomSnap: 0.25,
    maxBounds: [[-62, -200], [86, 200]], maxBoundsViscosity: 0.8
  });
  if (interactive) L.control.zoom({ position: "topleft", zoomInTitle: "Zoom in", zoomOutTitle: "Zoom out" }).addTo(map);
  if (interactive) addMapFullscreen(map, document.querySelector(".explore-stage"));
  map.attributionControl.setPrefix(false);
  map.fitBounds([[-50, -165], [75, 175]]);

  // Livello "artistico" (da lontano): la Terra di notte con le luci delle città (NASA Black Marble)
  const art = L.layerGroup().addTo(map);
  const landOk = true;
  let nightErrors = 0, nightFallback = false;
  const night = L.tileLayer(NIGHT_TILES, { maxNativeZoom: 8, maxZoom: 10, className: "tiles-night", attribution: NIGHT_ATTRIBUTION }).addTo(art);
  night.on("tileerror", () => {
    if (++nightErrors < 4 || nightFallback) return;
    nightFallback = true;
    art.removeLayer(night);
    loadLand().then(geo => geo && L.geoJSON(geo, { interactive: false, attribution: "Natural Earth",
      style: { color: "#6f9bd6", weight: 0.6, fillColor: "#16304f", fillOpacity: 0.95, className: "land" } }).addTo(art));
  });

  // Mappe dettagliate (da vicino o a scelta)
  map.createPane("labels");
  map.getPane("labels").style.zIndex = 450;
  map.getPane("labels").style.pointerEvents = "none";
  const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  const bases = {
    // Esri "Dark Gray Canvas": gratuita, senza chiave; i nomi dei luoghi sono un livello a parte
    mappa: L.featureGroup([
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 18, maxNativeZoom: 16, className: "tiles-site",
        attribution: "Map &copy; Esri, HERE, Garmin, &copy; OpenStreetMap and the GIS community" }),
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 18, maxNativeZoom: 16, pane: "labels", className: "tiles-labels" })
    ]),
    satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, maxNativeZoom: 18,
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS community" }),
    rilievo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      subdomains: "abc", maxZoom: 18, maxNativeZoom: 17,
      attribution: `${OSM}, SRTM &middot; style &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)` })
  };
  let mode = "mappa";
  try { if (bases[localStorage.getItem("fcph-map")]) mode = localStorage.getItem("fcph-map"); } catch {}
  const DETAIL_ZOOM = 7;   // sotto questo zoom, in modalità "Map", si vede la Terra di notte

  function updateBase() {
    const artistic = mode === "mappa" && landOk && map.getZoom() < DETAIL_ZOOM;
    Object.entries(bases).forEach(([k, layer]) => {
      const want = k === mode && !artistic;
      if (want && !map.hasLayer(layer)) layer.addTo(map).bringToBack();
      if (!want && map.hasLayer(layer)) map.removeLayer(layer);
    });
    if (artistic && !map.hasLayer(art)) art.addTo(map);
    if (!artistic && map.hasLayer(art)) map.removeLayer(art);
    map.getContainer().dataset.base = artistic ? "art" : mode;
    $$(".map-modes [data-mode]", map.getContainer()).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  }
  map.on("zoomend", () => { updateBase(); updateShotDots(); });

  if (interactive) {
    const Modes = L.Control.extend({
      options: { position: "bottomleft" },
      onAdd() {
        const box = L.DomUtil.create("div", "map-modes");
        box.innerHTML = `
          <button type="button" data-mode="mappa" aria-pressed="false">Map</button>
          <button type="button" data-mode="satellite" aria-pressed="false">Satellite</button>
          <button type="button" data-mode="rilievo" aria-pressed="false">Terrain</button>
          <button type="button" class="fit-all" title="Show all my spots" aria-label="Show all my spots">${ICON.globe}</button>`;
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        box.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => {
          mode = b.dataset.mode;
          try { localStorage.setItem("fcph-map", mode); } catch {}
          updateBase();
        }));
        box.querySelector(".fit-all").addEventListener("click", () => fitAllTrips(true));
        return box;
      }
    });
    new Modes().addTo(map);
  }
  updateBase();

  shotLayer = L.layerGroup().addTo(map);
  pinLayers[kind] = L.layerGroup().addTo(map);
  maps[kind] = map;
  drawPins(kind);
  setTimeout(() => { map.invalidateSize(); fitAllTrips(false); }, 60);
  return map;
}


/* =========================================================
   4b. HOME: mappa notturna fissa con astronauti luminosi
   ========================================================= */
const ASTRO_SVG = `<svg viewBox="0 0 40 52" aria-hidden="true">
  <ellipse class="astro-glow" cx="20" cy="48" rx="13" ry="3.6"/>
  <rect x="9" y="22" width="22" height="16" rx="6" fill="#cfd6db"/>
  <rect x="12.5" y="25" width="15" height="12" rx="4" fill="#f4f1ec"/>
  <rect x="17" y="28" width="6" height="4" rx="1" fill="#e7b37a"/>
  <rect x="6.5" y="24" width="5" height="11" rx="2.5" fill="#eceae6"/>
  <rect x="28.5" y="24" width="5" height="11" rx="2.5" fill="#eceae6"/>
  <rect x="13" y="36" width="6" height="9" rx="2.6" fill="#eceae6"/>
  <rect x="21" y="36" width="6" height="9" rx="2.6" fill="#eceae6"/>
  <circle cx="20" cy="14" r="11" fill="#f4f1ec"/>
  <rect x="12" y="9" width="16" height="11" rx="5.5" fill="#0b2635"/>
  <path d="M15 11.5c1.6-1.2 3.6-1.6 5.6-1.3" stroke="#9fd0ff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>
  <circle cx="24.5" cy="16" r="1.2" fill="#e7b37a" opacity=".9"/>
</svg>`;

const NIGHT_TILES = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png";
const NIGHT_ATTRIBUTION = 'Earth at night &copy; <a href="https://earthobservatory.nasa.gov/features/NightLights" target="_blank" rel="noopener">NASA Earth Observatory</a>';
let homeMap = null;
let homeCycle = null;

function createHomeMap() {
  if (homeMap || !window.L) return homeMap;
  const map = L.map("homeMap", {
    zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    touchZoom: false, boxZoom: false, keyboard: false, tap: false, zoomSnap: 0, inertia: false, fadeAnimation: true
  });
  map.attributionControl.setPrefix(false);
  homeMap = map;

  // Terra di notte (NASA Black Marble). Se non risponde, uso i continenti disegnati.
  let errors = 0, fallback = false;
  const night = L.tileLayer(NIGHT_TILES, {
    maxNativeZoom: 8, maxZoom: 10, noWrap: true, className: "tiles-night", bounds: [[-85, -180], [85, 180]], attribution: NIGHT_ATTRIBUTION
  }).addTo(map);
  night.on("tileerror", () => {
    if (++errors < 4 || fallback) return;
    fallback = true;
    map.removeLayer(night);
    loadLand().then(geo => geo && L.geoJSON(geo, { interactive: false, attribution: "Natural Earth",
      style: { color: "#8f7650", weight: 0.6, fillColor: "#bfa077", fillOpacity: 0.85, className: "land" } }).addTo(map));
  });

  homeMap._pins = L.layerGroup().addTo(map);
  fitHomeMap();
  map.on("resize", () => fitHomeMap());
  return map;
}

/* La mappa riempie tutto il riquadro (come una foto), centrata sul mondo abitato */
function fitHomeMap() {
  const map = homeMap;
  if (!map) return;
  map.invalidateSize({ pan: false });
  const world = L.latLngBounds([[-56, -168], [76, 190]]);
  const zoom = Math.max(map.getBoundsZoom(world, true), 1);   // "true": la mappa copre tutto il riquadro, senza bordi vuoti
  const narrow = map.getSize().x < 700;
  const center = narrow ? [14, 12] : [10, 11];               // gli spot (Europa) restano in alto, sopra al titolo
  map.setView(center, zoom, { animate: false });
  drawHomePins();
}

/* Astronauti: quelli troppo vicini per stare separati diventano uno solo con il numero */
function drawHomePins() {
  const map = homeMap;
  if (!map || !map._pins) return;
  map._pins.clearLayers();
  const spots = trips.filter(t => photosOfTrip(t.id).length);
  const groups = [];
  spots.forEach(t => {
    const pt = map.latLngToContainerPoint([t.lat, t.lon]);
    const g = groups.find(g => g.pt.distanceTo(pt) < 46);
    if (g) { g.trips.push(t); } else groups.push({ pt, trips: [t] });
  });
  groups.forEach((g, i) => {
    const lat = g.trips.reduce((s, t) => s + t.lat, 0) / g.trips.length;
    const lon = g.trips.reduce((s, t) => s + t.lon, 0) / g.trips.length;
    const n = g.trips.length;
    const label = n === 1 ? g.trips[0].name : `${n} spots · ${g.trips.map(t => t.name).join(", ")}`;
    const m = L.marker([lat, lon], {
      icon: L.divIcon({ className: "", iconSize: [40, 52], iconAnchor: [20, 48], tooltipAnchor: [0, -44],
        html: `<div class="home-astro" style="--d:${(i * 0.7) % 3}s">${ASTRO_SVG}${n > 1 ? `<span class="astro-count">${n}</span>` : ""}</div>` }),
      title: label, keyboard: true, riseOnHover: true
    }).addTo(map._pins);
    m.bindTooltip(n === 1 ? esc(g.trips[0].name) : `${n} spots<br><small>${g.trips.map(t => esc(t.name)).join(" · ")}</small>`, { direction: "top" });
    m.on("click", () => {
      location.hash = "explore";
      setTimeout(() => {
        if (n === 1) return openTrip(g.trips[0].id);
        const em = maps.explore;
        if (em) em.flyToBounds(L.latLngBounds(g.trips.map(t => [t.lat, t.lon])).pad(0.2), { ...mapPadding(), maxZoom: 9, duration: 1 });
      }, 120);
    });
  });
  startHomeCycle(spots);
  drawHomeNews();
}

/* ---------- Novità: astronavi con la scia sulla mappa della home, per 5 giorni dall'inserimento ---------- */
const NEWS_DAYS = 5;
const SHIP_SVG = `<svg viewBox="0 0 32 16" aria-hidden="true"><path d="M2 8c3-3.6 9-5.4 17-5.4 5 0 9 2.4 11 5.4-2 3-6 5.4-11 5.4C11 13.4 5 11.6 2 8z" fill="#0b1626"/><path d="M2 8c3-3.6 9-5.4 17-5.4 5 0 9 2.4 11 5.4-2 3-6 5.4-11 5.4C11 13.4 5 11.6 2 8z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="21" cy="8" r="2.2" fill="currentColor"/><path d="M8 3.6 5 0.8M8 12.4 5 15.2" stroke="currentColor" stroke-width="1.2"/></svg>`;
let homeWorkshops = null;
const isFresh = iso => { const t = Date.parse(iso || ""); return Number.isFinite(t) && Date.now() - t <= NEWS_DAYS * 864e5 && t <= Date.now() + 864e5; };
async function loadHomeWorkshops() {
  if (homeWorkshops) return homeWorkshops;
  homeWorkshops = [];
  try {
    if (typeof SPOTS_CONFIG === "undefined" || !SPOTS_CONFIG.url) return homeWorkshops;
    const res = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/rest/v1/public_workshops?select=id,name,lat,lon,starts_on,ends_on,ws_price,ws_currency,places_left,offer,ws_link,created_at`,
      { headers: { apikey: SPOTS_CONFIG.anonKey } });
    if (res.ok) homeWorkshops = await res.json();
  } catch {}
  return homeWorkshops;
}
function newsItems() {
  const items = [];
  articles.forEach(a => {
    const when = addedOn.articoli?.[a.id] || (a.date ? a.date + "T12:00:00" : "");
    if (!isFresh(when)) return;
    const t = a.trip && tripById(a.trip);
    const pos = t || (HOME_BASE && Number.isFinite(HOME_BASE.lat) ? HOME_BASE : null);
    if (pos) items.push({ kind: "article", when, lat: pos.lat, lon: pos.lon, label: `New in the Journal`, title: a.title, go: () => { location.hash = `art-${a.id}`; } });
  });
  trips.forEach(t => {
    const fresh = photos.filter(p => p.trip === t.id && isFresh(addedOn.foto?.[p.raw]));
    if (!fresh.length) return;
    const when = fresh.map(p => addedOn.foto[p.raw]).sort().pop();
    items.push({ kind: "photos", when, lat: t.lat, lon: t.lon, label: fresh.length === 1 ? "New photo" : `${fresh.length} new photos`, title: t.name,
      go: () => { location.hash = "explore"; setTimeout(() => openTrip(t.id), 120); } });
  });
  (homeWorkshops || []).forEach(w => {
    if (!isFresh(w.created_at)) return;
    const date = w.starts_on ? fmtDate(w.starts_on) : "";
    items.push({ kind: "workshop", when: w.created_at, lat: +w.lat, lon: +w.lon, label: w.offer ? `Workshop offer · ${w.offer}` : "New workshop",
      title: `${w.name}${date ? ` · ${date}` : ""}${w.places_left != null ? ` · ${w.places_left} places left` : ""}`,
      go: () => { if (w.ws_link && /^https?:\/\//.test(w.ws_link)) window.open(w.ws_link, "_blank", "noopener"); else location.hash = "spots"; } });
  });
  return items.filter(i => Number.isFinite(i.lat) && Number.isFinite(i.lon)).sort((a, b) => String(b.when).localeCompare(String(a.when)));
}
async function drawHomeNews() {
  const map = homeMap;
  if (!map) return;
  if (!homeWorkshops) { await loadHomeWorkshops(); }
  if (!map._news) map._news = L.layerGroup().addTo(map);
  map._news.clearLayers();
  const items = newsItems();
  items.forEach((it, i) => {
    const m = L.marker([it.lat, it.lon], { zIndexOffset: 2000, keyboard: true, title: `${it.label}: ${it.title}`,
      icon: L.divIcon({ className: "", iconSize: [64, 64], iconAnchor: [32, 32], tooltipAnchor: [0, -26],
        html: `<div class="ship ship-${it.kind}" style="--d:${-i * 2.3}s;--r:${22 + (i % 3) * 5}px"><div class="ship-orbit"><span class="ship-craft"><span class="ship-trail"></span>${SHIP_SVG}</span></div><span class="ship-dot"></span></div>` })
    }).addTo(map._news);
    m.bindTooltip(`<b class="news-kind">${esc(it.label)}</b><br>${esc(it.title)}`, { direction: "top", className: "news-tip" });
    m.on("click", () => { window.fcTrack?.(`Home news: ${it.kind}`); it.go(); });
  });
  renderNewsTicker(items);
}
let newsTimer = 0;
function renderNewsTicker(items) {
  const box = $("#heroNews"), tags = $(".hero-tags");
  clearInterval(newsTimer);
  if (!box) return;
  box.hidden = !items.length;
  if (tags) tags.hidden = !!items.length;
  if (!items.length) return;
  let i = 0;
  const show = () => {
    const it = items[i % items.length];
    box.innerHTML = `<span class="news-badge"><span class="news-pulse" aria-hidden="true"></span>New</span>
      <button type="button" class="news-item news-${it.kind}"><small>${esc(it.label)}</small><b>${esc(it.title)}</b></button>`;
    box.querySelector("button").addEventListener("click", () => { window.fcTrack?.(`Home news: ${it.kind}`); it.go(); });
    i++;
  };
  show();
  if (items.length > 1) newsTimer = setInterval(show, 5000);
}

/* In basso a sinistra scorrono nome e coordinate degli spot, come nel mockup */
function startHomeCycle(spots) {
  clearInterval(homeCycle);
  const show = t => {
    $("#heroPlace").textContent = (t ? t.name : "Earth").toUpperCase();
    $("#heroCoord").textContent = t ? fmtCoord(t.lat, t.lon).replace("  |  ", " · ") : "";
  };
  if (!spots.length) return show(null);
  let i = 0;
  show(spots[0]);
  if (spots.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches)
    homeCycle = setInterval(() => show(spots[++i % spots.length]), 4000);
}

/* Margini per non coprire i punti col riquadro del viaggio (a destra, su schermi larghi) */
function mapPadding() {
  const wide = window.innerWidth > 900;
  const panel = $("#locationPanel");
  const right = wide && panel ? panel.offsetWidth + 40 : 40;
  return { paddingTopLeft: [60, 60], paddingBottomRight: [right, 60] };
}
/* Inquadra tutti i viaggi */
function fitAllTrips(animate) {
  const map = maps.explore;
  const pts = trips.filter(t => photosOfTrip(t.id).length).map(t => [t.lat, t.lon]);
  if (!map || !pts.length) return;
  map.fitBounds(L.latLngBounds(pts), { ...mapPadding(), maxZoom: 7, animate });
}

/* Punti dei singoli scatti (con coordinate proprie), visibili da vicino */
let shotLayer = null;
const SHOT_ZOOM = 8;
function updateShotDots() {
  const map = maps.explore;
  if (!map || !shotLayer) return;
  shotLayer.clearLayers();
  if (map.getZoom() < SHOT_ZOOM) return;
  photos.filter(p => p.ownCoords).forEach(p => {
    const t = tripById(p.trip);
    if (t && distKm(t, p) < 0.05) return;
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: '<div class="shot-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), title: p.title, keyboard: true })
      .addTo(shotLayer)
      .bindTooltip(p.title, { direction: "top", offset: [0, -6] })
      .on("click", () => openTrip(p.trip, p.id));
  });
}

function drawPins(kind) {
  const map = maps[kind], layer = pinLayers[kind];
  if (!map || !layer) return;
  layer.clearLayers();
  trips.forEach(t => {
    if (!photosOfTrip(t.id).length) return;
    if (distKm(t, HOME_BASE) > 50)
      L.polyline(curve(HOME_BASE, t), { color: "#bcdcff", weight: 1.1, opacity: 0.5, dashArray: "2 7", interactive: false }).addTo(layer);
  });
  trips.forEach(t => {
    if (!photosOfTrip(t.id).length) return;
    const m = L.marker([t.lat, t.lon], { icon: pinIcon(kind === "explore" && t.id === activeTripId), title: t.name, keyboard: true, riseOnHover: true }).addTo(layer);
    m.bindTooltip(t.name, { direction: "top" });
    m.on("click", () => {
      if (kind === "home") { location.hash = "explore"; setTimeout(() => openTrip(t.id), 60); }
      else openTrip(t.id);
    });
  });
  if (kind === "explore") updateShotDots();
}

/* =========================================================
   5. EXPLORE: pannello del viaggio
   ========================================================= */
let carouselIndex = 0;

function renderPanelIntro() {
  activeTripId = null;
  const list = trips.filter(t => photosOfTrip(t.id).length)
    .sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  $("#locationPanel").innerHTML = `
    <span class="eyebrow">SELECT A LOCATION</span>
    <h2 class="intro-title">Where I've been</h2>
    <p class="trip-desc">${list.length ? "Tap an astronaut on the map, or pick a journey from the list." : "The first journeys are coming soon."}</p>
    <ul class="trip-list">${list.map(t => `
      <li><button type="button" data-trip="${esc(t.id)}"><strong>${esc(t.name)}</strong><small>${esc(fmtRange(t.start, t.end))}</small></button></li>`).join("")}
    </ul>`;
  $$("#locationPanel [data-trip]").forEach(b => b.addEventListener("click", () => openTrip(b.dataset.trip)));
  drawPins("explore");
}

function openTrip(id, photoId) {
  const t = tripById(id);
  if (!t) return;
  const items = photosOfTrip(id);
  activeTripId = id;
  carouselIndex = Math.max(0, items.findIndex(p => p.id === photoId));
  const article = t.article && articles.find(a => a.id === t.article);
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lon}`;

  $("#locationPanel").innerHTML = `
    <div class="panel-head">
      <div><span class="eyebrow">PHOTO LOCATION</span><h2>${esc(t.name)}</h2></div>
      <button class="panel-close" type="button" id="closeLocation" aria-label="Close journey">${ICON.close}</button>
    </div>
    <p class="coords">${ICON.pin}${fmtCoord(t.lat, t.lon)}</p>
    <div class="carousel">
      <img id="carouselImg" alt="" data-cat="">
      ${items.length > 1 ? `<button class="nav-arrow prev" type="button" id="carPrev" aria-label="Previous photo">${ICON.prev}</button>
      <button class="nav-arrow next" type="button" id="carNext" aria-label="Next photo">${ICON.next}</button>` : ""}
    </div>
    <div class="thumbs">${items.slice(0, 8).map((p, i) => `
      <button type="button" data-i="${i}" aria-label="Show ${esc(p.title)}"><img src="${esc(p.src)}" alt="" data-cat="${esc(p.category)}" loading="lazy"></button>`).join("")}
    </div>
    <p class="shot-row" id="shotRow"></p>
    <p class="trip-facts"><span>${ICON.cal}${esc(fmtRange(t.start, t.end))}</span><span>${ICON.img}${items.length} ${items.length === 1 ? "photo" : "photos"}</span></p>
    <p class="trip-desc">${esc(t.description || "A place from my photographic archive.")}</p>
    <div class="panel-actions">
      <button class="outline-link" type="button" id="viewPlacePhotos">VIEW PHOTOS <span aria-hidden="true">→</span></button>
      <div class="panel-links">
        ${article ? `<a class="text-link" href="#art-${esc(article.id)}">${ICON.book}Read the story</a>` : ""}
        <a class="text-link" href="${gmaps}" target="_blank" rel="noopener">${ICON.ext}Open in Google Maps</a>
      </div>
    </div>`;

  const show = i => {
    if (!items.length) return;
    carouselIndex = (i + items.length) % items.length;
    const p = items[carouselIndex], img = $("#carouselImg");
    delete img.dataset.fallback;
    img.dataset.cat = p.category;
    img.alt = p.title;
    img.src = p.src;
    $$("#locationPanel .thumbs button").forEach((b, k) => b.classList.toggle("is-current", k === carouselIndex));
    $("#shotRow").innerHTML = `<span class="shot-label">This photo</span>` + photoCoordsHtml(p);
    showPhotoMarker(p);
  };
  show(carouselIndex);
  $("#carPrev")?.addEventListener("click", () => show(carouselIndex - 1));
  $("#carNext")?.addEventListener("click", () => show(carouselIndex + 1));
  $$("#locationPanel .thumbs button").forEach(b => b.addEventListener("click", () => show(+b.dataset.i)));
  $("#carouselImg").addEventListener("click", () => items[carouselIndex] && openPhoto(items[carouselIndex].id, items));
  $("#closeLocation").addEventListener("click", () => { photoMarker?.remove(); photoMarker = null; renderPanelIntro(); });
  $("#viewPlacePhotos").addEventListener("click", () => {
    gallery.trip = id; gallery.category = "Tutte";
    location.hash = "gallery";
  });

  const map = maps.explore;
  if (map) {
    drawPins("explore");
    const pts = [[t.lat, t.lon], ...items.filter(p => p.ownCoords).map(p => [p.lat, p.lon])];
    const target = items[carouselIndex];
    if (photoId && target && target.ownCoords) pts.splice(0, pts.length, [t.lat, t.lon], [target.lat, target.lon]);
    map.flyToBounds(L.latLngBounds(pts).pad(0.05), { ...mapPadding(), maxZoom: 13, duration: 1.1 });
  }
  if (window.innerWidth <= 900) $("#locationPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* =========================================================
   6. GALLERY + LIGHTBOX
   ========================================================= */
const gallery = { category: "Tutte", trip: null };

function galleryItems() {
  return photos
    .filter(p => gallery.category === "Tutte" || p.category === gallery.category)
    .filter(p => !gallery.trip || p.trip === gallery.trip)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function renderGallery() {
  const items = galleryItems();
  $$(".filter").forEach(b => b.classList.toggle("active", b.dataset.filter === gallery.category));
  const chip = $("#tripChip"), t = gallery.trip && tripById(gallery.trip);
  chip.hidden = !t;
  if (t) {
    chip.innerHTML = `${esc(t.name)} <button type="button" aria-label="Show all places">${ICON.close}</button>`;
    chip.querySelector("button").addEventListener("click", () => { gallery.trip = null; renderGallery(); });
  }
  const tr = s => window.I18N ? I18N.t(s) : s;
  $("#photoCount").textContent = items.length === 1 ? tr("1 photograph") : tr("{n} photographs").replace("{n}", items.length);
  $("#photoGrid").innerHTML = items.map(p => `
    <div class="photo-cell">
      <button class="photo-card" type="button" data-id="${esc(p.id)}">
        <img src="${esc(p.src)}" alt="${esc(p.title)}" data-cat="${esc(p.category)}" loading="lazy">
        <span class="photo-info"><h3>${esc(p.title)}</h3><small>${esc(tripById(p.trip)?.name || "")} · ${esc(catLabel(p.category))}</small></span>
      </button>
      <button class="photo-pick" type="button" data-pick="${esc(p.id)}" aria-pressed="${picks.has(p.id)}" aria-label="Add “${esc(p.title)}” to your selection" title="Add to your selection">${ICON_PICK}</button>
    </div>`).join("");
  $("#galleryEmpty").hidden = items.length > 0;
  $$("#photoGrid .photo-card").forEach(el => el.addEventListener("click", () => openPhoto(el.dataset.id, items)));
  $$("#photoGrid [data-pick]").forEach(el => el.addEventListener("click", () => togglePick(el.dataset.pick)));
  renderPickBar();
}

let lightboxList = [], lightboxIndex = 0;

/* Aggiunge al riquadro della foto: coordinate, contatore e pulsante schermo intero */
function setupLightbox() {
  const d = $("#photoDialog");
  d.classList.add("lightbox-full");
  $("#dialogMeta").insertAdjacentHTML("afterend", `<p class="lightbox-coords" id="dialogCoords"></p>`);
  const tools = document.createElement("div");
  tools.className = "lightbox-tools";
  tools.innerHTML = `<span class="lightbox-count" id="dialogCount"></span>
    <button class="lightbox-btn" type="button" id="dialogInfo" aria-label="Hide details" title="Show/hide details (I)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg></button>
    <button class="lightbox-btn" type="button" id="dialogRotate" aria-label="Rotate photo" title="Rotate (R)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg></button>
    <button class="lightbox-btn" type="button" id="dialogFull" aria-label="Full screen" title="Full screen (F)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>`;
  d.prepend(tools);
  const close = $("#dialogClose");
  tools.appendChild(close);   // tutti i pulsanti in alto a destra, in fila
  if (!(d.requestFullscreen || d.webkitRequestFullscreen)) $("#dialogFull").hidden = true;
}
function toggleInfo(force) {
  const d = $("#photoDialog");
  const hide = force ?? !d.classList.contains("info-hidden");
  d.classList.toggle("info-hidden", hide);
  $("#dialogInfo").setAttribute("aria-label", hide ? "Show details" : "Hide details");
}
function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
/* Ruotare la foto: sul telefono, se il sistema lo consente, si gira davvero lo schermo (Android a schermo intero);
   altrimenti (iPhone o rotazione bloccata) si gira la foto di 90° dentro lo schermo. */
const isTouch = () => matchMedia("(pointer: coarse)").matches;
async function rotatePhoto() {
  const d = $("#photoDialog"), so = screen.orientation;
  if (isTouch() && so?.lock) {
    try {
      if (!isFullscreen()) await (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
      await so.lock(so.type.startsWith("portrait") ? "landscape" : "portrait");
      d.classList.remove("rot-90");
      return;
    } catch { /* non permesso: si ruota la foto */ }
  }
  d.classList.toggle("rot-90");
  toggleInfo(d.classList.contains("rot-90") ? true : undefined);
}
function toggleFullscreen() {
  const d = $("#photoDialog");
  try {
    if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (d.requestFullscreen || d.webkitRequestFullscreen).call(d)?.catch?.(() => {});
  } catch {}
}
function openPhoto(id, list = photos) {
  trackEvent("Gallery: open photo");
  lightboxList = list;
  lightboxIndex = Math.max(0, list.findIndex(p => p.id === id));
  showLightbox();
  const d = $("#photoDialog");
  d.classList.remove("rot-90");
  // sul telefono in orizzontale: solo la foto, a tutto schermo
  toggleInfo(isTouch() && matchMedia("(orientation: landscape)").matches);
  if (!d.open) d.showModal();
  if (isTouch() && !isFullscreen()) { try { (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d)?.catch?.(() => {}); } catch {} }
  document.documentElement.classList.add("no-scroll");
  renderPickBar();
}
function showLightbox() {
  const p = lightboxList[lightboxIndex];
  if (!p) return;
  const img = $("#dialogImage");
  delete img.dataset.fallback;
  img.dataset.cat = p.category;
  img.alt = p.title;
  img.src = p.src;
  $("#dialogTitle").textContent = p.title;
  $("#dialogCategory").textContent = catLabel(p.category);
  $("#dialogMeta").textContent = [tripById(p.trip)?.name, p.date ? fmtDate(p.date) : ""].filter(Boolean).join(" · ");
  $("#dialogCoords").innerHTML = photoCoordsHtml(p);
  $("#dialogCount").textContent = lightboxList.length > 1 ? `${lightboxIndex + 1} / ${lightboxList.length}` : "";
  $("#dialogDescription").textContent = p.description || "";
  const many = lightboxList.length > 1;
  $("#dialogPrev").hidden = $("#dialogNext").hidden = !many;
  renderInterest(p);
}

/* «Ti interessa questa foto? Contattami»: stampe e licenze, via email o Instagram */
function renderInterest(p) {
  const box = $("#photoInterest");
  if (!box) return;
  const ig = String(about.instagram || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  const mail = String(about.email || "").trim();
  if (!ig && !/^[^\s@]+@[^\s@]+$/.test(mail)) { box.hidden = true; return; }
  const subject = encodeURIComponent(`About your photo “${p.title}”`);
  const body = encodeURIComponent(`Hi Fabio,\n\nI'm interested in your photo “${p.title}”${tripById(p.trip)?.name ? ` (${tripById(p.trip).name})` : ""}.\nhttps://fabiocostaph.com/#gallery\n\nI'd like to know more about: [a print / using it / something else]\n\nThanks!`);
  box.hidden = false;
  box.classList.remove("open");
  box.innerHTML = `
    <div class="pi-row">
      <button type="button" class="pi-toggle" aria-expanded="false">${ICON_SPARK}<span>Interested in this photo?</span></button>
      <button type="button" class="pi-pick" data-pick-lb="${esc(p.id)}" aria-pressed="${picks.has(p.id)}">${ICON_PICK}<span>${picks.has(p.id) ? "In your selection" : "Add to selection"}</span></button>
    </div>
    <div class="pi-panel">
      <p><strong>Prints, licensing or a special use?</strong> Get in touch and tell me what you have in mind.</p>
      <div class="pi-actions">
        ${mail ? `<a class="outline-link" href="mailto:${esc(mail)}?subject=${subject}&body=${body}">${ICON_MAIL}<span>Email me</span></a>` : ""}
        ${ig ? `<a class="outline-link" href="https://ig.me/m/${encodeURIComponent(ig)}" target="_blank" rel="noopener">${ICON_IG}<span>Message on Instagram</span></a>` : ""}
      </div>
    </div>`;
  const t = box.querySelector(".pi-toggle");
  t.addEventListener("click", e => {
    e.stopPropagation();
    const open = !box.classList.contains("open");
    box.classList.toggle("open", open); t.setAttribute("aria-expanded", String(open));
    if (open) trackEvent("Gallery: interested in photo");
  });
  box.querySelectorAll(".pi-actions a").forEach(a => a.addEventListener("click", e => {
    e.stopPropagation();
    trackEvent(a.href.startsWith("mailto:") ? "Gallery: photo enquiry by email" : "Gallery: photo enquiry on Instagram");
  }));
  box.querySelector("[data-pick-lb]").addEventListener("click", e => { e.stopPropagation(); togglePick(p.id); renderInterest(p); });
  box.addEventListener("click", e => e.stopPropagation());   // non chiude la foto né cambia immagine
}

/* =========================================================
   SELEZIONE DI FOTO: chi visita sceglie più foto e manda un'unica richiesta (licenza o stampa)
   ========================================================= */
const PICK_KEY = "fcph-photo-selection";
const picks = new Set((() => { try { return JSON.parse(localStorage.getItem(PICK_KEY) || "[]"); } catch { return []; } })());
const savePicks = () => { try { localStorage.setItem(PICK_KEY, JSON.stringify([...picks])); } catch {} };
function togglePick(id) {
  if (picks.has(id)) picks.delete(id); else { picks.add(id); trackEvent("Gallery: photo added to selection"); }
  savePicks();
  $$(`[data-pick="${CSS.escape(id)}"]`).forEach(b => b.setAttribute("aria-pressed", String(picks.has(id))));
  renderPickBar();
}
function pickedPhotos() { return [...picks].map(id => photos.find(p => p.id === id)).filter(Boolean); }
function renderPickBar() {
  let bar = $("#pickBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "pickBar"; bar.className = "pick-bar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Your photo selection");
    document.body.appendChild(bar);
  }
  const list = pickedPhotos();
  const show = list.length > 0 && (document.body.dataset.page === "gallery" || $("#photoDialog")?.open);
  bar.hidden = !show;
  if (!show) return;
  bar.innerHTML = `
    <div class="pick-thumbs">${list.slice(0, 4).map(p => `<img src="${esc(p.src)}" alt="">`).join("")}</div>
    <p><strong>${list.length} photo${list.length > 1 ? "s" : ""}</strong> in your selection</p>
    <button type="button" class="text-link" id="pickClear">Clear</button>
    <button type="button" class="outline-link pick-go" id="pickSend">REQUEST LICENCE OR PRINTS <span aria-hidden="true">→</span></button>`;
  $("#pickClear").onclick = () => { picks.clear(); savePicks(); $$("[data-pick]").forEach(b => b.setAttribute("aria-pressed", "false")); renderPickBar(); };
  $("#pickSend").onclick = openPickRequest;
}
function openPickRequest() {
  let d = $("#pickDialog");
  if (!d) {
    d = document.createElement("dialog"); d.id = "pickDialog"; d.className = "pick-dialog";
    document.body.appendChild(d);
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
  }
  const list = pickedPhotos();
  const ig = String(about.instagram || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  const mail = String(about.email || "").trim(), okMail = /^[^\s@]+@[^\s@]+$/.test(mail);
  d.innerHTML = `
    <button class="dialog-close" type="button" data-close aria-label="Close">${ICON.close}</button>
    <form class="pick-form" novalidate>
      <span class="eyebrow">Licensing &amp; prints</span>
      <h2>Your selection</h2>
      <ul class="pick-list">${list.map(p => `<li><img src="${esc(p.src)}" alt=""><span><strong>${esc(p.title)}</strong><small>${esc([tripById(p.trip)?.name, catLabel(p.category)].filter(Boolean).join(" · "))}</small></span>
        <button type="button" class="pick-remove" data-unpick="${esc(p.id)}" aria-label="Remove ${esc(p.title)}">${ICON.close}</button></li>`).join("")}</ul>
      <fieldset class="pick-use"><legend>What would you like?</legend>
        ${["Fine-art prints", "Editorial licence", "Commercial licence", "Not sure yet"].map((u, i) => `<label><input type="checkbox" name="use" value="${u}"${i === 0 ? "" : ""}> ${u}</label>`).join("")}
      </fieldset>
      <label class="pick-msg">Anything else? <small>(sizes, quantity, where you'd use them…)</small>
        <textarea name="msg" rows="3" maxlength="1200"></textarea></label>
      <div class="pick-actions">
        ${okMail ? `<button type="submit" class="outline-link" data-via="email">${ICON_MAIL}<span>Send by email</span></button>` : ""}
        ${ig ? `<button type="button" class="outline-link" data-via="instagram">${ICON_IG}<span>Send on Instagram</span></button>` : ""}
      </div>
      <p class="pick-note" role="status"></p>
    </form>`;
  d.querySelector("[data-close]").onclick = () => d.close();
  d.querySelectorAll("[data-unpick]").forEach(b => b.addEventListener("click", () => { togglePick(b.dataset.unpick); if (picks.size) openPickRequest(); else d.close(); }));
  const f = d.querySelector("form");
  const compose = () => {
    const uses = [...f.querySelectorAll("[name=use]:checked")].map(x => x.value);
    return `Hi Fabio,\n\nI'm interested in these photographs from fabiocostaph.com:\n\n${list.map((p, i) => `${i + 1}. ${p.title}${tripById(p.trip)?.name ? ` (${tripById(p.trip).name})` : ""}`).join("\n")}\n\n`
      + (uses.length ? `For: ${uses.join(", ")}\n\n` : "") + (f.msg.value.trim() ? f.msg.value.trim() + "\n\n" : "") + "Thanks!";
  };
  f.addEventListener("submit", e => {
    e.preventDefault();
    trackEvent("Gallery: selection sent by email", { photos: list.length });
    location.href = `mailto:${mail}?subject=${encodeURIComponent(`Photo request — ${list.length} photo${list.length > 1 ? "s" : ""}`)}&body=${encodeURIComponent(compose())}`;
  });
  d.querySelector("[data-via=instagram]")?.addEventListener("click", async () => {
    const note = d.querySelector(".pick-note");
    try { await navigator.clipboard.writeText(compose()); note.textContent = "Your request is copied: paste it in the Instagram chat that just opened."; }
    catch { note.textContent = "Open the chat and list the photo titles in your message."; }
    trackEvent("Gallery: selection sent on Instagram", { photos: list.length });
    window.open(`https://ig.me/m/${encodeURIComponent(ig)}`, "_blank", "noopener");
  });
  if (!d.open) d.showModal();
}
function stepLightbox(d) {
  lightboxIndex = (lightboxIndex + d + lightboxList.length) % lightboxList.length;
  showLightbox();
}

/* =========================================================
   7. JOURNAL
   ========================================================= */
function articleMeta(a, withIcons = true) {
  return `<span>${withIcons ? ICON.cal : ""}${esc(fmtDate(a.date))}</span>${a.minutes ? `<span>${withIcons ? ICON.clock : ""}${a.minutes} min read</span>` : ""}`;
}
function renderJournal() {
  const layout = $("#journalLayout");
  layout.hidden = false;
  const list = [...articles].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const topics = [...new Set(list.map(a => a.category))];
  const cur = renderJournal.topic && topics.includes(renderJournal.topic) ? renderJournal.topic : "";
  renderTopics(topics, cur);
  if (!list.length) {
    layout.innerHTML = `<div class="fn-empty"><p class="fn-cat">Coming soon</p><h2>The first issue is being written.</h2>
      <p>Reportage, places, current affairs, photography and technique — and practical guides: when to go, where to park, how long the walk is and the mistakes to avoid.</p></div>`;
    return;
  }
  const shown = cur ? list.filter(a => a.category === cur) : list;
  layout.innerHTML = `<div class="fn-list">${shown.map((a, i) => `
    <a class="fn-entry" href="#art-${esc(a.id)}">
      <div class="fn-num">${String(i + 1).padStart(2, "0")}</div>
      <div class="fn-copy">
        <p class="fn-cat">${a.type === "reportage" ? "Reportage" : esc(catLabel(a.category))}</p>
        <h2>${esc(a.title)}</h2>
        ${a.excerpt ? `<p class="fn-desc">${esc(a.excerpt)}</p>` : ""}
        <p class="fn-meta">${a.author && !a.author.own ? `By ${esc(a.author.name)} · ` : ""}${esc(fmtDate(a.date))}${a.minutes ? ` · ${a.minutes} min read` : ""}</p>
      </div>
      ${a.cover ? `<img src="${esc(a.cover)}" alt="" data-cat="Paesaggi" loading="lazy">` : `<span class="fn-noimg" aria-hidden="true">Field Notes</span>`}
    </a>`).join("")}</div>`;
}
/* argomenti nella colonna laterale: portano sempre all'indice filtrato */
function renderTopics(topics, cur) {
  const nav = $("#fnTopics");
  if (!nav) return;
  const side = nav.previousElementSibling;
  nav.hidden = side.hidden = topics.length < 2;
  nav.innerHTML = `<a href="#journal" data-topic=""${cur ? "" : ' class="active"'}>All stories</a>` +
    topics.map(t => `<a href="#journal" data-topic="${esc(t)}"${t === cur ? ' class="active"' : ""}>${esc(catLabel(t))}</a>`).join("");
  nav.querySelectorAll("[data-topic]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    renderJournal.topic = el.dataset.topic;
    if (location.hash === "#journal") { $("#articleReader").hidden = true; renderJournal(); } else location.hash = "journal";
    $("#journalMag").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}
const GLANCE = [["periodo", "Best time"], ["arrivare", "Getting there"], ["parcheggio", "Parking"], ["camminata", "The walk"],
  ["difficolta", "Difficulty"], ["permessi", "Permits & rules"], ["attrezzatura", "Gear"], ["impostazioni", "Settings"]];
function glanceHtml(g) {
  const rows = GLANCE.filter(([k]) => g[k] && String(g[k]).trim());
  if (!rows.length) return "";
  return `<aside class="mag-glance"><p class="mag-glance-title">At a glance</p><dl>${rows.map(([k, l]) => `<div><dt>${l}</dt><dd>${esc(g[k])}</dd></div>`).join("")}</dl></aside>`;
}
/* immagini nel testo: la descrizione diventa didascalia; due o più foto di fila diventano una doppia pagina */
function magBody(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const fig = img => {
    const f = document.createElement("figure");
    f.className = "mag-fig";
    const pic = img.cloneNode(true);
    pic.loading = "lazy";
    f.appendChild(pic);
    if (img.alt && img.alt.trim()) { const c = document.createElement("figcaption"); c.textContent = img.alt.trim(); f.appendChild(c); }
    return f;
  };
  // paragrafi fatti solo di foto (anche più foto una sotto l'altra): diventano figure con didascalia
  tpl.content.querySelectorAll("p").forEach(p => {
    const imgs = p.querySelectorAll("img");
    if (imgs.length && p.textContent.trim() === "") p.replaceWith(...[...imgs].map(fig));
  });
  tpl.content.querySelectorAll("img:not(.mag-fig img)").forEach(img => { if (!img.closest(".mag-fig")) img.replaceWith(fig(img)); });
  [...tpl.content.children].forEach(el => {
    if (!el.classList.contains("mag-fig") || el.parentElement?.classList?.contains("mag-spread")) return;
    const run = [el];
    let n = el.nextElementSibling;
    while (n && n.classList.contains("mag-fig")) { run.push(n); n = n.nextElementSibling; }
    if (run.length > 1) {
      const sp = document.createElement("div");
      sp.className = `mag-spread n${Math.min(run.length, 3)}`;
      el.before(sp); run.forEach(f => sp.appendChild(f));
    }
  });
  return tpl.innerHTML;
}
function authorBox(au) {
  return `<aside class="mag-authorbox">
    ${au.photo ? `<img src="${esc(au.photo)}" alt="" loading="lazy">` : `<span class="mag-ap" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3l3.6 6.3M21 12l-7.3 0M16.5 19.8 12.8 13.5M7.5 19.8l3.7-6.3M3 12h7.3M7.5 4.2l3.7 6.3"/></svg></span>`}
    <div><p class="mag-kicker">Contributor</p><b>${esc(au.name)}</b>${au.bio ? `<p>${esc(au.bio)}</p>` : ""}
      <p class="mag-author-links">${au.instagram ? `<a href="https://www.instagram.com/${encodeURIComponent(au.instagram)}/" target="_blank" rel="noopener">Instagram @${esc(au.instagram)}</a>` : ""}${au.site ? `<a href="${esc(au.site)}" target="_blank" rel="noopener">Website</a>` : ""}<a href="#author-${esc(au.slug)}">All stories →</a></p></div>
  </aside>`;
}
function renderAuthor(authorSlug) {
  const reader = $("#articleReader"), list = articles.filter(a => a.author.slug === authorSlug).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!list.length) { location.hash = "journal"; return; }
  const au = list[0].author;
  $("#journalLayout").hidden = true;
  reader.className = "full-article mag-article is-author";
  reader.innerHTML = `<a class="fn-back" href="#journal">← Back to Field Notes</a>
    <p class="fn-kicker">${au.own ? "Editor" : "Contributor"}</p><h1 class="fn-title">${esc(au.name)}</h1>
    ${au.own ? "" : authorBox(au)}
    <p class="fn-section">${list.length} ${list.length === 1 ? "story" : "stories"}</p>
    <div class="fn-list">${list.map((a, i) => `<a class="fn-entry" href="#art-${esc(a.id)}"><div class="fn-num">${String(i + 1).padStart(2, "0")}</div>
      <div class="fn-copy"><p class="fn-cat">${a.type === "reportage" ? "Reportage" : esc(catLabel(a.category))}</p><h2>${esc(a.title)}</h2>${a.excerpt ? `<p class="fn-desc">${esc(a.excerpt)}</p>` : ""}<p class="fn-meta">${esc(fmtDate(a.date))}${a.minutes ? ` · ${a.minutes} min read` : ""}</p></div>
      ${a.cover ? `<img src="${esc(a.cover)}" alt="" data-cat="Paesaggi" loading="lazy">` : `<span class="fn-noimg" aria-hidden="true">Field Notes</span>`}</a>`).join("")}</div>`;
  reader.hidden = false;
  requestAnimationFrame(() => $("#journalMag").scrollIntoView({ behavior: "smooth", block: "start" }));
}
function renderArticle(id) {
  const reader = $("#articleReader"), a = articles.find(x => x.id === id);
  if (!a) { reader.hidden = true; return; }
  const t = a.trip && tripById(a.trip);
  $("#journalLayout").hidden = true;
  reader.className = `full-article mag-article ${a.type === "reportage" ? "is-reportage" : "is-guide"}`;
  reader.innerHTML = articleHtml(a, t);
  reader.insertAdjacentHTML("beforeend", `<div class="article-actions">
      ${t ? `<button class="outline-link" type="button" id="articleTrip">VIEW THE JOURNEY ON THE MAP <span aria-hidden="true">→</span></button>` : ""}
      <a class="fn-back" href="#journal">← Back to Field Notes</a>
    </div><p class="fn-foot">Field Notes / Fabio Costa Ph</p>`);
  reader.hidden = false;
  $("#articleTrip")?.addEventListener("click", () => { location.hash = "explore"; setTimeout(() => openTrip(t.id), 60); });
  requestAnimationFrame(() => $("#journalMag").scrollIntoView({ behavior: "smooth", block: "start" }));
}
/* l'articolo impaginato (usato anche per l'anteprima di «Write for the Journal») */
/* capolettera vero (un elemento, non ::first-letter: nelle due colonne il pseudo-elemento si spezza) */
function dropCap(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const p = [...tpl.content.children].find(el => el.tagName === "P" && el.textContent.trim());
  const walker = p && document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let n = walker?.nextNode();
  while (n && !n.nodeValue.trim()) n = walker.nextNode();
  if (n) {
    const txt = n.nodeValue.replace(/^\s+/, ""), m = txt.match(/^["“‘'(]?\p{L}/u);
    if (m) { const sp = document.createElement("span"); sp.className = "fn-drop"; sp.textContent = m[0]; n.nodeValue = txt.slice(m[0].length); n.before(sp); p.classList.add("fn-first"); }
  }
  return tpl.innerHTML;
}
function articleHtml(a, t, back = true) {
  const rep = a.type === "reportage";
  const caption = t ? `<figcaption>${esc(t.name || "")} · ${fmtCoord(t.lat, t.lon).replace("  |  ", ", ")}</figcaption>` : "";
  const glance = glanceHtml(a.glance);
  return `${back ? `<a class="fn-back" href="#journal">← Back to Field Notes</a>` : ""}
    <p class="fn-kicker">${rep ? "Reportage" : "Field guide"} · ${esc(catLabel(a.category))}${a.place ? ` · ${esc(a.place)}` : ""}</p>
    <h1 class="fn-title">${esc(a.title)}</h1>
    ${a.excerpt ? `<p class="fn-deck">${esc(a.excerpt)}</p>` : ""}
    <p class="fn-byline">Text and photographs by ${authorLink(a)} · ${esc(fmtDate(a.date))}${a.minutes ? ` · ${a.minutes} min read` : ""}</p>
    ${a.cover ? `<figure class="fn-hero"><img src="${esc(a.cover)}" alt="${esc(a.title)}" data-cat="Paesaggi">${caption}</figure>` : ""}
    ${glance}
    <div class="rich mag-body fn-body">${dropCap(magBody(md(a.text)))}</div>
    <p class="fn-end">Thanks for stopping by. Now, let's go explore.</p>` + (a.author && !a.author.own ? authorBox(a.author) : "");
}

/* ---------- articoli dei contributor approvati (Supabase) ---------- */
const TOPIC_OF = { "Attualità": "Attualità", Luoghi: "Luoghi", Viaggi: "Viaggi", Persone: "Persone", Natura: "Natura", Fotografia: "Fotografia", Tecnica: "Tecnica", "Guide pratiche": "Guide pratiche", Ispirazione: "Ispirazione" };
function submissionToArticle(x) {
  const words = String(x.body || "").split(/\s+/).length;
  return { id: `c-${x.slug || x.id}`, title: x.title, category: TOPIC_OF[x.topic] || "Luoghi", date: String(x.published_at || x.updated_at || "").slice(0, 10),
    minutes: Math.max(1, Math.round(words / 220)), cover: x.cover_url || "", trip: "", excerpt: x.excerpt || "", text: x.body || "",
    type: x.kind === "reportage" ? "reportage" : "guide", place: x.place || "", glance: x.glance || {},
    author: (x.author_name || "").trim() === (about?.proprietario || "Fabio Costantini") ? { name: x.author_name, slug: "fabio", own: true }
      : { name: x.author_name, slug: slug(x.author_name), own: false, instagram: x.author_instagram || "", site: x.author_site || "", bio: x.author_bio || "", photo: "" } };
}
async function loadCommunityArticles() {
  if (typeof SPOTS_CONFIG === "undefined" || !SPOTS_CONFIG.url) return;
  try {
    const res = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/rest/v1/journal_submissions?select=id,slug,title,kind,topic,place,excerpt,body,cover_url,glance,author_name,author_instagram,author_site,author_bio,published_at,updated_at&status=eq.published&order=published_at.desc&limit=200`,
      { headers: { apikey: SPOTS_CONFIG.anonKey } });
    if (!res.ok) return;
    const extra = (await res.json()).map(submissionToArticle);
    articles = articles.filter(a => !a.id.startsWith("c-")).concat(extra);
    if (document.body.dataset.page === "journal") route();
  } catch {}
}
/* ---------- THE CREW: schede di contributor, developer e local expert ---------- */
let crewData = null, crewFilter = "all";
const CREW_AP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3l3.6 6.3M21 12l-7.3 0M16.5 19.8 12.8 13.5M7.5 19.8l3.7-6.3M3 12h7.3M7.5 4.2l3.7 6.3"/></svg>';
const CREW_DEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/></svg>';
async function renderCrew() {
  const grid = $("#crewGrid"), filters = $("#crewFilters");
  if (!crewData) {
    try {
      if (typeof SPOTS_CONFIG === "undefined") throw new Error("not configured");
      const res = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/rest/v1/public_crew?select=*&order=articles.desc,since.asc`, { headers: { apikey: SPOTS_CONFIG.anonKey } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      crewData = await res.json();
    } catch { grid.innerHTML = `<p class="empty-state">The crew is being assembled. Come back soon.</p>`; return; }
  }
  const isCo = c => (c.roles || []).some(r => r !== "developer"), isDev = c => (c.roles || []).includes("developer"), isXp = c => !!c.expert_area;
  const F = { all: ["Everyone", () => true], contributors: ["Contributors", isCo], experts: ["Local experts", isXp], developers: ["Developers", isDev] };
  filters.innerHTML = Object.entries(F).map(([k, [l, fn]]) => `<button type="button" class="filter${crewFilter === k ? " active" : ""}" data-crew="${k}">${l} <small>${crewData.filter(fn).length}</small></button>`).join("");
  filters.querySelectorAll("[data-crew]").forEach(b => b.addEventListener("click", () => { crewFilter = b.dataset.crew; renderCrew(); }));
  const list = crewData.filter(F[crewFilter][1]);
  if (!list.length) { grid.innerHTML = `<p class="empty-state">${crewData.length ? "Nobody in this group yet." : "The crew is being assembled: be the first to join."}</p>`; return; }
  const ini = n => String(n || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  grid.innerHTML = list.map(c => {
    const site = /^https?:\/\//.test(c.website || "") ? c.website : "";
    return `<article class="crew-card${isCo(c) ? " is-co" : ""}${isDev(c) && !isCo(c) ? " is-dev" : ""}">
      <div class="crew-avatar" aria-hidden="true">${isCo(c) ? CREW_AP : isDev(c) ? CREW_DEV : `<span>${esc(ini(c.name))}</span>`}</div>
      <h3>${esc(c.name)}</h3>
      <p class="crew-badges">${isCo(c) ? `<span class="co-badge">${CREW_AP}Contributor</span>` : ""}${isDev(c) ? `<span class="co-badge dev-badge">${CREW_DEV}Developer</span>` : ""}${isXp(c) ? `<span class="xp-badge">🧭 ${esc(c.expert_area)}</span>` : ""}</p>
      ${c.base_name ? `<p class="crew-base">${ICON.pin}${esc(c.base_name)}</p>` : ""}
      ${c.bio ? `<p class="crew-bio">${esc(c.bio)}</p>` : ""}
      <p class="crew-links">
        ${c.instagram ? `<a href="https://www.instagram.com/${encodeURIComponent(c.instagram)}/" target="_blank" rel="noopener">Instagram @${esc(c.instagram)}</a>` : ""}
        ${site ? `<a href="${esc(site)}" target="_blank" rel="noopener">${ICON.ext}Website</a>` : ""}
        ${c.articles ? `<a href="#author-${esc(slug(c.name))}">${c.articles} ${c.articles === 1 ? "story" : "stories"} in the Journal →</a>` : ""}
        ${c.on_map ? `<a href="#spots">On the Spots map</a>` : ""}
      </p>
    </article>`;
  }).join("");
}

window.FCJournal = { articleHtml: (a, t) => articleHtml(a, t, false), fromSubmission: submissionToArticle, reload: loadCommunityArticles };
window.addEventListener("load", () => setTimeout(loadCommunityArticles, 50));

/* =========================================================
   8. RICERCA: tuoi luoghi + qualsiasi luogo (OpenStreetMap)
   ========================================================= */
let searchTimer = null, worldController = null;

function openSearch(prefill = "") {
  const d = $("#searchDialog");
  $("#searchInput").value = prefill;
  renderLocalResults(prefill);
  if (!d.open) d.showModal();
  $("#searchInput").focus();
}

function localMatches(q) {
  const n = norm(q);
  if (!n) return { trips: trips.filter(t => photosOfTrip(t.id).length).slice(0, 6), photos: [], articles: [] };
  return {
    trips: trips.filter(t => photosOfTrip(t.id).length && (norm(t.name).includes(n) || norm(t.country).includes(n))),
    photos: photos.filter(p => norm(p.title).includes(n) || norm(p.description).includes(n)).slice(0, 6),
    articles: articles.filter(a => norm(a.title).includes(n) || norm(a.excerpt).includes(n)).slice(0, 4)
  };
}

function renderLocalResults(q) {
  const r = localMatches(q), box = $("#searchResults");
  let html = "";
  if (r.trips.length) html += `<div class="result-group">${q ? "My places" : "Journeys"}</div>` + r.trips.map(t => `
    <button class="result" type="button" data-kind="trip" data-id="${esc(t.id)}"><span class="result-icon">${ICON.pin}</span>
      <span><strong>${esc(t.name)}</strong><small>${esc(fmtRange(t.start, t.end))} · ${photosOfTrip(t.id).length} ${photosOfTrip(t.id).length === 1 ? "photo" : "photos"}</small></span></button>`).join("");
  if (r.photos.length) html += `<div class="result-group">Photographs</div>` + r.photos.map(p => `
    <button class="result" type="button" data-kind="photo" data-id="${esc(p.id)}"><img src="${esc(p.src)}" alt="" data-cat="${esc(p.category)}">
      <span><strong>${esc(p.title)}</strong><small>${esc(tripById(p.trip)?.name || "")} · ${esc(fmtDate(p.date))}</small></span></button>`).join("");
  if (r.articles.length) html += `<div class="result-group">Journal</div>` + r.articles.map(a => `
    <button class="result" type="button" data-kind="article" data-id="${esc(a.id)}"><span class="result-icon">${ICON.book}</span>
      <span><strong>${esc(a.title)}</strong><small>${esc(catLabel(a.category))}${a.minutes ? ` · ${a.minutes} min` : ""}</small></span></button>`).join("");
  if (q.trim().length >= 2) html += `<div class="result-group">Around the world</div>
    <button class="result" type="button" data-kind="world" data-q="${esc(q.trim())}"><span class="result-icon">${ICON.globe}</span>
      <span><strong>Find “${esc(q.trim())}” on the map</strong><small>Any city, mountain or place · OpenStreetMap</small></span></button>
    <div id="worldResults"></div>`;
  if (!html) html = `<p class="search-note">Type the name of a place, a journey or a photo.</p>`;
  box.innerHTML = html;
  $$(".result", box).forEach(b => b.addEventListener("click", () => pickResult(b)));
}

function pickResult(b) {
  const { kind, id } = b.dataset;
  if (kind === "world") return searchWorld(b.dataset.q);
  $("#searchDialog").close();
  if (kind === "trip") { location.hash = "explore"; setTimeout(() => openTrip(id), 60); }
  if (kind === "photo") { const p = photos.find(x => x.id === id); location.hash = "explore"; setTimeout(() => { openTrip(p.trip, p.id); openPhoto(p.id, photosOfTrip(p.trip)); }, 60); }
  if (kind === "article") location.hash = "art-" + id;
  if (kind === "place") flyToPlace(+b.dataset.lat, +b.dataset.lon, b.dataset.name, b.dataset.full);
}

async function geocode(q, limit = 5) {
  worldController?.abort();
  worldController = new AbortController();
  const timer = setTimeout(() => worldController.abort(), 9000);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&accept-language=en&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: worldController.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return (await res.json()).map(r => ({ lat: +r.lat, lon: +r.lon, name: r.name || r.display_name.split(",")[0], full: r.display_name }));
  } finally { clearTimeout(timer); }
}

async function searchWorld(q) {
  const box = $("#worldResults");
  if (!box) return;
  box.innerHTML = `<p class="search-note">Searching for “${esc(q)}”…</p>`;
  try {
    const found = await geocode(q);
    if (!found.length) { box.innerHTML = `<p class="search-note">No place found with this name. Try adding the country, e.g. “Bracciano, Italy”.</p>`; return; }
    box.innerHTML = found.map(r => `
      <button class="result" type="button" data-kind="place" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${esc(r.name)}" data-full="${esc(r.full)}">
        <span class="result-icon">${ICON.map}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.full)}</small></span></button>`).join("");
    $$(".result", box).forEach(b => b.addEventListener("click", () => pickResult(b)));
  } catch (err) {
    if (err.name === "AbortError" && !box.isConnected) return;
    box.innerHTML = `<p class="search-note">Worldwide search is not available right now. You can still search the places on this site.</p>`;
  }
}

function flyToPlace(lat, lon, name, full) {
  location.hash = "explore";
  setTimeout(() => {
    const map = maps.explore;
    if (!map) return;
    searchMarker?.remove();
    const near = trips.filter(t => photosOfTrip(t.id).length).map(t => ({ t, d: distKm(t, { lat, lon }) })).sort((a, b) => a.d - b.d)[0];
    const nearHtml = near && near.d < 300
      ? `<br><button class="text-link" type="button" data-near="${esc(near.t.id)}">Nearby: ${esc(near.t.name)} (${Math.round(near.d)} km) →</button>`
      : "";
    searchMarker = L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div class="search-pin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) })
      .addTo(map)
      .bindPopup(`<strong>${esc(name)}</strong>${esc(full && full !== name ? full.split(",").slice(1, 3).join(",") : "")}<br><span class="muted">No photos here yet.</span>${nearHtml}`)
      .openPopup();
    map.flyTo([lat, lon], 11, { duration: 1.1 });
    searchMarker.getPopup().getElement()?.querySelector("[data-near]")?.addEventListener("click", e => openTrip(e.currentTarget.dataset.near));
  }, 80);
}

/* =========================================================
   9. PAGINA CHI SONO
   ========================================================= */
const ICON_IG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>';
const ICON_PICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.4-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.7-7.5 10.1-7.5 10.1z"/></svg>';
const ICON_SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>';
const ICON_MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>';
function renderContacts() {
  const ig = String(about.instagram || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  const mail = String(about.email || "").trim();
  const html = (ig ? `<a href="https://www.instagram.com/${encodeURIComponent(ig)}/" target="_blank" rel="noopener" aria-label="Instagram @${esc(ig)}">${ICON_IG}<span>@${esc(ig)}</span></a>` : "")
    + (mail && /^[^\s@]+@[^\s@]+$/.test(mail) ? `<a href="mailto:${esc(mail)}" aria-label="Email ${esc(mail)}">${ICON_MAIL}<span>${esc(mail)}</span></a>` : "");
  $$("[data-contact]").forEach(el => { el.innerHTML = html; el.hidden = !html; });
  // avviso in cima alla Gallery: foto disponibili per licenze e stampe
  const note = $("#licenseNote");
  if (note) {
    const okMail = mail && /^[^\s@]+@[^\s@]+$/.test(mail);
    note.hidden = !(okMail || ig);
    const T = s => window.I18N ? I18N.t(s) : s;
    const intro = T("LIC_INTRO") === "LIC_INTRO" ? `<strong>All my photographs are available for licensing</strong>, for editorial and commercial use, and as <strong>fine-art prints</strong>.` : T("LIC_INTRO");
    const write = T("LIC_WRITE") === "LIC_WRITE" ? "For licences and prints, just write to me" : T("LIC_WRITE");
    note.innerHTML = `${ICON_SPARK}<p>${intro}
      ${write}${okMail ? `${T(" at ")}<a href="mailto:${esc(mail)}?subject=${encodeURIComponent("Photo licensing / prints")}" data-lic="email">${esc(mail)}</a>` : ""}${okMail && ig ? T(" or") : ""}${ig ? `${T(" on ")}<a href="https://ig.me/m/${encodeURIComponent(ig)}" target="_blank" rel="noopener" data-lic="instagram">Instagram @${esc(ig)}</a>` : ""}.</p>`;
    note.querySelectorAll("[data-lic]").forEach(a => a.addEventListener("click", () => trackEvent(`Gallery: licensing via ${a.dataset.lic}`)));
  }
}

function renderAbout() {
  $("#aboutTitle").textContent = about.titolo || "";
  $("#aboutIntro").innerHTML = md(about.presentazione);
  $("#aboutInterests").innerHTML = (Array.isArray(about.interessi) ? about.interessi : [])
    .filter(Boolean).map(i => `<li>${esc(i)}</li>`).join("");
  $("#aboutQuote").textContent = about.citazione ? `“${about.citazione}”` : "";
  $("#aboutQuote").hidden = !about.citazione;
  $("#aboutGear").innerHTML = md(about.attrezzatura);
  const img = $("#aboutImage");
  $("#aboutPhoto").hidden = !about.immagine;
  if (about.immagine) { delete img.dataset.fallback; img.src = mediaUrl(about.immagine); }
  renderContacts();
  const owner = (about.proprietario || "Fabio Costantini").trim();
  $$("[data-owner]").forEach(el => (el.textContent = owner));
  $("#metaAuthor")?.setAttribute("content", owner);
  const initials = owner.split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase() || "FC";
  const portrait = $("#aboutPortrait");
  portrait.innerHTML = about.ritratto ? `<img src="${esc(mediaUrl(about.ritratto))}" alt="${esc(owner)}">` : esc(initials);
  // Dati strutturati: dicono a Google chi è il titolare e fotografo del sito
  let ld = document.getElementById("ownerData");
  if (!ld) { ld = document.createElement("script"); ld.type = "application/ld+json"; ld.id = "ownerData"; document.head.appendChild(ld); }
  ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Person", name: owner,
    jobTitle: "Photographer", brand: { "@type": "Brand", name: "Fabio Costa Ph" }, url: location.origin + location.pathname });
}

/* =========================================================
   10. NAVIGAZIONE
   ========================================================= */
const PAGES = ["home", "explore", "gallery", "journal", "tools", "spots", "about", "guide", "privacy", "terms", "crew"];

/* =========================================================
   STATISTICHE (Umami, anonime e senza cookie)
   Il sito usa gli indirizzi con # (es. #explore): ogni sezione viene registrata come una pagina.
   ========================================================= */
const PAGE_TITLES = { home: "Home", explore: "Explore", gallery: "Gallery", journal: "Journal", tools: "Tools", spots: "Spots", about: "About" };
function whenUmami(fn, tries = 0) {
  if (window.umami?.track) { try { fn(window.umami); } catch {} return; }
  if (tries < 40) setTimeout(() => whenUmami(fn, tries + 1), 250);   // lo script arriva dopo: si aspetta fino a 10 s
}
function trackPage(page, extra = "") {
  const url = "/" + (page === "home" ? "" : page) + extra;
  whenUmami(u => u.track(p => ({ ...p, url, title: `Fabio Costa Ph — ${PAGE_TITLES[page] || page}` })));
}
function trackEvent(name, data) { whenUmami(u => u.track(name, data)); }
window.fcTrack = trackEvent;

// clic importanti, riconosciuti da dove avvengono (nessun dato personale)
const CLICK_EVENTS = [
  [".hero-button", "Home: explore the places"],
  [".contact-links a[href*='instagram.com']", "Contact: Instagram"],
  [".contact-links a[href^='mailto:']", "Contact: email"],
  ["a[href*='google.com/maps']", "Open in Google Maps"],
  ["#spotsLogin, #guestJoin, [data-login]", "Spots: log in prompt"],
  ["#spotsAdd", "Spots: add a place"],
  ["[data-addphoto]", "Spots: add photo"],
  ["[data-review]", "Spots: review"],
  ["[data-report]", "Spots: report"],
  ["#osmScan", "Spots: scan this area"],
  ["#spotsLocate", "Spots: near me"],
  ["[data-osmi], [data-addosm]", "Spots: OpenStreetMap place"],
  ["#toolsLocate", "Tools: near me"],
  ["[data-tab]", el => `Tools: tab ${el.dataset.tab}`],
  ["[data-mode]", el => `Planner: ${el.dataset.mode}`],
  ["[data-look]", el => `Planner: look at ${el.dataset.look}`],
  ["#plPlay", "Planner: play"],
  ["#shotAi", "Analyze: AI detect"],
  ["[data-scene]", el => `Analyze: scene ${el.dataset.scene}`]
];
document.addEventListener("click", e => {
  for (const [sel, name] of CLICK_EVENTS) {
    const el = e.target.closest?.(sel);
    if (el) { trackEvent(typeof name === "function" ? name(el) : name); break; }
  }
}, { capture: true, passive: true });
document.addEventListener("change", e => { if (e.target.id === "shotFile" && e.target.files?.length) trackEvent("Analyze: photo loaded"); }, { capture: true });

function route() {
  let hash = decodeURIComponent(location.hash.slice(1));
  let page = hash, article = null;
  if (hash.startsWith("art-")) { page = "journal"; article = hash.slice(4); }
  let authorSlug = null;
  const writeMode = hash === "write";
  if (writeMode) page = "journal";
  if (hash.startsWith("author-")) { page = "journal"; authorSlug = hash.slice(7); }
  const join = hash === "join";
  const guideAnchor = hash.startsWith("guide-") ? hash : null;
  if (guideAnchor) page = "guide";
  if (join) page = "spots";
  if (!PAGES.includes(page)) page = "home";

  const changed = document.body.dataset.page !== page;
  document.body.dataset.page = page;
  setTimeout(renderPickBar, 0);
  const trackKey = page + (article ? "/" + article : "");
  if (trackKey !== route.lastTracked) { route.lastTracked = trackKey; trackPage(page, article ? "/" + article : ""); }
  $$("main > .page").forEach(s => (s.hidden = s.dataset.page !== page));
  $$("#mainNav a").forEach(a => {
    const on = a.dataset.page === page;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $("#mainNav").classList.remove("open");
  $("#menuToggle").setAttribute("aria-expanded", "false");

  if (page === "home") {
    const hm = createHomeMap();
    if (hm) setTimeout(fitHomeMap, 30);
  }
  if (page === "explore") {
    const map = createMap("explore");
    if (map) setTimeout(() => map.invalidateSize(), 30);
    if (!activeTripId) renderPanelIntro();
  }
  if (page === "gallery") renderGallery();
  if (page === "crew") renderCrew();
  if (page === "spots") window.Spots?.show(join);
  if (page === "tools") window.Tools?.show();
  if (page === "journal") {
    if (writeMode) { $("#journalLayout").hidden = true; const r = $("#articleReader"); r.hidden = false; r.className = "full-article mag-article is-write"; window.Spots?.renderWrite?.(r); }
    else if (authorSlug) renderAuthor(authorSlug);
    else if (article) renderArticle(article);
    else { $("#articleReader").hidden = true; renderJournal(); }
  }
  if (guideAnchor) setTimeout(() => document.getElementById(guideAnchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  else if (changed && !article) window.scrollTo(0, 0);
}

function renderAll() {
  renderGallery();
  renderJournal();
  renderAbout();
  drawHomePins();
  if (activeTripId && tripById(activeTripId)) drawPins("explore"); else if (maps.explore) renderPanelIntro();
}

/* =========================================================
   11. AVVIO
   ========================================================= */
function bindEvents() {
  $$(".filter").forEach(b => b.addEventListener("click", () => { gallery.category = b.dataset.filter; renderGallery(); }));
  $("#menuToggle").addEventListener("click", () => {
    const open = $("#mainNav").classList.toggle("open");
    $("#menuToggle").setAttribute("aria-expanded", String(open));
  });

  const dlg = $("#photoDialog");
  setupLightbox();
  $("#dialogClose").addEventListener("click", () => dlg.close());
  $("#dialogFull").addEventListener("click", toggleFullscreen);
  $("#dialogRotate").addEventListener("click", rotatePhoto);
  // quando si gira il telefono: in orizzontale si nascondono i dettagli per lasciare spazio alla foto
  matchMedia("(orientation: landscape)").addEventListener?.("change", e => {
    if (!dlg.open || !isTouch()) return;
    dlg.classList.remove("rot-90");
    toggleInfo(e.matches);
  });
  $("#dialogInfo").addEventListener("click", () => toggleInfo());
  $("#dialogImage").addEventListener("click", () => toggleInfo());          // clic sulla foto: solo immagine
  dlg.addEventListener("close", () => {
    document.documentElement.classList.remove("no-scroll");
    renderPickBar();
    try { screen.orientation?.unlock?.(); } catch {}
    dlg.classList.remove("rot-90");
    if (isFullscreen()) try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch {}
  });
  // scorrimento col dito sul telefono
  let touchX = null;
  dlg.addEventListener("touchstart", e => { touchX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  dlg.addEventListener("touchend", e => {
    if (touchX === null || lightboxList.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
    touchX = null;
  });
  $("#dialogPrev").addEventListener("click", () => stepLightbox(-1));
  $("#dialogNext").addEventListener("click", () => stepLightbox(1));
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
    if (e.key === "f" || e.key === "F") toggleFullscreen();
    if (e.key === "r" || e.key === "R") rotatePhoto();
    if (e.key === "i" || e.key === "I") toggleInfo();
  });
  $("#dialogMapButton").addEventListener("click", () => {
    const p = lightboxList[lightboxIndex];
    dlg.close();
    if (p) { location.hash = "explore"; setTimeout(() => openTrip(p.trip, p.id), 60); }
  });

  const sdlg = $("#searchDialog");
  $("#searchToggle").addEventListener("click", () => openSearch());
  $("#mapSearch").addEventListener("click", () => openSearch());
  $("#searchClose").addEventListener("click", () => sdlg.close());
  sdlg.addEventListener("click", e => { if (e.target === sdlg) sdlg.close(); });
  $("#searchInput").addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderLocalResults(e.target.value), 120);
  });
  $("#searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = $("#searchInput").value.trim();
    if (!q) return;
    const r = localMatches(q);
    renderLocalResults(q);
    if (r.trips.length === 1) { pickResult($('#searchResults .result[data-kind="trip"]')); return; }
    searchWorld(q);
  });
  document.addEventListener("keydown", e => {
    if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault(); openSearch();
    }
  });

  window.addEventListener("hashchange", route);
  window.addEventListener("resize", () => Object.values(maps).forEach(m => m.invalidateSize()));
}

(async function start() {
  $("#year").textContent = new Date().getFullYear();
  bindEvents();
  await loadContent();          // legge content/viaggi.json, articoli.json, chi-sono.json
  if (contentFailed)
    toast("The site content could not be loaded. Please reload the page.", true);
  renderAll();
  route();
})();
