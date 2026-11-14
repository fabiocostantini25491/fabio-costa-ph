/* Fabio Costa Ph / SpotFolk — photopulse.js
   📸 Photo pulse: a quick, smart planner inside every place card. The place is the subject; it answers «where do I stand, and when?»
   for grazing light, front or side light, the sun or the full moon right behind it, the moon in front or to the side,
   the Milky Way core or its arch, a constellation over it. Sun, moon and sky from Astro (tools.js), ground height and clouds
   from Open-Meteo (free). Everything is calculated in the browser; nothing is stored. Loaded only when the section opens. */
"use strict";

window.PhotoPulse = (() => {
  const lang = window.I18N?.lang || "en", it = lang === "it";
  const IT = {
    "Where do I stand, and when?": "Dove mi metto, e quando?", "The place is your subject.": "Il posto è il tuo soggetto.",
    "Grazing light": "Luce radente", "Front light": "Sole frontale", "Side light (3/4)": "Sole di lato (3/4)", "Sun behind it": "Sole dietro il soggetto",
    "Full moon behind it": "Luna piena dietro", "Moon in front or to the side": "Luna davanti o di lato", "Milky Way core": "Via Lattea frontale",
    "Milky Way arch": "Coda della Via Lattea", "Constellation over it": "Costellazione davanti",
    "Sunrise": "Alba", "Sunset": "Tramonto", "Subject height": "Altezza del soggetto",
    "statue · 5 m": "statua · 5 m", "church · 20 m": "chiesa · 20 m", "castle · 40 m": "castello · 40 m", "cliff · 100 m": "rupe · 100 m", "mountain · 500 m": "montagna · 500 m",
    "Calculating…": "Calcolo…", "Stand {d} of the place": "Mettiti a {d} del posto", "at about {k}": "a circa {k}",
    "Navigate to the spot": "Naviga al punto", "Open in the planner": "Apri nel planner",
    "sun": "sole", "moon": "luna", "core": "nucleo", "Low clouds {l}% · mid {m}% · high {h}%": "Nuvole basse {l}% · medie {m}% · alte {h}%",
    "No forecast yet for that day: check it a few days before.": "Ancora nessuna previsione per quel giorno: guardala qualche giorno prima.",
    "today": "oggi", "tomorrow": "domani",
    "Grazing light from the left": "Luce radente da sinistra", "Grazing light from the right": "Luce radente da destra",
    "The sun skims the surfaces sideways: textures, stone and relief come out. Stand so the sun is at 90° from where you look.": "Il sole sfiora le superfici di lato: escono texture, pietra e rilievo. Mettiti in modo che il sole sia a 90° da dove guardi.",
    "Sun behind you, low and warm: the subject is lit in full.": "Sole alle spalle, basso e caldo: il soggetto è illuminato in pieno.",
    "Sun at 45°: volume and long shadows, the classic three-quarter light.": "Sole a 45°: volume e ombre lunghe, la classica luce di tre quarti.",
    "From the left": "Da sinistra", "From the right": "Da destra",
    "The sun rises right behind the top of the subject.": "Il sole sorge proprio dietro la cima del soggetto.", "The sun sets right behind the top of the subject.": "Il sole tramonta proprio dietro la cima del soggetto.",
    "From here the sun looks as big as the subject. Further away it gets bigger.": "Da qui il sole appare grande quanto il soggetto. Più lontano diventa più grande.",
    "From here the moon looks as big as the subject. Further away it gets bigger.": "Da qui la luna appare grande quanto il soggetto. Più lontano diventa più grande.",
    "Full moon rising behind it": "Luna piena che sorge dietro", "Full moon setting behind it": "Luna piena che tramonta dietro",
    "No full moon near sunrise or sunset in the next 13 months.": "Nessuna luna piena vicina ad alba o tramonto nei prossimi 13 mesi.",
    "Moon {p}% · {w}": "Luna al {p}% · {w}", "golden hour at sunrise": "ora d'oro all'alba", "golden hour at sunset": "ora d'oro al tramonto", "blue hour": "ora blu",
    "Behind the subject": "Dietro il soggetto", "To the side": "Di lato",
    "No low moon in the good light in the next 45 days.": "Nessuna luna bassa nella luce buona nei prossimi 45 giorni.",
    "Good period: {n} good nights in the next 30 days.": "Buon periodo: {n} notti buone nei prossimi 30 giorni.",
    "Not the season: the core comes back on {d}.": "Non è periodo: il nucleo torna visibile dal {d}.",
    "The core of the Milky Way never rises high enough here.": "Qui il nucleo della Via Lattea non sale mai abbastanza.",
    "Core at {a}°, dark sky, no moon": "Nucleo a {a}°, cielo buio, senza luna",
    "Dark sky and no moon: the core stands right behind the subject. Stay close (100–300 m) so the subject fills the frame.": "Cielo buio e senza luna: il nucleo sta proprio dietro il soggetto. Resta vicino (100–300 m) così il soggetto riempie l'inquadratura.",
    "The arch of {n} at {a}°": "L'arco di {n} a {a}°", "No dark, moonless night in the next 45 days.": "Nessuna notte buia e senza luna nei prossimi 45 giorni.",
    "The fainter part of the Milky Way, away from the core: the arch you see in the other seasons.": "La parte più tenue della Via Lattea, lontana dal nucleo: l'arco che si vede nelle altre stagioni.",
    "{c} at {a}°, dark sky": "{c} a {a}°, cielo buio", "Constellation": "Costellazione",
    "Not visible from here in the next 60 nights.": "Non visibile da qui nelle prossime 60 notti.",
    "The real horizon (hills, mountains) can hide the first minutes: check it in the planner, in 3D.": "L'orizzonte reale (colline, montagne) può nascondere i primi minuti: controllalo nel planner, in 3D.",
    "Positions are calculated: check them on the spot, a few metres can change everything.": "Le posizioni sono calcolate: verificale sul posto, pochi metri cambiano tutto.",
    "N": "N", "NNE": "NNE", "NE": "NE", "ENE": "ENE", "E": "E", "ESE": "ESE", "SE": "SE", "SSE": "SSE", "S": "S", "SSW": "SSO", "SW": "SO", "WSW": "OSO", "W": "O", "WNW": "ONO", "NW": "NO", "NNW": "NNO",
    "north": "nord", "north-east": "nord-est", "east": "est", "south-east": "sud-est", "south": "sud", "south-west": "sud-ovest", "west": "ovest", "north-west": "nord-ovest",
    "Orion": "Orione", "Big Dipper": "Grande Carro", "Cassiopeia": "Cassiopea", "Scorpius": "Scorpione", "Cygnus": "Cigno", "Pleiades": "Pleiadi", "Southern Cross": "Croce del Sud",
    "Aquila": "Aquila", "Perseus": "Perseo", "Auriga": "Auriga", "Orion and Monoceros": "Orione e Unicorno", "Cassiopeia ": "Cassiopea ",
    "sun {a}° · {h}° high": "sole {a}° · alto {h}°", "moon {a}° · {h}° high": "luna {a}° · alta {h}°", "sky {a}° · {h}° high": "cielo {a}° · alto {h}°"
  };
  const t = (s, v = {}) => (it ? IT[s] || s : s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
  const rad = Math.PI / 180, MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  const SUN_D = 0.53, MOON_D = 0.52;   // apparent diameters, degrees
  const DIR16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const DIR8 = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  const dir16 = az => t(DIR16[Math.round(((az % 360) + 360) % 360 / 22.5) % 16]);
  const dir8 = az => t(DIR8[Math.round(((az % 360) + 360) % 360 / 45) % 8]);
  const norm = a => ((a % 360) + 360) % 360;
  // a point d km from (lat, lon) towards bearing az
  function dest(lat, lon, az, km) {
    const R = 6371, d = km / R, b = az * rad, p1 = lat * rad, l1 = lon * rad;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 / rad, lon: ((l2 / rad + 540) % 360) - 180 };
  }
  const kmTxt = km => km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km < 10 ? km.toFixed(1).replace(".", it ? "," : ".") : Math.round(km)} km`;

  // the constellations of the planner, by their centre (RA, Dec in degrees)
  const CONS = [["Orion", 83.8, 1], ["Big Dipper", 178, 56], ["Cassiopeia", 14, 60], ["Scorpius", 252, -30], ["Cygnus", 305, 40], ["Pleiades", 56.8, 24.1], ["Southern Cross", 187, -60]];
  // the arch of the Milky Way away from the core: galactic longitude → name
  const ARCH = [[50, "Aquila"], [80, "Cygnus"], [120, "Cassiopeia "], [150, "Perseus"], [175, "Auriga"], [210, "Orion and Monoceros"]];

  let css = false;
  function addCss() {
    if (css) return; css = true;
    const st = document.createElement("style");
    st.textContent = `
.pp2{display:grid;gap:10px}
.pp2-h{margin:0;font-size:12.5px;color:#b8c4d2}
.pp2-qs{display:flex;flex-wrap:wrap;gap:6px}
.pp2-qs button,.pp2-seg button{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#f2f6fb;border-radius:99px;padding:7px 11px;font-family:inherit;font-weight:600;font-size:12.5px;cursor:pointer}
.pp2-qs button.on,.pp2-seg button.on{background:#f28c28;border-color:#f28c28;color:#1a1206}
.pp2-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12px;color:#9fb0c4}
.pp2-seg{display:flex;flex-wrap:wrap;gap:4px}
.pp2-seg button{padding:5px 9px;font-size:12px}
.pp2-sel{padding:6px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(5,11,20,.6);color:#f2f6fb;font:inherit;font-size:12.5px}
.pp2-res{display:grid;gap:8px}
.pp2-a{display:grid;grid-template-columns:90px minmax(0,1fr);gap:10px;align-items:start;padding:10px;border-radius:14px;background:rgba(2,6,12,.45);border:1px solid rgba(156,200,255,.14)}
.pp2-a svg{width:90px;height:90px;display:block}
.pp2-a b{display:block;font-size:13.5px;color:#fff}.pp2-a .w{display:block;font-size:12px;color:#ffd27a;margin-top:2px}
.pp2-a p{margin:4px 0 0;font-size:12px;color:#c9d6e6;line-height:1.4}.pp2-a small{display:block;font-size:11.5px;color:#8a99ab;margin-top:3px}
.pp2-a .acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.pp2-a .acts a{font-size:12px;font-weight:600;color:#ffbe7a;text-decoration:none;border:1px solid rgba(255,190,122,.45);border-radius:99px;padding:4px 9px}
.pp2-note{margin:0;font-size:11.5px;color:#8a99ab}
.pp2-good{font-size:12.5px;color:#8fe0a6;margin:0}.pp2-bad{font-size:12.5px;color:#ffbe7a;margin:0}
@media(max-width:420px){.pp2-a{grid-template-columns:72px minmax(0,1fr);padding:8px}.pp2-a svg{width:72px;height:72px}}`;
    document.head.append(st);
  }

  /* ---------- the place: timezone, clouds (7 days), ground height ---------- */
  const meteoCache = new Map(), elevCache = new Map();
  async function meteo(lat, lon) {
    const k = `${lat.toFixed(2)},${lon.toFixed(2)}`, c = meteoCache.get(k);
    if (c && Date.now() - c.at < HOUR) return c.d;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high&timezone=auto&forecast_days=7`);
      const d = r.ok ? await r.json() : null; meteoCache.set(k, { at: Date.now(), d }); return d;
    } catch { return null; }
  }
  async function elevations(pts) {
    const need = pts.filter(p => !elevCache.has(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`));
    if (need.length) try {
      const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${need.map(p => p.lat.toFixed(4)).join(",")}&longitude=${need.map(p => p.lon.toFixed(4)).join(",")}`);
      const j = await r.json(); (j.elevation || []).forEach((e, i) => elevCache.set(`${need[i].lat.toFixed(4)},${need[i].lon.toFixed(4)}`, +e || 0));
    } catch {}
    return pts.map(p => elevCache.get(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`) ?? 0);
  }

  /* ---------- the sky ---------- */
  const sunAt = (ms, s) => Astro.sunPos(ms, s.lat, s.lon), moonAt = (ms, s) => Astro.moonPos(ms, s.lat, s.lon);
  // the moment, after «from», when a body's altitude crosses «h» (rising true: going up), within «span» ms; null if not
  function crossing(pos, s, from, span, h, rising) {
    const step = 4 * MIN; let prev = pos(from, s).alt - h;
    for (let x = from + step; x <= from + span; x += step) {
      const cur = pos(x, s).alt - h;
      if (rising ? (prev < 0 && cur >= 0) : (prev > 0 && cur <= 0)) {
        let a = x - step, b = x;   // refine
        for (let i = 0; i < 12; i++) { const m = (a + b) / 2, v = pos(m, s).alt - h; if (rising ? v < 0 : v > 0) a = m; else b = m; }
        return (a + b) / 2;
      }
      prev = cur;
    }
    return null;
  }
  const sunEvents = (dayNoon, s) => Astro.sunTimes(dayNoon, s.lat, s.lon, [-0.833, -6, -18, 6]);

  /* ---------- drawing: a little map of where to stand ---------- */
  function diagram(cams, bodyAz, icon, side) {
    // subject in the middle; the body's direction as an arrow at the edge; cameras as dots on their bearing
    const C = 59, R = 44, P = a => [C + R * Math.sin(a * rad), C - R * Math.cos(a * rad)];
    const [bx, by] = P(bodyAz), body = `<text x="${(C + (R + 9) * Math.sin(bodyAz * rad)).toFixed(1)}" y="${(C - (R + 9) * Math.cos(bodyAz * rad) + 4).toFixed(1)}" font-size="13" text-anchor="middle">${icon}</text>`;
    const rays = side ? "" : `<line x1="${C}" y1="${C}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#ffd27a" stroke-width="1.4" stroke-dasharray="3 3"/>`;
    const cam = cams.map(a => { const [x, y] = P(a); return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${C}" y2="${C}" stroke="#8fe0a6" stroke-width="1.6"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#2fbf71" stroke="#051b10" stroke-width="1.5"/><text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" font-size="8" text-anchor="middle">📷</text>`; }).join("");
    return `<svg viewBox="0 0 118 118" role="img" aria-hidden="true"><circle cx="${C}" cy="${C}" r="${R}" fill="rgba(16,35,58,.8)" stroke="rgba(255,255,255,.15)"/>
      <text x="${C}" y="11" font-size="9" fill="#9fb0c4" text-anchor="middle">N</text><text x="${C}" y="114" font-size="9" fill="#5f7085" text-anchor="middle">S</text>
      <text x="113" y="${C + 3}" font-size="9" fill="#5f7085" text-anchor="middle">E</text><text x="5" y="${C + 3}" font-size="9" fill="#5f7085" text-anchor="middle">${it ? "O" : "W"}</text>
      ${rays}${cam}<rect x="${C - 4}" y="${C - 4}" width="8" height="8" rx="2" fill="#ffbe7a"/>${body}</svg>`;
  }

  /* ---------- mount ---------- */
  async function mount(el, K, s) {
    addCss();
    s = { lat: +s.lat, lon: +s.lon, name: s.name, id: s.id };
    const esc = K.esc;
    const S = { q: null, when: "rise", h: 20, con: "Orion" };
    try { const sv = JSON.parse(sessionStorage.getItem("pp2") || "{}"); Object.assign(S, { when: sv.when || "rise", h: sv.h || 20, con: sv.con || "Orion" }); } catch {}
    el.innerHTML = `<div class="pp2"><p class="pp2-h">📸 <b>${esc(t("Where do I stand, and when?"))}</b> ${esc(t("The place is your subject."))}</p>
      <div class="pp2-qs" role="group">${[["graze", "🌅 " + t("Grazing light")], ["front", "☀️ " + t("Front light")], ["side", "↗️ " + t("Side light (3/4)")], ["sunback", "🎯 " + t("Sun behind it")],
        ["fullmoon", "🌕 " + t("Full moon behind it")], ["moon", "🌙 " + t("Moon in front or to the side")], ["core", "🌌 " + t("Milky Way core")], ["arch", "🌠 " + t("Milky Way arch")], ["cons", "✨ " + t("Constellation over it")]]
        .map(([k, l]) => `<button type="button" data-ppq="${k}">${esc(l)}</button>`).join("")}</div>
      <div class="pp2-opts" data-ppopts></div><div class="pp2-res" data-ppres></div></div>`;
    const wx = meteo(s.lat, s.lon);   // timezone and clouds, in the meantime
    el.querySelectorAll("[data-ppq]").forEach(b => b.addEventListener("click", () => { S.q = b.dataset.ppq; el.querySelectorAll("[data-ppq]").forEach(x => x.classList.toggle("on", x === b)); K.track?.(`Photo pulse: ${S.q}`); run(); }));

    async function run() {
      const opts = el.querySelector("[data-ppopts]"), res = el.querySelector("[data-ppres]");
      const sunQ = ["graze", "front", "side", "sunback"].includes(S.q), sizeQ = ["sunback", "fullmoon", "moon"].includes(S.q);
      opts.innerHTML = `<div class="pp2-row">${sunQ ? `<div class="pp2-seg">${[["rise", "🌅 " + t("Sunrise")], ["set", "🌇 " + t("Sunset")]].map(([k, l]) => `<button type="button" data-ppw="${k}" class="${S.when === k ? "on" : ""}">${esc(l)}</button>`).join("")}</div>` : ""}
        ${sizeQ ? `<label>${esc(t("Subject height"))} <select class="pp2-sel" data-pph>${[[5, "statue · 5 m"], [20, "church · 20 m"], [40, "castle · 40 m"], [100, "cliff · 100 m"], [500, "mountain · 500 m"]].map(([v, l]) => `<option value="${v}"${+S.h === v ? " selected" : ""}>${esc(t(l))}</option>`).join("")}</select></label>` : ""}
        ${S.q === "cons" ? `<label>${esc(t("Constellation"))} <select class="pp2-sel" data-ppc>${CONS.map(c => `<option value="${c[0]}"${S.con === c[0] ? " selected" : ""}>${esc(t(c[0]))}</option>`).join("")}</select></label>` : ""}</div>`;
      const save = () => { try { sessionStorage.setItem("pp2", JSON.stringify({ when: S.when, h: S.h, con: S.con })); } catch {} };
      opts.querySelectorAll("[data-ppw]").forEach(b => b.addEventListener("click", () => { S.when = b.dataset.ppw; save(); run(); }));
      opts.querySelector("[data-pph]")?.addEventListener("change", e => { S.h = +e.target.value; save(); run(); });
      opts.querySelector("[data-ppc]")?.addEventListener("change", e => { S.con = e.target.value; save(); run(); });
      res.innerHTML = `<p class="pp2-note">${esc(t("Calculating…"))}</p>`;
      const m = await wx, off = (m?.utc_offset_seconds ?? Math.round(s.lon / 15) * 3600) * 1000;
      await new Promise(r => setTimeout(r, 20));
      let out = [];
      try { out = await answer(S, s, off, m); } catch (err) { out = [{ html: `<p class="pp2-bad">${esc(err.message)}</p>` }]; }
      res.innerHTML = out.map(o => o.html).join("") + `<p class="pp2-note">${esc(t(["sunback", "fullmoon"].includes(S.q) ? "The real horizon (hills, mountains) can hide the first minutes: check it in the planner, in 3D." : "Positions are calculated: check them on the spot, a few metres can change everything."))}</p>`;
      K.update?.();
    }

    /* ---------- the answers ---------- */
    const local = (ms, off) => new Date(ms + off);
    const hm = (ms, off) => local(ms, off).toISOString().slice(11, 16);
    const dayName = (ms, off) => {
      const d0 = local(Date.now(), off).toISOString().slice(0, 10), d = local(ms, off).toISOString().slice(0, 10);
      if (d === d0) return t("today");
      if (d === local(Date.now() + DAY, off).toISOString().slice(0, 10)) return t("tomorrow");
      return new Date(d + "T12:00:00").toLocaleDateString(window.I18N?.locale || "en-GB", { weekday: "short", day: "numeric", month: "short", year: d.slice(0, 4) !== d0.slice(0, 4) ? "numeric" : undefined });
    };
    const clouds = (ms, m) => {
      const H = m?.hourly; if (!H?.time) return "";
      const k = new Date(ms + (m.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 13) + ":00", i = H.time.indexOf(k);
      if (i < 0) return ms - Date.now() < 7 * DAY ? "" : `<small>☁️ ${esc(t("No forecast yet for that day: check it a few days before."))}</small>`;
      return `<small>☁️ ${esc(t("Low clouds {l}% · mid {m}% · high {h}%", { l: Math.round(H.cloud_cover_low[i]), m: Math.round(H.cloud_cover_mid[i]), h: Math.round(H.cloud_cover_high[i]) }))}</small>`;
    };
    const links = (cam, ms, off) => {
      const day = local(ms, off).toISOString().slice(0, 10);
      const pl = `https://fabiocostaph.com/?tp=${cam.lat.toFixed(5)},${cam.lon.toFixed(5)}&tn=${encodeURIComponent((it ? "Da dove scattare: " : "Where to shoot: ") + (s.name || ""))}&td=${day}&tt=planner#tools`;
      return `<div class="acts"><a href="https://www.google.com/maps/dir/?api=1&destination=${cam.lat.toFixed(5)},${cam.lon.toFixed(5)}" target="_blank" rel="noopener">🗺️ ${esc(t("Navigate to the spot"))}</a><a href="${pl}" target="_blank" rel="noopener">🔭 ${esc(t("Open in the planner"))}</a></div>`;
    };
    const card = ({ title, ms, off, camAz, km, bodyAz, icon, text, extra = "", m, side, cams }) => {
      const cam = dest(s.lat, s.lon, camAz, km);
      return { html: `<div class="pp2-a">${diagram(cams || [camAz], bodyAz, icon, side)}<div><b>${esc(title)}</b><span class="w">🕒 ${esc(dayName(ms, off))} · ${esc(hm(ms, off))}</span>
        <p>📍 ${esc(t("Stand {d} of the place", { d: dir8(camAz) }))}${km ? ` ${esc(t("at about {k}", { k: kmTxt(km) }))}` : ""} (${Math.round(norm(camAz))}° ${esc(dir16(camAz))})${text ? ` · ${esc(text)}` : ""}</p>
        ${extra}${clouds(ms, m)}${links(cam, ms, off)}</div></div>` };
    };
    // the next local noons, as UTC ms
    const noons = (off, n, from = 0) => { const d0 = local(Date.now(), off).toISOString().slice(0, 10), b = Date.parse(d0 + "T12:00:00Z") - off; return Array.from({ length: n }, (_, i) => b + (from + i) * DAY); };

    async function answer(S, s, off, m) {
      const q = S.q, rise = S.when === "rise";
      // --- sun at sunrise or sunset: grazing, front, side ---
      if (q === "graze" || q === "front" || q === "side") {
        const out = [];
        for (const noon of noons(off, 4)) {
          const ev = sunEvents(noon, s)[-0.833]; const base = rise ? ev.rise : ev.set; if (!base || base < Date.now() - 30 * MIN) continue;
          const ms = rise ? base + 18 * MIN : base - 18 * MIN, p = sunAt(ms, s);   // the sun about 2–4° high: the warm, low light
          if (q === "graze") out.push(card({ title: t("Grazing light"), ms, off, camAz: p.az + 90, km: 0.3, bodyAz: p.az, icon: "☀️", m, side: true, cams: [p.az + 90, p.az - 90],
            text: t("sun {a}° · {h}° high", { a: Math.round(p.az), h: Math.max(0, Math.round(p.alt)) }), extra: `<p>${esc(t("The sun skims the surfaces sideways: textures, stone and relief come out. Stand so the sun is at 90° from where you look."))}</p>` }));
          if (q === "front") out.push(card({ title: t("Front light"), ms, off, camAz: p.az, km: 0.3, bodyAz: p.az, icon: "☀️", m, side: true,
            text: t("sun {a}° · {h}° high", { a: Math.round(p.az), h: Math.max(0, Math.round(p.alt)) }), extra: `<p>${esc(t("Sun behind you, low and warm: the subject is lit in full."))}</p>` }));
          if (q === "side") out.push(card({ title: t("Side light (3/4)"), ms, off, camAz: p.az + 45, km: 0.3, bodyAz: p.az, icon: "☀️", m, side: true, cams: [p.az + 45, p.az - 45],
            text: t("sun {a}° · {h}° high", { a: Math.round(p.az), h: Math.max(0, Math.round(p.alt)) }), extra: `<p>${esc(t("Sun at 45°: volume and long shadows, the classic three-quarter light."))}</p>` }));
          if (out.length >= 3) break;
        }
        return out;
      }
      // --- the sun or the moon right behind the top of the subject (distance from the size) ---
      const behind = async (pos, ms0, rising, diam) => {
        // first guess: the body at the astronomical horizon; then the ground heights give the true angle to the top
        const km = Math.max(0.15, (S.h / Math.tan(diam * rad)) / 1000);
        let p = pos(ms0, s), cam = dest(s.lat, s.lon, p.az + 180, km), ms = ms0;
        for (let pass = 0; pass < 2; pass++) {
          const [eS, eC] = await elevations([s, cam]);
          const ang = Math.atan2(eS + S.h - eC - 1.7, km * 1000) / rad;   // from the eye, 1.7 m above the ground
          const x = crossing(pos, s, ms0 - 3 * HOUR, 7 * HOUR, ang, rising); if (!x) break;
          ms = x; p = pos(ms, s); cam = dest(s.lat, s.lon, p.az + 180, km);
        }
        return { ms, p, km };
      };
      if (q === "sunback") {
        const out = [];
        for (const noon of noons(off, 4)) {
          const ev = sunEvents(noon, s)[-0.833], base = rise ? ev.rise : ev.set; if (!base || base < Date.now()) continue;
          const r = await behind((x, ss) => sunAt(x, ss), base, rise, SUN_D);
          out.push(card({ title: t(rise ? "The sun rises right behind the top of the subject." : "The sun sets right behind the top of the subject."), ms: r.ms, off, camAz: r.p.az + 180, km: r.km, bodyAz: r.p.az, icon: "☀️", m,
            text: t("sun {a}° · {h}° high", { a: Math.round(r.p.az), h: String(Math.round(r.p.alt * 10) / 10).replace(".", it ? "," : ".") }), extra: `<p>${esc(t("From here the sun looks as big as the subject. Further away it gets bigger."))}</p>` }));
          if (out.length >= 3) break;
        }
        return out;
      }
      if (q === "fullmoon") {
        // full moons (≥ 92% lit) rising within the hour around sunset, or setting around sunrise, in the next 13 months
        const found = [];
        for (const noon of noons(off, 400)) {
          const il = Astro.moonIllum(noon).fraction; if (il < 0.88) continue;
          const ev = sunEvents(noon, s)[-0.833]; if (!ev.set || !ev.rise) continue;
          const mr = crossing((x, ss) => moonAt(x, ss), s, ev.set - 75 * MIN, 165 * MIN, 0, true);
          if (mr && Astro.moonIllum(mr).fraction >= 0.92 && mr > Date.now()) found.push({ ms: mr, rising: true, il: Astro.moonIllum(mr).fraction });
          const ms2 = crossing((x, ss) => moonAt(x, ss), s, ev.rise - 90 * MIN, 165 * MIN, 0, false);
          if (ms2 && Astro.moonIllum(ms2).fraction >= 0.92 && ms2 > Date.now()) found.push({ ms: ms2, rising: false, il: Astro.moonIllum(ms2).fraction });
          if (found.length >= 4) break;
        }
        if (!found.length) return [{ html: `<p class="pp2-bad">${esc(t("No full moon near sunrise or sunset in the next 13 months."))}</p>` }];
        found.sort((x, y) => x.ms - y.ms);
        const out = [];
        for (const f of found.slice(0, 4)) {
          const r = await behind((x, ss) => moonAt(x, ss), f.ms, f.rising, MOON_D);
          out.push(card({ title: `${t(f.rising ? "Full moon rising behind it" : "Full moon setting behind it")} · ${Math.round(f.il * 100)}%`, ms: r.ms, off, camAz: r.p.az + 180, km: r.km, bodyAz: r.p.az, icon: "🌕", m,
            text: t("moon {a}° · {h}° high", { a: Math.round(r.p.az), h: String(Math.round(r.p.alt * 10) / 10).replace(".", it ? "," : ".") }), extra: `<p>${esc(t("From here the moon looks as big as the subject. Further away it gets bigger."))}</p>` }));
        }
        return out;
      }
      if (q === "moon") {
        // a moon at least 40% lit, low (2–15°), in the golden or blue hour, next 45 days: the brightest first
        const found = [];
        for (const noon of noons(off, 45)) {
          const ev = sunEvents(noon, s);
          for (const [a, b, w] of [[ev[-6].rise, ev[6].rise, "golden hour at sunrise"], [ev[6].set, ev[-6].set, "golden hour at sunset"]]) {
            if (!a || !b || b < Date.now()) continue;
            for (let x = a; x <= b; x += 10 * MIN) {
              const p = moonAt(x, s), il = Astro.moonIllum(x).fraction;
              if (p.alt >= 2 && p.alt <= 15 && il >= 0.4) { found.push({ ms: x, p, il, w: sunAt(x, s).alt < -0.8 ? "blue hour" : w }); break; }
            }
          }
        }
        if (!found.length) return [{ html: `<p class="pp2-bad">${esc(t("No low moon in the good light in the next 45 days."))}</p>` }];
        const best = found.sort((a, b) => b.il - a.il).slice(0, 3).sort((a, b) => a.ms - b.ms);
        return best.map(f => card({ title: t("Moon {p}% · {w}", { p: Math.round(f.il * 100), w: t(f.w) }), ms: f.ms, off, camAz: f.p.az + 180, km: Math.max(0.15, S.h / Math.tan(MOON_D * rad) / 1000), bodyAz: f.p.az, icon: "🌙", m,
          cams: [f.p.az + 180, f.p.az + 135, f.p.az - 135], text: t("moon {a}° · {h}° high", { a: Math.round(f.p.az), h: Math.round(f.p.alt) }),
          extra: `<p>${esc(t("Behind the subject"))}: ${esc(dir8(f.p.az + 180))} · ${esc(t("To the side"))}: ${esc(dir8(f.p.az + 135))} / ${esc(dir8(f.p.az - 135))}</p>` }));
      }
      // --- the night sky: dark (sun below −18°) and no moon (below the horizon or under 15% lit) ---
      const nights = (n, from = 0) => noons(off, n, from).map(noon => {
        const e = sunEvents(noon, s)[-18], e2 = sunEvents(noon + DAY, s)[-18];
        return e.set && e2.rise ? [e.set, e2.rise] : null;
      });
      const darkAt = x => moonAt(x, s).alt < 0 || Astro.moonIllum(x).fraction < 0.15;
      if (q === "core") {
        const best = (night) => { if (!night) return null; let b = null;
          for (let x = night[0]; x < night[1]; x += 15 * MIN) { if (!darkAt(x)) continue; const p = Astro.corePos(x, s.lat, s.lon); if (p.alt >= 10) { const score = -Math.abs(p.alt - 20); if (!b || score > b.score) b = { ms: x, p, score }; } }
          return b; };
        const month = nights(30).map(best), good = month.filter(Boolean);
        if (!good.length) {
          const later = nights(335, 30).map((n, i) => ({ i, b: best(n) })).find(x => x.b);
          return [{ html: later ? `<p class="pp2-bad">🌌 ${esc(t("Not the season: the core comes back on {d}.", { d: new Date(later.b.ms + off).toLocaleDateString(window.I18N?.locale || "en-GB", { day: "numeric", month: "long", year: "numeric" }) }))}</p>`
            : `<p class="pp2-bad">${esc(t("The core of the Milky Way never rises high enough here."))}</p>` }];
        }
        const pick = good.slice().sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.ms - b.ms);
        return [{ html: `<p class="pp2-good">🌌 ${esc(t("Good period: {n} good nights in the next 30 days.", { n: good.length }))}</p>` }, ...pick.map(b => card({ title: t("Core at {a}°, dark sky, no moon", { a: Math.round(b.p.alt) }), ms: b.ms, off, camAz: b.p.az + 180, km: 0.2, bodyAz: b.p.az, icon: "🌌", m,
          text: t("sky {a}° · {h}° high", { a: Math.round(b.p.az), h: Math.round(b.p.alt) }), extra: `<p>${esc(t("Dark sky and no moon: the core stands right behind the subject. Stay close (100–300 m) so the subject fills the frame."))}</p>` }))];
      }
      if (q === "arch") {
        const out = [];
        for (const night of nights(45)) {
          if (!night) continue;
          const mid = (night[0] + night[1]) / 2; let b = null;
          for (let x = night[0] + HOUR; x < night[1] - HOUR; x += 30 * MIN) {
            if (!darkAt(x)) continue;
            for (const [l, n] of ARCH) { const [ra, dec] = Astro.galToRaDec(l, 0), p = Astro.radecPos(x, s.lat, s.lon, ra, dec); if (p.alt >= 20 && p.alt <= 45) { const sc = -Math.abs(p.alt - 30) - Math.abs(x - mid) / HOUR; if (!b || sc > b.sc) b = { ms: x, p, n, sc }; } }
          }
          if (b) out.push(b); if (out.length >= 3) break;
        }
        if (!out.length) return [{ html: `<p class="pp2-bad">${esc(t("No dark, moonless night in the next 45 days."))}</p>` }];
        return out.map(b => card({ title: t("The arch of {n} at {a}°", { n: t(b.n).trim(), a: Math.round(b.p.alt) }), ms: b.ms, off, camAz: b.p.az + 180, km: 0.2, bodyAz: b.p.az, icon: "🌠", m,
          text: t("sky {a}° · {h}° high", { a: Math.round(b.p.az), h: Math.round(b.p.alt) }), extra: `<p>${esc(t("The fainter part of the Milky Way, away from the core: the arch you see in the other seasons."))}</p>` }));
      }
      if (q === "cons") {
        const c = CONS.find(x => x[0] === S.con) || CONS[0], out = [];
        for (const night of nights(60)) {
          if (!night) continue; let b = null;
          for (let x = night[0]; x < night[1]; x += 20 * MIN) {
            const p = Astro.radecPos(x, s.lat, s.lon, c[1], c[2]); if (p.alt < 12 || p.alt > 40) continue;
            const sc = -Math.abs(p.alt - 22) + (darkAt(x) ? 10 : 0); if (!b || sc > b.sc) b = { ms: x, p, sc };
          }
          if (b) out.push(b); if (out.length >= 3) break;
        }
        if (!out.length) return [{ html: `<p class="pp2-bad">${esc(t("Not visible from here in the next 60 nights."))}</p>` }];
        return out.map(b => card({ title: t("{c} at {a}°, dark sky", { c: t(c[0]), a: Math.round(b.p.alt) }), ms: b.ms, off, camAz: b.p.az + 180, km: 0.2, bodyAz: b.p.az, icon: "✨", m,
          text: t("sky {a}° · {h}° high", { a: Math.round(b.p.az), h: Math.round(b.p.alt) }) }));
      }
      return [];
    }
  }
  return { mount };
})();
