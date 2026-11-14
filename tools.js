/* Fabio Costa Ph — tools.js
   Pagina TOOLS: alba, tramonto, golden e blue hour, fasi lunari, notti buie e Via Lattea.
   Tutti i calcoli astronomici sono fatti qui nel browser (algoritmi di SunCalc, V. Agafonkin, licenza BSD).
   Servizi esterni gratuiti e senza chiave: Photon (ricerca luoghi) e Open-Meteo (fuso orario e nuvole). */
"use strict";

/* =========================================================
   MOTORE ASTRONOMICO
   ========================================================= */
const Astro = (() => {
  const PI = Math.PI, sin = Math.sin, cos = Math.cos, tan = Math.tan, asin = Math.asin, atan = Math.atan2, acos = Math.acos;
  const rad = PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const toDays = ms => ms / dayMs - 0.5 + J1970 - J2000;
  const fromJulian = j => (j + 0.5 - J1970) * dayMs;
  const rightAscension = (l, b) => atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l));
  const declination = (l, b) => asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
  const altitude = (H, phi, dec) => asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const refraction = h => { if (h < 0) h = 0; return 0.0002967 / tan(h + 0.00312536 / (h + 0.08901179)); };
  const solarMeanAnomaly = d => rad * (357.5291 + 0.98560028 * d);
  const eclipticLongitude = M => M + rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)) + rad * 102.9372 + PI;
  const sunCoords = d => { const L = eclipticLongitude(solarMeanAnomaly(d)); return { dec: declination(L, 0), ra: rightAscension(L, 0) }; };

  function sunAlt(ms, lat, lon) {
    const d = toDays(ms), c = sunCoords(d);
    return altitude(siderealTime(d, rad * -lon) - c.ra, rad * lat, c.dec) / rad;
  }

  const J0 = 0.0009;
  /* orari in cui il sole passa per l'altezza h (gradi); ms = un istante vicino al mezzogiorno locale */
  function sunTimes(ms, lat, lon, angles) {
    const lw = rad * -lon, phi = rad * lat, d = toDays(ms);
    const n = Math.round(d - J0 - lw / (2 * PI));
    const ds = J0 + lw / (2 * PI) + n;
    const M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0);
    const transit = (a) => J2000 + a + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
    const Jnoon = transit(ds);
    const out = { noon: fromJulian(Jnoon) };
    angles.forEach(h => {
      const x = (sin(h * rad) - sin(phi) * sin(dec)) / (cos(phi) * cos(dec));
      if (x < -1 || x > 1) { out[h] = { rise: null, set: null, always: x < -1 ? "above" : "below" }; return; }
      const w = acos(x), Jset = transit(J0 + (w + lw) / (2 * PI) + n);
      out[h] = { rise: fromJulian(Jnoon - (Jset - Jnoon)), set: fromJulian(Jset) };
    });
    return out;
  }

  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d);
    const l = L + rad * 6.289 * sin(M), b = rad * 5.128 * sin(F);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * cos(M) };
  }
  function moonAlt(ms, lat, lon) {
    const d = toDays(ms), c = moonCoords(d);
    const h = altitude(siderealTime(d, rad * -lon) - c.ra, rad * lat, c.dec);
    return (h + refraction(h)) / rad;
  }
  /* fraction = parte illuminata (0–1); phase: 0 nuova → 0.25 primo quarto → 0.5 piena → 0.75 ultimo quarto */
  function moonIllum(ms) {
    const d = toDays(ms), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
    const phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra));
    const inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi));
    const angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));
    return { fraction: (1 + cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI };
  }

  /* centro galattico (nucleo della Via Lattea): RA 266.4°, Dec −28.94° */
  const GC = { ra: 266.405 * rad, dec: -28.936 * rad };
  function coreAlt(ms, lat, lon) {
    const d = toDays(ms);
    return altitude(siderealTime(d, rad * -lon) - GC.ra, rad * lat, GC.dec) / rad;
  }

  /* posizione: altezza sull'orizzonte e azimut da nord in senso orario (gradi) */
  const azimuth = (H, phi, dec) => atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi));
  const toBearing = a => ((a / rad) + 180 + 360) % 360;
  function sunPos(ms, lat, lon) {
    const d = toDays(ms), c = sunCoords(d), H = siderealTime(d, rad * -lon) - c.ra, phi = rad * lat;
    return { alt: altitude(H, phi, c.dec) / rad, az: toBearing(azimuth(H, phi, c.dec)) };
  }
  function moonPos(ms, lat, lon) {
    const d = toDays(ms), c = moonCoords(d), H = siderealTime(d, rad * -lon) - c.ra, phi = rad * lat;
    const h = altitude(H, phi, c.dec);
    return { alt: (h + refraction(h)) / rad, az: toBearing(azimuth(H, phi, c.dec)) };
  }
  function corePos(ms, lat, lon) {
    const d = toDays(ms), H = siderealTime(d, rad * -lon) - GC.ra, phi = rad * lat;
    return { alt: altitude(H, phi, GC.dec) / rad, az: toBearing(azimuth(H, phi, GC.dec)) };
  }

  /* qualsiasi stella o punto del cielo, da ascensione retta e declinazione (gradi, J2000) */
  function radecPos(ms, lat, lon, raDeg, decDeg) {
    const d = toDays(ms), H = siderealTime(d, rad * -lon) - raDeg * rad, phi = rad * lat, dec = decDeg * rad;
    return { alt: altitude(H, phi, dec) / rad, az: toBearing(azimuth(H, phi, dec)) };
  }
  /* punto del piano della Via Lattea (longitudine galattica l, latitudine b) → RA/Dec in gradi */
  function galToRaDec(l, b = 0) {
    const aN = 192.85948 * rad, dN = 27.12825 * rad, lN = 122.93192 * rad;
    l *= rad; b *= rad;
    const dec = asin(sin(dN) * sin(b) + cos(dN) * cos(b) * cos(lN - l));
    const ra = aN + atan(cos(b) * sin(lN - l), cos(dN) * sin(b) - sin(dN) * cos(b) * cos(lN - l));
    return [((ra / rad) % 360 + 360) % 360, dec / rad];
  }

  return { sunAlt, sunTimes, moonAlt, moonIllum, coreAlt, sunPos, moonPos, corePos, radecPos, galToRaDec };
})();

