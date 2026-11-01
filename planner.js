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
  const h2d = (h, m, s) => (h + m / 60 + s / 3600) * 15;
  const d2d = (d, m, sgn = 1) => sgn * (Math.abs(d) + m / 60);
  /* stelle principali (ascensione retta, declinazione) e linee della figura */
  const CONSTELLATIONS = {
    orion: { name: "Orion", stars: [
        [h2d(5, 55, 10), d2d(7, 24)], [h2d(5, 25, 8), d2d(6, 21)], [h2d(5, 32, 0), d2d(0, 18, -1)], [h2d(5, 36, 13), d2d(1, 12, -1)],
        [h2d(5, 40, 46), d2d(1, 57, -1)], [h2d(5, 47, 45), d2d(9, 40, -1)], [h2d(5, 14, 32), d2d(8, 12, -1)], [h2d(5, 35, 8), d2d(9, 56)]],
      lines: [[0, 1], [0, 4], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [0, 7], [1, 7]], labels: { 0: "Betelgeuse", 6: "Rigel" } },
    bigdipper: { name: "Big Dipper", stars: [
        [h2d(11, 3, 44), 61.75], [h2d(11, 1, 51), 56.38], [h2d(11, 53, 50), 53.7], [h2d(12, 15, 26), 57.03],
        [h2d(12, 54, 2), 55.96], [h2d(13, 23, 56), 54.93], [h2d(13, 47, 32), 49.31]],
      lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] },
    cassiopeia: { name: "Cassiopeia", stars: [
        [h2d(0, 9, 11), 59.15], [h2d(0, 40, 30), 56.54], [h2d(0, 56, 43), 60.72], [h2d(1, 25, 49), 60.24], [h2d(1, 54, 24), 63.67]],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    scorpius: { name: "Scorpius", stars: [
        [h2d(16, 5, 26), -19.8], [h2d(16, 0, 20), -22.62], [h2d(15, 58, 51), -26.11], [h2d(16, 21, 11), -25.59], [h2d(16, 29, 24), -26.43],
        [h2d(16, 35, 53), -28.22], [h2d(16, 50, 10), -34.29], [h2d(16, 51, 52), -38.05], [h2d(16, 54, 35), -42.36], [h2d(17, 12, 9), -43.24],
        [h2d(17, 37, 19), -43.0], [h2d(17, 47, 35), -40.13], [h2d(17, 42, 29), -39.03], [h2d(17, 33, 36), -37.1]],
      lines: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13]], labels: { 4: "Antares" } },
    cygnus: { name: "Cygnus (Northern Cross)", stars: [
        [h2d(20, 41, 26), 45.28], [h2d(20, 22, 14), 40.26], [h2d(19, 30, 43), 27.96], [h2d(20, 46, 13), 33.97], [h2d(19, 44, 58), 45.13]],
      lines: [[0, 1], [1, 2], [1, 3], [1, 4]], labels: { 0: "Deneb" } },
    pleiades: { name: "Pleiades", stars: [[h2d(3, 47, 29), 24.1], [h2d(3, 49, 9), 24.05], [h2d(3, 45, 50), 24.37], [h2d(3, 44, 53), 24.11], [h2d(3, 46, 20), 23.95]],
      lines: [] },
    crux: { name: "Southern Cross", stars: [[h2d(12, 26, 36), -63.1], [h2d(12, 31, 10), -57.11], [h2d(12, 47, 43), -59.69], [h2d(12, 15, 9), -58.75]],
      lines: [[0, 1], [2, 3]] },
    polaris: { name: "Polaris (North Star)", stars: [[h2d(2, 31, 49), 89.26]], lines: [] }
  };
  const CON_KEY = "fcph-planner-con";
  let con = (() => { try { const v = localStorage.getItem(CON_KEY); return v === "" ? "" : (CONSTELLATIONS[v] ? v : "orion"); } catch { return "orion"; } })();
  const conCenter = k => { const st = CONSTELLATIONS[k].stars; return [st.reduce((a, x) => a + x[0], 0) / st.length, st.reduce((a, x) => a + x[1], 0) / st.length]; };
  const conPos = (k, t) => { const [ra, dec] = conCenter(k), pl = ctx.place; return Astro.radecPos(t, pl.lat, pl.lon, ra, dec); };
  let skyCanvas = null, groundMarkers = {};

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
          <canvas class="pl-sky" id="plSky" aria-hidden="true"></canvas>
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

        <article class="tool-card pl-skyview">
          <header class="pl-sv-head"><div><span class="eyebrow">Sky view from the pin</span><h2>Watch the sky move</h2></div>
            <label class="shot-check pl-follow"><input type="checkbox" id="plFollow" checked> Follow the action</label></header>
          <div class="pl-sv-box"><div class="pl-pano-wrap" id="plPanoWrap"><div id="plPano"></div></div>
            <p class="pl-sv-clock" id="plSvClock" aria-hidden="true"></p></div>
          <p class="tool-foot">Move the time slider (or press ▶) to see the sun, the moon, the Milky Way and the constellation rise and set over the real skyline. Drag sideways to look around: N, E, S and W are at the bottom.</p>
        </article>

        <div class="pl-cards">
          <article class="tool-card pl-card"><span class="eyebrow">Sun</span><dl id="plSun"></dl></article>
          <article class="tool-card pl-card"><span class="eyebrow">Moon</span><dl id="plMoon"></dl></article>
          <article class="tool-card pl-card"><span class="eyebrow">Milky Way core</span><dl id="plCore"></dl></article>
        </div>

        <article class="tool-card pl-con">
          <header class="pl-con-head"><div><span class="eyebrow">Constellations</span><h2>When to see them</h2></div>
            <label class="pl-con-pick"><span class="sr-only">Constellation</span>
              <select id="plCon"><option value="">None</option>${Object.entries(CONSTELLATIONS).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join("")}</select></label></header>
          <ul class="tool-times" id="plConTimes"></ul>
          <p class="tool-foot">The constellation is drawn on the map and in the sky view. Times are for the night that starts on the chosen date.</p>
        </article>

        <article class="tool-card pl-horizon">
          <header><span class="eyebrow">Real horizon</span><h2>Mountains, hills and the light</h2></header>
          <p class="tool-note" id="plHorizonNote">Calculating the horizon from the terrain around your point…</p>
          <ul class="tool-times" id="plHorizonTimes"></ul>
          <p class="tool-foot">The skyline comes from terrain data (about 30–75 m detail): buildings and trees are not included. Always check on location.</p>
        </article>
      </div>`;
  }

  function wireUi() {
    $p("#plSlider").addEventListener("input", e => { minute = +e.target.value; followNow = false; stopPlay(); updateTime(); });
    $p("#plNow").addEventListener("click", () => { followNow = true; stopPlay(); setNow(); updateTime(); });
    $p("#plPlay").addEventListener("click", () => playing ? stopPlay() : startPlay());
    document.querySelectorAll("#plannerRoot [data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode === "3d")));
    $p("#plCon").value = con;
    $p("#plFollow").addEventListener("change", e => { followSky = e.target.checked; if (followSky) centerPanoOn(); });
    // trascinare il panorama per guardarsi intorno
    const wrap = $p("#plPanoWrap");
    let drag = null;
    wrap.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") { drag = { x: e.clientX, l: wrap.scrollLeft }; wrap.setPointerCapture(e.pointerId); } });
    wrap.addEventListener("pointermove", e => { if (drag) { wrap.scrollLeft = drag.l - (e.clientX - drag.x); } });
    wrap.addEventListener("pointerup", () => { drag = null; });
    const manual = () => { if (followSky) { followSky = false; $p("#plFollow").checked = false; } };   // chi si guarda intorno smette di seguire
    wrap.addEventListener("pointerdown", manual);
    wrap.addEventListener("wheel", manual, { passive: true });
    wrap.addEventListener("touchstart", manual, { passive: true });
    $p("#plCon").addEventListener("change", e => { con = e.target.value; try { localStorage.setItem(CON_KEY, con); } catch {} renderCon(); updateTime(); });
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
    // pronto appena lo stile è letto (non serve aspettare tutte le immagini satellitari)
    const ready = () => {
      if (styleReady || !map.getSource("lines")) return;
      styleReady = true;
      if (is3d) setMode(true);
      try { map.setSky?.({ "sky-color": "#0b1a33", "horizon-color": "#30507e", "fog-color": "#0b1a33", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4 }); } catch {}
      updateTime();
    };
    map.on("styledata", ready);
    map.on("load", ready);
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    const el = document.createElement("div");
    el.className = "pl-pin"; el.setAttribute("aria-label", "Shooting point");
    marker = new maplibregl.Marker({ element: el, draggable: true, anchor: "bottom" }).setLngLat([pl.lon, pl.lat]).addTo(map);
    marker.on("dragend", () => { const ll = marker.getLngLat(); movePin(ll.lat, ll.lng); });
    map.on("click", e => { marker.setLngLat(e.lngLat); movePin(e.lngLat.lat, e.lngLat.lng); });
    skyCanvas = document.getElementById("plSky");
    map.on("move", drawSky);
    map.on("resize", drawSky);
    map.on("moveend", () => { drawLines(); drawGround(); });
    // sole, luna, Via Lattea e costellazione come sfere sulla mappa (vista dall'alto)
    const mk = cls => { const el = document.createElement("div"); el.className = `pl-body ${cls}`; return new maplibregl.Marker({ element: el, anchor: "center" }); };
    groundMarkers = { sun: mk("b-sun"), moon: mk("b-moon"), core: mk("b-core"), con: mk("b-con") };
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
    // camera poco dietro e sopra il segnaposto, rivolta nella direzione scelta, con il cielo in alto
    const center = dest(pl.lat, pl.lon, az, 1200);
    map.easeTo({ center, bearing: az, pitch: 85, zoom: 14.2, duration: 1600 });
  }

  /* ---------- linee di direzione ---------- */
  function lineFeature(kind, az, km, w, dash = false) {
    const pl = ctx.place, pts = [];
    for (let i = 0; i <= 24; i++) pts.push(dest(pl.lat, pl.lon, az, (km * 1000 * i) / 24));
    return { type: "Feature", properties: { kind, color: COL[kind], w, dash }, geometry: { type: "LineString", coordinates: pts } };
  }
  /* lunghezza delle linee: circa metà dello schermo, a qualsiasi zoom */
  const lineKm = () => {
    const el = map.getContainer(), px = 0.46 * Math.min(el.clientWidth, el.clientHeight);
    const mpp = 40075016 * Math.cos((ctx.place?.lat || 0) * rad) / (512 * 2 ** map.getZoom());
    return Math.max(0.3, (px * mpp) / 1000);
  };
  const groundR = (alt, km) => km * 1000 * 0.92 * Math.max(0.04, 1 - Math.max(0, alt) / 90);   // metri dal segnaposto

  /* vista dall'alto: ogni astro è una sfera sulla sua direzione; più è alto, più è vicino al segnaposto */
  function drawGround() {
    if (!map || !ctx.place || !groundMarkers.sun) return;
    const pl = ctx.place, t = msAt(minute), km = lineKm(), flat = map.getPitch() < 35;
    const place = (m, p, show) => {
      if (show && flat) { m.setLngLat(dest(pl.lat, pl.lon, p.az, groundR(p.alt, km))); if (!m._map) m.addTo(map); m.getElement().style.setProperty("--a", Math.max(0.35, Math.min(1, (p.alt + 6) / 20))); }
      else if (m._map) m.remove();
    };
    const sun = Astro.sunPos(t, pl.lat, pl.lon), moon = Astro.moonPos(t, pl.lat, pl.lon), core = Astro.corePos(t, pl.lat, pl.lon);
    const il = Astro.moonIllum(t);
    groundMarkers.moon.getElement().innerHTML = moonDisc(il.phase, 22);
    place(groundMarkers.sun, sun, sun.alt > -2);
    place(groundMarkers.moon, moon, moon.alt > -2);
    place(groundMarkers.core, core, core.alt > 0 && sun.alt < -10);
    if (con) {
      const c = conPos(con, t);
      groundMarkers.con.getElement().textContent = CONSTELLATIONS[con].name.split(" (")[0];
      place(groundMarkers.con, c, c.alt > 0 && sun.alt < -6);
    } else if (groundMarkers.con._map) groundMarkers.con.remove();
  }

  function moonDisc(p, size) {
    const r = size / 2 - 1, c = size / 2, k = Math.cos(2 * Math.PI * p), rx = Math.abs(r * k).toFixed(2);
    const waxing = p < 0.5, outer = waxing ? 1 : 0, inner = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
    const lit = p < 0.01 || p > 0.99 ? "" : `<path d="M${c} ${c - r}A${r} ${r} 0 0 ${outer} ${c} ${c + r}A${rx} ${r} 0 0 ${inner} ${c} ${c - r}Z" fill="#f4eedc"/>`;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="#26303f" stroke="rgba(255,255,255,.5)"/>${lit}</svg>`;
  }

  /* =========================================================
     CIELO 3D: gli astri sono all'infinito, quindi la loro posizione sullo schermo dipende solo
     dall'orientamento della camera (direzione e inclinazione), non da dove si trova.
     ========================================================= */
  function drawSky() {
    if (!skyCanvas || !map) return;
    const W = skyCanvas.clientWidth, H = skyCanvas.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (skyCanvas.width !== Math.round(W * dpr) || skyCanvas.height !== Math.round(H * dpr)) { skyCanvas.width = Math.round(W * dpr); skyCanvas.height = Math.round(H * dpr); }
    const g = skyCanvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const pitch = map.getPitch();
    if (pitch < 35 || !ctx.place) return;
    const tr = map.transform, fov = tr._fov || (tr.fov ? tr.fov * rad : 0.6435);
    const b = map.getBearing() * rad, e = (pitch - 90) * rad;
    const F = [Math.cos(e) * Math.sin(b), Math.cos(e) * Math.cos(b), Math.sin(e)];
    const Rt = [Math.cos(b), -Math.sin(b), 0];
    const U = [-Math.sin(e) * Math.sin(b), -Math.sin(e) * Math.cos(b), Math.cos(e)];
    const f = (H / 2) / Math.tan(fov / 2), cy = H / 2 + (tr.centerOffset?.y || 0);
    const proj = (alt, az) => {
      const a = alt * rad, z = az * rad, d = [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
      const Z = d[0] * F[0] + d[1] * F[1] + d[2] * F[2];
      if (Z <= 0.05) return null;
      return [W / 2 + (d[0] * Rt[0] + d[1] * Rt[1]) / Z * f, cy - (d[0] * U[0] + d[1] * U[1] + d[2] * U[2]) / Z * f];
    };
    const pl = ctx.place, t = msAt(minute), st = dayStart();
    const sun = Astro.sunPos(t, pl.lat, pl.lon), dark = sun.alt < -12;
    const visible = p => p.alt > horizonAt(p.az) - 0.2;
    const polyline = (pts, style, width, dash = []) => {
      g.strokeStyle = style; g.lineWidth = width; g.setLineDash(dash); g.beginPath();
      let pen = false;
      pts.forEach(p => { const q = p && visible(p) ? proj(p.alt, p.az) : null; if (q) { pen ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); pen = true; } else pen = false; });
      g.stroke(); g.setLineDash([]);
    };
    // Via Lattea: una fascia lungo il piano galattico, più larga e luminosa verso il nucleo
    if (dark) {
      const band = [];
      for (let l = -180; l <= 180; l += 3) { const [ra, dec] = Astro.galToRaDec(l); band.push({ ...Astro.radecPos(t, pl.lat, pl.lon, ra, dec), l }); }
      for (let i = 1; i < band.length; i++) {
        const p0 = band[i - 1], p1 = band[i];
        if (!visible(p0) || !visible(p1)) continue;
        const q0 = proj(p0.alt, p0.az), q1 = proj(p1.alt, p1.az);
        if (!q0 || !q1 || Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) > W) continue;
        const near = Math.max(0, 1 - Math.abs(p1.l) / 70);
        g.strokeStyle = `rgba(214,200,255,${0.07 + near * 0.18})`; g.lineWidth = 18 + near * 40; g.lineCap = "round";
        g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke();
      }
    }
    // percorsi del giorno
    const path = fn => { const out = []; for (let m = 0; m <= 1440; m += 8) out.push(fn(st + m * 60000)); return out; };
    polyline(path(x => Astro.sunPos(x, pl.lat, pl.lon)), "rgba(255,210,122,.55)", 1.5, [5, 6]);
    polyline(path(x => Astro.moonPos(x, pl.lat, pl.lon)), "rgba(207,216,230,.35)", 1.2, [2, 6]);
    // costellazione
    if (con && sun.alt < -6) {
      const C = CONSTELLATIONS[con], P = C.stars.map(s => Astro.radecPos(t, pl.lat, pl.lon, s[0], s[1]));
      g.strokeStyle = "rgba(159,227,255,.7)"; g.lineWidth = 1.3;
      C.lines.forEach(([a, b2]) => { if (!visible(P[a]) || !visible(P[b2])) return; const qa = proj(P[a].alt, P[a].az), qb = proj(P[b2].alt, P[b2].az); if (qa && qb) { g.beginPath(); g.moveTo(qa[0], qa[1]); g.lineTo(qb[0], qb[1]); g.stroke(); } });
      P.forEach((p, i) => { if (!visible(p)) return; const q = proj(p.alt, p.az); if (!q) return;
        g.fillStyle = "#fff"; g.shadowColor = "#9fe3ff"; g.shadowBlur = 8; g.beginPath(); g.arc(q[0], q[1], C.labels?.[i] ? 3.2 : 2.4, 0, 7); g.fill(); g.shadowBlur = 0;
        if (C.labels?.[i]) { g.fillStyle = "rgba(220,240,255,.85)"; g.font = "11px DM Sans, sans-serif"; g.fillText(C.labels[i], q[0] + 7, q[1] - 6); } });
      const c = conPos(con, t), qc = visible(c) ? proj(c.alt, c.az) : null;
      if (qc) { g.fillStyle = "rgba(159,227,255,.95)"; g.font = "600 12px DM Sans, sans-serif"; g.fillText(C.name.split(" (")[0].toUpperCase(), qc[0] + 14, qc[1] + 22); }
    }
    // nucleo della Via Lattea
    const core = Astro.corePos(t, pl.lat, pl.lon), qcore = dark && visible(core) ? proj(core.alt, core.az) : null;
    if (qcore) {
      const gr = g.createRadialGradient(qcore[0], qcore[1], 0, qcore[0], qcore[1], 46);
      gr.addColorStop(0, "rgba(255,236,210,.9)"); gr.addColorStop(0.3, "rgba(220,190,255,.45)"); gr.addColorStop(1, "rgba(199,155,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(qcore[0], qcore[1], 46, 0, 7); g.fill();
      g.fillStyle = "rgba(230,215,255,.9)"; g.font = "600 11px DM Sans, sans-serif"; g.fillText("MILKY WAY CORE", qcore[0] + 18, qcore[1] - 18);
    }
    // luna
    const moon = Astro.moonPos(t, pl.lat, pl.lon), qm = visible(moon) ? proj(moon.alt, moon.az) : null;
    if (qm) {
      const il = Astro.moonIllum(t), r = 13;
      const gr = g.createRadialGradient(qm[0], qm[1], r * 0.6, qm[0], qm[1], r * 4);
      gr.addColorStop(0, `rgba(240,236,220,${0.15 + il.fraction * 0.35})`); gr.addColorStop(1, "rgba(240,236,220,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(qm[0], qm[1], r * 4, 0, 7); g.fill();
      g.fillStyle = "#2a3444"; g.beginPath(); g.arc(qm[0], qm[1], r, 0, 7); g.fill();
      const k = Math.cos(2 * Math.PI * il.phase), waxing = il.phase < 0.5;
      if (il.fraction > 0.01) {
        g.fillStyle = "#f4eedc"; g.beginPath();
        g.arc(qm[0], qm[1], r, -Math.PI / 2, Math.PI / 2, !waxing);
        g.ellipse(qm[0], qm[1], Math.abs(r * k), r, 0, Math.PI / 2, -Math.PI / 2, waxing ? k > 0 : k <= 0);
        g.fill();
      }
    }
    // sole
    const qs = visible(sun) ? proj(sun.alt, sun.az) : null;
    if (qs) {
      const low = Math.max(0, Math.min(1, sun.alt / 12));
      const col = `rgb(255,${Math.round(150 + low * 90)},${Math.round(60 + low * 120)})`;
      const gr = g.createRadialGradient(qs[0], qs[1], 4, qs[0], qs[1], 90);
      gr.addColorStop(0, "rgba(255,230,160,.85)"); gr.addColorStop(0.25, "rgba(255,190,90,.35)"); gr.addColorStop(1, "rgba(255,170,60,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(qs[0], qs[1], 90, 0, 7); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(qs[0], qs[1], 15, 0, 7); g.fill();
    }
  }

  function drawLines() {
    if (!map || !styleReady || !ctx.place) return;
    const pl = ctx.place, T = ctx.sunDay(), mrs = ctx.moonRiseSet(), t = msAt(minute), f = [];
    const km = lineKm();   // più corte quando si avvicina
    if (T[-0.833].rise) f.push(lineFeature("sunrise", Astro.sunPos(T[-0.833].rise, pl.lat, pl.lon).az, km, 2.5));
    if (T[-0.833].set) f.push(lineFeature("sunset", Astro.sunPos(T[-0.833].set, pl.lat, pl.lon).az, km, 2.5));
    if (mrs.rise) f.push(lineFeature("moonrise", Astro.moonPos(mrs.rise, pl.lat, pl.lon).az, km * 0.85, 2, true));
    if (mrs.set) f.push(lineFeature("moonset", Astro.moonPos(mrs.set, pl.lat, pl.lon).az, km * 0.85, 2, true));
    const sun = Astro.sunPos(t, pl.lat, pl.lon), moon = Astro.moonPos(t, pl.lat, pl.lon), core = Astro.corePos(t, pl.lat, pl.lon);
    if (sun.alt > -6) f.push(lineFeature("sun", sun.az, km * 1.1, 5));
    if (moon.alt > -1) f.push(lineFeature("moon", moon.az, km, 4));
    if (core.alt > 0 && sun.alt < -12) f.push(lineFeature("core", core.az, km, 4));
    // percorso del sole nella giornata, proiettato a terra: vicino al segnaposto = alto nel cielo
    const st = dayStart(), arc = [];
    for (let m = 0; m <= 1440; m += 10) {
      const p = Astro.sunPos(st + m * 60000, pl.lat, pl.lon);
      if (p.alt > -1) arc.push(dest(pl.lat, pl.lon, p.az, groundR(p.alt, km)));
      else if (arc.length > 1) break;
    }
    if (arc.length > 1) f.push({ type: "Feature", properties: { kind: "sunpath", color: "#ffd27a", w: 1.5, dash: true }, geometry: { type: "LineString", coordinates: arc } });
    if (con) CONSTELLATIONS[con].lines.forEach(([a, b]) => {
      const A = CONSTELLATIONS[con].stars[a], B = CONSTELLATIONS[con].stars[b];
      const pa = Astro.radecPos(t, pl.lat, pl.lon, A[0], A[1]), pb = Astro.radecPos(t, pl.lat, pl.lon, B[0], B[1]);
      if (pa.alt > 0 && pb.alt > 0 && map.getPitch() < 35)
        f.push({ type: "Feature", properties: { kind: "con", color: "#9fe3ff", w: 1.4, dash: false },
          geometry: { type: "LineString", coordinates: [dest(pl.lat, pl.lon, pa.az, groundR(pa.alt, km)), dest(pl.lat, pl.lon, pb.az, groundR(pb.alt, km))] } });
    });
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
      renderCon();
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
    drawGround();
    drawSky();
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

  /* ---------- orari della costellazione: sorge, punto più alto, tramonta, visibile a cielo buio ---------- */
  function renderCon() {
    const list = $p("#plConTimes");
    if (!list || !ctx?.place) return;
    if (!con) { list.innerHTML = `<li><span>Choose a constellation to see its times.</span><strong></strong></li>`; return; }
    const d = ctx.day, from = ctx.localToUtc(d.y, d.m, d.d, 12), pl = ctx.place;
    let rise = null, set = null, best = null, bestAlt = -90, visFrom = null, visTo = null, prev = null;
    for (let t = from; t <= from + 864e5; t += 5 * 60000) {
      const p = conPos(con, t), up = p.alt > Math.max(0, horizonAt(p.az));
      if (prev !== null && up && !prev && rise == null) rise = t;
      if (prev !== null && !up && prev && set == null && rise != null) set = t;
      if (prev !== null && !up && prev && set == null && rise == null) set = t;
      const dark = Astro.sunPos(t, pl.lat, pl.lon).alt < -12;
      if (dark && p.alt > bestAlt) { bestAlt = p.alt; best = t; }
      if (dark && p.alt > Math.max(10, horizonAt(p.az) + 3)) { if (visFrom == null) visFrom = t; visTo = t; }
      prev = up;
    }
    const always = conPos(con, from).alt > 0 && rise == null && set == null;
    const row = (k, v, c = "") => `<li class="${c}"><span>${k}</span><strong>${v}</strong></li>`;
    list.innerHTML = always ? row("Above the horizon", "all night") + (best ? row("Highest in the dark", `${ctx.fmtT(best)} · ${bestAlt.toFixed(0)}°`, "is-key") : "")
      : bestAlt < 0 && !rise ? row("Visible", "not from here on this night")
      : row("Rises", rise ? ctx.fmtT(rise) : "—") + row("Sets", set ? ctx.fmtT(set) : "—")
        + (best && bestAlt > 0 ? row("Best moment (highest in the dark)", `${ctx.fmtT(best)} · ${bestAlt.toFixed(0)}°`, "is-key") : "")
        + row("Well visible in a dark sky", visFrom ? `${ctx.fmtT(visFrom)} – ${ctx.fmtT(visTo)}` : "not tonight");
    list.querySelectorAll(".is-key").forEach(li => { li.style.cursor = "pointer"; li.title = "Show this moment"; li.addEventListener("click", () => {
      minute = Math.round((best - dayStart()) / 60000); if (minute >= 1440) minute -= 1440; if (minute < 0) minute += 1440;
      followNow = false; $p("#plSlider").value = minute; updateTime(); }); });
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
    renderCon();
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
  const PX = 5, PH = 340;
  let followSky = true;
  function drawPano() {
    const box = $p("#plPano");
    if (!box || !ctx?.place) return;
    const pl = ctx.place, st = dayStart(), W = 360 * PX, t = msAt(minute);
    const sunPath = [], moonPath = [];
    let maxAlt = 25;
    for (let m = 0; m <= 1440; m += 6) {
      const x = st + m * 60000, sp = Astro.sunPos(x, pl.lat, pl.lon);
      sunPath.push({ ...sp, m }); moonPath.push({ ...Astro.moonPos(x, pl.lat, pl.lon), m });
      maxAlt = Math.max(maxAlt, sp.alt);
    }
    const sNow = Astro.sunPos(t, pl.lat, pl.lon), mNow = Astro.moonPos(t, pl.lat, pl.lon), cNow = Astro.corePos(t, pl.lat, pl.lon);
    const hMax = horizon ? Math.max(...horizon) : 0;
    const yMax = Math.min(85, Math.max(35, Math.ceil(Math.max(maxAlt, hMax + 10, con ? 45 : 0) / 5) * 5)), yMin = -4;
    const Y = a => (PH - 26) - ((a - yMin) / (yMax - yMin)) * (PH - 36);
    const X = az => az * PX;
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
    // colore del cielo secondo l'altezza del sole
    const sa = sNow.alt;
    const sky = sa > 6 ? ["#3d78c4", "#9cc4ec"] : sa > -4 ? ["#2a4f8a", "#e7a35a"] : sa > -6 ? ["#132b55", "#4d6fb0"] : sa > -12 ? ["#0a1834", "#1f3b6e"] : sa > -18 ? ["#060f22", "#0f2347"] : ["#02060f", "#06122a"];
    const dark = sa < -12;
    let land = `M0 ${Y(yMin)}`;
    for (let i = 0; i <= 720; i++) land += `L${(i / 2 * PX).toFixed(1)} ${Y(Math.max(yMin, horizon ? horizon[i % 720] : -0.3)).toFixed(1)}`;
    land += `L${W} ${Y(yMin)}Z`;
    // Via Lattea
    let band = "";
    if (dark) {
      const pts = [];
      for (let l = -180; l <= 180; l += 2) { const [ra, dec] = Astro.galToRaDec(l); pts.push({ ...Astro.radecPos(t, pl.lat, pl.lon, ra, dec), l }); }
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i];
        if (p0.alt < yMin || p1.alt < yMin || Math.abs(p1.az - p0.az) > 180) continue;
        const near = Math.max(0, 1 - Math.abs(p1.l) / 60);
        band += `<line x1="${X(p0.az).toFixed(1)}" y1="${Y(p0.alt).toFixed(1)}" x2="${X(p1.az).toFixed(1)}" y2="${Y(p1.alt).toFixed(1)}" stroke-width="${(16 + near * 34).toFixed(0)}" stroke-opacity="${(0.07 + near * 0.2).toFixed(2)}"/>`;
      }
      band = `<g class="pano-band" filter="url(#svBlur)">${band}</g>`;
    }
    // costellazione
    let cons = "";
    if (con && sa < -6) {
      const C = CONSTELLATIONS[con], P = C.stars.map(x => Astro.radecPos(t, pl.lat, pl.lon, x[0], x[1]));
      cons += C.lines.map(([a, b]) => P[a].alt > yMin && P[b].alt > yMin && Math.abs(P[a].az - P[b].az) < 180
        ? `<line x1="${X(P[a].az)}" y1="${Y(P[a].alt)}" x2="${X(P[b].az)}" y2="${Y(P[b].alt)}" class="pano-conline"/>` : "").join("");
      cons += P.map((p, i) => p.alt > yMin ? `<circle cx="${X(p.az)}" cy="${Y(p.alt)}" r="${C.labels?.[i] ? 3.4 : 2.5}" class="pano-star"/>${C.labels?.[i] ? `<text x="${X(p.az) + 7}" y="${Y(p.alt) - 6}" class="pano-starname">${C.labels[i]}</text>` : ""}` : "").join("");
      const c = conPos(con, t);
      if (c.alt > yMin) cons += `<text x="${X(c.az)}" y="${Y(c.alt) + 30}" class="pano-conname">${C.name.split(" (")[0].toUpperCase()}</text>`;
    }
    const hourDots = sunPath.filter(p => p.m % 60 === 0 && p.alt > yMin).map(p =>
      `<circle cx="${X(p.az)}" cy="${Y(p.alt)}" r="2.4" class="pano-hrdot"/><text x="${X(p.az)}" y="${Y(p.alt) - 8}" class="pano-hr">${ctx.fmtT(st + p.m * 60000).slice(0, 2)}</text>`).join("");
    const grid = [0, 15, 30, 45, 60, 75].filter(a => a <= yMax).map(a => `<line x1="0" x2="${W}" y1="${Y(a)}" y2="${Y(a)}" class="pano-grid"/><text x="6" y="${Y(a) - 4}" class="pano-deg">${a}°</text>`).join("");
    const ticks = Array.from({ length: 24 }, (_, i) => i * 15).map(az => `<line x1="${X(az)}" x2="${X(az)}" y1="${PH - 26}" y2="${PH - (az % 45 ? 21 : 15)}" class="pano-tick"/>${az % 45 === 0 ? `<text x="${X(az)}" y="${PH - 5}" class="pano-card">${compass(az)}</text>` : ""}`).join("");
    const il = Astro.moonIllum(t);
    const moonSvg = mNow.alt > yMin ? (() => {
      const r = 11, cx = X(mNow.az), cy = Y(mNow.alt), k = Math.cos(2 * Math.PI * il.phase), waxing = il.phase < 0.5;
      const outer = waxing ? 1 : 0, inner = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
      const lit = il.fraction < 0.01 ? "" : `<path d="M${cx} ${cy - r}A${r} ${r} 0 0 ${outer} ${cx} ${cy + r}A${Math.abs(r * k).toFixed(2)} ${r} 0 0 ${inner} ${cx} ${cy - r}Z" fill="#f4eedc"/>`;
      return `<circle cx="${cx}" cy="${cy}" r="${r * 3}" fill="url(#svMoonGlow)" stroke="none" opacity="${(0.3 + il.fraction * 0.7).toFixed(2)}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#2a3444" stroke="none"/>${lit}`;
    })() : "";
    box.innerHTML = `<svg viewBox="0 0 ${W} ${PH}" width="${W}" height="${PH}" role="img" aria-label="Sky seen from the pin at ${ctx.fmtT(t)}">
      <defs>
        <linearGradient id="svSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
        <radialGradient id="svSun"><stop offset="0" stop-color="#fff3c4"/><stop offset=".25" stop-color="rgba(255,200,90,.6)"/><stop offset="1" stop-color="rgba(255,170,60,0)"/></radialGradient>
        <radialGradient id="svMoonGlow"><stop offset="0" stop-color="rgba(240,236,220,.4)"/><stop offset=".55" stop-color="rgba(240,236,220,.08)"/><stop offset="1" stop-color="rgba(240,236,220,0)"/></radialGradient>
        <radialGradient id="svCore"><stop offset="0" stop-color="rgba(255,240,220,.95)"/><stop offset=".35" stop-color="rgba(214,190,255,.5)"/><stop offset="1" stop-color="rgba(199,155,255,0)"/></radialGradient>
        <filter id="svBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      <rect width="${W}" height="${PH}" fill="url(#svSky)"/>${grid}${band}
      <path d="${path(moonPath)}" class="pano-moon"/>
      <path d="${path(sunPath)}" class="pano-sun"/>${hourDots}
      ${cons}
      ${dark && cNow.alt > yMin ? `<circle cx="${X(cNow.az)}" cy="${Y(cNow.alt)}" r="30" fill="url(#svCore)" stroke="none"/>` : ""}
      ${moonSvg}
      ${sNow.alt > yMin ? `<circle cx="${X(sNow.az)}" cy="${Y(sNow.alt)}" r="60" fill="url(#svSun)" stroke="none"/><circle cx="${X(sNow.az)}" cy="${Y(sNow.alt)}" r="13" class="pano-sunnow"/>` : ""}
      <path d="${land}" class="pano-land"/>
      <rect x="0" y="${PH - 26}" width="${W}" height="26" class="pano-foot"/>
      ${ticks}
    </svg>`;
    const clk = $p("#plSvClock"); if (clk) clk.textContent = `${ctx.fmtT(t)} · ${phase(sa)}`;
    if (followSky) centerPanoOn(playing ? "auto" : "smooth");
  }
  function centerPanoOn(behavior = "smooth") {
    const wrap = $p("#plPanoWrap");
    if (!wrap || !ctx?.place) return;
    const t = msAt(minute), pl = ctx.place, s = Astro.sunPos(t, pl.lat, pl.lon), m = Astro.moonPos(t, pl.lat, pl.lon), c = Astro.corePos(t, pl.lat, pl.lon);
    const cc = con ? conPos(con, t) : null;
    const az = s.alt > -6 ? s.az : c.alt > 3 && s.alt < -12 ? c.az : cc && cc.alt > 3 ? cc.az : m.alt > 0 ? m.az : s.az;
    const left = Math.max(0, az * PX - wrap.clientWidth / 2);
    if (Math.abs(wrap.scrollLeft - left) > 4) wrap.scrollTo({ left, behavior: behavior === "current" ? "smooth" : behavior });
  }

  return { show, _debug: () => ({ map, styleReady, minute }) };
})();
window.Planner = Planner;
