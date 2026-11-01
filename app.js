/* Fabio Costa Ph — app.js
   Viaggi sulla mappa, Gallery, Journal, ricerca luoghi e archivio foto nel browser. */
"use strict";

/* =========================================================
   1. CONTENUTI — si modificano dal pannello Pages CMS (cartella content/)
   ========================================================= */
let HOME_BASE = { name: "Roma", lat: 41.9028, lon: 12.4964 }; // da qui partono le rotte tratteggiate
let trips = [];      // { id, name, country, lat, lon, start, end, description, article }
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* Le categorie restano in italiano nel pannello, sul sito si leggono in inglese */
const CATEGORY_EN = { Paesaggi: "Landscapes", Urban: "Urban", Viaggi: "Travel", Fotografia: "Photography", Tecnica: "Technique", Ispirazione: "Inspiration" };
const catLabel = c => CATEGORY_EN[c] || c || "";
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
  const [v, a, c] = await Promise.allSettled([
    getJSON("content/viaggi.json"), getJSON("content/articoli.json"), getJSON("content/chi-sono.json")
  ]);
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
      photos.push({ id: `${id}-${fi}`, trip: id, title: f.titolo || trip.name, src: mediaUrl(f.immagine),
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
    excerpt: x.estratto || "", text: x.testo || "" }));

  about = c.status === "fulfilled" && c.value ? c.value : {};
  if (about.partenza && Number.isFinite(parseFloat(about.partenza.lat)))
    HOME_BASE = { name: about.partenza.nome || "", lat: num(about.partenza.lat), lon: num(about.partenza.lon) };
}

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
  $("#photoCount").textContent = `${items.length} ${items.length === 1 ? "photograph" : "photographs"}`;
  $("#photoGrid").innerHTML = items.map(p => `
    <button class="photo-card" type="button" data-id="${esc(p.id)}">
      <img src="${esc(p.src)}" alt="${esc(p.title)}" data-cat="${esc(p.category)}" loading="lazy">
      <span class="photo-info"><h3>${esc(p.title)}</h3><small>${esc(tripById(p.trip)?.name || "")} · ${esc(catLabel(p.category))}</small></span>
    </button>`).join("");
  $("#galleryEmpty").hidden = items.length > 0;
  $$("#photoGrid .photo-card").forEach(el => el.addEventListener("click", () => openPhoto(el.dataset.id, items)));
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
function toggleFullscreen() {
  const d = $("#photoDialog");
  try {
    if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (d.requestFullscreen || d.webkitRequestFullscreen).call(d)?.catch?.(() => {});
  } catch {}
}
function openPhoto(id, list = photos) {
  lightboxList = list;
  lightboxIndex = Math.max(0, list.findIndex(p => p.id === id));
  showLightbox();
  const d = $("#photoDialog");
  toggleInfo(false);
  if (!d.open) d.showModal();
  document.documentElement.classList.add("no-scroll");
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
  if (!articles.length) { $("#journalLayout").innerHTML = `<p class="empty-state">No articles yet.</p>`; return; }
  const list = [...articles].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  $("#journalLayout").innerHTML = list.map(a => {
    const t = a.trip && tripById(a.trip);
    return `
    <a class="log-card" href="#art-${esc(a.id)}">
      <img src="${esc(a.cover)}" alt="" data-cat="Paesaggi" loading="lazy">
      <div class="log-body">
        <p class="meta-row"><span>${ICON.cal}${esc(fmtDate(a.date))}</span>${a.minutes ? `<span>${a.minutes} min</span>` : ""}<span>${esc(catLabel(a.category))}</span></p>
        <h3>${esc(a.title)}</h3>
        ${a.excerpt ? `<p class="log-excerpt">${esc(a.excerpt)}</p>` : ""}
        ${t ? `<span class="log-coords">${ICON.pin}${fmtCoord(t.lat, t.lon).replace("  |  ", ", ")}</span>` : "<span></span>"}
        <span class="log-arrow" aria-hidden="true">${ICON.next}</span>
      </div>
    </a>`;
  }).join("");
}
function renderArticle(id) {
  const reader = $("#articleReader"), a = articles.find(x => x.id === id);
  if (!a) { reader.hidden = true; return; }
  const t = a.trip && tripById(a.trip);
  reader.innerHTML = `
    <span class="eyebrow">FROM THE JOURNAL · ${esc(catLabel(a.category))}</span>
    <h2>${esc(a.title)}</h2>
    <p class="meta-row">${articleMeta(a)}</p>
    <img src="${esc(a.cover)}" alt="${esc(a.title)}" data-cat="Paesaggi">
    <div class="rich">${md(a.text)}</div>
    <div class="article-actions">
      ${t ? `<button class="outline-link" type="button" id="articleTrip">VIEW THE JOURNEY ON THE MAP <span aria-hidden="true">→</span></button>` : ""}
      <a class="text-link" href="#journal">${ICON.prev}Back to the Journal</a>
    </div>`;
  reader.hidden = false;
  $("#articleTrip")?.addEventListener("click", () => { location.hash = "explore"; setTimeout(() => openTrip(t.id), 60); });
  requestAnimationFrame(() => reader.scrollIntoView({ behavior: "smooth", block: "start" }));
}

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
const PAGES = ["home", "explore", "gallery", "journal", "spots", "about"];

function route() {
  let hash = decodeURIComponent(location.hash.slice(1));
  let page = hash, article = null;
  if (hash.startsWith("art-")) { page = "journal"; article = hash.slice(4); }
  if (!PAGES.includes(page)) page = "home";

  const changed = document.body.dataset.page !== page;
  document.body.dataset.page = page;
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
  if (page === "spots") window.Spots?.show();
  if (page === "journal") {
    if (article) renderArticle(article);
    else { $("#articleReader").hidden = true; }
  }
  if (changed && !article) window.scrollTo(0, 0);
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
  $("#dialogInfo").addEventListener("click", () => toggleInfo());
  $("#dialogImage").addEventListener("click", () => toggleInfo());          // clic sulla foto: solo immagine
  dlg.addEventListener("close", () => {
    document.documentElement.classList.remove("no-scroll");
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
