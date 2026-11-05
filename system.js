/* =========================================================
   SISTEMA SOLARE della home: spiega il sito giocando.
   - ogni pianeta è una sezione, le lune sono le sue parti (sottosezioni)
   - le comete sono le novità degli ultimi 5 giorni (le stesse delle astronavi sulla mappa)
   - 1° tocco su un pianeta: si illumina, arriva l'astronave e compare la scheda
   - 2° tocco (o «Fly there»): l'astronave accende i motori e ci va
   Le posizioni sono in % dell'immagine img/solar-system.jpg (rapporto 3:1).
   ========================================================= */
(() => {
  const IMG = "img/solar-system.jpg";
  const stage = document.getElementById("sysStage");
  if (!stage) return;
  const viewport = document.getElementById("sysViewport"), card = document.getElementById("sysCard");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const e = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const track = n => { try { window.fcTrack?.(n); } catch {} };
  const go = hash => () => { location.hash = hash; };
  const later = (hash, fn, ms = 160) => () => { location.hash = hash; setTimeout(fn, ms); };
  const igUser = () => (typeof about !== "undefined" && about?.instagram) || "fabiocostaph";
  const ext = url => () => window.open(url, "_blank", "noopener");
  const pdf = f => ext(`guides/${f}`);
  const kindColor = k => (typeof NEWS_KIND !== "undefined" && NEWS_KIND[k]?.color) || "#9cc8ff";

  /* x, y = centro in % dell'immagine; r = raggio in % della larghezza */
  const BODIES = [
    { id: "sun", x: -22, y: 50, r: 33.5, name: "The Sun", section: "About", label: "About",
      desc: "The star of the system: the photographer behind it. Who I am, my gear, and how to reach me for prints, licences or a chat.",
      go: go("about"), moons: () => [
        { name: "About me", go: go("about") },
        { name: "Instagram", go: ext(`https://www.instagram.com/${encodeURIComponent(igUser())}/`) },
        { name: "Send feedback", go: () => window.FCFeedback?.open() }] },
    { id: "mercury", x: 18.5, y: 48.2, r: 1.7, name: "Mercury", section: "Tools", label: "Tools",
      desc: "Closest to the light. Sun and moon times, golden and blue hour, a 3D planner with the real horizon and a shooting plan from your test shot.",
      go: go("tools"), moons: () => [
        { name: "Sun & Moon", go: later("tools", () => document.getElementById("tab-sun")?.click(), 400) },
        { name: "3D planner", go: later("tools", () => document.getElementById("tab-planner")?.click(), 400) },
        { name: "Analyze your shot", go: later("tools", () => document.getElementById("tab-shot")?.click(), 400) }] },
    { id: "venus", x: 25.6, y: 48.5, r: 3.0, name: "Venus", section: "Gallery", label: "Gallery",
      desc: "The brightest planet: my photographs, by landscapes, cities and collections. Tap the heart on a photo to build a selection and ask about prints.",
      go: () => { gallery.category = "Tutte"; gallery.trip = null; gallery.sub = ""; gallery.collection = ""; location.hash = "gallery"; },
      moons: () => {
        const show = (cat, coll) => () => { Object.assign(gallery, { category: cat, trip: null, sub: "", collection: coll || "" }); location.hash = "gallery"; if (document.body.dataset.page === "gallery") renderGallery(); };
        const cols = [...new Set(trips.map(t => t.collection).filter(Boolean))].slice(0, 4);
        return [{ name: "Landscapes", go: show("Paesaggi") }, { name: "Urban", go: show("Urban") }, ...cols.map(c => ({ name: c, go: show("Tutte", c) }))];
      } },
    { id: "earth", x: 34.9, y: 48.8, r: 4.1, name: "Earth", section: "Spots", label: "Spots",
      desc: "The home planet of the community: a members-only map of photo spots, places to eat and stay, treks, workshops and meetups. Free to join.",
      go: go("spots"), moons: () => [
        { name: "Join for free", go: go("join") },
        { name: "Open the map", go: go("spots") },
        { name: "How Spots works", go: go("guide-spots") },
        { name: "Spots in one page", go: pdf("spots-quick-guide.pdf") }] },
    { id: "mars", x: 44.0, y: 48.6, r: 2.6, name: "Mars", section: "Explore", label: "Explore",
      desc: "The explorer's planet: an interactive map of my journeys. Every astronaut is a place, with its photos, exact coordinates and stories.",
      go: go("explore"), moons: () => trips.filter(t => photosOfTrip(t.id).length)
        .slice().sort((a, b) => (b.start || "").localeCompare(a.start || "")).slice(0, 6)
        .map(t => ({ name: t.name, go: later("explore", () => openTrip(t.id), 140) })) },
    { id: "jupiter", x: 55.2, y: 48.0, r: 6.4, name: "Jupiter", section: "Journal", label: "Journal",
      desc: "The giant: Field Notes. Reportage in the style of the old picture magazines and practical guides — when to go, where to park, what to avoid.",
      go: () => { if (typeof renderJournal !== "undefined") renderJournal.topic = ""; location.hash = "journal"; },
      moons: () => [
        ...[...articles].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3).map(a => ({ name: a.title, go: go(`art-${a.id}`) })),
        { name: "Write for the Journal", go: go("write") }] },
    { id: "saturn", x: 70.5, y: 47.4, r: 5.0, name: "Saturn", section: "The crew", label: "The crew",
      desc: "Its rings are the people: contributors, local experts and developers who write, shoot and build the site with me.",
      go: go("crew"), moons: () => [
        { name: "Meet the crew", go: go("crew") },
        { name: "Become a contributor", go: () => window.FCFeedback?.contribute("") },
        { name: "Contributors in one page", go: pdf("contributors-quick-guide.pdf") }] },
    { id: "uranus", x: 83.7, y: 48.4, r: 3.2, name: "Uranus", section: "How it works", label: "Guide",
      desc: "The odd one, tilted on its side: the site's manual. What each section does, step by step, with one-page guides to download.",
      go: go("guide"), moons: () => [
        { name: "Site guide", go: go("guide") },
        { name: "Explore & Gallery", go: go("guide-explore") },
        { name: "The site in one page", go: pdf("site-quick-guide.pdf") }] },
    { id: "neptune", x: 93.0, y: 48.3, r: 3.3, name: "Neptune", section: "The app", label: "App",
      desc: "The farthest blue: take the whole system in your pocket. Install fabiocostaph.com on your phone — it opens like an app and works offline.",
      go: () => { if (window.FCPWA) window.FCPWA.show(); else location.hash = "guide-app"; },
      moons: () => [
        { name: "Install the app", go: () => { if (window.FCPWA) window.FCPWA.show(); else location.hash = "guide-app"; } },
        { name: "How to install", go: go("guide-app") }] }
  ];

  /* ---------- costruzione ---------- */
  const SHIP = `<svg viewBox="0 0 64 32" aria-hidden="true">
    <path d="M6 16c6-7 17-10 31-10 10 0 18 4 22 10-4 6-12 10-22 10C23 26 12 23 6 16z" fill="#0b1626" stroke="#cfe3ff" stroke-width="1.6"/>
    <path d="M14 9 8 2h7l7 6M14 23l-6 7h7l7-6" fill="#0b1626" stroke="#cfe3ff" stroke-width="1.4" stroke-linejoin="round"/>
    <ellipse cx="43" cy="16" rx="6.5" ry="4.2" fill="#9cc8ff"/><ellipse cx="44.5" cy="14.6" rx="2.6" ry="1.4" fill="#fff" opacity=".8"/>
    <path d="M22 16h12" stroke="#ffc46e" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  stage.style.setProperty("--img", `url(${IMG})`);
  stage.innerHTML = BODIES.map(b => {
    const imgW = 100 / (2 * b.r) * 100, left = -(b.x - b.r) / (2 * b.r) * 100, top = -(b.y / 3 - b.r) / (2 * b.r) * 100;
    return `<button type="button" class="sys-body sys-${b.id}" data-id="${b.id}" style="--x:${b.x};--y:${b.y};--r:${b.r}" aria-label="${e(b.name)}: ${e(b.section)}">
      <span class="sys-zoom"><img src="${IMG}" alt="" draggable="false" style="width:${imgW}%;left:${left}%;top:${top}%"></span>
      <span class="sys-ring" aria-hidden="true"></span>
    </button>
    <span class="sys-label${b.id === "sun" ? " is-sun" : ""}" data-for="${b.id}" style="--x:${b.id === "sun" ? 5.5 : b.x};--y:${b.id === "sun" ? 88 : b.y + b.r * 3 + 4}">${e(b.label)}</span>`;
  }).join("") + `<div class="sys-moons" id="sysMoons" hidden></div>
    <div class="sys-comets" id="sysComets"></div>
    <div class="sys-ship" id="sysShip" aria-hidden="true"><span class="sys-flame"></span>${SHIP}</div>`;

  const ship = document.getElementById("sysShip"), moonsBox = document.getElementById("sysMoons");
  let sel = null, flying = false;
  const W = () => stage.clientWidth, H = () => stage.clientHeight;
  const toPx = (x, y) => [x / 100 * W(), y / 100 * H()];

  // l'astronave: posizione in % dello stage, orientata verso la direzione di volo
  let shipAt = { x: 2, y: 112 };
  const placeShip = (x, y, opts = {}) => {
    const [x0, y0] = toPx(shipAt.x, shipAt.y), [x1, y1] = toPx(x, y);
    const ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
    ship.style.setProperty("--a", `${Math.abs(x1 - x0) + Math.abs(y1 - y0) < 2 ? (opts.keepAngle ?? 0) : ang}deg`);
    ship.style.setProperty("--s", opts.scale ?? 1);
    ship.style.left = `${x}%`; ship.style.top = `${y}%`;
    shipAt = { x, y };
  };
  ship.style.left = `${shipAt.x}%`; ship.style.top = `${shipAt.y}%`;

  /* dove parcheggia l'astronave accanto a un corpo celeste (in alto a sinistra) */
  const parking = b => b.id === "sun" ? { x: 8.5, y: 22 } : { x: b.x - Math.max(b.r * 1.15, 2.6), y: b.y - Math.max(b.r * 3 * 1.05, 9) };

  function moonsOf(b) { try { return (b.moons?.() || []).filter(m => m && m.name); } catch { return []; } }

  function drawMoons(b) {
    const list = moonsOf(b);
    if (!list.length || b.id === "sun") { moonsBox.hidden = true; moonsBox.innerHTML = ""; return; }
    const R = Math.max(b.r * 1.85, 4.2);   // raggio dell'orbita, in % della larghezza
    moonsBox.hidden = false;
    moonsBox.style.cssText = `--x:${b.x};--y:${b.y};--R:${R}`;
    moonsBox.innerHTML = `<div class="sys-orbit">${list.map((m, i) => {
      const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      return `<button type="button" class="sys-moon" data-moon="${i}" style="--mx:${50 + Math.cos(a) * 50}%;--my:${50 + Math.sin(a) * 50}%" title="${e(m.name)}">
        <span class="sys-moon-ball" aria-hidden="true"></span><span class="sys-moon-name">${e(m.name)}</span></button>`;
    }).join("")}</div>`;
    moonsBox.querySelectorAll("[data-moon]").forEach(btn => btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const m = list[+btn.dataset.moon], r = btn.getBoundingClientRect(), s = stage.getBoundingClientRect();
      flyTo({ x: (r.left + r.width / 2 - s.left) / s.width * 100, y: (r.top + r.height / 2 - s.top) / s.height * 100 }, m.go, `System: ${b.id} → ${m.name}`);
    }));
  }

  function showCard(b) {
    if (!b) return defaultCard();
    const moons = moonsOf(b);
    card.hidden = false;
    card.innerHTML = `<div class="sys-card-in sys-c-${b.id}">
      <p class="sys-card-kick"><span>${e(b.name)}</span> · <b>${e(b.section)}</b></p>
      <p class="sys-card-desc">${e(b.desc)}</p>
      ${moons.length ? `<p class="sys-card-moons"><span>${b.id === "sun" ? "Also here" : "Moons"}</span>${moons.map((m, i) => `<button type="button" data-cm="${i}">${e(m.name)}</button>`).join("")}</p>` : ""}
      <p class="sys-card-act"><button type="button" class="outline-link" id="sysFly">🚀 <span>Fly to</span> <span>${e(b.section)}</span> <span aria-hidden="true">→</span></button>
        <button type="button" class="text-link" id="sysBack">Back to the system</button></p></div>`;
    card.querySelector("#sysFly").addEventListener("click", () => launch(b));
    card.querySelector("#sysBack").addEventListener("click", () => select(null));
    card.querySelectorAll("[data-cm]").forEach(btn => btn.addEventListener("click", () => {
      const m = moons[+btn.dataset.cm], el = moonsBox.querySelector(`[data-moon="${btn.dataset.cm}"]`);
      if (el) el.click(); else flyTo(b, m.go, `System: ${b.id} → ${m.name}`);
    }));
  }

  function defaultCard() {
    const news = typeof newsItems === "function" ? newsItems() : [];
    card.hidden = false;
    card.innerHTML = `<div class="sys-card-in is-default">
      <p class="sys-card-kick">☄ <span>${news.length ? "Comets in the sky right now" : "No comets right now"}</span></p>
      ${news.length ? `<p class="sys-card-news">${news.slice(0, 8).map((n, i) => `<button type="button" data-news="${i}" style="--c:${kindColor(n.kind)}">${e(n.label)} <small>${e(n.title)}</small></button>`).join("")}</p>`
        : `<p class="sys-card-desc">New photos, stories, places, workshops and meetups cross the sky as comets for five days. Pick a planet to start.</p>`}</div>`;
    card.querySelectorAll("[data-news]").forEach(btn => btn.addEventListener("click", () => { const n = news[+btn.dataset.news]; track(`System comet: ${n.kind}`); n.go(); }));
  }

  /* ---------- interazione ---------- */
  function select(b) {
    if (flying) return;
    sel = b;
    stage.querySelectorAll(".sys-body").forEach(el => el.classList.toggle("on", !!b && el.dataset.id === b.id));
    stage.querySelectorAll(".sys-label").forEach(el => el.classList.toggle("on", !!b && el.dataset.for === b.id));
    stage.classList.toggle("has-sel", !!b);
    if (!b) { moonsBox.hidden = true; placeShip(2, 112); showCard(null); return; }
    drawMoons(b);
    const p = parking(b);
    ship.classList.add("show");
    placeShip(p.x, p.y);
    showCard(b);
    track(`System: ${b.id}`);
    // sul telefono il sistema scorre di lato: porta il pianeta al centro
    if (viewport.scrollWidth > viewport.clientWidth + 4) {
      const [px] = toPx(Math.max(b.x, 6), 0);
      viewport.scrollTo({ left: px - viewport.clientWidth / 2, behavior: calm ? "auto" : "smooth" });
    }
  }

  function flyTo(target, action, label) {
    if (flying) return;
    track(label);
    if (calm) { action(); return; }
    flying = true;
    ship.classList.add("show", "burn");
    setTimeout(() => {
      placeShip(target.x, target.y, { scale: .25 });
      ship.classList.add("land");
    }, 380);
    setTimeout(() => { stage.classList.add("flash"); }, 1150);
    setTimeout(() => {
      action();
      setTimeout(() => {   // al ritorno sulla home, tutto com'era
        flying = false;
        ship.classList.remove("burn", "land"); stage.classList.remove("flash");
        select(null);
      }, 400);
    }, 1450);
  }
  const launch = b => flyTo(b.id === "sun" ? { x: 4, y: 50 } : b, b.go, `System: fly ${b.id}`);

  stage.querySelectorAll(".sys-body").forEach(el => el.addEventListener("click", () => {
    const b = BODIES.find(x => x.id === el.dataset.id);
    if (sel && sel.id === b.id) launch(b); else select(b);
  }));
  stage.querySelectorAll(".sys-label").forEach(el => el.addEventListener("click", () => stage.querySelector(`.sys-body[data-id="${el.dataset.for}"]`)?.click()));
  stage.addEventListener("click", ev => { if (ev.target === stage && sel) select(null); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && sel && document.body.dataset.page === "home") select(null); });

  /* ---------- comete = novità ---------- */
  function drawComets() {
    const box = document.getElementById("sysComets");
    const news = typeof newsItems === "function" ? newsItems().slice(0, 6) : [];
    box.innerHTML = news.map((n, i) => {
      const y = [5, 82, 14, 89, 9, 76][i % 6], dur = 26 + (i % 3) * 6, delay = -(i * 9.5);
      return `<button type="button" class="sys-comet${calm ? " still" : ""}" data-c="${i}" style="--cy:${y}%;--dur:${dur}s;--delay:${delay}s;--c:${kindColor(n.kind)};--still:${12 + i * 15}%"
        aria-label="${e(n.label)}: ${e(n.title)}"><span class="sys-comet-tail" aria-hidden="true"></span><span class="sys-comet-head" aria-hidden="true"></span>
        <span class="sys-comet-tag">${e(n.label)}<small>${e(n.title)}</small></span></button>`;
    }).join("");
    box.querySelectorAll("[data-c]").forEach(btn => btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const n = news[+btn.dataset.c];
      track(`System comet: ${n.kind}`);
      n.go();
    }));
  }

  function render() {
    drawComets();
    if (sel) { drawMoons(sel); showCard(sel); } else showCard(null);
  }
  render();
  window.FCSystem = { render, select: id => select(BODIES.find(b => b.id === id) || null) };

  // il pulsante in fondo alla home porta qui
  document.getElementById("heroScroll")?.addEventListener("click", () => {
    track("Home: scroll to system");
    document.getElementById("homeSystem")?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  });
  window.addEventListener("hashchange", () => { if (!flying && sel) select(null); });
})();
