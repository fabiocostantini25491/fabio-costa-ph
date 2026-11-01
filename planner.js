/* Fabio Costa Ph — planner.js
   Planner in stile PhotoPills / Google Earth: mappa satellitare 2D o rilievo 3D (MapLibre, open source),
   direzioni di sole, luna e nucleo della Via Lattea, cursore del tempo e orizzonte reale calcolato dal rilievo.
   Rilievo: AWS Terrain Tiles (dati aperti). Calcoli astronomici: Astro, in tools.js. */
"use strict";

const Planner = (() => {
  const ML_JS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
  const ML_CSS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
  const DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const LBL_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
  const COL = { sunrise: "#ffd27a", sunset: "#ff9a5a", sun: "#ffe14d", moonrise: "#cfd8e6", moonset: "#9fb0c8", moon: "#ffffff", core: "#c79bff" };
  const R_EARTH = 6371000, rad = Math.PI / 180;

  let ctx = null, map = null, marker = null, built = false, styleReady = false;
  let is3d = false, minute = 0, playing = 0, lastKey = "", followNow = true;
  let horizon = null, horizonKey = "", horizonBusy = false, observerElev = null;

  /* ---------- utilità ---------- */
  const $p = sel => document.querySelector(`#plannerRoot ${sel}`);
  function dest(lat, lon, brg, meters) {
    const d = meters / R_EARTH, b = brg * rad, p1 = lat * rad, l1 = lon * rad;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [((l2 / rad + 540) % 360) - 180, p2 / rad];
  }
  const dayStart = () => { const d = ctx.day; return ctx.localToUtc(d.y, d.m, d.d, 0); };
  const msAt = min => dayStart() + min * 60000;
  const compass = az => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(az / 22.5) % 16];
  const fmtAz = az => `${Math.round(az)}° ${compass(az)}`;
  const fmtAlt = a => `${a >= 0 ? "+" : "−"}${Math.abs(a).toFixed(1)}°`;
  const phase = a => a >= 6 ? "Daylight" : a >= -4 ? "Golden hour" : a >= -6 ? "Blue hour" : a >= -12 ? "Nautical twilight" : a >= -18 ? "Astronomical twilight" : "Night";
  const refr = h => { h = Math.max(h, -1.5); return 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * rad) / 60; };   // rifrazione apparente (gradi)

  /* ---------- avvio ---------- */
  async function show(c) {
    ctx = c;
    if (!built) {
      built = true;
      document.getElementById("plannerRoot").innerHTML = shellHtml();
      wireUi();
      ctx.onUpdate(update);
      try { await loadLib(); } catch {
        $p("#plMap").innerHTML = `<p class="gate-note warn pl-fail">The 3D map engine could not be loaded. Check your connection and reload the page.</p>`;
        return;
      }
      buildMap();
    } else if (map) setTimeout(() => map.resize(), 30);
    update();
  }

  function loadLib() {
    if (window.maplibregl) return Promise.resolve();
    if (!document.querySelector(`link[href="${ML_CSS}"]`)) document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${ML_CSS}">`);
    return ctx.loadScript(ML_JS);
  }

  function shellHtml() {
    return `
      <div class="planner">
        <div class="pl-stage">
          <div id="plMap" class="pl-map" aria-label="Planner map"></div>
          <div class="pl-modes" role="group" aria-label="Map view">
            <button type="button" data-mode="2d" aria-pressed="true">2D</button>
            <button type="button" data-mode="3d" aria-pressed="false">3D</button>
          </div>
          <div class="pl-look" role="group" aria-label="Look from the pin">
            <button type="button" data-look="sunrise">Look at sunrise</button>
            <button type="button" data-look="sunset">Look at sunset</button>
            <button type="button" data-look="core">Look at Milky Way</button>
          </div>
          <ul class="pl-legend" aria-label="Legend">
            <li><i style="--c:${COL.sunrise}"></i>Sunrise</li><li><i style="--c:${COL.sunset}"></i>Sunset</li>
            <li><i style="--c:${COL.sun}" class="thick"></i>Sun now</li><li><i style="--c:${COL.moonrise}" class="dash"></i>Moonrise/set</li>
            <li><i style="--c:${COL.moon}" class="thick"></i>Moon now</li><li><i style="--c:${COL.core}" class="thick"></i>Milky Way core</li>
          </ul>
        </div>
        <p class="pl-hint">Tap the map or drag the pin to choose your shooting point. In 3D, drag with two fingers (or right-click) to tilt and rotate.</p>

        <div class="pl-time">
          <div class="pl-time-head">
            <strong id="plClock">--:--</strong><span id="plPhase" class="pl-phase"></span>
            <div class="pl-time-btns">
              <button type="button" class="pop-btn" id="plPlay" aria-label="Play the day">▶</button>
              <button type="button" class="pop-btn" id="plNow">Now</button>
            </div>
          </div>
          <input type="range" id="plSlider" min="0" max="1439" step="1" value="0" aria-label="Time of day">
          <div class="pl-scale" aria-hidden="true"><span>00</span><span>03</span><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>
          <div class="pl-jumps" id="plJumps"></div>
        </div>

        <div class="pl-cards">
          <article class="tool-card pl-card"><span class="eyebrow">Sun</span><dl id="plSun"></dl></article>
          <article class="tool-card pl-card"><span class="eyebrow">Moon</span><dl id="plMoon"></dl></article>
          <article class="tool-card pl-card"><span class="eyebrow">Milky Way core</span><dl id="plCore"></dl></article>
        </div>

        <article class="tool-card pl-horizon">
          <header><span class="eyebrow">Real horizon</span><h2>Mountains, hills and the light</h2></header>
          <p class="tool-note" id="plHorizonNote">Calculating the horizon from the terrain around your point…</p>
          <ul class="tool-times" id="plHorizonTimes"></ul>
          <div class="pl-pano-wrap" id="plPanoWrap"><div id="plPano"></div></div>
          <p class="tool-foot">The panorama shows the skyline seen from the pin (terrain only — buildings and trees are not included) with today's path of the sun, the moon and the Milky Way core. Accuracy depends on the terrain data (about 30–75 m): always check on location.</p>
        </article>
      </div>`;
  }

  function wireUi() {
    $p("#plSlider").addEventListener("input", e => { minute = +e.target.value; followNow = false; stopPlay(); updateTime(); });
    $p("#plNow").addEventListener("click", () => { followNow = true; stopPlay(); setNow(); updateTime(); });
    $p("#plPlay").addEventListener("click", () => playing ? stopPlay() : startPlay());
    document.querySelectorAll("#plannerRoot [data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode === "3d")));
    document.querySelectorAll("#plannerRoot [data-look]").forEach(b => b.addEventListener("click", () => lookFromPin(b.dataset.look)));
  }

  function startPlay() {
    followNow = false;
    $p("#plPlay").textContent = "❚❚"; $p("#plPlay").setAttribute("aria-label", "Pause");
    let last = performance.now();
    const step = t => {
      if (!playing) return;
      if (t - last > 40) { minute = (minute + 4) % 1440; $p("#plSlider").value = minute; updateTime(); last = t; }
      playing = requestAnimationFrame(step);
    };
    playing = requestAnimationFrame(step);
  }
  function stopPlay() {
    if (playing) cancelAnimationFrame(playing);
    playing = 0;
    const b = $p("#plPlay"); if (b) { b.textContent = "▶"; b.setAttribute("aria-label", "Play the day"); }
  }
  function setNow() {
    if (ctx.isToday()) { const p = ctx.partsIn(Date.now()); minute = (p.hour % 24) * 60 + p.minute; }
    else { const T = ctx.sunDay(); const set = T[-0.833].set; minute = set ? Math.round((set - dayStart()) / 60000) : 12 * 60; }
    minute = Math.max(0, Math.min(1439, minute));
    $p("#plSlider").value = minute;
  }

  /* ---------- mappa ---------- */
  function buildMap() {
    const pl = ctx.place || { lat: 41.9, lon: 12.5 };
    map = new maplibregl.Map({
      container: "plMap",
      style: {
        version: 8,
        sources: {
          sat: { type: "raster", tiles: [SAT_URL], tileSize: 256, maxzoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
          labels: { type: "raster", tiles: [LBL_URL], tileSize: 256, maxzoom: 18 },
          dem: { type: "raster-dem", tiles: [DEM_URL], tileSize: 256, encoding: "terrarium", maxzoom: 15,
            attribution: "Terrain: AWS Terrain Tiles (Mapzen, USGS, SRTM, Copernicus)" },
          demShade: { type: "raster-dem", tiles: [DEM_URL], tileSize: 256, encoding: "terrarium", maxzoom: 15 },
          lines: { type: "geojson", data: { type: "FeatureCollection", features: [] } }
        },
        layers: [
          { id: "sat", type: "raster", source: "sat" },
          { id: "shade", type: "hillshade", source: "demShade", paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#000814", "hillshade-highlight-color": "#ffffff" } },
          { id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.85 } },
          { id: "lines-glow", type: "line", source: "lines", filter: ["!=", ["get", "dash"], true], layout: { "line-cap": "round" },
            paint: { "line-color": ["get", "color"], "line-width": ["*", ["get", "w"], 3], "line-opacity": 0.25, "line-blur": 4 } },
          { id: "lines", type: "line", source: "lines", filter: ["!=", ["get", "dash"], true], layout: { "line-cap": "round" },
            paint: { "line-color": ["get", "color"], "line-width": ["get", "w"] } },
          { id: "lines-dash", type: "line", source: "lines", filter: ["==", ["get", "dash"], true], layout: { "line-cap": "butt" },
            paint: { "line-color": ["get", "color"], "line-width": ["get", "w"], "line-dasharray": [2, 2] } }
        ]
      },
      center: [pl.lon, pl.lat], zoom: 11.5, maxPitch: 85, attributionControl: false
    });
    map.on("load", () => {
      styleReady = true;
      if (is3d) setMode(true);
      try { map.setSky?.({ "sky-color": "#0b1a33", "horizon-color": "#30507e", "fog-color": "#0b1a33", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4 }); } catch {}
      drawLines();
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    const el = document.createElement("div");
    el.className = "pl-pin"; el.setAttribute("aria-label", "Shooting point");
    marker = new maplibregl.Marker({ element: el, draggable: true, anchor: "bottom" }).setLngLat([pl.lon, pl.lat]).addTo(map);
    marker.on("dragend", () => { const ll = marker.getLngLat(); movePin(ll.lat, ll.lng); });
    map.on("click", e => { marker.setLngLat(e.lngLat); movePin(e.lngLat.lat, e.lngLat.lng); });
  }

  async function movePin(lat, lon) {
    lon = ((lon + 540) % 360) - 180;
    const n = await ctx.reverseName(lat, lon);
    ctx.setPlace({ lat, lon, name: n?.name ? `Near ${n.name}` : "Pinned point", context: n?.context || "" });
  }

  function setMode(three) {
    is3d = three;
    document.querySelectorAll("#plannerRoot [data-mode]").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.mode === "3d") === three)));
    document.querySelector("#plannerRoot .planner").classList.toggle("is-3d", three);
    if (!map || !styleReady) return;
    if (three) {
      map.setTerrain({ source: "dem", exaggeration: 1 });
      map.setLayoutProperty("shade", "visibility", "none");
      const sun = Astro.sunPos(msAt(minute), ctx.place.lat, ctx.place.lon);
      map.easeTo({ pitch: 68, bearing: sun.alt > -8 ? sun.az : map.getBearing(), zoom: Math.max(map.getZoom(), 12.5), duration: 1200 });
    } else {
      map.setTerrain(null);
      map.setLayoutProperty("shade", "visibility", "visible");
      map.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    }
  }

  /* vista «da terra» dal punto scelto verso l'alba, il tramonto o la Via Lattea */
  function lookFromPin(what) {
    if (!map || !ctx.place) return;
    const T = ctx.sunDay(), pl = ctx.place;
    let az;
    if (what === "sunrise" && T[-0.833].rise) az = Astro.sunPos(T[-0.833].rise, pl.lat, pl.lon).az;
    else if (what === "sunset" && T[-0.833].set) az = Astro.sunPos(T[-0.833].set, pl.lat, pl.lon).az;
    else if (what === "core") {
      const n = ctx.night();
      const t = n.coreFrom ? (n.coreFrom + n.coreTo) / 2 : msAt(minute);
      az = Astro.corePos(t, pl.lat, pl.lon).az;
      if (n.coreFrom) { minute = Math.round((t - dayStart()) / 60000) % 1440; if (minute < 0) minute += 1440; $p("#plSlider").value = minute; followNow = false; updateTime(); }
    }
    if (az == null) return toast("Not available for this day.", true);
    if (!is3d) setMode(true);
    const elev = observerElev ?? 0;
    const to = dest(pl.lat, pl.lon, az, 3000);
    try {
      const cam = map.calculateCameraOptionsFromTo(new maplibregl.LngLat(pl.lon, pl.lat), elev + 40, new maplibregl.LngLat(to[0], to[1]), elev + 40);
      map.easeTo({ ...cam, pitch: Math.min(85, cam.pitch ?? 85), duration: 1600 });
    } catch {
      map.easeTo({ center: [pl.lon, pl.lat], bearing: az, pitch: 82, zoom: 15, duration: 1600 });
    }
  }

  /* ---------- linee di direzione ---------- */
  function lineFeature(kind, az, km, w, dash = false) {
    const pl = ctx.place, pts = [];
    for (let i = 0; i <= 24; i++) pts.push(dest(pl.lat, pl.lon, az, (km * 1000 * i) / 24));
    return { type: "Feature", properties: { kind, color: COL[kind], w, dash }, geometry: { type: "LineString", coordinates: pts } };
  }
  function drawLines() {
    if (!map || !styleReady || !ctx.place) return;
    const pl = ctx.place, T = ctx.sunDay(), mrs = ctx.moonRiseSet(), t = msAt(minute), f = [];
    const km = Math.max(4, 40 / Math.pow(2, Math.max(0, map.getZoom() - 10)));   // più corte quando si avvicina
    if (T[-0.833].rise) f.push(lineFeature("sunrise", Astro.sunPos(T[-0.833].rise, pl.lat, pl.lon).az, km, 2.5));
    if (T[-0.833].set) f.push(lineFeature("sunset", Astro.sunPos(T[-0.833].set, pl.lat, pl.lon).az, km, 2.5));
    if (mrs.rise) f.push(lineFeature("moonrise", Astro.moonPos(mrs.rise, pl.lat, pl.lon).az, km * 0.85, 2, true));
    if (mrs.set) f.push(lineFeature("moonset", Astro.moonPos(mrs.set, pl.lat, pl.lon).az, km * 0.85, 2, true));
    const sun = Astro.sunPos(t, pl.lat, pl.lon), moon = Astro.moonPos(t, pl.lat, pl.lon), core = Astro.corePos(t, pl.lat, pl.lon);
    if (sun.alt > -6) f.push(lineFeature("sun", sun.az, km * 1.1, 5));
    if (moon.alt > -1) f.push(lineFeature("moon", moon.az, km, 4));
    if (core.alt > 0 && sun.alt < -12) f.push(lineFeature("core", core.az, km, 4));
    map.getSource("lines")?.setData({ type: "FeatureCollection", features: f });
  }

  /* ---------- aggiornamenti ---------- */
  function update() {
    if (!ctx?.place || !ctx.tz || !ctx.day) return;
    const pl = ctx.place, key = `${pl.lat.toFixed(5)},${pl.lon.toFixed(5)}|${ctx.day.y}-${ctx.day.m}-${ctx.day.d}`;
    if (key !== lastKey) {
      const moved = !lastKey || lastKey.split("|")[0] !== key.split("|")[0];
      lastKey = key;
      if (followNow || moved) setNow();
      if (marker) marker.setLngLat([pl.lon, pl.lat]);
      if (map && moved) map.easeTo({ center: [pl.lon, pl.lat], duration: 900 });
      renderJumps();
      computeHorizon();
    }
    updateTime();
  }

  function updateTime() {
    if (!ctx?.place) return;
    const pl = ctx.place, t = msAt(minute);
    const sun = Astro.sunPos(t, pl.lat, pl.lon), moon = Astro.moonPos(t, pl.lat, pl.lon), core = Astro.corePos(t, pl.lat, pl.lon);
    const il = Astro.moonIllum(t);
    $p("#plClock").textContent = ctx.fmtT(t);
    $p("#plPhase").textContent = phase(sun.alt);
    $p("#plPhase").dataset.phase = phase(sun.alt).split(" ")[0].toLowerCase();
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    $p("#plSun").innerHTML = row("Direction", fmtAz(sun.az)) + row("Height", fmtAlt(sun.alt)) + row("Light", phase(sun.alt));
    $p("#plMoon").innerHTML = row("Direction", fmtAz(moon.az)) + row("Height", fmtAlt(moon.alt)) + row("Illuminated", `${Math.round(il.fraction * 100)}%`);
    $p("#plCore").innerHTML = row("Direction", fmtAz(core.az)) + row("Height", fmtAlt(core.alt))
      + row("Visible", core.alt > 10 && sun.alt < -18 ? (moon.alt > 0 && il.fraction > 0.3 ? "Yes, but moonlit" : "Yes") : core.alt <= 0 ? "Below the horizon" : sun.alt >= -18 ? "Sky too bright" : "Too low");
    drawLines();
    drawPano();
  }

  function renderJumps() {
    const T = ctx.sunDay(), mrs = ctx.moonRiseSet(), n = ctx.night(), st = dayStart();
    const items = [
      ["Sunrise", T[-0.833].rise, COL.sunrise], ["Golden hour", T[6].set, "#e2a14c"], ["Sunset", T[-0.833].set, COL.sunset],
      ["Blue hour", T[-4].set, "#4f86dd"], ["Moonrise", mrs.rise, COL.moonrise], ["Moonset", mrs.set, COL.moonset],
      ["Milky Way", n.coreFrom ? (n.coreFrom + n.coreTo) / 2 : null, COL.core]
    ].filter(([, t]) => t && t >= st && t < st + 864e5);
    $p("#plJumps").innerHTML = items.map(([l, t, c]) => `<button type="button" class="pl-jump" style="--c:${c}" data-min="${Math.round((t - st) / 60000)}">
      <span>${l}</span><b>${ctx.fmtT(t)}</b></button>`).join("");
    $p("#plJumps").querySelectorAll("[data-min]").forEach(b => b.addEventListener("click", () => {
      minute = Math.max(0, Math.min(1439, +b.dataset.min)); followNow = false; stopPlay();
      $p("#plSlider").value = minute; updateTime(); centerPanoOn("current");
    }));
  }

  /* =========================================================
     ORIZZONTE REALE dal rilievo (Terrain Tiles, formato «terrarium»)
     ========================================================= */
  const tileCache = new Map();
  function loadTile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (!tileCache.has(key)) tileCache.set(key, (async () => {
      try {
        const r = await fetch(DEM_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y));
        if (!r.ok) return null;
        const bmp = await createImageBitmap(await r.blob());
        const c = document.createElement("canvas"); c.width = c.height = 256;
        const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, 256, 256).data;
      } catch { return null; }
    })());
    return tileCache.get(key);
  }
  const tileXY = (lat, lon, z) => {
    const n = 2 ** z, s = Math.sin(lat * rad);
    return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  };
  const ZOOMS = [[13, 2500], [12, 9000], [11, 32000]];   // dettaglio vicino, meno lontano
  const zoomFor = d => d <= 2500 ? 13 : d <= 9000 ? 12 : 11;

  async function computeHorizon() {
    const pl = ctx.place, key = `${pl.lat.toFixed(4)},${pl.lon.toFixed(4)}`;
    if (key === horizonKey && horizon) { renderHorizonTimes(); return; }
    horizonKey = key; horizon = null; observerElev = null;
    const note = $p("#plHorizonNote");
    note.textContent = "Calculating the horizon from the terrain around your point…";
    $p("#plHorizonTimes").innerHTML = "";
    drawPano();
    // tessere da scaricare
    const need = [];
    for (const [z, dmax] of ZOOMS) {
      const dLat = dmax / 111320, dLon = dmax / (111320 * Math.cos(pl.lat * rad));
      const [x0, y1] = tileXY(pl.lat - dLat, pl.lon - dLon, z), [x1, y0] = tileXY(pl.lat + dLat, pl.lon + dLon, z);
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) need.push([z, x, y]);
    }
    const tiles = new Map();
    let done = 0;
    await Promise.all(need.map(async ([z, x, y]) => {
      tiles.set(`${z}/${x}/${y}`, await loadTile(z, x, y));
      done++;
      if (horizonKey === key && done % 6 === 0) note.textContent = `Reading the terrain… ${Math.round(done / need.length * 100)}%`;
    }));
    if (horizonKey !== key) return;   // nel frattempo il punto è cambiato
    const elevAt = (lat, lon, z) => {
      const [fx, fy] = tileXY(lat, lon, z), tx = Math.floor(fx), ty = Math.floor(fy);
      const d = tiles.get(`${z}/${tx}/${ty}`);
      if (!d) return null;
      const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256)), i = (py * 256 + px) * 4;
      return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
    };
    const h0 = elevAt(pl.lat, pl.lon, 13);
    if (h0 == null) { note.textContent = "Terrain data isn't available here, so only the flat horizon is used."; horizon = null; renderHorizonTimes(); drawPano(); return; }
    observerElev = Math.max(0, h0);
    const eye = observerElev + 1.7, k = 0.13;   // occhio a 1,7 m; rifrazione terrestre standard
    const dists = []; for (let d = 60; d <= 32000; d *= 1.07) dists.push(d);
    const H = new Float32Array(720);   // ogni mezzo grado
    for (let i = 0; i < 720; i++) {
      const az = i / 2;
      let best = -90;
      for (const d of dists) {
        const [lon, lat] = dest(pl.lat, pl.lon, az, d);
        const h = elevAt(lat, lon, zoomFor(d));
        if (h == null) continue;
        const drop = (d * d) / (2 * R_EARTH) * (1 - k);
        const a = Math.atan2(h - eye - drop, d) / rad;
        if (a > best) best = a;
      }
      H[i] = best < -5 ? -0.3 : best;   // in mare aperto: orizzonte geometrico
    }
    horizon = H;
    const max = Math.max(...H);
    note.innerHTML = `Your point is at <strong>${Math.round(observerElev)} m</strong>. The skyline rises up to <strong>${max.toFixed(1)}°</strong>${max > 1 ? ` (towards ${compass(H.indexOf(max) / 2)})` : ""}.`;
    renderHorizonTimes();
    drawPano();
    centerPanoOn("current");
  }

  const horizonAt = az => {
    if (!horizon) return -0.3;
    const x = (((az % 360) + 360) % 360) * 2, i = Math.floor(x) % 720, j = (i + 1) % 720, f = x - Math.floor(x);
    return horizon[i] * (1 - f) + horizon[j] * f;
  };

  /* quando sole, luna e Via Lattea compaiono o spariscono davvero dietro il rilievo */
  function crossings(posFn, limb) {
    const pl = ctx.place, st = dayStart(), out = [];
    let prev = null;
    for (let m = 0; m <= 1440; m += 1) {
      const t = st + m * 60000, p = posFn(t, pl.lat, pl.lon);
      const vis = p.alt + refr(p.alt) + limb > horizonAt(p.az);
      if (prev !== null && vis !== prev) out.push({ t, rise: vis, az: p.az, h: horizonAt(p.az) });
      prev = vis;
    }
    return out;
  }
  function renderHorizonTimes() {
    const list = $p("#plHorizonTimes");
    if (!list || !ctx.place) return;
    const T = ctx.sunDay(), rows = [];
    const sunX = crossings(Astro.sunPos, 0.27), moonX = crossings((t, a, b) => { const p = Astro.moonPos(t, a, b); return { alt: p.alt - refr(p.alt), az: p.az }; }, 0.26);
    // nucleo della Via Lattea sopra il profilo dei monti, a cielo buio (sole sotto −18°)
    let cFrom = null, cTo = null;
    for (let m = 0; m <= 1440; m += 2) {
      const t = dayStart() + m * 60000, pl = ctx.place;
      if (Astro.sunPos(t, pl.lat, pl.lon).alt > -18) continue;
      const c = Astro.corePos(t, pl.lat, pl.lon);
      if (c.alt > horizonAt(c.az) + 3) { if (cFrom == null) cFrom = t; cTo = t; }
    }
    const first = (arr, rise) => arr.find(x => x.rise === rise), last = (arr, rise) => [...arr].reverse().find(x => x.rise === rise);
    const r = first(sunX, true), s = last(sunX, false);
    const delta = (real, flat) => real && flat ? Math.round((real.t - flat) / 60000) : null;
    const dR = delta(r, T[-0.833].rise), dS = delta(s, T[-0.833].set);
    rows.push(["Sun appears over the terrain", r ? `${ctx.fmtT(r.t)}${dR > 0 ? ` <small>(+${dR} min)</small>` : ""}` : "—", "is-key"]);
    rows.push(["Sun disappears behind the terrain", s ? `${ctx.fmtT(s.t)}${dS < 0 ? ` <small>(${dS} min)</small>` : ""}` : "—", "is-key"]);
    const mr = first(moonX, true), ms = last(moonX, false);
    rows.push(["Moon appears", mr ? ctx.fmtT(mr.t) : "—"], ["Moon disappears", ms ? ctx.fmtT(ms.t) : "—"]);
    rows.push(["Milky Way core above the skyline, dark sky", cFrom ? `${ctx.fmtT(cFrom)} – ${ctx.fmtT(cTo)}` : "not tonight"]);
    list.innerHTML = rows.map(([k, v, c = ""]) => `<li class="${c}"><span>${k}</span><strong>${v}</strong></li>`).join("");
    if (!horizon) list.insertAdjacentHTML("beforeend", `<li><span>Horizon</span><strong>flat (no terrain data)</strong></li>`);
  }

  /* ---------- panorama dell'orizzonte con i percorsi ---------- */
  const PX = 4, PH = 280;
  function drawPano() {
    const box = $p("#plPano");
    if (!box || !ctx?.place) return;
    const pl = ctx.place, st = dayStart(), W = 360 * PX;
    const sunPath = [], moonPath = [], corePath = [];
    let maxAlt = 20;
    for (let m = 0; m <= 1440; m += 6) {
      const t = st + m * 60000, s = Astro.sunPos(t, pl.lat, pl.lon), mo = Astro.moonPos(t, pl.lat, pl.lon), c = Astro.corePos(t, pl.lat, pl.lon);
      sunPath.push({ ...s, m }); moonPath.push({ ...mo, m });
      corePath.push({ ...c, m, dark: s.alt < -12 });
      maxAlt = Math.max(maxAlt, s.alt);
    }
    const hMax = horizon ? Math.max(...horizon) : 0;
    const yMax = Math.min(80, Math.max(20, Math.ceil(Math.max(maxAlt, hMax + 8) / 5) * 5)), yMin = -4;
    const Y = a => (PH - 24) - ((a - yMin) / (yMax - yMin)) * (PH - 34);
    const X = az => az * PX;
    // percorso, spezzato quando passa per il nord (0/360) o scende sotto il bordo
    const path = (pts, ok = () => true) => {
      let d = "", pen = false, prev = null;
      for (const p of pts) {
        const show = p.alt >= yMin && ok(p);
        if (show && pen && prev && Math.abs(p.az - prev.az) < 180) d += `L${X(p.az).toFixed(1)} ${Y(p.alt).toFixed(1)}`;
        else if (show) d += `M${X(p.az).toFixed(1)} ${Y(p.alt).toFixed(1)}`;
        pen = show; prev = p;
      }
      return d;
    };
    let sky = `M0 ${Y(yMin)}`;
    for (let i = 0; i <= 720; i++) sky += `L${(i / 2 * PX).toFixed(1)} ${Y(Math.max(yMin, horizon ? horizon[i % 720] : -0.3)).toFixed(1)}`;
    sky += `L${W} ${Y(yMin)}Z`;
    const hourDots = sunPath.filter(p => p.m % 60 === 0 && p.alt > yMin).map(p => {
      const lbl = ctx.fmtT(st + p.m * 60000).slice(0, 2);
      return `<circle cx="${X(p.az)}" cy="${Y(p.alt)}" r="2.6" fill="${COL.sun}"/><text x="${X(p.az)}" y="${Y(p.alt) - 8}" class="pano-hr">${lbl}</text>`;
    }).join("");
    const t = msAt(minute), sNow = Astro.sunPos(t, pl.lat, pl.lon), mNow = Astro.moonPos(t, pl.lat, pl.lon), cNow = Astro.corePos(t, pl.lat, pl.lon);
    const grid = [0, 10, 20, 30, 40, 50, 60, 70].filter(a => a <= yMax).map(a => `<line x1="0" x2="${W}" y1="${Y(a)}" y2="${Y(a)}" class="pano-grid"/><text x="4" y="${Y(a) - 3}" class="pano-deg">${a}°</text>`).join("");
    const ticks = Array.from({ length: 24 }, (_, i) => i * 15).map(az => `<line x1="${X(az)}" x2="${X(az)}" y1="${PH - 24}" y2="${PH - (az % 45 ? 19 : 14)}" class="pano-tick"/>${az % 45 === 0 ? `<text x="${X(az)}" y="${PH - 4}" class="pano-card">${compass(az)}</text>` : ""}`).join("");
    box.innerHTML = `<svg viewBox="0 0 ${W} ${PH}" width="${W}" height="${PH}" role="img" aria-label="Panorama of the skyline with the paths of the sun, moon and Milky Way">
      <rect width="${W}" height="${PH}" class="pano-bg"/>${grid}
      <path d="${path(corePath, p => p.dark)}" class="pano-core"/>
      <path d="${path(moonPath)}" class="pano-moon"/>
      <path d="${path(sunPath)}" class="pano-sun"/>${hourDots}
      <path d="${sky}" class="pano-land"/>
      ${ticks}
      ${cNow.alt > yMin ? `<text x="${X(cNow.az)}" y="${Y(cNow.alt) + 6}" class="pano-corestar">✦</text>` : ""}
      ${mNow.alt > yMin ? `<circle cx="${X(mNow.az)}" cy="${Y(mNow.alt)}" r="7" class="pano-moonnow"/>` : ""}
      ${sNow.alt > yMin ? `<circle cx="${X(sNow.az)}" cy="${Y(sNow.alt)}" r="9" class="pano-sunnow"/>` : ""}
    </svg>`;
  }
  function centerPanoOn() {
    const wrap = $p("#plPanoWrap");
    if (!wrap || !ctx?.place) return;
    const t = msAt(minute), pl = ctx.place, s = Astro.sunPos(t, pl.lat, pl.lon), m = Astro.moonPos(t, pl.lat, pl.lon), c = Astro.corePos(t, pl.lat, pl.lon);
    const az = s.alt > -6 ? s.az : m.alt > 0 ? m.az : c.az;
    wrap.scrollTo({ left: Math.max(0, az * PX - wrap.clientWidth / 2), behavior: "smooth" });
  }

  return { show };
})();
window.Planner = Planner;