/* =========================================================
   PAGINA TOOLS
   ========================================================= */
const Tools = (() => {
  const LOC_KEY = "fcph-tools-place";
  const DEFAULT_PLACE = { lat: 41.9028, lon: 12.4964, name: "Rome", context: "Lazio, Italy" };
  const STEP = 10 * 60 * 1000;   // campionamento: 10 minuti

  let place = null;            // { lat, lon, name, context }
  let tz = null;               // fuso orario IANA del luogo (da Open-Meteo)
  let tzApprox = false;
  let clouds = null;           // { "2026-11-01T07:00": 35, ... } ore locali del luogo
  let day = null;              // { y, m, d } data scelta, nel fuso del luogo
  let calMonth = null;         // { y, m }
  let wired = false, placeResults = [], placeTimer = 0, placeSeq = 0, suggestIdx = -1, loadSeq = 0;

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(LOC_KEY) || "null"); } catch { return null; } },
    set(p) { try { localStorage.setItem(LOC_KEY, JSON.stringify(p)); } catch {} }
  };

  /* ---------- fuso orario e date ---------- */
  const userTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  function partsIn(ms, zone) {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms)).forEach(x => (p[x.type] = +x.value));
    return p;
  }
  const offsetMs = (ms, zone) => { const p = partsIn(ms, zone); return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000; };
  /* istante UTC corrispondente a y-m-d hh:00 nell'ora locale del luogo */
  function localToUtc(y, m, d, h = 0) {
    const guess = Date.UTC(y, m, d, h);
    let t = guess - offsetMs(guess, tz);
    t = guess - offsetMs(t, tz);
    return t;
  }
  const todayIn = zone => { const p = partsIn(Date.now(), zone); return { y: p.year, m: p.month - 1, d: p.day }; };
  const addDays = (o, n) => { const t = new Date(Date.UTC(o.y, o.m, o.d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; };
  const isoDay = o => `${o.y}-${String(o.m + 1).padStart(2, "0")}-${String(o.d).padStart(2, "0")}`;
  const sameDay = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;

  const fmtT = ms => ms == null || !Number.isFinite(ms) ? "—"
    : new Intl.DateTimeFormat((window.I18N?.locale || "en-GB"), { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  const TT = s => (window.I18N ? I18N.t(s) : s);
  const fmtDate = (ms, opts) => new Intl.DateTimeFormat((window.I18N?.locale || "en-GB"), { timeZone: tz, ...opts }).format(new Date(ms));
  const fmtDur = ms => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };

  /* ---------- calcoli per un giorno e una notte ---------- */
  function sunDay(o) {
    const noonApprox = localToUtc(o.y, o.m, o.d, 12);
    return Astro.sunTimes(noonApprox, place.lat, place.lon, [-18, -12, -6, -4, -0.833, 6]);
  }

  /* notte che inizia la sera del giorno o: finestre di buio vero e di Via Lattea visibile */
  function night(o) {
    const from = localToUtc(o.y, o.m, o.d, 12), to = localToUtc(...Object.values(addDays(o, 1)), 12);
    const illumMid = Astro.moonIllum((from + to) / 2).fraction;
    let dark = 0, core = 0, astro = 0, darkFrom = null, darkTo = null, coreFrom = null, coreTo = null;
    for (let t = from; t < to; t += STEP) {
      const s = Astro.sunAlt(t, place.lat, place.lon);
      if (s >= -18) continue;
      astro += STEP;
      const moonDown = illumMid < 0.03 || Astro.moonAlt(t, place.lat, place.lon) < -0.5;
      if (!moonDown) continue;
      dark += STEP; if (darkFrom == null) darkFrom = t; darkTo = t + STEP;
      if (Astro.coreAlt(t, place.lat, place.lon) > 10) { core += STEP; if (coreFrom == null) coreFrom = t; coreTo = t + STEP; }
    }
    return { dark, core, astro, darkFrom, darkTo, coreFrom, coreTo, illum: illumMid };
  }

  function moonRiseSet(o) {
    const from = localToUtc(o.y, o.m, o.d, 0), to = localToUtc(...Object.values(addDays(o, 1)), 0);
    const h0 = 0.133;
    let rise = null, set = null, prev = Astro.moonAlt(from, place.lat, place.lon) - h0;
    const always = prev > 0 ? "above" : "below";
    let crossed = false;
    for (let t = from + STEP; t <= to; t += STEP) {
      const cur = Astro.moonAlt(t, place.lat, place.lon) - h0;
      if ((prev <= 0) !== (cur <= 0)) {
        const x = t - STEP + STEP * (prev / (prev - cur));
        if (cur > 0 && rise == null) rise = x;
        if (cur <= 0 && set == null) set = x;
        crossed = true;
      }
      prev = cur;
    }
    return { rise, set, always: crossed ? null : always };
  }

  function nextPhase(fromMs, target) {   // target 0.5 = piena, 1 = nuova
    let prev = Astro.moonIllum(fromMs).phase;
    for (let t = fromMs + 36e5; t < fromMs + 31 * 864e5; t += 36e5) {
      const p = Astro.moonIllum(t).phase;
      if (target === 1 ? p < prev - 0.5 : prev < 0.5 && p >= 0.5) return t;
      prev = p;
    }
    return null;
  }

  const phaseName = p => p < 0.03 || p > 0.97 ? "New Moon" : p < 0.22 ? "Waxing Crescent" : p < 0.28 ? "First Quarter"
    : p < 0.47 ? "Waxing Gibbous" : p < 0.53 ? "Full Moon" : p < 0.72 ? "Waning Gibbous" : p < 0.78 ? "Last Quarter" : "Waning Crescent";

  function moonSvg(p, size, cls = "") {
    const r = size / 2 - 1, c = size / 2, k = Math.cos(2 * Math.PI * p), rx = Math.abs(r * k).toFixed(2);
    const waxing = p < 0.5, outer = waxing ? 1 : 0, inner = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
    const lit = Math.abs(p - 0.5) < 0.005 ? `<circle cx="${c}" cy="${c}" r="${r}" class="moon-lit"/>`
      : (p < 0.005 || p > 0.995) ? "" : `<path class="moon-lit" d="M${c} ${c - r}A${r} ${r} 0 0 ${outer} ${c} ${c + r}A${rx} ${r} 0 0 ${inner} ${c} ${c - r}Z"/>`;
    return `<svg class="moon-ico ${cls}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r}" class="moon-dark"/>${lit}</svg>`;
  }

  /* ---------- servizi esterni ---------- */
  async function loadPlaceData() {
    const seq = ++loadSeq;
    tz = null; tzApprox = false; clouds = null;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(4)}&longitude=${place.lon.toFixed(4)}&hourly=cloud_cover&timezone=auto&forecast_days=16`);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (seq !== loadSeq) return false;
      tz = j.timezone;
      new Intl.DateTimeFormat("en-GB", { timeZone: tz });   // verifica che il fuso sia valido
      clouds = {};
      (j.hourly?.time || []).forEach((t, i) => (clouds[t] = j.hourly.cloud_cover[i]));
    } catch {
      if (seq !== loadSeq) return false;
      tz = userTz(); tzApprox = true;
    }
    return true;
  }
  const cloudAt = ms => {
    if (!clouds || ms == null) return null;
    const p = partsIn(ms + 30 * 60000, tz);   // ora più vicina
    const key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour % 24).padStart(2, "0")}:00`;
    return clouds[key] ?? null;
  };

  async function searchPlaces(q) {
    const seq = ++placeSeq;
    try {
      const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (seq !== placeSeq) return placeResults;
      return (j.features || []).map(f => {
        const p = f.properties || {}, [lon, lat] = f.geometry.coordinates;
        const ctx = [p.city !== p.name ? p.city : "", p.state, p.country].filter(Boolean);
        return { lat, lon, name: p.name || p.city || p.country || q, context: [...new Set(ctx)].join(", ") };
      });
    } catch {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "en" } });
        return (await r.json()).map(p => ({ lat: +p.lat, lon: +p.lon, name: p.name || p.display_name.split(",")[0], context: p.display_name.split(",").slice(1, 4).join(",").trim() }));
      } catch { return []; }
    }
  }
  async function reverseName(lat, lon) {
    try {
      const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`);
      const p = (await r.json()).features?.[0]?.properties || {};
      const name = p.city || p.name || p.county || p.state;
      return name ? { name, context: [p.state, p.country].filter(x => x && x !== name).join(", ") } : null;
    } catch { return null; }
  }

  /* ---------- interfaccia ---------- */
  const root = () => document.getElementById("toolsRoot");

  async function show() {
    const el = root();
    if (!el) return;
    // a link from the Photo pulse: ?tp=lat,lon&tn=name&td=YYYY-MM-DD&tt=planner opens that point, that day, that tab
    const qs = new URLSearchParams(location.search), tp = (qs.get("tp") || "").split(",").map(Number);
    const linked = tp.length === 2 && tp.every(Number.isFinite) ? { lat: tp[0], lon: tp[1], name: (qs.get("tn") || "Pinned point").slice(0, 80), context: "" } : null;
    const linkedDay = /^\d{4}-\d{2}-\d{2}$/.test(qs.get("td") || "") ? qs.get("td") : null;
    if (linked) { if (TABS.some(x => x.id === qs.get("tt"))) tab = qs.get("tt"); try { history.replaceState(null, "", location.pathname + location.hash); } catch {} }
    if (!wired) {
      wired = true;
      el.innerHTML = shellHtml();
      wire();
      setTab(tab);
      place = linked || store.get() || DEFAULT_PLACE;
      await setPlace(place, { keepDay: false, save: !!linked });
    } else if (linked) { setTab(tab); await setPlace(linked, { keepDay: true }); }
    if (linked && linkedDay) { const [y, m, d] = linkedDay.split("-").map(Number); ctx.setDay({ y, m: m - 1, d }); }
  }

  const TABS = [
    { id: "sun", label: "Sun & Moon", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>' },
    { id: "planner", label: "Planner", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 20 6-11 4 6 2.5-3.5L21 20z"/><path d="M12 3v3M16.5 4.5l-1.5 2.5M7.5 4.5 9 7"/></svg>' },
    { id: "shot", label: "Analyze your shot", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20V19H4z"/><circle cx="12" cy="13" r="3.4"/></svg>' }
  ];
  const TAB_KEY = "fcph-tools-tab";
  let tab = (() => { try { return localStorage.getItem(TAB_KEY) || "sun"; } catch { return "sun"; } })();
  const listeners = [];

  function shellHtml() {
    return `
      <nav class="tools-tabs" role="tablist" aria-label="Tools">
        ${TABS.map(t => `<button type="button" role="tab" id="tab-${t.id}" aria-controls="panel-${t.id}" data-tab="${t.id}">${t.icon}<span>${t.label}</span></button>`).join("")}
      </nav>
      <div class="tools-bar" id="toolsBar">
        <div class="spots-search tools-search" id="toolsSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
          <input id="toolsQuery" type="search" placeholder="Search a place…" aria-label="Search a place" autocomplete="off"
            role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="toolsSuggest">
          <button type="button" class="spots-locate" id="toolsLocate" title="Use my location" aria-label="Use my location">${ICON_LOCATE}<span>Near me</span></button>
          <div class="spots-suggest" id="toolsSuggest" role="listbox" hidden></div>
        </div>
        <div class="tools-date">
          <button type="button" class="tools-step" data-step="-1" aria-label="Previous day">‹</button>
          <input type="date" id="toolsDate" aria-label="Date">
          <button type="button" class="tools-step" data-step="1" aria-label="Next day">›</button>
          <button type="button" class="text-link" id="toolsToday">Today</button>
        </div>
      </div>
      <p class="tools-place" id="toolsPlace" aria-live="polite"></p>
      <section class="tools-panel" id="panel-sun" role="tabpanel" aria-labelledby="tab-sun">
        <div class="tools-grid" id="toolsGrid"><p class="gate-note">Calculating…</p></div>
      </section>
      <section class="tools-panel" id="panel-planner" role="tabpanel" aria-labelledby="tab-planner" hidden><div id="plannerRoot"></div></section>
      <section class="tools-panel" id="panel-shot" role="tabpanel" aria-labelledby="tab-shot" hidden><div id="shotRoot"></div></section>`;
  }

  function setTab(id) {
    if (!TABS.some(t => t.id === id)) id = "sun";
    tab = id;
    try { localStorage.setItem(TAB_KEY, id); } catch {}
    root().querySelectorAll("[data-tab]").forEach(b => { const on = b.dataset.tab === id; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    TABS.forEach(t => (document.getElementById(`panel-${t.id}`).hidden = t.id !== id));
    const usesPlace = id !== "shot";
    document.getElementById("toolsBar").hidden = !usesPlace;
    document.getElementById("toolsPlace").hidden = !usesPlace;
    if (id === "planner") loadScript("planner.js").then(() => window.Planner?.show(ctx)).catch(() => toast("The planner could not be loaded. Check your connection.", true));
    if (id === "shot") loadScript("analyzer.js").then(() => window.Analyzer?.show()).catch(() => toast("The analyzer could not be loaded. Check your connection.", true));
  }

  const scripts = {};
  function loadScript(src) {
    const v = document.querySelector('script[src^="tools.js"]')?.src.split("?")[1] || "";
    return scripts[src] ||= new Promise((ok, ko) => {
      const el = document.createElement("script");
      el.src = /^https?:/.test(src) ? src : `${src}${v ? "?" + v : ""}`;
      el.onload = ok; el.onerror = () => { delete scripts[src]; ko(new Error(src)); };
      document.head.appendChild(el);
    });
  }

  function wire() {
    root().querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
    root().querySelector(".tools-tabs").addEventListener("keydown", e => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = TABS.findIndex(t => t.id === tab), n = TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length].id;
      setTab(n); document.getElementById(`tab-${n}`).focus();
    });
    const input = document.getElementById("toolsQuery"), box = document.getElementById("toolsSuggest");
    input.addEventListener("input", () => {
      const q = input.value.trim();
      placeResults = []; clearTimeout(placeTimer);
      if (q.length >= 2) placeTimer = setTimeout(() => searchPlaces(q).then(r => { if (input.value.trim() === q) { placeResults = r; renderSuggest(); } }), 350);
      renderSuggest();
    });
    input.addEventListener("keydown", async e => {
      const items = [...box.querySelectorAll("[data-i]")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        suggestIdx = (suggestIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((el, i) => el.setAttribute("aria-selected", i === suggestIdx ? "true" : "false"));
      } else if (e.key === "Escape") closeSuggest();
      else if (e.key === "Enter") {
        e.preventDefault();
        if (suggestIdx >= 0 && items[suggestIdx]) return items[suggestIdx].click();
        const q = input.value.trim();
        if (!q) return;
        const r = placeResults.length ? placeResults : await searchPlaces(q);
        if (r.length) pick(r[0]); else toast(`Nothing found for “${q}”.`, true);
      }
    });
    box.addEventListener("mousedown", e => e.preventDefault());
    document.addEventListener("click", e => { if (!e.target.closest("#toolsSearch")) closeSuggest(); });
    document.getElementById("toolsLocate").addEventListener("click", locate);
    document.getElementById("toolsDate").addEventListener("change", e => {
      const [y, m, d] = e.target.value.split("-").map(Number);
      if (y) { day = { y, m: m - 1, d }; calMonth = { y, m: m - 1 }; render(); }
    });
    root().querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", () => {
      day = addDays(day, +b.dataset.step); calMonth = { y: day.y, m: day.m }; render();
    }));
    document.getElementById("toolsToday").addEventListener("click", () => { day = todayIn(tz); calMonth = { y: day.y, m: day.m }; render(); });
  }

  function renderSuggest() {
    const box = document.getElementById("toolsSuggest"), input = document.getElementById("toolsQuery");
    suggestIdx = -1;
    const q = input.value.trim();
    if (!q) return closeSuggest();
    box.innerHTML = placeResults.length ? placeResults.map((p, i) =>
      `<button type="button" role="option" class="sg-item" data-i="${i}">${ICON.pin}<span class="sg-text"><strong>${esc(p.name)}</strong><small>${esc(p.context)}</small></span></button>`).join("")
      : q.length >= 2 ? `<p class="sg-head sg-wait">Searching…</p>` : "";
    box.hidden = !box.innerHTML;
    input.setAttribute("aria-expanded", box.hidden ? "false" : "true");
    box.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => pick(placeResults[+b.dataset.i])));
  }
  function closeSuggest() {
    const box = document.getElementById("toolsSuggest");
    if (box) { box.hidden = true; box.innerHTML = ""; }
    document.getElementById("toolsQuery")?.setAttribute("aria-expanded", "false");
    suggestIdx = -1;
  }
  function pick(p) {
    if (!p) return;
    const input = document.getElementById("toolsQuery");
    input.value = ""; input.blur(); closeSuggest();
    setPlace(p, { keepDay: true });
  }

  function locate() {
    const btn = document.getElementById("toolsLocate");
    if (!navigator.geolocation) return toast("Your browser can't share its location.", true);
    btn.classList.add("busy"); btn.disabled = true;
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const n = await reverseName(lat, lon);
      btn.classList.remove("busy"); btn.disabled = false;
      setPlace({ lat, lon, name: n?.name || "Your position", context: n?.context || "", me: true }, { keepDay: false });
    }, err => {
      btn.classList.remove("busy"); btn.disabled = false;
      toast(err.code === 1 ? "Location access was blocked. Allow it in your browser settings and try again." : "Couldn't find your position. Try again in a moment.", true);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }

  async function setPlace(p, { keepDay = true, save = true } = {}) {
    place = { lat: +p.lat, lon: +p.lon, name: p.name, context: p.context || "", me: !!p.me };
    if (save) store.set(place);
    document.getElementById("toolsGrid").classList.add("loading");
    if (!(await loadPlaceData())) return;
    if (!keepDay || !day) day = todayIn(tz);
    calMonth = { y: day.y, m: day.m };
    document.getElementById("toolsGrid").classList.remove("loading");
    render();
  }

  /* ---------- disegno ---------- */
  function render() {
    if (!place || !tz || !day) return;
    document.getElementById("toolsDate").value = isoDay(day);
    const today = sameDay(day, todayIn(tz));
    document.getElementById("toolsToday").hidden = today;
    const off = offsetMs(localToUtc(day.y, day.m, day.d, 12), tz) / 36e5;
    const offTxt = `UTC${off >= 0 ? "+" : "−"}${Math.abs(off) % 1 ? Math.abs(off).toFixed(1) : Math.abs(off)}`;
    document.getElementById("toolsPlace").innerHTML = `
      ${ICON.pin}<strong>${esc(place.name)}</strong>${place.context ? `<span>${esc(place.context)}</span>` : ""}
      <span class="tp-meta">${fmtCoord(place.lat, place.lon).replace("  |  ", " · ")} · ${esc(tzApprox ? `${tz} ${TT("(your device)")}` : tz)} ${offTxt}</span>`;
    document.getElementById("toolsGrid").innerHTML = sunCard(today) + moonCard() + nightCard() + calendarCard();
    wireCalendar();
    listeners.forEach(fn => { try { fn(); } catch (err) { console.error(err); } });
  }

  function sunCard(today) {
    const T = sunDay(day);
    const row = (label, a, b, cls = "") => `<li class="${cls}"><span>${label}</span><strong>${b === undefined ? fmtT(a) : `${fmtT(a)} – ${fmtT(b)}`}</strong></li>`;
    const sr = T[-0.833], s6 = T[6], s4 = T[-4], s6n = T[-6], s12 = T[-12], s18 = T[-18];
    let status = "";
    if (sr.always === "above") status = `<p class="tool-note">The sun doesn't set on this day (midnight sun).</p>`;
    else if (sr.always === "below") status = `<p class="tool-note">The sun doesn't rise on this day (polar night).</p>`;
    const dayLen = sr.rise && sr.set ? fmtDur(sr.set - sr.rise) : sr.always === "above" ? "24 h" : "0 h";
    const cRise = cloudAt(sr.rise), cSet = cloudAt(sr.set);

    // barra del giorno: colore secondo l'altezza del sole, ogni 10 minuti
    const from = localToUtc(day.y, day.m, day.d, 0), to = localToUtc(...Object.values(addDays(day, 1)), 0);
    const span = to - from, stops = [];
    const col = a => a < -18 ? "#040a14" : a < -12 ? "#0a1a33" : a < -6 ? "#13305a" : a < -4 ? "#2b5aa6" : a < 6 ? "#e2a14c" : "#8cc2ff";
    let last = null;
    for (let t = from; t <= to; t += STEP) {
      const c = col(Astro.sunAlt(t, place.lat, place.lon)), pct = ((t - from) / span * 100).toFixed(2);
      if (c !== last) { if (last) stops.push(`${last} ${pct}%`); stops.push(`${c} ${pct}%`); last = c; }
    }
    stops.push(`${last} 100%`);
    const now = Date.now(), nowPct = today && now >= from && now < to ? ((now - from) / span * 100).toFixed(2) : null;

    return `<article class="tool-card tool-sun">
      <header><span class="eyebrow">The sun</span><h2>Light of the day</h2>
        <p class="tool-date">${fmtDate(localToUtc(day.y, day.m, day.d, 12), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></header>
      <div class="sun-bar" style="background:linear-gradient(90deg,${stops.join(",")})">
        ${nowPct ? `<span class="sun-now" style="left:${nowPct}%"><em>Now</em></span>` : ""}
      </div>
      <div class="sun-scale" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      <ul class="sun-legend" aria-label="Legend">
        <li><i style="--c:#13305a"></i>Twilight</li><li><i style="--c:#2b5aa6"></i>Blue hour</li><li><i style="--c:#e2a14c"></i>Golden hour</li><li><i style="--c:#8cc2ff"></i>Daylight</li>
      </ul>
      ${status}
      <div class="sun-cols">
        <div><h3>Morning</h3><ul class="tool-times">
          ${row("Astronomical dawn", s18.rise)}
          ${row("Nautical dawn", s12.rise)}
          ${row("Blue hour", s6n.rise, s4.rise, "is-blue")}
          ${row("Golden hour", s4.rise, s6.rise, "is-gold")}
          ${row("Sunrise", sr.rise, undefined, "is-key")}
          ${cRise != null ? `<li class="is-cloud"><span>Clouds at sunrise</span><strong>${cRise}%</strong></li>` : ""}
        </ul></div>
        <div><h3>Evening</h3><ul class="tool-times">
          ${row("Golden hour", s6.set, s4.set, "is-gold")}
          ${row("Sunset", sr.set, undefined, "is-key")}
          ${row("Blue hour", s4.set, s6n.set, "is-blue")}
          ${row("Nautical dusk", s12.set)}
          ${row("Astronomical dusk", s18.set)}
          ${cSet != null ? `<li class="is-cloud"><span>Clouds at sunset</span><strong>${cSet}%</strong></li>` : ""}
        </ul></div>
      </div>
      <p class="tool-foot">Solar noon <strong>${fmtT(T.noon)}</strong> · Day length <strong>${dayLen}</strong></p>
    </article>`;
  }

  function moonCard() {
    const mid = localToUtc(day.y, day.m, day.d, 22);
    const il = Astro.moonIllum(mid), rs = moonRiseSet(day);
    const full = nextPhase(localToUtc(day.y, day.m, day.d, 0), 0.5), nw = nextPhase(localToUtc(day.y, day.m, day.d, 0), 1);
    const d = ms => ms ? fmtDate(ms, { weekday: "short", day: "numeric", month: "short" }) : "—";
    return `<article class="tool-card tool-moon">
      <header><span class="eyebrow">The moon</span><h2>${phaseName(il.phase)}</h2></header>
      <div class="moon-hero">
        ${moonSvg(il.phase, 120, "big")}
        <div><p class="moon-pct"><strong>${Math.round(il.fraction * 100)}%</strong> illuminated</p>
          <p class="moon-age">${(il.phase * 29.53).toFixed(1)} days since new moon</p></div>
      </div>
      <ul class="tool-times">
        <li><span>Moonrise</span><strong>${rs.always ? (rs.always === "above" ? "Up all day" : "Doesn't rise") : fmtT(rs.rise)}</strong></li>
        <li><span>Moonset</span><strong>${rs.always ? "—" : fmtT(rs.set)}</strong></li>
        <li><span>Next full moon</span><strong>${d(full)}</strong></li>
        <li><span>Next new moon</span><strong>${d(nw)}</strong></li>
      </ul>
    </article>`;
  }

  function nightCard() {
    const n = night(day);
    const win = (a, b) => a ? `${fmtT(a)} – ${fmtT(b)}` : "—";
    const rating = !n.astro ? "none" : n.dark >= 3 * 36e5 ? "great" : n.dark >= 1.5 * 36e5 ? "ok" : "poor";
    const msg = {
      none: "The sky never gets fully dark tonight: the sun stays less than 18° below the horizon.",
      great: "A dark night: plenty of time without sunlight or moonlight. Great for stars.",
      ok: "Some dark hours tonight, between twilight and the moon.",
      poor: "The moon lights up most of the night. Better for moonlit landscapes than for stars."
    }[rating];
    return `<article class="tool-card tool-night">
      <header><span class="eyebrow">Night sky</span><h2>Tonight</h2></header>
      <p class="night-rating r-${rating}">${{ none: "No full darkness", great: "Dark sky", ok: "Partly dark", poor: "Bright moon" }[rating]}</p>
      <p class="tool-note">${msg}</p>
      <ul class="tool-times">
        <li><span>Dark sky (no sun, no moon)</span><strong>${win(n.darkFrom, n.darkTo)}</strong></li>
        <li><span>Total darkness</span><strong>${n.dark ? fmtDur(n.dark) : "—"}</strong></li>
        <li class="is-key"><span>Milky Way core visible</span><strong>${win(n.coreFrom, n.coreTo)}</strong></li>
      </ul>
      <p class="tool-foot">${n.core ? `The galactic core is above 10° for <strong>${fmtDur(n.core)}</strong> of dark sky.`
        : "The Milky Way core is not visible in the dark hours of this night" + (place.lat > 50 ? " (it stays very low at this latitude)." : " — it's best from about March to October.")}</p>
    </article>`;
  }

  function calendarCard() {
    const { y, m } = calMonth;
    const first = new Date(Date.UTC(y, m, 1)), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7;   // settimana da lunedì
    const today = todayIn(tz);
    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<span class="cal-cell empty"></span>`;
    for (let d = 1; d <= days; d++) {
      const o = { y, m, d }, il = Astro.moonIllum(localToUtc(y, m, d, 22)), n = night(o);
      const mw = n.core >= 36e5, dark = n.dark >= 3 * 36e5;
      cells += `<button type="button" class="cal-cell${sameDay(o, day) ? " sel" : ""}${sameDay(o, today) ? " today" : ""}${dark ? " dark" : ""}" data-day="${d}"
        title="${TT(phaseName(il.phase))} · ${Math.round(il.fraction * 100)}%${n.dark ? ` · ${fmtDur(n.dark)} ${TT("of dark sky")}` : ""}${mw ? " · " + TT("Milky Way core visible") : ""}">
        <span class="cal-d">${d}</span>${moonSvg(il.phase, 26)}<span class="cal-p">${Math.round(il.fraction * 100)}%</span>
        ${mw ? `<span class="cal-mw" aria-label="Milky Way">✦</span>` : ""}</button>`;
    }
    const label = new Intl.DateTimeFormat((window.I18N?.locale || "en-GB"), { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
    return `<article class="tool-card tool-cal">
      <header class="cal-head"><div><span class="eyebrow">Moon calendar</span><h2>${label}</h2></div>
        <div class="cal-nav"><button type="button" data-month="-1" aria-label="Previous month">‹</button><button type="button" data-month="1" aria-label="Next month">›</button></div></header>
      <div class="cal-grid">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(w => `<span class="cal-w">${w}</span>`).join("")}${cells}</div>
      <ul class="cal-legend"><li><span class="lg-dark"></span>Dark night (3 h+ without sun and moon)</li><li><span class="cal-mw">✦</span>Milky Way core visible 1 h+</li></ul>
    </article>`;
  }

  function wireCalendar() {
    root().querySelectorAll("[data-day]").forEach(b => b.addEventListener("click", () => {
      day = { y: calMonth.y, m: calMonth.m, d: +b.dataset.day }; render();
      document.querySelector(".tool-sun")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    root().querySelectorAll("[data-month]").forEach(b => b.addEventListener("click", () => {
      const t = new Date(Date.UTC(calMonth.y, calMonth.m + +b.dataset.month, 1));
      calMonth = { y: t.getUTCFullYear(), m: t.getUTCMonth() };
      const card = root().querySelector(".tool-cal");
      card.outerHTML = calendarCard();
      wireCalendar();
    }));
  }

  /* ---------- contesto condiviso con planner.js ---------- */
  const ctx = {
    get place() { return place; }, get tz() { return tz; }, get day() { return day; },
    localToUtc: (...a) => localToUtc(...a), addDays, partsIn: ms => partsIn(ms, tz), fmtT, fmtDate, fmtDur,
    sunDay: () => sunDay(day), night: () => night(day), moonRiseSet: () => moonRiseSet(day), isToday: () => sameDay(day, todayIn(tz)),
    setPlace: p => setPlace(p, { keepDay: true }),
    setDay: o => { day = o; calMonth = { y: o.y, m: o.m }; render(); },
    reverseName,
    onUpdate: fn => listeners.push(fn),
    loadScript
  };

  return { show, ctx };
})();
window.Tools = Tools;
