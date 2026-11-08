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
const CATEGORY_EN = { Paesaggi: "Landscapes", Urban: "Urban", Astrofotografia: "Astrophotography", "Lunga esposizione": "Long Exposure", Altro: "Other", Viaggi: "Travel", Fotografia: "Photography", Tecnica: "Technique", Ispirazione: "Inspiration",
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
  // immagini caricate in blocco: Pages CMS salva un elenco di percorsi (o un solo percorso)
  const pathsOf = v => (Array.isArray(v) ? v : v ? [v] : []).map(x => typeof x === "string" ? x : x?.immagine || x?.src || "").filter(Boolean);
  const PHOTO_CATS = ["Paesaggi", "Urban", "Astrofotografia", "Lunga esposizione", "Altro"];
  const okCat = c => (PHOTO_CATS.includes(c) ? c : "Paesaggi");
  rawTrips.forEach((t, ti) => {
    if (!t || !t.nome) return;
    const id = slug(t.id || t.nome) + (trips.some(x => x.id === slug(t.id || t.nome)) ? "-" + ti : "");
    const trip = { id, name: t.nome, country: t.paese || "", lat: num(t.lat, 0), lon: num(t.lon, 0),
      start: t.inizio || "", end: t.fine || t.inizio || "", description: t.descrizione || "", article: slug(t.articolo || ""),
      collection: String(t.collezione || "").trim(), subs: [] };
    trips.push(trip);
    const cat0 = okCat(t.categoria);
    // foto con i dettagli (una per una) e foto caricate insieme, per il viaggio o per una sua sottosezione
    const addPhotos = (list, bulk, prefix, sub) => {
      const base = sub || trip;
      (Array.isArray(list) ? list : []).forEach((f, fi) => {
        if (!f || !f.immagine) return;
        const own = Number.isFinite(parseFloat(f.lat)) && Number.isFinite(parseFloat(f.lon));
        photos.push({ id: `${prefix}-${fi}`, trip: id, sub: sub?.id || "", raw: f.immagine, title: f.titolo || base.name, src: mediaUrl(f.immagine),
          date: f.data || trip.start, category: f.categoria ? okCat(f.categoria) : (sub?.category || cat0),
          lat: own ? num(f.lat) : base.lat, lon: own ? num(f.lon) : base.lon, description: f.descrizione || "",
          ownCoords: own || !!sub?.ownCoords, camera: String(f.fotocamera || "").trim(), lens: String(f.obiettivo || "").trim(), settings: String(f.scatto || "").trim() });
      });
      pathsOf(bulk).forEach((src, k) => {
        photos.push({ id: `${prefix}-i${k}`, trip: id, sub: sub?.id || "", raw: src, title: base.name, src: mediaUrl(src),
          date: trip.start, category: sub?.category || cat0, lat: base.lat, lon: base.lon, description: "", ownCoords: !!sub?.ownCoords });
      });
    };
    addPhotos(t.foto, t.immagini, id);
    (Array.isArray(t.sottosezioni) ? t.sottosezioni : []).forEach((x, si) => {
      if (!x || !x.nome) return;
      const own = Number.isFinite(parseFloat(x.lat)) && Number.isFinite(parseFloat(x.lon));
      const sub = { id: `${id}--${slug(x.nome) || si}`, name: x.nome, description: x.descrizione || "",
        lat: own ? num(x.lat) : trip.lat, lon: own ? num(x.lon) : trip.lon, ownCoords: own, category: x.categoria ? okCat(x.categoria) : cat0 };
      trip.subs.push(sub);
      addPhotos(x.foto, x.immagini, `${id}-s${si}`, sub);
    });
    trip.subs = trip.subs.filter(sb => photos.some(p => p.sub === sb.id));
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
    blocks: Array.isArray(x.impaginazione) ? x.impaginazione.filter(b => b && typeof b === "object") : [],
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
// firma degli articoli: nome e cognome, e il folk di chi scrive (Field Notes)
const FOLK_LABEL = { photo: "📷 Photo folk", hike: "🥾 Hiker folk", slow: "🎒 Backpacker folk", road: "🚐 Road trip folk", nomad: "💻 Nomad folk", food: "🍝 Foodie folk" };
const folkTag = a => (a.author?.folk && FOLK_LABEL[a.author.folk] ? ` <span class="mag-folk">${FOLK_LABEL[a.author.folk]}</span>` : "");
const authorLink = a => `<a class="mag-author" href="#author-${esc(a.author.slug)}">${esc(a.author.name)}</a>${folkTag(a)}`;

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
const subOf = p => p && p.sub ? tripById(p.trip)?.subs.find(x => x.id === p.sub) : null;
/* «Roma · Tempio di Esculapio» */
const placeOf = p => [tripById(p.trip)?.name, subOf(p)?.name].filter(Boolean).join(" · ");
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
  if (window.innerWidth <= 900) return L.divIcon({ className: "", iconSize: [28, 31], iconAnchor: [14, 27], tooltipAnchor: [0, -24],
    html: `<div class="ex-lander sm${active ? " is-active" : ""}">${LANDER_SVG}</div>` });
  return L.divIcon({ className: "", iconSize: [46, 50], iconAnchor: [23, 44], tooltipAnchor: [0, -40],
    html: `<div class="ex-lander${active ? " is-active" : ""}">${LANDER_SVG}</div>` });
}
/* Lander arancione = viaggio; rover ciano = località dentro il viaggio */
const LANDER_SVG = `<svg viewBox="0 0 46 50" aria-hidden="true">
  <ellipse class="lg" cx="23" cy="44" rx="17" ry="4.5"/>
  <path class="ln" d="M30 9l6-6M36 3a3 3 0 1 0 .01 0"/>
  <path class="lb" d="M12 14h22l3 14H9z"/>
  <rect class="lw" x="17" y="17" width="12" height="6" rx="1.5"/>
  <path class="ll" d="M11 28 5 41M35 28l6 13M17 28l-3 13M29 28l3 13M2 41h7M37 41h7M11 41h6M29 41h6"/>
  <path class="lt" d="M15 14l2-5h12l2 5"/>
</svg>`;
const ROVER_SVG = `<svg viewBox="0 0 40 34" aria-hidden="true">
  <ellipse class="rg" cx="20" cy="29" rx="15" ry="3.6"/>
  <path class="rm" d="M14 13V5M14 5h6M20 3v4"/>
  <rect class="rb" x="7" y="13" width="26" height="8" rx="2"/>
  <circle class="rw" cx="11" cy="25" r="3.4"/><circle class="rw" cx="20" cy="25" r="3.4"/><circle class="rw" cx="29" cy="25" r="3.4"/>
</svg>`;
const roverIcon = () => L.divIcon({ className: "", iconSize: [14, 14], iconAnchor: [7, 7], tooltipAnchor: [0, -6], html: '<div class="shot-dot"></div>' });
const DOT_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="dg" cx="20" cy="20" r="15"/><circle class="dd" cx="20" cy="20" r="6"/></svg>`;
let roverLayer = null;
const ROVER_ZOOM = 4.5;
/* rover per ogni sottosezione con coordinate proprie, legato al suo lander con una linea tratteggiata */
function drawRovers() {
  const map = maps.explore;
  if (!map || !roverLayer) return;
  roverLayer.clearLayers();
  if (map.getZoom() < ROVER_ZOOM) return;
  trips.forEach(t => {
    if (!photosOfTrip(t.id).length) return;
    t.subs.filter(sb => sb.ownCoords && distKm(t, sb) > 0.05).forEach(sb => {
      L.polyline([[t.lat, t.lon], [sb.lat, sb.lon]], { color: "#ff9a3c", weight: 1.6, opacity: 0.85, dashArray: "1 6", lineCap: "round", interactive: false, className: "ex-link" }).addTo(roverLayer);
      L.marker([sb.lat, sb.lon], { icon: roverIcon(), title: `${sb.name} · ${t.name}`, keyboard: true, riseOnHover: true })
        .addTo(roverLayer)
        .bindTooltip(`${esc(sb.name)} <small>${esc(t.name)}</small>`, { direction: "top", className: "ex-tip" })
        .on("click", () => openTrip(t.id, null, sb.id));
    });
  });
}

/* Confini e coste (Natural Earth) e nomi eleganti di paesi e mari, per la vista da lontano */
const SEA_LABELS = [
  ["Atlantic Ocean", 28, -40, 1.5, 5], ["Atlantic Ocean", -22, -16, 2, 5], ["Pacific Ocean", 8, -140, 1.5, 5], ["Pacific Ocean", -25, -115, 2, 5],
  ["Indian Ocean", -22, 78, 1.5, 5], ["Arctic Ocean", 80, -20, 2, 5], ["Southern Ocean", -58, 40, 2, 5],
  ["Mediterranean Sea", 34.6, 18.5, 4, 7], ["Tyrrhenian Sea", 39.8, 12.3, 5, 8], ["Adriatic Sea", 43.1, 15.2, 5, 8], ["Ionian Sea", 37.8, 18.8, 5, 8],
  ["Ligurian Sea", 43.5, 8.6, 6, 9], ["Aegean Sea", 38.9, 25.1, 5, 8], ["Balearic Sea", 40.3, 2.6, 6, 9], ["Black Sea", 43.3, 34.2, 4, 7],
  ["North Sea", 56, 3.2, 4, 7], ["Baltic Sea", 57.8, 19.4, 4, 7], ["Norwegian Sea", 68, 3, 3, 6], ["Bay of Biscay", 45.2, -4.6, 5, 8],
  ["Celtic Sea", 50, -8, 5.5, 8], ["Caribbean Sea", 15, -75, 3, 6], ["Gulf of Mexico", 25, -90, 3, 6], ["Red Sea", 20, 38.4, 4, 7],
  ["Arabian Sea", 15, 64, 3, 6], ["Bay of Bengal", 15, 88, 3, 6], ["South China Sea", 13, 114, 3, 6], ["Philippine Sea", 20, 132, 3, 6],
  ["Sea of Japan", 40, 135, 4, 7], ["Tasman Sea", -38, 160, 3, 6], ["Coral Sea", -17, 155, 3, 6], ["Caspian Sea", 42, 50.6, 4, 7],
  ["Hudson Bay", 59, -85, 3, 6], ["Gulf of Alaska", 56, -145, 3, 6], ["Canary Islands", 28.3, -15.8, 6, 9]
];
const COUNTRY_SOURCES = {
  low: ["https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json", "https://unpkg.com/world-atlas@2.0.2/countries-110m.json"],
  high: ["https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json", "https://unpkg.com/world-atlas@2.0.2/countries-50m.json"]
};
const countryCache = {};
function loadCountries(level) {
  if (countryCache[level]) return countryCache[level];
  countryCache[level] = (async () => {
    for (const url of COUNTRY_SOURCES[level]) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const topo = await res.json(), tf = topo.transform;
        const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(p => tf ? (x += p[0], y += p[1], [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]) : p); });
        const ring = ids => ids.reduce((pts, i) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return pts.concat(pts.length ? a.slice(1) : a); }, []);
        // bordi come linee (ogni arco una volta sola): confini e coste senza doppioni
        const lines = { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: arcs } };
        const countries = topo.objects.countries.geometries.filter(g => g.arcs).map(g => ({ name: g.properties?.name || "",
          polys: g.type === "Polygon" ? [g.arcs.map(ring)] : g.arcs.map(p => p.map(ring)) }));
        return { lines, countries };
      } catch { /* prova la fonte successiva */ }
    }
    return null;
  })();
  return countryCache[level];
}
/* punto dentro il poligono più grande, il più lontano possibile dai bordi (per centrare il nome) */
function labelPoint(polys) {
  const area = r => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const big = polys.map(p => ({ p, a: area(p[0]) })).sort((x, y) => y.a - x.a)[0];
  if (!big) return null;
  const outer = big.p[0];
  const inside = (x, y) => { let c = false; for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) { const [xi, yi] = outer[i], [xj, yj] = outer[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  outer.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
  let best = null, bestD = -1;
  const step = 12, kx = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
  for (let i = 1; i < step; i++) for (let j = 1; j < step; j++) {
    const x = minX + (maxX - minX) * i / step, y = minY + (maxY - minY) * j / step;
    if (!inside(x, y)) continue;
    let d = Infinity;
    for (let k = 0; k < outer.length; k += Math.max(1, Math.floor(outer.length / 300))) { const dx = (outer[k][0] - x) * kx, dy = outer[k][1] - y; d = Math.min(d, dx * dx + dy * dy); }
    if (d > bestD) { bestD = d; best = [y, x]; }
  }
  return best ? { at: best, area: big.a } : null;
}
function createEarthDecor(map, lite) {
  const group = L.layerGroup();
  const lineRenderer = L.canvas({ pane: "earthLines", padding: 0.3 });   // un solo disegno al posto di migliaia di tracciati SVG
  let shown = false, lines = null, linesLevel = "", labels = [], loading = false, withLines = true;
  const seaMarkers = SEA_LABELS.map(([n, lat, lon, z0, z1]) => ({ z0, z1, sea: true, m: L.marker([lat, lon], { pane: "earthLabels", interactive: false, keyboard: false,
    icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<span class="ex-lab sea">${esc(n)}</span>` }) }) }));
  const place = () => {
    if (!shown) return;
    const z = map.getZoom(), size = map.getSize();
    const boxes = [];
    // prima i mari, poi i paesi dal più grande: se due nomi si sovrappongono resta il primo
    [...seaMarkers, ...labels].forEach(l => {
      const want = z >= l.z0 && z < l.z1;
      let ok = want;
      if (ok) {
        const pt = map.latLngToContainerPoint(l.m.getLatLng()), w = l.w || 120, h = 18;
        const r = [pt.x - w / 2, pt.y - h / 2, pt.x + w / 2, pt.y + h / 2];
        ok = r[2] > -50 && r[0] < size.x + 50 && r[3] > -20 && r[1] < size.y + 20 && !boxes.some(b => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1]);
        if (ok) boxes.push(r);
      }
      if (ok && !group.hasLayer(l.m)) group.addLayer(l.m);
      if (!ok && group.hasLayer(l.m)) group.removeLayer(l.m);
    });
  };
  const build = async () => {
    const level = !lite && map.getZoom() >= 3.5 ? "high" : "low";   // sui telefoni solo i confini leggeri
    if (level === linesLevel || loading) return;
    loading = true;
    const data = await loadCountries(level).catch(() => null);
    loading = false;
    if (!data) return;
    linesLevel = level;
    if (lines) group.removeLayer(lines);
    lines = L.geoJSON(data.lines, { pane: "earthLines", renderer: lineRenderer, interactive: false, smoothFactor: 1.5, style: { color: "#f0bd72", weight: 0.9, opacity: 0.62 } });
    if (withLines) group.addLayer(lines);
    if (!labels.length || level === "high") {
      labels.forEach(l => group.removeLayer(l.m));
      labels = data.countries.map(c => {
        const lp = c.name && labelPoint(c.polys);
        if (!lp) return null;
        const z0 = lp.area > 600 ? 2.5 : lp.area > 120 ? 3.5 : lp.area > 25 ? 4.5 : 5.3;
        const name = c.name.replace(/^United States of America$/, "United States").replace(/^Dem\. Rep\. Congo$/, "DR Congo");
        return { z0, z1: 6.5, area: lp.area, w: name.length * 8.5 + 20, m: L.marker(lp.at, { pane: "earthLabels", interactive: false, keyboard: false,
          icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<span class="ex-lab">${esc(name)}</span>` }) }) };
      }).filter(Boolean).sort((a, b) => b.area - a.area);
    }
    place();
  };
  map.on("moveend zoomend", () => { if (shown) { build(); place(); } });
  return {
    update(on, showLines = true) {
      withLines = showLines;
      if (on && !shown) { shown = true; group.addTo(map); }
      if (!on && shown) { shown = false; map.removeLayer(group); }
      if (lines) { if (withLines && !group.hasLayer(lines)) group.addLayer(lines); if (!withLines && group.hasLayer(lines)) group.removeLayer(lines); }
      if (shown) { build(); place(); }
    }
  };
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
// telefono girato in orizzontale con la mappa davanti: solo la mappa, a tutto schermo; rigirato in verticale torna com'era
(() => {
  const land = window.matchMedia?.("(orientation: landscape) and (max-height: 540px) and (pointer: coarse)");
  if (!land) return;
  let wasLand = land.matches, auto = null, tid = 0;
  const turned = () => {
    if (land.matches === wasLand) return;   // solo quando cambia davvero l'orientamento
    wasLand = land.matches;
    if (land.matches) {
      for (const btn of document.querySelectorAll(".map-full-ctrl a")) {
        const stage = btn.closest(".sx-stage, .explore-stage, .spots-stage");
        if (!stage || !stage.offsetParent || stage.classList.contains("map-full")) continue;
        const r = stage.getBoundingClientRect(), vh = window.innerHeight;
        const seen = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        if (seen > Math.min(r.height, vh) * 0.35) { btn.click(); auto = stage; break; }
      }
    } else if (auto) {
      if (auto.isConnected && auto.classList.contains("map-full")) auto.querySelector(".map-full-ctrl a")?.click();
      auto = null;
    }
  };
  window.addEventListener("resize", () => { clearTimeout(tid); tid = setTimeout(turned, 200); });
})();

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
  const art = L.layerGroup();
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
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  const IMG_ATTR = "Imagery &copy; Esri, Maxar, Earthstar Geographics, USGS, NASA and the GIS community";
  // «Satellite + Terrain»: foto satellitari + ombreggiatura del rilievo (Esri World Hillshade, in moltiplica)
  // + confini e coste (Natural Earth) + nomi eleganti; da vicino nomi e confini dettagliati di Esri.
  map.createPane("relief");
  map.getPane("relief").style.zIndex = 250;
  map.getPane("relief").style.pointerEvents = "none";
  map.createPane("earthLines");
  map.getPane("earthLines").style.zIndex = 420;
  map.getPane("earthLines").style.pointerEvents = "none";
  map.createPane("earthLabels");
  map.getPane("earthLabels").style.zIndex = 455;
  map.getPane("earthLabels").style.pointerEvents = "none";
  // telefoni: meno tile tenute in memoria, niente aggiornamenti durante lo zoom, rilievo solo fino a zoom 13
  const LITE = matchMedia("(pointer: coarse)").matches || window.innerWidth <= 900;
  const tileOpt = LITE ? { updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 1 } : { keepBuffer: 2 };
  const earthRef = L.tileLayer(ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    ...tileOpt, maxZoom: 18, maxNativeZoom: 16, pane: "labels", className: "tiles-ref" });
  const earth = L.featureGroup([
    L.tileLayer(ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", { ...tileOpt, maxZoom: 18, maxNativeZoom: 18, className: "tiles-earth", attribution: IMG_ATTR }),
    L.tileLayer(ESRI + "Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}", { ...tileOpt, maxZoom: LITE ? 13 : 18, maxNativeZoom: LITE ? 13 : 16, pane: "relief", className: "tiles-hill",
      attribution: "Relief &copy; Esri, USGS, NASA SRTM" })
  ]);
  const bases = { earth };
  const mode = "earth";   // una sola vista: satellite con rilievo, confini e nomi
  const REF_ZOOM = 6.5;   // da qui in su: nomi e confini dettagliati di Esri
  const earthDeco = createEarthDecor(map, LITE);

  function updateBase() {
    Object.entries(bases).forEach(([k, layer]) => {
      const want = k === mode;
      if (want && !map.hasLayer(layer)) layer.addTo(map).bringToBack();
      if (!want && map.hasLayer(layer)) map.removeLayer(layer);
    });
    if (map.hasLayer(art)) map.removeLayer(art);
    const near = map.getZoom() >= REF_ZOOM, isEarth = mode === "earth";
    if (isEarth && near && !map.hasLayer(earthRef)) earthRef.addTo(map);
    if ((!isEarth || !near) && map.hasLayer(earthRef)) map.removeLayer(earthRef);
    earthDeco.update(isEarth && !near);
    map.getContainer().dataset.base = mode;
    $$(".map-modes [data-mode]", map.getContainer()).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  }
  map.on("zoomend", () => { updateBase(); updateShotDots(); drawRovers(); });

  if (interactive) {
    const Modes = L.Control.extend({
      options: { position: "bottomleft" },
      onAdd() {
        const box = L.DomUtil.create("div", "map-modes");
        box.innerHTML = `
          <button type="button" class="fit-all" title="Show all my spots" aria-label="Show all my spots">${ICON.globe}</button>`;
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        box.querySelector(".fit-all").addEventListener("click", () => fitAllTrips(true));
        return box;
      }
    });
    new Modes().addTo(map);
    L.control.scale({ position: "bottomright", imperial: false, maxWidth: 140 }).addTo(map);
  }
  updateBase();

  roverLayer = L.layerGroup().addTo(map);
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
/* nuovi punti di interesse e ritrovi di Spots: per i visitatori solo la zona, senza nomi (vista public_news) */
let homeSpotNews = null;
async function loadHomeSpotNews() {
  if (homeSpotNews) return homeSpotNews;
  homeSpotNews = [];
  try {
    if (typeof SPOTS_CONFIG === "undefined" || !SPOTS_CONFIG.url) return homeSpotNews;
    const res = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/rest/v1/public_news?select=kind,category,lat,lon,n,created_at,on_date`, { headers: { apikey: SPOTS_CONFIG.anonKey } });
    if (res.ok) homeSpotNews = await res.json();
  } catch {}
  return homeSpotNews;
}
const NEWS_KIND = {
  photos:   { icon: "📷", color: "#9cc8ff", name: "New photos" },
  article:  { icon: "✍", color: "#ffc46e", name: "New article" },
  workshop: { icon: "🎓", color: "#9fe3c8", name: "New workshop" },
  meetup:   { icon: "🤝", color: "#ffd166", name: "New meetup" },
  spot:     { icon: "📍", color: "#ff8fb1", name: "New place in Wayfolk" }
};
const SPOT_WORD = { spot: "photo spot", restaurant: "place to eat", hotel: "place to stay", trekking: "trek" };
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
      go: () => { if (w.ws_link && /^https?:\/\//.test(w.ws_link)) window.open(w.ws_link, "_blank", "noopener"); else location.hash = "wayfolk"; } });
  });
  (homeSpotNews || []).forEach(x => {
    if (!isFresh(x.created_at)) return;
    if (x.kind === "meetup") items.push({ kind: "meetup", when: x.created_at, lat: +x.lat, lon: +x.lon, label: "New meetup",
      title: `Members meet${x.on_date ? ` on ${fmtDate(x.on_date)}` : ""} · open Wayfolk to join`, go: () => { location.hash = "wayfolk"; } });
    else {
      const w = SPOT_WORD[x.category] || "place", n = +x.n || 1;
      items.push({ kind: "spot", when: x.created_at, lat: +x.lat, lon: +x.lon, label: n === 1 ? "New place in Wayfolk" : `${n} new places in Wayfolk`,
        title: `${n === 1 ? `A new ${w}` : `New ${w}s`} in this area · members only`, go: () => { location.hash = "wayfolk"; } });
    }
  });
  return items.filter(i => Number.isFinite(i.lat) && Number.isFinite(i.lon)).sort((a, b) => String(b.when).localeCompare(String(a.when)));
}
async function drawHomeNews() {
  const map = homeMap;
  if (!map) return;
  if (!homeWorkshops || !homeSpotNews) await Promise.all([loadHomeWorkshops(), loadHomeSpotNews()]);
  if (!map._news) map._news = L.layerGroup().addTo(map);
  map._news.clearLayers();
  const items = newsItems();
  // novità vicine (a questo zoom) si dispongono a ventaglio, così ognuna resta facile da toccare
  const pts = items.map(it => map.latLngToLayerPoint([it.lat, it.lon])), shift = items.map(() => [0, 0]), used = new Set();
  items.forEach((_, i) => {
    if (used.has(i)) return;
    const group = items.map((_, j) => j).filter(j => !used.has(j) && pts[i].distanceTo(pts[j]) < 46);
    group.forEach(j => used.add(j));
    if (group.length > 1) group.forEach((j, k) => {
      const a = (k / group.length) * Math.PI * 2 - Math.PI / 2, rad = 30 + group.length * 4;
      shift[j] = [Math.round(Math.cos(a) * rad), Math.round(Math.sin(a) * rad)];
    });
  });
  if (!map._newsZoom) { map._newsZoom = true; map.on("zoomend", () => drawHomeNews()); }
  items.forEach((it, i) => {
    const m = L.marker([it.lat, it.lon], { zIndexOffset: 2000, keyboard: true, title: `${it.label}: ${it.title}`,
      icon: L.divIcon({ className: "", iconSize: [64, 64], iconAnchor: [32 - shift[i][0], 32 - shift[i][1]], tooltipAnchor: [shift[i][0], shift[i][1] - 26],
        html: `<div class="ship ship-${it.kind}" style="--d:${-i * 2.3}s;--r:${24 + (i % 3) * 4}px;--c:${NEWS_KIND[it.kind]?.color || "#9cc8ff"}"><div class="ship-orbit"><span class="ship-craft"><span class="ship-trail"></span>${SHIP_SVG}</span></div><span class="ship-ico" aria-hidden="true">${NEWS_KIND[it.kind]?.icon || "★"}</span></div>` })
    }).addTo(map._news);
    m.bindTooltip(`<b class="news-kind">${esc(it.label)}</b><br>${esc(it.title)}`, { direction: "top", className: "news-tip" });
    m.on("click", () => { window.fcTrack?.(`Home news: ${it.kind}`); it.go(); });
  });
  renderNewsTicker(items);
  renderNewsLegend(items);
  window.FCSystem?.render();
}
/* legenda delle astronavi (solo i tipi presenti) */
function renderNewsLegend(items) {
  const box = $("#newsLegend");
  if (!box) return;
  const kinds = [...new Set(items.map(i => i.kind))];
  box.hidden = !kinds.length;
  box.innerHTML = kinds.map(k => `<span style="--c:${NEWS_KIND[k].color}"><i aria-hidden="true">${NEWS_KIND[k].icon}</i>${NEWS_KIND[k].name}</span>`).join("");
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
  const open = $(".explore-stage")?.classList.contains("ex-open");
  const right = wide && panel && open ? panel.offsetWidth + 40 : 40;
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
      L.polyline(curve(HOME_BASE, t), { color: "#ffa14a", weight: 1.4, opacity: 0.7, dashArray: "1 7", lineCap: "round", interactive: false, className: "ex-route" }).addTo(layer);
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
  if (kind === "explore") { updateShotDots(); drawRovers(); }
}

/* =========================================================
   5. EXPLORE: pannello del viaggio
   ========================================================= */
let carouselIndex = 0;

/* elenco dei viaggi, raggruppati per collezione quando ce n'è almeno una */
function tripListHtml(list) {
  const li = t => `<li><button type="button" data-trip="${esc(t.id)}"><strong>${esc(t.name)}</strong><small>${esc([fmtRange(t.start, t.end), t.subs.length ? `${t.subs.length} ${t.subs.length === 1 ? "place" : "places"}` : ""].filter(Boolean).join(" · "))}</small></button></li>`;
  const cols = [...new Set(list.map(t => t.collection).filter(Boolean))];
  if (!cols.length) return `<ul class="trip-list">${list.map(li).join("")}</ul>`;
  const loose = list.filter(t => !t.collection);
  return cols.map(c => `<p class="trip-coll">${esc(c)}</p><ul class="trip-list">${list.filter(t => t.collection === c).map(li).join("")}</ul>`).join("")
    + (loose.length ? `<p class="trip-coll">More places</p><ul class="trip-list">${loose.map(li).join("")}</ul>` : "");
}
/* Pannello a scomparsa da destra: si apre dalle linguette (lander / rover) o toccando un viaggio sulla mappa.
   Da chiuso la mappa usa tutta la larghezza. */
let exListView = "journeys";
function exDrawer(open) {
  const stage = $(".explore-stage"), panel = $("#locationPanel");
  if (!stage || !panel) return;
  if (open === undefined) open = !stage.classList.contains("ex-open");
  stage.classList.toggle("ex-open", open);
  panel.inert = !open; panel.setAttribute("aria-hidden", String(!open));
  $$(".ex-tab, .ex-tab-toggle").forEach(b => b.setAttribute("aria-expanded", String(open && (!b.dataset.exlist || (!activeTripId && b.dataset.exlist === exListView)))));
  $$(".ex-tab").forEach(b => b.classList.toggle("on", open && !activeTripId && b.dataset.exlist === exListView));
  $("#exToggle")?.setAttribute("aria-label", open ? "Close the list" : "Open the list");
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function renderPanelIntro(view) {
  activeTripId = null;
  if (view) exListView = view;
  const T = s => window.I18N ? I18N.t(s) : s;
  const list = trips.filter(t => photosOfTrip(t.id).length)
    .sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const places = list.flatMap(t => t.subs.map(sb => ({ t, sb, n: photos.filter(p => p.sub === sb.id).length }))).filter(x => x.n);
  const nLoc = places.length;
  const when = t => t.start ? fmtRange(t.start, t.end) : "";
  const thumb = (src, cat) => src ? `<img src="${esc(src)}" alt="" loading="lazy" data-cat="${esc(cat || "")}">` : "<span></span>";
  const chev = '<svg class="ex-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const counts = [plural(list.length, T("journey"), T("journeys")), nLoc ? plural(nLoc, T("location"), T("locations")) : ""].filter(Boolean).join(" · ");
  const isJ = exListView === "journeys";
  const row = t => {
    const ph = photosOfTrip(t.id), nl = t.subs.length;
    const meta = [nl ? plural(nl, T("location"), T("locations")) : "", plural(ph.length, T("photograph"), T("photographs")), when(t)].filter(Boolean).join(" · ");
    return `<li><button type="button" class="ex-row" data-trip="${esc(t.id)}">${thumb(ph[0]?.src, ph[0]?.category)}
      <span class="ex-rowtext"><strong>${esc(t.name)}</strong><small>${esc(meta)}</small></span>${chev}</button></li>`;
  };
  const cols = [...new Set(list.map(t => t.collection).filter(Boolean))];
  const jHtml = !cols.length ? `<ul class="ex-list">${list.map(row).join("")}</ul>`
    : cols.map(c => `<p class="trip-coll">${esc(c)}</p><ul class="ex-list">${list.filter(t => t.collection === c).map(row).join("")}</ul>`).join("")
      + (list.some(t => !t.collection) ? `<p class="trip-coll">${T("More places")}</p><ul class="ex-list">${list.filter(t => !t.collection).map(row).join("")}</ul>` : "");
  const lHtml = `<ul class="ex-list">${places.map(({ t, sb, n }) => {
    const ph = photos.find(p => p.sub === sb.id);
    return `<li><button type="button" class="ex-row" data-trip="${esc(t.id)}" data-sub="${esc(sb.id)}">${thumb(ph?.src, ph?.category)}
      <span class="ex-rowtext"><strong>${esc(sb.name)}</strong><small>${esc([t.name, plural(n, T("photograph"), T("photographs")), when(t)].filter(Boolean).join(" · "))}</small></span>${chev}</button></li>`;
  }).join("")}</ul>`;
  $("#locationPanel").innerHTML = `
    <div class="ex-dhead">
      <span class="ex-eyebrow2">EXPEDITIONS <i aria-hidden="true">///</i></span>
      <button class="panel-close ex-close" type="button" id="exClose" aria-label="Close the list">${ICON.close}</button>
    </div>
    <div class="ex-dtitle">
      <span class="ex-dicon">${isJ ? LANDER_SVG : DOT_SVG}</span>
      <div><h2>${isJ ? "Journeys" : "Locations"}</h2>
        <p>${isJ ? "All the photographic travels I've completed." : "The places I've photographed inside each journey."}</p>
        ${list.length ? `<p class="ex-count">${esc(counts)}</p>` : ""}</div>
    </div>
    ${!list.length ? `<p class="trip-desc">The first journeys are coming soon.</p>` : isJ ? jHtml : (nLoc ? lHtml : `<p class="trip-desc">No locations yet: they appear when a journey has places with their own coordinates.</p>`)}
    <button type="button" class="ex-gallery" id="exGallery">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>
      <span><b>CONNECTED WITH GALLERY</b><small>Explore the photographs from these journeys.</small></span>${chev}</button>`;
  $$("#locationPanel [data-trip]").forEach(b => b.addEventListener("click", () => openTrip(b.dataset.trip, null, b.dataset.sub || "")));
  $("#exClose").addEventListener("click", () => exDrawer(false));
  $("#exGallery").addEventListener("click", () => { gallery.trip = null; gallery.sub = ""; gallery.collection = ""; gallery.category = "Tutte"; location.hash = "gallery"; });
  exDrawer($(".explore-stage")?.classList.contains("ex-open"));
  drawPins("explore");
}

function openTrip(id, photoId, subId) {
  const t = tripById(id);
  if (!t) return;
  if (photoId && subId === undefined) subId = "";
  const sub = subId ? t.subs.find(x => x.id === subId) : null;
  const all = photosOfTrip(id), items = sub ? all.filter(p => p.sub === sub.id) : all;
  activeTripId = id;
  carouselIndex = Math.max(0, items.findIndex(p => p.id === photoId));
  const article = t.article && articles.find(a => a.id === t.article);
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lon}`;

  $("#locationPanel").innerHTML = `
    <div class="panel-head">
      <div><span class="eyebrow">${t.collection ? esc(t.collection) : "PHOTO LOCATION"}</span><h2>${esc(t.name)}</h2></div>
      <button class="panel-close" type="button" id="closeLocation" aria-label="Close journey">${ICON.close}</button>
    </div>
    ${t.subs.length ? `<nav class="sub-chips" aria-label="Places in ${esc(t.name)}"><button type="button" data-sub=""${sub ? "" : ' class="on"'}>All <small>${all.length}</small></button>${t.subs.map(x =>
      `<button type="button" data-sub="${esc(x.id)}"${sub && sub.id === x.id ? ' class="on"' : ""}>${esc(x.name)} <small>${all.filter(p => p.sub === x.id).length}</small></button>`).join("")}</nav>` : ""}
    <p class="coords">${ICON.pin}${fmtCoord((sub || t).lat, (sub || t).lon)}</p>
    <div class="carousel">
      <img id="carouselImg" alt="" data-cat="">
      ${items.length > 1 ? `<button class="nav-arrow prev" type="button" id="carPrev" aria-label="Previous photo">${ICON.prev}</button>
      <button class="nav-arrow next" type="button" id="carNext" aria-label="Next photo">${ICON.next}</button>` : ""}
    </div>
    <div class="thumbs">${items.slice(0, 8).map((p, i) => `
      <button type="button" data-i="${i}" aria-label="Show ${esc(p.title)}"><img src="${esc(p.src)}" alt="" data-cat="${esc(p.category)}" loading="lazy"></button>`).join("")}
    </div>
    <p class="shot-row" id="shotRow"></p>
    <p class="trip-facts">${t.start ? `<span>${ICON.cal}${esc(fmtRange(t.start, t.end))}</span>` : ""}<span>${ICON.img}${items.length} ${items.length === 1 ? "photo" : "photos"}</span></p>
    <p class="trip-desc">${esc((sub && sub.description) || t.description || "A place from my photographic archive.")}</p>
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
    $("#shotRow").innerHTML = `<span class="shot-label">${p.sub && !sub ? esc(subOf(p)?.name || "This photo") : "This photo"}</span>` + photoCoordsHtml(p);
    showPhotoMarker(p);
  };
  show(carouselIndex);
  $("#carPrev")?.addEventListener("click", () => show(carouselIndex - 1));
  $("#carNext")?.addEventListener("click", () => show(carouselIndex + 1));
  $$("#locationPanel .thumbs button").forEach(b => b.addEventListener("click", () => show(+b.dataset.i)));
  $("#carouselImg").addEventListener("click", () => items[carouselIndex] && openPhoto(items[carouselIndex].id, items));
  $("#closeLocation").addEventListener("click", () => { photoMarker?.remove(); photoMarker = null; renderPanelIntro(); });
  $$("#locationPanel [data-sub]").forEach(b => b.addEventListener("click", () => openTrip(id, null, b.dataset.sub)));
  $("#viewPlacePhotos").addEventListener("click", () => {
    gallery.trip = id; gallery.sub = sub ? sub.id : ""; gallery.collection = ""; gallery.category = "Tutte";
    location.hash = "gallery";
  });

  exDrawer(true);
  const map = maps.explore;
  if (map) {
    drawPins("explore");
    const pts = sub && sub.ownCoords ? [[sub.lat, sub.lon]] : [[t.lat, t.lon], ...items.filter(p => p.ownCoords).map(p => [p.lat, p.lon])];
    const target = items[carouselIndex];
    if (photoId && target && target.ownCoords) pts.splice(0, pts.length, [t.lat, t.lon], [target.lat, target.lon]);
    map.flyToBounds(L.latLngBounds(pts).pad(0.05), { ...mapPadding(), maxZoom: 13, duration: 1.1 });
  }
  $("#locationPanel").scrollTop = 0;
}

/* =========================================================
   6. GALLERY + LIGHTBOX
   ========================================================= */
const gallery = { category: "Tutte", trip: null, sub: "", collection: "" };

function galleryItems() {
  return photos
    .filter(p => gallery.category === "Tutte" || p.category === gallery.category)
    .filter(p => !gallery.trip || p.trip === gallery.trip)
    .filter(p => !gallery.sub || p.sub === gallery.sub)
    .filter(p => !gallery.collection || tripById(p.trip)?.collection === gallery.collection)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

const GALLERY_CATS = ["Paesaggi", "Urban", "Astrofotografia", "Lunga esposizione", "Altro"];
const GL_ICON = {
  Tutte: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  Paesaggi: '<path d="M3 19l6-9 4 6 3-4 5 7z"/><circle cx="17" cy="7" r="2"/>',
  Urban: '<path d="M4 20V9l5-3v14M9 20V4h7v16M16 20v-9h4v9M3 20h18"/>',
  Astrofotografia: '<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z"/><path d="M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  "Lunga esposizione": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  Altro: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>'
};
const glIcon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${GL_ICON[k] || GL_ICON.Altro}</svg>`;
gallery.view = (() => { try { return localStorage.getItem("fcph-gallery-view") === "list" ? "list" : "grid"; } catch { return "grid"; } })();
gallery.allJourneys = false;

function renderGallery() {
  const tr = s => window.I18N ? I18N.t(s) : s;
  // filtri: solo le categorie che hanno almeno una foto
  const fbox = $("#galleryFilters");
  if (fbox) {
    const cats = GALLERY_CATS.filter(c => photos.some(p => p.category === c));
    if (gallery.category !== "Tutte" && !cats.includes(gallery.category)) gallery.category = "Tutte";
    fbox.innerHTML = [["Tutte", "All Photos"], ...cats.map(c => [c, CATEGORY_EN[c] || c])].map(([k, l]) =>
      `<button type="button" class="filter gl-pill${gallery.category === k ? " active" : ""}" data-filter="${esc(k)}" aria-pressed="${gallery.category === k}">${glIcon(k)}<span>${esc(tr(l))}</span></button>`).join("");
    fbox.querySelectorAll("[data-filter]").forEach(b => b.addEventListener("click", () => { gallery.category = b.dataset.filter; renderGallery(); }));
  }
  const items = galleryItems();
  const chip = $("#tripChip"), t = gallery.trip && tripById(gallery.trip);
  chip.hidden = !t;
  if (t) {
    const sb = gallery.sub && t.subs.find(x => x.id === gallery.sub);
    chip.innerHTML = `${esc(sb ? `${t.name} · ${sb.name}` : t.name)} <button type="button" aria-label="Show all places">${ICON.close}</button>`;
    chip.querySelector("button").addEventListener("click", () => { gallery.trip = null; gallery.sub = ""; renderGallery(); });
  }
  // collezioni e serie: compaiono solo se almeno un viaggio ne ha una
  const cols = [...new Set(trips.filter(x => photosOfTrip(x.id).length).map(x => x.collection).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const cbox = $("#galleryCollections");
  if (cbox) {
    if (gallery.collection && !cols.includes(gallery.collection)) gallery.collection = "";
    cbox.hidden = !cols.length;
    cbox.innerHTML = cols.length ? `<span class="coll-label">Collections</span><button type="button" data-coll=""${gallery.collection ? "" : ' class="on"'}>All</button>` +
      cols.map(c => `<button type="button" data-coll="${esc(c)}"${c === gallery.collection ? ' class="on"' : ""}>${esc(c)}</button>`).join("") : "";
    cbox.querySelectorAll("[data-coll]").forEach(b => b.addEventListener("click", () => { gallery.collection = b.dataset.coll; gallery.trip = null; gallery.sub = ""; renderGallery(); }));
  }
  renderJourneys();
  $("#photoCount").textContent = items.length === 1 ? tr("1 photograph") : tr("{n} photographs").replace("{n}", items.length);
  $$(".gl-vbtn").forEach(b => { const on = b.dataset.view === gallery.view; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  const grid = $("#photoGrid");
  grid.classList.toggle("is-list", gallery.view === "list");
  grid.innerHTML = items.map(p => gallery.view === "list" ? `
    <div class="photo-cell gl-row">
      <button class="photo-card" type="button" data-id="${esc(p.id)}">
        <img src="${esc(p.src)}" alt="${esc(p.title)}" data-cat="${esc(p.category)}" loading="lazy">
        <span class="gl-rowtext"><small class="gl-rowcat">${esc(catLabel(p.category))}</small><strong>${esc(p.title)}</strong>
          <small>${esc([placeOf(p), p.date ? fmtDate(p.date) : ""].filter(Boolean).join(" · "))}</small></span>
      </button>
      <button class="photo-pick" type="button" data-pick="${esc(p.id)}" aria-pressed="${picks.has(p.id)}" aria-label="${esc((window.I18N ? I18N.t("Add to your selection") : "Add to your selection") + ": " + p.title)}" title="Add to your selection">${ICON_PICK}</button>
    </div>` : `
    <div class="photo-cell">
      <button class="photo-card" type="button" data-id="${esc(p.id)}">
        <img src="${esc(p.src)}" alt="${esc(p.title)}" data-cat="${esc(p.category)}" loading="lazy">
        <span class="photo-info"><h3>${esc(p.title)}</h3><small>${esc(placeOf(p))} · ${esc(catLabel(p.category))}</small></span>
      </button>
      <button class="photo-pick" type="button" data-pick="${esc(p.id)}" aria-pressed="${picks.has(p.id)}" aria-label="${esc((window.I18N ? I18N.t("Add to your selection") : "Add to your selection") + ": " + p.title)}" title="Add to your selection">${ICON_PICK}</button>
    </div>`).join("");
  $("#galleryEmpty").hidden = items.length > 0;
  $$("#photoGrid .photo-card").forEach(el => el.addEventListener("click", () => openPhoto(el.dataset.id, items)));
  $$("#photoGrid [data-pick]").forEach(el => el.addEventListener("click", () => togglePick(el.dataset.pick)));
  renderPickBar();
}

/* Riga dei viaggi: copertina, nome e numero di foto; un clic filtra la galleria */
function renderJourneys() {
  const box = $("#galleryJourneys");
  if (!box) return;
  const list = trips.filter(x => photosOfTrip(x.id).length && (!gallery.collection || x.collection === gallery.collection))
    .sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  box.hidden = !list.length;
  if (!list.length) { box.innerHTML = ""; return; }
  const tr = s => window.I18N ? I18N.t(s) : s;
  const card = x => {
    const ph = photosOfTrip(x.id), cover = ph[0];
    return `<button type="button" class="gl-jcard${gallery.trip === x.id ? " on" : ""}" data-journey="${esc(x.id)}" aria-pressed="${gallery.trip === x.id}">
      <img src="${esc(cover.src)}" alt="" loading="lazy" data-cat="${esc(cover.category)}">
      <span class="gl-jtext"><strong>${esc(x.name)}</strong><small>${ph.length === 1 ? tr("1 photo") : tr("{n} photos").replace("{n}", ph.length)}</small></span></button>`;
  };
  box.classList.toggle("all", gallery.allJourneys);
  box.innerHTML = `<div class="gl-jhead"><h2>Journeys</h2>${list.length > 3 ? `<button type="button" class="text-link gl-jall" aria-expanded="${gallery.allJourneys}">${gallery.allJourneys ? "Show less" : "See all"} <span aria-hidden="true">→</span></button>` : ""}</div>
    <div class="gl-jrow">${list.map(card).join("")}</div>`;
  box.querySelector(".gl-jall")?.addEventListener("click", () => { gallery.allJourneys = !gallery.allJourneys; renderJourneys(); });
  box.querySelectorAll("[data-journey]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.journey;
    gallery.trip = gallery.trip === id ? null : id; gallery.sub = "";
    renderGallery();
    if (gallery.trip) $("#photoGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

let lightboxList = [], lightboxIndex = 0;

/* ---------- Visualizzatore foto ---------- */
function setupLightbox() {
  // nascondo il pulsante solo se non c'è nessun modo di ingrandire (non succede: c'è sempre la modalità immersiva)
}
let interestTimer = null, interestGone = false;
function syncInterest() {}
function toggleInfo() {
  const d = $("#photoDialog");
  if (d.classList.contains("pv-full")) setImmersive(false);
  const info = $("#pvInfo");
  d.classList.remove("info-hidden");
  info.scrollIntoView({ behavior: "smooth", block: "start" });
  info.classList.remove("pv-flash"); void info.offsetWidth; info.classList.add("pv-flash");
}
function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
const isTouch = () => matchMedia("(pointer: coarse)").matches;
/* Ruotare: sul telefono, se il sistema lo consente, si gira lo schermo; altrimenti si gira la foto di 90° */
async function rotatePhoto() {
  const d = $("#photoDialog"), so = screen.orientation;
  if (isTouch() && so?.lock) {
    try {
      if (!d.classList.contains("pv-full")) await setImmersive(true);
      await so.lock(so.type.startsWith("portrait") ? "landscape" : "portrait");
      d.classList.remove("rot-90");
      return;
    } catch { /* non permesso: si ruota la foto */ }
  }
  d.classList.toggle("rot-90");
}
/* Schermo intero: la foto da sola, su sfondo nero. Usa lo schermo intero del browser quando c'è
   (computer, Android); su iPhone, dove non esiste, la stessa vista occupa tutta la finestra.
   Si esce con la stessa icona, con l'icona in alto a destra o con ESC. */
let fsLeftAt = 0;
async function setImmersive(on) {
  const d = $("#photoDialog");
  d.classList.toggle("pv-full", on);
  const b = $("#dialogFull");
  b.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
  b.setAttribute("aria-pressed", String(on));
  $("#pvFsCount").textContent = $("#dialogCount").textContent;
  const root = document.documentElement;
  try {
    if (on && !isFullscreen()) await (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root, { navigationUI: "hide" });
    else if (!on && isFullscreen()) await (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  } catch { /* non disponibile: resta la vista a tutta finestra */ }
  if (on) $("#pvExitFs").focus({ preventScroll: true });
  else b.focus({ preventScroll: true });
}
function toggleFullscreen() { setImmersive(!$("#photoDialog").classList.contains("pv-full")); }
function openPhoto(id, list = photos) {
  trackEvent("Gallery: open photo");
  lightboxList = list;
  lightboxIndex = Math.max(0, list.findIndex(p => p.id === id));
  const d = $("#photoDialog");
  d.classList.remove("rot-90", "pv-full", "info-hidden");
  $("#pvMenuList").hidden = true; $("#pvMenu").setAttribute("aria-expanded", "false");
  renderThumbs();
  showLightbox();
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  document.documentElement.classList.add("no-scroll");
  renderPickBar();
}
function renderThumbs() {
  const box = $("#pvThumbs");
  box.hidden = lightboxList.length < 2;
  box.innerHTML = lightboxList.length < 2 ? "" : lightboxList.map((p, i) =>
    `<button type="button" class="pv-thumb" data-i="${i}" aria-label="${esc(p.title)} (${i + 1})"><img src="${esc(p.src)}" alt="" loading="lazy" data-cat="${esc(p.category)}"></button>`).join("");
  box.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => { lightboxIndex = +b.dataset.i; showLightbox(); }));
}
function showLightbox() {
  const p = lightboxList[lightboxIndex];
  if (!p) return;
  const img = $("#dialogImage");
  delete img.dataset.fallback;
  img.dataset.cat = p.category;
  img.alt = p.title;
  img.src = p.src;
  $("#photoDialog").classList.remove("rot-90");
  $("#dialogTitle").textContent = p.title;
  $("#dialogCategory").textContent = catLabel(p.category);
  $("#dialogMeta").textContent = [placeOf(p), p.date ? fmtDate(p.date) : ""].filter(Boolean).join(" · ");
  $("#dialogCoords").innerHTML = photoCoordsHtml(p);
  const count = lightboxList.length > 1 ? `${lightboxIndex + 1} / ${lightboxList.length}` : "";
  $("#dialogCount").textContent = count; $("#pvFsCount").textContent = count;
  $("#dialogDescription").textContent = p.description || "";
  const many = lightboxList.length > 1;
  $("#dialogPrev").hidden = $("#dialogNext").hidden = !many;
  $$("#pvThumbs .pv-thumb").forEach((b, i) => {
    const on = i === lightboxIndex;
    b.classList.toggle("on", on); b.setAttribute("aria-current", on ? "true" : "false");
    if (on) b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  });
  if (many) [1, -1].forEach(d => { const q = lightboxList[(lightboxIndex + d + lightboxList.length) % lightboxList.length]; if (q) new Image().src = q.src; });
  renderShot(p);
  renderJourneyFacts(p);
  renderInterest(p);
}
/* Fotocamera e parametri: quelli scritti nel pannello, altrimenti letti dalla foto (EXIF) */
function renderShot(p) {
  const box = $("#pvShot");
  const draw = x => {
    if (lightboxList[lightboxIndex] !== p) return;
    const rows = [["Camera", x.camera], ["Lens", x.lens], ["Settings", x.settings]].filter(r => r[1]);
    box.hidden = !rows.length;
    box.innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  };
  const own = { camera: p.camera, lens: p.lens, settings: p.settings };
  draw(own);
  if (own.camera && own.settings) return;
  readExif(p.src).then(e => e && draw({ camera: own.camera || e.camera, lens: own.lens || e.lens, settings: own.settings || e.settings }));
}
function renderJourneyFacts(p) {
  const box = $("#pvJourney"), t = tripById(p.trip);
  if (!t) { box.innerHTML = ""; return; }
  const n = photosOfTrip(t.id).length, sb = subOf(p);
  const tr = s => window.I18N ? I18N.t(s) : s;
  box.innerHTML = `<p class="pv-jlabel">Journey</p>
    <button type="button" class="pv-jlink" data-open-trip="${esc(t.id)}"><strong>${esc(t.name)}</strong><span aria-hidden="true">→</span></button>
    <ul>${[t.country, t.start ? fmtRange(t.start, t.end) : "", n === 1 ? tr("1 photo") : tr("{n} photos").replace("{n}", n), sb ? sb.name : ""].filter(Boolean).map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  box.querySelector("[data-open-trip]").addEventListener("click", () => {
    $("#photoDialog").close();
    location.hash = "explore"; setTimeout(() => openTrip(t.id), 60);
  });
}
/* Lettore EXIF minimo (JPEG): marca, modello, obiettivo, focale, diaframma, tempo, ISO.
   Scarica solo l'inizio del file (i dati sono lì) e ricorda il risultato. */
const exifCache = new Map();
function readExif(src) {
  if (!/\.jpe?g($|\?)/i.test(src)) return Promise.resolve(null);
  if (exifCache.has(src)) return exifCache.get(src);
  const job = fetch(src, { headers: { Range: "bytes=0-196607" } }).then(r => r.ok ? r.arrayBuffer() : null).then(buf => buf && parseExif(buf)).catch(() => null);
  exifCache.set(src, job);
  return job;
}
function parseExif(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
  let o = 2;
  while (o + 4 < v.byteLength) {
    if (v.getUint8(o) !== 0xFF) return null;
    const m = v.getUint8(o + 1), len = v.getUint16(o + 2);
    if (m === 0xE1 && v.getUint32(o + 4) === 0x45786966) return exifTiff(v, o + 10);
    if (m === 0xDA) return null;
    o += 2 + len;
  }
  return null;
}
function exifTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = x => v.getUint16(x, le), u32 = x => v.getUint32(x, le);
  const tags = {};
  const val = (type, cnt, at) => {
    const off = (type === 2 && cnt > 4) || (type === 3 && cnt > 2) || type === 5 || type === 10 ? t + u32(at) : at;
    if (off + 8 > v.byteLength) return null;
    if (type === 2) { let s = ""; for (let i = 0; i < cnt - 1 && off + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(off + i)); return s.trim(); }
    if (type === 3) return u16(off);
    if (type === 4) return u32(off);
    if (type === 5) { const d = u32(off + 4); return d ? u32(off) / d : null; }
    if (type === 10) { const d = v.getInt32(off + 4, le); return d ? v.getInt32(off, le) / d : null; }
    return null;
  };
  const ifd = at => {
    if (at + 2 > v.byteLength) return;
    const n = u16(at);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > v.byteLength) return;
      tags[u16(e)] = val(u16(e + 2), u32(e + 4), e + 8);
    }
  };
  try {
    ifd(t + u32(t + 4));
    if (tags[0x8769]) ifd(t + tags[0x8769]);
  } catch { /* file troncato */ }
  const make = tags[0x010F] || "", model = tags[0x0110] || "";
  const camera = model ? (model.toLowerCase().startsWith(make.split(" ")[0].toLowerCase()) ? model : `${make} ${model}`).trim() : "";
  const exp = tags[0x829A], f = tags[0x829D], iso = tags[0x8827], fl = tags[0x920A];
  const settings = [fl ? `${Math.round(fl)}mm` : "", f ? `f/${+f.toFixed(1)}` : "",
    exp ? (exp >= 1 ? `${+exp.toFixed(1)}s` : `1/${Math.round(1 / exp)}s`) : "", iso ? `ISO ${iso}` : ""].filter(Boolean).join(" · ");
  const lens = tags[0xA434] || "";
  return camera || settings || lens ? { camera, lens, settings } : null;
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
  syncInterest();
  box.onmouseleave = () => { if (interestGone) syncInterest(); };
  const t = box.querySelector(".pi-toggle");
  t.addEventListener("click", e => {
    e.stopPropagation();
    const open = !box.classList.contains("open");
    box.classList.toggle("open", open); t.setAttribute("aria-expanded", String(open));
    if (!open) { interestGone = true; syncInterest(); }
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
  if (lightboxList.length < 2) return;
  lightboxIndex = (lightboxIndex + d + lightboxList.length) % lightboxList.length;
  showLightbox();
  const img = $("#dialogImage");
  if (!img.dataset.swiping) { img.classList.remove("pv-fade"); void img.offsetWidth; img.classList.add("pv-fade"); }
}

/* Gesti sul telefono, sulla foto:
   - orizzontale: la foto segue il dito; oltre la soglia passa alla successiva / precedente
   - verso il basso: la foto segue il dito rimpicciolendosi; oltre la soglia il visualizzatore si chiude
   Due dita = zoom del browser: nessun gesto. Con la pagina ingrandita lo spostamento resta al browser.
   Sotto la foto (dettagli, miniature) lo scorrimento è quello normale. */
function setupPhotoGestures(dlg) {
  const stage = $("#pvStage"), img = $("#dialogImage");
  let g = null;
  const zoomed = () => (window.visualViewport?.scale || 1) > 1.02;
  const syncTouchAction = () => { stage.style.touchAction = zoomed() ? "auto" : "pinch-zoom"; };
  syncTouchAction();
  window.visualViewport?.addEventListener("resize", syncTouchAction);
  const rot = () => dlg.classList.contains("rot-90") ? " rotate(90deg)" : "";
  const setT = (x, y, sc, op) => { img.style.transform = `translate3d(${x}px,${y}px,0) scale(${sc})${rot()}`; img.style.opacity = op; };
  const reset = (anim = true) => {
    img.style.transition = anim ? "transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s" : "none";
    img.style.transform = ""; img.style.opacity = "";
    dlg.style.removeProperty("--pv-dim"); dlg.classList.remove("pv-dragging");
    if (anim) setTimeout(() => { if (!g) img.style.transition = ""; }, 300);
    else img.style.transition = "";
  };
  const end = () => { g = null; delete img.dataset.swiping; };

  stage.addEventListener("touchstart", e => {
    if (e.touches.length !== 1 || zoomed() || e.target.closest("button, a")) { if (g) { reset(); end(); } return; }
    const t = e.touches[0];
    g = { x: t.clientX, y: t.clientY, t: performance.now(), axis: null, dx: 0, dy: 0, scroll: dlg.classList.contains("pv-full") ? 0 : dlg.scrollTop };
  }, { passive: true });

  stage.addEventListener("touchmove", e => {
    if (!g) return;
    if (e.touches.length !== 1) { reset(); end(); return; }            // entra un secondo dito: è uno zoom
    const t = e.touches[0];
    g.dx = t.clientX - g.x; g.dy = t.clientY - g.y;
    if (!g.axis) {
      const ax = Math.abs(g.dx), ay = Math.abs(g.dy);
      if (ax < 10 && ay < 10) return;
      g.axis = ax > ay * 1.2 ? "x" : ay > ax * 1.2 ? "y" : null;
      if (!g.axis) return;
      // pagina già scorsa verso i dettagli: il dito sulla foto scorre (in su e in giù) invece di chiudere
      if (g.axis === "y" && (g.scroll > 4 || g.dy < 0)) g.axis = "scroll";
      img.style.transition = "none"; img.dataset.swiping = "1";
    }
    if (e.cancelable) e.preventDefault();
    if (g.axis === "scroll") { dlg.scrollTop = g.scroll - g.dy; return; }
    if (g.axis === "x") {
      const many = lightboxList.length > 1;
      const x = many ? g.dx : g.dx * 0.25;                               // una sola foto: resistenza
      setT(x, 0, 1, 1);
    } else {
      const dy = Math.max(0, g.dy), p = Math.min(dy / (innerHeight * 0.6), 1);
      dlg.classList.add("pv-dragging");
      dlg.style.setProperty("--pv-dim", String(1 - p * 0.75));
      setT(g.dx * 0.3, dy, 1 - p * 0.25, 1 - p * 0.45);
    }
  }, { passive: false });

  const finish = () => {
    if (!g) return;
    const { axis, dx, dy } = g, dt = Math.max(1, performance.now() - g.t);
    if (!axis || axis === "scroll") { end(); return; }
    const W = stage.clientWidth || innerWidth;
    if (axis === "x") {
      const fast = Math.abs(dx) / dt > 0.45 && Math.abs(dx) > 30;
      if (lightboxList.length > 1 && (Math.abs(dx) > W * 0.22 || fast)) {
        const dir = dx < 0 ? 1 : -1;
        const n = lightboxList.length, next = (lightboxIndex + dir + n) % n;
        const cnt = `${next + 1} / ${n}`;
        $("#dialogCount").textContent = cnt; $("#pvFsCount").textContent = cnt;   // contatore subito
        img.style.transition = "transform .2s ease-out, opacity .2s";
        setT(-dir * W, 0, 1, 0);
        setTimeout(() => {
          img.style.transition = "none";
          stepLightbox(dir);
          setT(dir * W * 0.6, 0, 1, 0);
          void img.offsetWidth;
          img.style.transition = "transform .26s cubic-bezier(.2,.8,.2,1), opacity .26s";
          img.style.transform = rot().trim() || ""; img.style.opacity = "";
          setTimeout(() => { img.style.transition = ""; }, 280);
          end();
        }, 190);
        return;
      }
      reset(); end(); return;
    }
    // verso il basso
    const fast = dy / dt > 0.5 && dy > 40;
    if (dy > Math.min(130, innerHeight * 0.16) || fast) {
      img.style.transition = "transform .22s ease-in, opacity .22s";
      dlg.style.setProperty("--pv-dim", "0");
      setT(dx * 0.3, innerHeight * 0.5, 0.7, 0);
      setTimeout(() => { dlg.close(); reset(false); end(); }, 210);
      return;
    }
    reset(); end();
  };
  stage.addEventListener("touchend", finish);
  stage.addEventListener("touchcancel", () => { if (g) { reset(); end(); } });
  dlg.addEventListener("close", () => { if (g) end(); reset(false); });
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
        <p class="fn-meta">${a.author && !a.author.own ? `By ${esc(a.author.name)}${a.author.folk && FOLK_LABEL[a.author.folk] ? ` (${FOLK_LABEL[a.author.folk]})` : ""} · ` : ""}${esc(fmtDate(a.date))}${a.minutes ? ` · ${a.minutes} min read` : ""}</p>
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
/* impaginazione a blocchi (pannello): testo, foto con formato, foto affiancate, citazioni, nell'ordine scelto */
const FIG_FMT = { "Tutta larghezza": "full", "Nella colonna": "col", "A sinistra nel testo": "left", "A destra nel testo": "right", "Pagina intera": "page" };
function blocksHtml(blocks) {
  const fig = (src, cap, fmt) => `<figure class="mag-fig fig-${fmt}"><img src="${esc(mediaUrl(src))}" alt="${esc(cap || "")}" loading="lazy">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ""}</figure>`;
  return blocks.map(b => {
    const kind = b.blocco || b._block || b.type || "";
    if (kind === "testo") return md(b.testo || "");
    if (kind === "foto" && b.immagine) return fig(b.immagine, b.didascalia, FIG_FMT[b.formato] || "full");
    if (kind === "coppia") {
      const imgs = (Array.isArray(b.immagini) ? b.immagini : b.immagini ? [b.immagini] : []).map(x => typeof x === "string" ? x : x?.immagine || "").filter(Boolean).slice(0, 3);
      if (!imgs.length) return "";
      return `<div class="mag-spread n${Math.max(2, imgs.length)}">${imgs.map(i => fig(i, "", "full")).join("")}</div>${b.didascalia ? `<p class="fig-cap-shared">${esc(b.didascalia)}</p>` : ""}`;
    }
    if (kind === "citazione" && b.testo) return `<blockquote><p>${esc(b.testo)}</p>${b.autore ? `<cite>— ${esc(b.autore)}</cite>` : ""}</blockquote>`;
    return "";
  }).join("");
}
/* lingua del testo (per andare a capo con la sillabazione giusta nel testo giustificato) */
function textLang(t) {
  const w = " " + String(t || "").toLowerCase().replace(/[^a-zà-ú' ]+/g, " ") + " ";
  const n = re => (w.match(re) || []).length;
  const it = n(/ (il|che|della|delle|di|per|non|una|sono|nel|alla|gli) /g), en = n(/ (the|and|of|to|is|with|that|this|for|you) /g);
  return it > en ? "it" : "en";
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
    <div class="rich mag-body fn-body" lang="${textLang(a.text + " " + (a.blocks || []).map(b => b.testo || "").join(" "))}">${dropCap(a.blocks?.length ? blocksHtml(a.blocks) : magBody(md(a.text)))}</div>
    <p class="fn-end">Thanks for stopping by. Now, let's go explore.</p>` + (a.author && !a.author.own ? authorBox(a.author) : "");
}

/* =========================================================
   7b. RIVISTA DEL MESE — «Field Notes From Planet Earth»
   Il numero del mese in corso cresce con gli articoli; il 1° del mese si chiude e ne parte uno nuovo.
   Il numero chiuso diventa un PDF (vedi rivista.html e .github/workflows/rivista.yml), scaricabile per un mese.
   ========================================================= */
const MAG_NAME = "Field Notes From Planet Earth";
const MAG_REPO = "fabiocostantini25491/fabio-costa-ph";
const romeMonth = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
const monthLabel = m => { const [y, mo] = m.split("-").map(Number); return new Intl.DateTimeFormat(window.I18N?.locale || "en-GB", { month: "long", year: "numeric" }).format(new Date(y, mo - 1, 15)); };
/* numero progressivo: il mese del primo articolo è il N° 1 */
function issueNumber(month) {
  const first = articles.map(a => (a.date || "").slice(0, 7)).filter(Boolean).sort()[0] || month;
  const [y1, m1] = first.split("-").map(Number), [y2, m2] = month.split("-").map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}
let magCovers = null, magPdf;
async function loadMagCovers() {
  if (magCovers) return magCovers;
  try { const r = await getJSON("content/rivista.json"); magCovers = Array.isArray(r?.numeri) ? r.numeri : []; } catch { magCovers = []; }
  return magCovers;
}
/* il PDF dell'ultimo numero chiuso: è un allegato della release «rivista-pdf» su GitHub (controllato al massimo ogni 6 ore) */
async function loadMagPdf() {
  if (magPdf !== undefined) return magPdf;
  const KEY = "fcph-mag-pdf";
  try { const c = JSON.parse(localStorage.getItem(KEY) || "null"); if (c && Date.now() - c.at < 6 * 3600e3) return (magPdf = c.v); } catch {}
  magPdf = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${MAG_REPO}/releases/tags/rivista-pdf`, { headers: { Accept: "application/vnd.github+json" } });
    if (r.ok) {
      const rel = await r.json(), asset = (rel.assets || []).find(x => /\.pdf$/i.test(x.name));
      let info = {};
      try { info = JSON.parse(String(rel.body || "").match(/\{[\s\S]*\}/)?.[0] || "{}"); } catch {}
      if (asset) magPdf = { url: asset.browser_download_url, size: asset.size, month: info.month || "", number: info.number || 0, until: info.until || "" };
    }
  } catch {}
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), v: magPdf })); } catch {}
  return magPdf;
}
function magPdfHtml(p) {
  if (!p) return "";
  const mb = p.size ? ` · ${(p.size / 1048576).toFixed(p.size > 10485760 ? 0 : 1)} MB` : "";
  const until = p.until ? new Intl.DateTimeFormat(window.I18N?.locale || "en-GB", { day: "numeric", month: "long" }).format(new Date(p.until + "T12:00:00")) : "";
  return `<a class="mz-pdf" href="${esc(p.url)}" target="_blank" rel="noopener" data-mag-pdf>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 19h14"/></svg>
    <span><b>${(window.I18N ? I18N.t("Download the last issue") : "Download the last issue")}</b><small>${p.number ? `N° ${p.number} · ` : ""}${p.month ? esc(monthLabel(p.month)) : ""} · PDF${mb}${until ? ` · available until ${esc(until)}` : ""}</small></span></a>`;
}
/* numeri passati: tutti i mesi con almeno un articolo, dal più recente */
function pastIssues(current) {
  const months = [...new Set(articles.map(a => (a.date || "").slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m) && m < current))].sort().reverse();
  return months.map(m => ({ month: m, number: issueNumber(m), stories: articles.filter(a => (a.date || "").slice(0, 7) === m) }));
}
/* PDF di un numero: quello ufficiale (il mese appena chiuso, finché è disponibile) oppure impaginato al momento nel browser */
function issuePdfLink(m, pdf, cls = "") {
  if (pdf && pdf.month === m) return `<a class="${cls}" href="${esc(pdf.url)}" target="_blank" rel="noopener" data-mag-pdf>PDF</a>`;
  return `<a class="${cls}" href="rivista.html?mese=${m}&amp;print=1" target="_blank" rel="noopener" data-mag-print>PDF</a>`;
}
async function renderMagazine(want) {
  const layout = $("#journalLayout");
  layout.hidden = false;
  $("#articleReader").hidden = true;
  const now = romeMonth(), month = want && want < now ? want : now, closed = month !== now, num = issueNumber(month);
  const list = articles.filter(a => (a.date || "").slice(0, 7) === month).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  renderTopics([...new Set(articles.map(a => a.category))], "");
  const covers = await loadMagCovers();
  if (document.body.dataset.page !== "journal" || renderMagazine.token !== magToken) return;
  const setCover = covers.find(c => String(c.mese || "").trim() === month);
  const cover = setCover?.copertina ? mediaUrl(setCover.copertina) : (list.find(a => a.cover)?.cover || "");
  const authors = new Set(list.map(a => a.author?.name).filter(Boolean)).size;
  const T = s => window.I18N ? I18N.t(s) : s;
  layout.innerHTML = `<div class="mz">
    <header class="mz-cover${cover ? "" : " no-img"}">
      ${cover ? `<img class="mz-cover-img" src="${esc(cover)}" alt="" data-zoom>` : ""}
      <div class="mz-cover-text">
        <p class="mz-issue">N° ${num} · ${esc(monthLabel(month))}</p>
        <h2 class="mz-name">Field Notes<span>From Planet Earth</span></h2>
        ${setCover?.titolo ? `<p class="mz-cover-title">${esc(setCover.titolo)}</p>` : ""}
        <p class="mz-status">${closed ? `${T("Closed issue")} · ` : `<span class="mz-live" aria-hidden="true"></span>${T("In progress")} · `}${list.length === 1 ? T("1 story") : T("{n} stories").replace("{n}", list.length)}${authors > 1 ? ` · ${T("{n} authors").replace("{n}", authors)}` : ""}</p>
      </div>
    </header>
    <div class="mz-pdfslot" id="mzPdf"></div>
    ${setCover?.folk_nome ? `<section class="mz-folk" aria-label="Folk of the month">
      ${setCover.folk_foto ? `<img src="${esc(mediaUrl(setCover.folk_foto))}" alt="" loading="lazy">` : ""}
      <div><p class="mz-folk-k">Folk of the month</p><h3>${esc(setCover.folk_nome)}</h3>${setCover.folk_tipo && FOLK_LABEL[setCover.folk_tipo] ? `<p class="mz-folk-t">${FOLK_LABEL[setCover.folk_tipo]}</p>` : ""}
        ${setCover.folk_testo ? `<p>${esc(setCover.folk_testo)}</p>` : ""}<a class="text-link" href="#wayfolk">Meet the folk on Wayfolk →</a></div>
    </section>` : ""}
    <section class="mz-toc" id="mzToc" aria-label="Contents">
      <h3>Contents</h3>
      ${list.length ? `<ol>${list.map((a, i) => `<li><button type="button" data-goto="${esc(a.id)}">
        <span class="mz-n">${String(i + 1).padStart(2, "0")}</span>
        <span class="mz-t"><small>${a.type === "reportage" ? "Reportage" : esc(catLabel(a.category))}</small><strong>${esc(a.title)}</strong>
          <em>${esc(a.author?.name || "")}${a.author?.folk && FOLK_LABEL[a.author.folk] ? ` (${FOLK_LABEL[a.author.folk]})` : ""} · ${esc(fmtDate(a.date))}${a.minutes ? ` · ${a.minutes} min` : ""}</em></span></button></li>`).join("")}</ol>`
        : `<p class="mz-empty">The first story of this issue is being written. It closes on the last day of the month.</p>`}
      ${closed ? `<p class="mz-note"><a href="#magazine">← This month's issue</a></p>` : `<p class="mz-note">This issue grows with every new story and closes at the end of the month. Then it becomes a PDF you can download for one month.</p>`}
    </section>
    ${list.map((a, i) => `<section class="mz-article" id="mz-${esc(a.id)}" data-title="${esc(a.title)}">
      <p class="mz-runhead"><span>${String(i + 1).padStart(2, "0")}</span>${MAG_NAME} · N° ${num}</p>
      <article class="full-article mag-article ${a.type === "reportage" ? "is-reportage" : "is-guide"}">${articleHtml(a, a.trip && tripById(a.trip), false)}</article>
    </section>`).join("")}
    ${list.length ? `<p class="fn-foot">${MAG_NAME} · N° ${num} · ${esc(monthLabel(month))}</p>` : ""}
    <section class="mz-archive" id="mzArchive" hidden></section>
    <div class="mz-bar" id="mzBar" hidden><button type="button" id="mzTop">↑ Contents</button><span id="mzNow"></span></div>
  </div>`;
  layout.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => {
    document.getElementById("mz-" + b.dataset.goto)?.scrollIntoView({ behavior: "smooth", block: "start" });
    trackEvent("Magazine: open from contents");
  }));
  $("#mzTop").addEventListener("click", () => $("#mzToc").scrollIntoView({ behavior: "smooth", block: "start" }));
  // barra in basso: dove sei nel numero
  const bar = $("#mzBar"), nowEl = $("#mzNow");
  magObserver?.disconnect();
  if (list.length && "IntersectionObserver" in window) {
    magObserver = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { nowEl.textContent = e.target.dataset.title || ""; } });
      const inArticles = [...layout.querySelectorAll(".mz-article")].some(s => { const r = s.getBoundingClientRect(); return r.top < innerHeight * 0.6 && r.bottom > 0; });
      bar.hidden = !inArticles;
    }, { rootMargin: "-40% 0px -55% 0px" });
    layout.querySelectorAll(".mz-article").forEach(s => magObserver.observe(s));
    const tocObs = new IntersectionObserver(([e]) => { if (e.isIntersecting) bar.hidden = true; });
    tocObs.observe($("#mzToc"));
    magObserver._toc = tocObs;
  }
  const pdf = await loadMagPdf();
  if (!$("#mzPdf")) return;
  // in un numero chiuso: il PDF ufficiale se è ancora disponibile, altrimenti quello impaginato al momento
  if (closed && list.length) $("#mzPdf").innerHTML = pdf && pdf.month === month ? magPdfHtml(pdf)
    : `<a class="mz-pdf" href="rivista.html?mese=${month}&amp;print=1" target="_blank" rel="noopener" data-mag-print>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 19h14"/></svg>
        <span><b>${T("Download this issue")}</b><small>N° ${num} · ${esc(monthLabel(month))} · ${T("PDF prepared on request: choose “Save as PDF” in the print window")}</small></span></a>`;
  else $("#mzPdf").innerHTML = magPdfHtml(pdf);
  // archivio dei numeri passati
  const past = pastIssues(now).filter(x => x.month !== month);
  const box = $("#mzArchive");
  box.hidden = !past.length;
  box.innerHTML = past.length ? `<h3>Past issues</h3><ul>${past.map(x => {
    const cv = (magCovers || []).find(c => String(c.mese || "").trim() === x.month);
    const img = cv?.copertina ? mediaUrl(cv.copertina) : (x.stories.find(a => a.cover)?.cover || "");
    return `<li><a class="mz-arc" href="#magazine-${x.month}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="mz-arc-ph"></span>`}
      <span><small>N° ${x.number}</small><strong>${esc(monthLabel(x.month))}</strong><em>${x.stories.length === 1 ? T("1 story") : T("{n} stories").replace("{n}", x.stories.length)}</em></span></a>
      ${issuePdfLink(x.month, pdf, "mz-arc-pdf")}</li>`;
  }).join("")}</ul>` : "";
}
let magObserver = null, magToken = 0;
function setJournalMode(mode) {
  $$(".fn-modes [data-jmode]").forEach(a => { const on = a.dataset.jmode === mode; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#journalMag")?.classList.toggle("is-magazine", mode === "magazine");
  if (mode !== "magazine") { magObserver?.disconnect(); magObserver?._toc?.disconnect(); }
}

/* ---------- foto degli articoli: si ingrandiscono a tutto schermo ---------- */
function setupArticleZoom() {
  const d = $("#zoomDialog");
  if (!d) return;
  let list = [], i = 0;
  const show = () => {
    const im = list[i]; if (!im) return;
    $("#zmImg").src = im.currentSrc || im.src; $("#zmImg").alt = im.alt || "";
    const cap = im.closest("figure")?.querySelector("figcaption")?.textContent || im.alt || "";
    $("#zmCap").textContent = cap; $("#zmCap").hidden = !cap;
    $("#zmCount").textContent = list.length > 1 ? `${i + 1} / ${list.length}` : "";
    $("#zmPrev").hidden = $("#zmNext").hidden = list.length < 2;
  };
  const step = k => { if (list.length > 1) { i = (i + k + list.length) % list.length; show(); } };
  document.addEventListener("click", e => {
    const img = e.target.closest?.("#journalMag .mag-body img, #journalMag .fn-hero img, #journalMag .mz-cover-img, #journalMag .gd-photo img, #journalMag .gd-hero img");
    if (!img || img.closest("a")) return;
    const scope = img.closest(".mag-article, .mz-cover, .gd") || document;
    list = [...scope.querySelectorAll(".mag-body img, .fn-hero img, .mz-cover-img, .gd-photo img, .gd-hero img")];
    i = Math.max(0, list.indexOf(img));
    show(); d.showModal(); document.documentElement.classList.add("no-scroll");
    trackEvent("Journal: zoom photo");
  });
  $("#zmClose").addEventListener("click", () => d.close());
  $("#zmPrev").addEventListener("click", () => step(-1));
  $("#zmNext").addEventListener("click", () => step(1));
  d.addEventListener("click", e => { if (e.target === d || e.target.id === "zmStage") d.close(); });
  d.addEventListener("close", () => document.documentElement.classList.remove("no-scroll"));
  d.addEventListener("keydown", e => { if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
  let x0 = null, y0 = null;
  const st = $("#zmStage");
  st.addEventListener("touchstart", e => { if (e.touches.length === 1 && (visualViewport?.scale || 1) <= 1.02) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive: true });
  st.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
    else if (dy > 90 && dy > Math.abs(dx) * 1.3) d.close();
  });
}

/* =========================================================
   7c. GUIDES — guide per zone (pannello → content/guide.json), con PDF su richiesta (guida.html)
   ========================================================= */
let guidesData = null;
async function loadGuides() {
  if (guidesData) return guidesData;
  try { const r = await getJSON("content/guide.json"); guidesData = (Array.isArray(r?.guide) ? r.guide : []).filter(g => g && g.titolo && g.slug && !g.bozza); }   // le bozze non si vedono sul sito
  catch { guidesData = []; }
  return guidesData;
}
const LIGHT_ICON = { "Sunrise": "◐", "Early morning": "◔", "Morning": "○", "Afternoon": "◑", "Sunset": "◒", "Blue hour": "◕", "Night": "●", "Any time": "◌" };
const ZONE_COLORS = ["#b20d0d", "#1f5f8b", "#7a5a12", "#2d6a4f", "#6b3fa0", "#a0522d", "#3d5a80", "#8a1c7c"];
/* Canal Grande, tracciato schematico (per orientarsi sulle mappe delle guide di Venezia) */
const VENICE_CANAL = [[45.4378,12.3172],[45.4398,12.3208],[45.4412,12.3228],[45.4424,12.3262],[45.4434,12.3296],[45.442,12.333],[45.44,12.335],[45.438,12.336],[45.4362,12.334],[45.435,12.3312],[45.4344,12.3275],[45.4334,12.3264],[45.4318,12.3287],[45.4316,12.332],[45.431,12.335],[45.4318,12.339]];
/* mappa schematica in SVG: punti numerati su un riquadro in scala, senza tessere (va bene anche nel PDF) */
function guideMapSvg(points, { w = 640, h = 380, color = "#b20d0d", canal = false, labels = false } = {}) {
  const pts = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!pts.length) return "";
  const k = Math.cos(pts[0].lat * Math.PI / 180);
  let x0 = Math.min(...pts.map(p => p.lon)), x1 = Math.max(...pts.map(p => p.lon)), y0 = Math.min(...pts.map(p => p.lat)), y1 = Math.max(...pts.map(p => p.lat));
  const padX = Math.max((x1 - x0) * 0.12, 0.0015), padY = Math.max((y1 - y0) * 0.12, 0.0012);
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  const sx = (w - 40) / ((x1 - x0) * k), sy = (h - 40) / (y1 - y0), s = Math.min(sx, sy);
  const ox = (w - (x1 - x0) * k * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  const X = lon => ox + (lon - x0) * k * s, Y = lat => h - oy - (lat - y0) * s;
  const canalPath = canal ? `<path d="${VENICE_CANAL.map(([la, lo], i) => `${i ? "L" : "M"}${X(lo).toFixed(1)} ${Y(la).toFixed(1)}`).join(" ")}" class="gm-canal"/>` : "";
  // scala grafica: 200 m
  const m200 = 200 / (111320 * k) * k * s;
  return `<svg class="gm" viewBox="0 0 ${w} ${h}" role="img" aria-label="Schematic map">
    <rect x="0" y="0" width="${w}" height="${h}" class="gm-bg"/>${canalPath}
    ${canal ? `<text x="${w - 12}" y="${h - 12}" class="gm-note" text-anchor="end">Grand Canal, schematic</text>` : ""}
    <g class="gm-scale"><path d="M14 ${h - 16}h${m200.toFixed(1)}"/><text x="14" y="${h - 22}">200 m</text></g>
    <text x="${w - 14}" y="22" class="gm-n" text-anchor="end">N ↑</text>
    ${pts.map(p => `<g class="gm-pt"><circle cx="${X(p.lon).toFixed(1)}" cy="${Y(p.lat).toFixed(1)}" r="11" fill="${p.color || color}"/><text x="${X(p.lon).toFixed(1)}" y="${(Y(p.lat) + 4).toFixed(1)}" text-anchor="middle">${p.n}</text>${labels ? `<text class="gm-lbl" x="${(X(p.lon) + 15).toFixed(1)}" y="${(Y(p.lat) + 4).toFixed(1)}">${esc(p.label || "")}</text>` : ""}</g>`).join("")}
  </svg>`;
}
const gnum = g => { let n = 0; return (g.zone || []).map((z, zi) => ({ ...z, color: ZONE_COLORS[zi % ZONE_COLORS.length], luoghi: (z.luoghi || []).filter(l => l && l.nome).map(l => ({ ...l, n: ++n, lat: parseFloat(l.lat), lon: parseFloat(l.lon) })) })); };
const mdInline = t => md(t || "").replace(/^<p>|<\/p>\s*$/g, "");
async function renderGuides() {
  const layout = $("#journalLayout");
  layout.hidden = false; $("#articleReader").hidden = true;
  renderTopics([...new Set(articles.map(a => a.category))], "");
  const list = await loadGuides();
  if (document.body.dataset.page !== "journal" || !/^#guides$/.test(location.hash)) return;
  const T = s => window.I18N ? I18N.t(s) : s;
  layout.innerHTML = `<div class="gd-shelf">
    <p class="gd-shelf-lead">${T("Travel guides, zone by zone: what to see, when to go, where to stop and the practical things to know — with a photographer's eye. Read them here or download the PDF.")}</p>
    ${list.length ? `<ul class="gd-books">${list.map(g => {
      const n = (g.zone || []).reduce((a, z) => a + (z.luoghi || []).length, 0);
      return `<li><a class="gd-book" href="#g-${esc(g.slug)}">
        <span class="gd-cover${g.copertina ? "" : " no-img"}">${g.copertina ? `<img src="${esc(mediaUrl(g.copertina))}" alt="" loading="lazy">` : ""}<span class="gd-cover-t"><small>Field Notes · Guide</small><b>${esc(g.titolo)}</b><em>${esc(g.sottotitolo || "")}</em></span></span>
        <span class="gd-book-meta">${(g.zone || []).length} ${T("zones")} · ${n} ${T("places")}</span></a>
        <a class="gd-book-pdf" href="guida.html?g=${encodeURIComponent(g.slug)}&amp;print=1" target="_blank" rel="noopener" data-guide-pdf>PDF</a></li>`;
    }).join("")}</ul>` : `<p class="mz-empty">${T("The first guide is being written.")}</p>`}
  </div>`;
}
async function renderGuide(slugId) {
  const layout = $("#journalLayout");
  layout.hidden = false; $("#articleReader").hidden = true;
  renderTopics([...new Set(articles.map(a => a.category))], "");
  const g = (await loadGuides()).find(x => x.slug === slugId);
  if (document.body.dataset.page !== "journal") return;
  if (!g) { location.hash = "guides"; return; }
  const T = s => window.I18N ? I18N.t(s) : s;
  const zones = gnum(g), venice = /venice|venezia/i.test(g.slug + g.titolo);
  const all = zones.flatMap(z => z.luoghi.map(l => ({ ...l, color: z.color, label: l.nome })));
  const pdf = `guida.html?g=${encodeURIComponent(g.slug)}&amp;print=1`;
  layout.innerHTML = `<article class="gd">
    <a class="fn-back" href="#guides">← ${T("All guides")}</a>
    <header class="gd-hero${g.copertina ? "" : " no-img"}">
      ${g.copertina ? `<img src="${esc(mediaUrl(g.copertina))}" alt="" data-zoom>` : ""}
      <div class="gd-hero-t"><p class="mz-issue">Field Notes · ${T("Guide")}${g.luogo ? ` · ${esc(g.luogo)}` : ""}</p><h2>${esc(g.titolo)}</h2>${g.sottotitolo ? `<p class="gd-sub">${esc(g.sottotitolo)}</p>` : ""}</div>
    </header>
    <div class="gd-bar"><a class="mz-pdf gd-pdf" href="${pdf}" target="_blank" rel="noopener" data-guide-pdf>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 19h14"/></svg>
      <span><b>${T("Download the PDF guide")}</b><small>${T("Prepared on request: choose “Save as PDF” in the print window")}</small></span></a></div>
    ${g.intro ? `<p class="gd-intro">${esc(g.intro)}</p>` : ""}
    <section class="gd-glance"><h3>${T("The zones")}</h3>
      <div class="gd-map" id="gdMap">${guideMapSvg(all, { w: 900, h: 560, canal: venice })}</div>
      <ol class="gd-zlist">${zones.map((z, i) => `<li><a href="#" data-gz="${i}"><span class="gd-dot" style="background:${z.color}"></span><b>${esc(z.nome)}</b><small>${z.luoghi.length} ${T("places")}</small></a></li>`).join("")}</ol>
    </section>
    ${zones.map((z, i) => `<section class="gd-zone" id="gz-${i}" style="--zc:${z.color}">
      <p class="gd-zk">${T("Zone")} ${i + 1}</p><h3>${esc(z.nome)}</h3>
      ${z.intro ? `<p class="gd-zintro">${esc(z.intro)}</p>` : ""}
      <div class="gd-zmap">${guideMapSvg(z.luoghi, { color: z.color, canal: venice })}</div>
      <ol class="gd-spots">${z.luoghi.map(l => `<li class="gd-spot">
        <span class="gd-n" style="background:${z.color}">${l.n}</span>
        <div><h4>${esc(l.nome)}</h4>
          ${l.luce ? `<p class="gd-light"><span aria-hidden="true">${LIGHT_ICON[l.luce] || "○"}</span> ${T("Best time")}: <b>${esc(T(l.luce))}</b></p>` : ""}
          ${l.consiglio ? `<p>${mdInline(l.consiglio)}</p>` : ""}
          ${l.nota ? `<p class="gd-note">${esc(l.nota)}</p>` : ""}
          ${l.foto ? `<figure class="gd-photo"><img src="${esc(mediaUrl(l.foto))}" alt="${esc(l.nome)}" loading="lazy"></figure>` : ""}
          ${Number.isFinite(l.lat) ? `<p class="gd-coord">${fmtCoord(l.lat, l.lon)} · <a href="${gmapsUrl(l.lat, l.lon)}" target="_blank" rel="noopener">${T("Open in Maps")}</a></p>` : ""}
        </div></li>`).join("")}</ol>
    </section>`).join("")}
    ${(g.pause || []).length ? `<section class="gd-zone gd-pause"><p class="gd-zk">${T("Take a break")}</p><h3>${T("Where to stop")}</h3>
      <ul class="gd-spots">${g.pause.map(p => `<li class="gd-spot"><span class="gd-n gd-cup">☕</span><div><h4>${esc(p.nome)}</h4>${p.consiglio ? `<p>${esc(p.consiglio)}</p>` : ""}${p.nota ? `<p class="gd-note">${esc(p.nota)}</p>` : ""}
        ${Number.isFinite(parseFloat(p.lat)) ? `<p class="gd-coord"><a href="${gmapsUrl(parseFloat(p.lat), parseFloat(p.lon))}" target="_blank" rel="noopener">${T("Open in Maps")}</a></p>` : ""}</div></li>`).join("")}</ul></section>` : ""}
    ${g.pratiche ? `<section class="gd-zone gd-prac"><p class="gd-zk">${T("Before you go")}</p><h3>${T("Practical information")}</h3><div class="rich gd-rich">${md(g.pratiche)}</div></section>` : ""}
    <p class="fn-foot">Field Notes · ${esc(g.titolo)}${g.aggiornata ? ` · ${T("updated")} ${esc(fmtDate(g.aggiornata))}` : ""}</p>
  </article>`;
  layout.querySelectorAll("[data-gz]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); document.getElementById("gz-" + a.dataset.gz)?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  requestAnimationFrame(() => $("#journalMag")?.scrollIntoView({ block: "start" }));
}

/* ---------- articoli dei contributor approvati (Supabase) ---------- */
const TOPIC_OF = { "Attualità": "Attualità", Luoghi: "Luoghi", Viaggi: "Viaggi", Persone: "Persone", Natura: "Natura", Fotografia: "Fotografia", Tecnica: "Tecnica", "Guide pratiche": "Guide pratiche", Ispirazione: "Ispirazione" };
function submissionToArticle(x) {
  const words = String(x.body || "").split(/\s+/).length;
  return { id: `c-${x.slug || x.id}`, title: x.title, category: TOPIC_OF[x.topic] || "Luoghi", date: String(x.published_at || x.updated_at || "").slice(0, 10),
    minutes: Math.max(1, Math.round(words / 220)), cover: x.cover_url || "", trip: "", excerpt: x.excerpt || "", text: x.body || "",
    type: x.kind === "reportage" ? "reportage" : "guide", place: x.place || "", glance: x.glance || {},
    author: (x.author_name || "").trim() === (about?.proprietario || "Fabio Costantini") ? { name: x.author_name, slug: "fabio", own: true }
      : { name: x.author_name, slug: slug(x.author_name), own: false, instagram: x.author_instagram || "", site: x.author_site || "", bio: x.author_bio || "", photo: "", folk: x.author_folk || "" } };
}
/* articoli scritti sul sito: restano sul dispositivo; a ogni visita si controlla solo un elenco minuscolo
   (id + ultima modifica) e si scaricano soltanto gli articoli nuovi o cambiati — molto meno traffico su Supabase */
const JOURNAL_CACHE = "fcph-journal-v1";
async function loadCommunityArticles() {
  if (typeof SPOTS_CONFIG === "undefined" || !SPOTS_CONFIG.url) return;
  const base = `${SPOTS_CONFIG.url.replace(/\/$/, "")}/rest/v1/journal_submissions`, headers = { apikey: SPOTS_CONFIG.anonKey };
  const COLS = "id,slug,title,kind,topic,place,excerpt,body,cover_url,glance,author_name,author_instagram,author_site,author_bio,published_at,updated_at";
  try {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(JOURNAL_CACHE) || "{}") || {}; } catch {}
    const res = await fetch(`${base}?select=id,updated_at&status=eq.published&order=published_at.desc&limit=200`, { headers });
    if (!res.ok) return;
    const stubs = await res.json();
    const want = stubs.filter(x => !cache[x.id] || cache[x.id].updated_at !== x.updated_at).map(x => x.id);
    if (want.length) {
      let r2 = await fetch(`${base}?select=${COLS},author_folk&status=eq.published&id=in.(${want.join(",")})`, { headers });
      if (r2.status === 400) r2 = await fetch(`${base}?select=${COLS}&status=eq.published&id=in.(${want.join(",")})`, { headers });   // colonna «author_folk» non ancora creata
      if (!r2.ok) return;
      (await r2.json()).forEach(x => { cache[x.id] = x; });
    }
    const rows = stubs.map(x => cache[x.id]).filter(Boolean);
    try { localStorage.setItem(JOURNAL_CACHE, JSON.stringify(Object.fromEntries(rows.map(x => [x.id, x])))); } catch {}
    const extra = rows.map(submissionToArticle);
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
      <div class="crew-avatar${c.avatar_path ? " has-photo" : ""}" aria-hidden="true">${c.avatar_path ? `<img src="${esc(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/storage/v1/object/public/avatars/${c.avatar_path}`)}" alt="" loading="lazy">` : isCo(c) ? CREW_AP : isDev(c) ? CREW_DEV : `<span>${esc(ini(c.name))}</span>`}</div>
      <h3>${esc(c.name)}</h3>
      ${c.username ? `<p class="crew-user">@${esc(c.username)}</p>` : ""}
      <p class="crew-badges">${isCo(c) ? `<span class="co-badge">${CREW_AP}Contributor</span>` : ""}${isDev(c) ? `<span class="co-badge dev-badge">${CREW_DEV}Developer</span>` : ""}${isXp(c) ? `<span class="xp-badge">🧭 ${esc(c.expert_area)}</span>` : ""}</p>
      ${c.base_name ? `<p class="crew-base">${ICON.pin}${esc(c.base_name)}</p>` : ""}
      ${c.bio ? `<p class="crew-bio">${esc(c.bio)}</p>` : ""}
      <p class="crew-links">
        ${c.instagram ? `<a href="https://www.instagram.com/${encodeURIComponent(c.instagram)}/" target="_blank" rel="noopener">Instagram @${esc(c.instagram)}</a>` : ""}
        ${site ? `<a href="${esc(site)}" target="_blank" rel="noopener">${ICON.ext}Website</a>` : ""}
        ${c.articles ? `<a href="#author-${esc(slug(c.name))}">${c.articles} ${c.articles === 1 ? "story" : "stories"} in the Journal →</a>` : ""}
        ${c.on_map ? `<a href="#wayfolk">On the Wayfolk map</a>` : ""}
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
    trips: trips.filter(t => photosOfTrip(t.id).length && [t.name, t.country, t.collection, ...t.subs.map(x => x.name)].some(v => norm(v).includes(n))),
    photos: photos.filter(p => norm(p.title).includes(n) || norm(p.description).includes(n) || norm(subOf(p)?.name).includes(n)).slice(0, 6),
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
    let closed = false; try { closed = localStorage.getItem("fcph-lic-closed") === "1"; } catch {}
    if (closed) note.hidden = true;
    note.innerHTML = `<span class="gl-lic-ic">${ICON_SPARK}</span>
      <div class="gl-lic-body"><p class="gl-lic-lead">${intro}</p>
        <p class="gl-lic-more" id="licMore" hidden>${write}${okMail ? `${T(" at ")}<a href="mailto:${esc(mail)}?subject=${encodeURIComponent("Photo licensing / prints")}" data-lic="email">${esc(mail)}</a>` : ""}${okMail && ig ? T(" or") : ""}${ig ? `${T(" on ")}<a href="https://ig.me/m/${encodeURIComponent(ig)}" target="_blank" rel="noopener" data-lic="instagram">Instagram @${esc(ig)}</a>` : ""}.</p></div>
      <button type="button" class="outline-link gl-lic-go" aria-expanded="false" aria-controls="licMore">Learn more <span aria-hidden="true">→</span></button>
      <button type="button" class="gl-lic-x" aria-label="Close">${ICON.close}</button>`;
    note.querySelector(".gl-lic-go").addEventListener("click", e => {
      const m = $("#licMore"), open = m.hidden; m.hidden = !open; e.currentTarget.setAttribute("aria-expanded", String(open));
      if (open) trackEvent("Gallery: licensing learn more");
    });
    note.querySelector(".gl-lic-x").addEventListener("click", () => { note.hidden = true; try { localStorage.setItem("fcph-lic-closed", "1"); } catch {} });
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
const PAGE_TITLES = { home: "Home", explore: "Explore", gallery: "Gallery", journal: "Journal", tools: "Tools", spots: "Wayfolk", about: "About" };
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
  ["#spotsLogin, #guestJoin, #wfJoin, #wfLogin, [data-login]", "Spots: log in prompt"],
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
  // chi arriva da wayfolk.eu (inoltro del dominio a fabiocostaph.com/?wayfolk) va dritto a Wayfolk
  if (/(^\?|&)wayfolk\b/.test(location.search) && !location.hash) { history.replaceState(null, "", location.pathname + "#wayfolk"); trackEvent("Wayfolk domain"); }
  let hash = decodeURIComponent(location.hash.slice(1));
  let page = hash, article = null;
  if (hash.startsWith("art-")) { page = "journal"; article = hash.slice(4); }
  let authorSlug = null;
  const writeMode = hash === "write";
  const magMonth = (hash.match(/^magazine-(\d{4}-\d{2})$/) || [])[1] || "";
  const magazine = hash === "magazine" || !!magMonth;
  const guidesHash = hash === "guides", guideSlug = (hash.match(/^g-([a-z0-9-]+)$/) || [])[1] || "";
  if (guidesHash || guideSlug) page = "journal";
  if (magazine) page = "journal";
  if (writeMode) page = "journal";
  if (hash.startsWith("author-")) { page = "journal"; authorSlug = hash.slice(7); }
  // porte d'ingresso dei folk (link nei post): #wayfolk-hikers, #wayfolk-backpackers… (anche #spots-…)
  if (hash === "wayfolk") page = "spots";   // #wayfolk è il nuovo indirizzo della sezione (#spots continua a funzionare)
  const door = (hash.match(/^(?:spots|wayfolk)-(photographers|hikers|backpackers|roadtrips|nomads|foodies)$/) || [])[1];
  if (door) { page = "spots"; try { if (localStorage.getItem("fcph-door") !== door) { localStorage.setItem("fcph-door", door); trackEvent("Spots door", { door }); } } catch {} }
  const join = hash === "join";
  const meHash = hash === "me";
  if (meHash) page = "spots";
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
  if (page === "spots") window.Spots?.show(join, meHash);
  if (page === "tools") window.Tools?.show();
  if (page === "journal") {
    if (writeMode) { $("#journalLayout").hidden = true; const r = $("#articleReader"); r.hidden = false; r.className = "full-article mag-article is-write"; window.Spots?.renderWrite?.(r); }
    else if (authorSlug) renderAuthor(authorSlug);
    else if (article) renderArticle(article);
    else if (magazine) { setJournalMode("magazine"); renderMagazine.token = ++magToken; renderMagazine(magMonth); }
    else if (guidesHash) { setJournalMode("guides"); renderGuides(); }
    else if (guideSlug) { setJournalMode("guides"); renderGuide(guideSlug); }
    else { $("#articleReader").hidden = true; renderJournal(); }
    if (!magazine && !guidesHash && !guideSlug) setJournalMode("journal");
  }
  if (guideAnchor) setTimeout(() => document.getElementById(guideAnchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  else if ((changed || magazine || guidesHash) && !article && !guideSlug) window.scrollTo(0, 0);
}

function renderAll() {
  renderGallery();
  const mm = location.hash.match(/^#magazine(?:-(\d{4}-\d{2}))?$/);
  if (mm) { renderMagazine.token = ++magToken; renderMagazine(mm[1] || ""); }
  else if (location.hash === "#guides") renderGuides();
  else if (/^#g-/.test(location.hash)) renderGuide(location.hash.slice(3));
  else renderJournal();
  renderAbout();
  drawHomePins();
  if (activeTripId && tripById(activeTripId)) drawPins("explore"); else if (maps.explore) renderPanelIntro();
}

/* =========================================================
   11. AVVIO
   ========================================================= */
function bindEvents() {
  setupArticleZoom();
  // chi sta per aprire Spots (dito o mouse sul link): il globo 3D inizia a scaricarsi subito
  const preSpots = e => { if (e.target.closest?.('a[href="#wayfolk"], a[href="#join"], a[href="#me"]')) window.Spots?.prefetch?.(); };
  document.addEventListener("pointerdown", preSpots, { passive: true });
  document.addEventListener("mouseover", preSpots, { passive: true });
  $$(".gl-vbtn").forEach(b => b.addEventListener("click", () => {
    gallery.view = b.dataset.view; try { localStorage.setItem("fcph-gallery-view", gallery.view); } catch {}
    renderGallery();
  }));
  $("#menuToggle").addEventListener("click", () => {
    const open = $("#mainNav").classList.toggle("open");
    $("#menuToggle").setAttribute("aria-expanded", String(open));
  });

  const dlg = $("#photoDialog");
  setupLightbox();
  $("#dialogClose").addEventListener("click", () => dlg.close());
  $("#pvBack").addEventListener("click", () => dlg.close());
  $("#dialogFull").addEventListener("click", toggleFullscreen);
  $("#pvExitFs").addEventListener("click", () => setImmersive(false));
  $("#dialogRotate").addEventListener("click", rotatePhoto);
  $("#dialogInfo").addEventListener("click", () => toggleInfo());
  // intestazione compatta: logo e voci del menu chiudono la foto e portano alla pagina; la lente apre la ricerca
  dlg.querySelectorAll("[data-pvnav]").forEach(a => a.addEventListener("click", () => dlg.close()));
  $("#pvSearch").addEventListener("click", () => { dlg.close(); openSearch(); });
  $("#pvMenu").addEventListener("click", e => {
    e.stopPropagation();
    const m = $("#pvMenuList"), open = m.hidden;
    m.hidden = !open; $("#pvMenu").setAttribute("aria-expanded", String(open));
  });
  dlg.addEventListener("click", e => { if (!e.target.closest("#pvMenu, #pvMenuList")) { $("#pvMenuList").hidden = true; $("#pvMenu").setAttribute("aria-expanded", "false"); } });
  // clic sulla foto: entra/esce dalla vista a schermo intero
  $("#dialogImage").addEventListener("click", toggleFullscreen);
  // se si esce dallo schermo intero del browser (ESC, gesto di sistema) si esce anche dalla vista immersiva
  const onFs = () => { if (!isFullscreen() && dlg.classList.contains("pv-full")) { fsLeftAt = Date.now(); setImmersive(false); } };
  document.addEventListener("fullscreenchange", onFs);
  document.addEventListener("webkitfullscreenchange", onFs);
  // ESC: prima esce dallo schermo intero, solo dopo chiude la foto
  dlg.addEventListener("cancel", e => {
    if (dlg.classList.contains("pv-full") || Date.now() - fsLeftAt < 400) { e.preventDefault(); setImmersive(false); }
    else if (!$("#pvMenuList").hidden) { e.preventDefault(); $("#pvMenuList").hidden = true; }
  });
  matchMedia("(orientation: landscape)").addEventListener?.("change", () => { if (dlg.open) dlg.classList.remove("rot-90"); });
  dlg.addEventListener("close", () => {
    document.documentElement.classList.remove("no-scroll");
    $("#pvMenuList").hidden = true;
    try { screen.orientation?.unlock?.(); } catch {}
    dlg.classList.remove("rot-90");
    if (dlg.classList.contains("pv-full")) setImmersive(false);
    renderPickBar();
  });
  setupPhotoGestures(dlg);
  $("#dialogPrev").addEventListener("click", e => { e.stopPropagation(); stepLightbox(-1); });
  $("#dialogNext").addEventListener("click", e => { e.stopPropagation(); stepLightbox(1); });
  dlg.addEventListener("keydown", e => {
    if (e.target.closest("input, textarea")) return;
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
  // linguette del pannello Explore
  $$(".ex-tab").forEach(b => b.addEventListener("click", () => {
    const st = $(".explore-stage"), same = st.classList.contains("ex-open") && !activeTripId && exListView === b.dataset.exlist;
    if (same) { exDrawer(false); return; }
    photoMarker?.remove(); photoMarker = null;
    renderPanelIntro(b.dataset.exlist); exDrawer(true);
  }));
  $("#exToggle")?.addEventListener("click", () => {
    const st = $(".explore-stage");
    if (!st.classList.contains("ex-open") && !activeTripId) renderPanelIntro();
    exDrawer();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.dataset.page === "explore" && $(".explore-stage")?.classList.contains("ex-open") && !document.querySelector("dialog[open]")) exDrawer(false); });
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
