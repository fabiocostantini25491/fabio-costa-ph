/* Mappa PDF di tutti i luoghi di una guida: cartina grande da ingrandire, sestieri a colori,
   ogni numero apre il luogo su Google Maps; nell'indice il numero porta al punto sulla mappa e il nome a Google Maps. */
(() => {
  const SEST = [
    { name: "San Marco", color: "#c0392b" },
    { name: "Castello", color: "#1f6fb2" },
    { name: "Cannaregio", color: "#23825f" },
    { name: "San Polo", color: "#d98a12" },
    { name: "Santa Croce", color: "#7d4fb0" },
    { name: "Dorsoduro", color: "#c4467c" },
    { name: "The lagoon islands", color: "#4b6670" }
  ];
  const colOf = n => (SEST.find(s => s.name === n) || SEST[SEST.length - 1]).color;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gmaps = p => `https://www.google.com/maps/search/?api=1&query=${(+p.lat).toFixed(6)}%2C${(+p.lon).toFixed(6)}`;
  const params = new URLSearchParams(location.search);
  window.MAPPA = {};

  // geometria: punto dentro il poligono e distanza (in metri, approssimata) dal bordo
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const polys = g => g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const inGeom = (x, y, g) => polys(g).some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
  const K = Math.cos(45.43 * Math.PI / 180) * 111320, KY = 111320;
  const segDist = (x, y, [x1, y1], [x2, y2]) => { const ax = (x - x1) * K, ay = (y - y1) * KY, bx = (x2 - x1) * K, by = (y2 - y1) * KY; const t = Math.max(0, Math.min(1, (ax * bx + ay * by) / ((bx * bx + by * by) || 1))); return Math.hypot(ax - t * bx, ay - t * by); };
  const geomDist = (x, y, g) => { let d = Infinity; for (const p of polys(g)) for (const r of p) for (let i = 1; i < r.length; i++) d = Math.min(d, segDist(x, y, r[i - 1], r[i])); return d; };
  const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };
  const labelPoint = g => {   // baricentro del pezzo più grande
    const big = polys(g).map(p => p[0]).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
    let A = 0, cx = 0, cy = 0; for (let i = 0, j = big.length - 1; i < big.length; j = i++) { const f = big[j][0] * big[i][1] - big[i][0] * big[j][1]; A += f; cx += (big[j][0] + big[i][0]) * f; cy += (big[j][1] + big[i][1]) * f; }
    return [cy / (3 * A), cx / (3 * A)];
  };

  (async () => {
    const r = await (await fetch("content/guide.json", { cache: "no-store" })).json();
    const g = (r.guide || []).find(x => x.slug === params.get("g"));
    if (!g || !(g.mappa || []).length) throw new Error("no map for this guide");
    let sest = null;
    try { sest = await (await fetch("content/sestieri-venezia.json", { cache: "no-store" })).json(); } catch {}
    const feats = sest?.features || [];
    // ogni luogo nel suo sestiere (dentro il confine, o il più vicino entro 250 m: rive e fondamenta); il resto sono le isole della laguna
    const pts = g.mappa.filter(p => Number.isFinite(+p.lat) && Number.isFinite(+p.lon)).map(p => {
      const x = +p.lon, y = +p.lat;
      let s = feats.find(f => inGeom(x, y, f.geometry))?.properties.name;
      if (!s && feats.length) { let best = null, bd = 250; for (const f of feats) { const d = geomDist(x, y, f.geometry); if (d < bd) { bd = d; best = f.properties.name; } } s = best; }
      if (!s) s = SEST.find(z => z.name === p.zona)?.name || (/murano|lido|lazzaro|burano|torcello/i.test(p.zona) ? null : p.zona.split(" / ")[0]);
      if (/murano|lido|lazzaro|burano|torcello/i.test(p.zona) && !feats.length) s = null;
      return { ...p, sest: SEST.some(z => z.name === s) ? s : "The lagoon islands", isola: /san giorgio|murano|lido|lazzaro|giudecca/i.test(p.zona) ? p.zona : "" };
    });
    // i "Viewpoint" senza nome prendono il nome del luogo vicino (entro 200 m)
    const named = pts.filter(p => !/^viewpoint\b/i.test(p.nome));
    for (const p of pts) {
      if (!/^viewpoint$/i.test(p.nome.trim())) continue;
      let best = null, bd = 200;
      for (const q of named) { const d = Math.hypot((+q.lon - +p.lon) * K, (+q.lat - +p.lat) * KY); if (d < bd) { bd = d; best = q; } }
      if (best) p.nome = `Viewpoint near ${best.nome}`;
    }
    // numeri nuovi, sestiere per sestiere
    const order = SEST.map(s => s.name);
    pts.sort((a, b) => order.indexOf(a.sest) - order.indexOf(b.sest) || a.n - b.n).forEach((p, i) => { p.n = i + 1; });
    const used = SEST.filter(s => pts.some(p => p.sest === s.name));
    window.MAPPA.sest = Object.fromEntries(used.map(s => [s.name, pts.filter(p => p.sest === s.name).length]));
    window.MAPPA.polygons = feats.map(f => f.properties.name);
    document.title = `${g.titolo} — all places map · Fabio Costa Ph`;

    const pin = (p, id = true) => `<a class="mp-pin${p.tipo === "pausa" ? " pausa" : ""}"${id ? ` id="p${p.n}"` : ""} href="${gmaps(p)}" style="--c:${colOf(p.sest)}" title="${esc(p.nome)}">${p.n}</a>`;
    document.getElementById("sheet").innerHTML = `
      <section class="mp-page" id="map-page"><div id="map"></div>
        <div class="mp-title"><small>Field Notes From Planet Earth · Map</small><h1>${esc(g.titolo)}</h1><p>All ${pts.length} places on my map, sestiere by sestiere</p></div>
        <div class="mp-legend">
          <p>The sestieri</p>
          ${used.map(s => `<div><i style="background:${s.color}"></i>${esc(s.name)}<span>${pts.filter(p => p.sest === s.name).length}</span></div>`).join("")}
          <div class="mp-how"><b class="mp-pin" style="--c:#555">12</b>a place to see</div>
          <div class="mp-how"><b class="mp-pin pausa" style="--c:#555">12</b>coffee &amp; food</div>
          <p class="mp-tip">Tap a number to open the place in Google Maps.<br>Index with all the names on the next page.</p>
        </div>
        <div class="mp-inset"><div id="inset"></div><p>The lagoon islands</p></div>
        <p class="mp-credit">Base map © Esri, HERE, Garmin, © OpenStreetMap contributors · sestieri © OpenStreetMap contributors · fabiocostaph.com</p>
      </section>
      <section class="mp-page mp-index" id="index">
        <h2>${esc(g.titolo)} · Index <small>number → the place on the map · name → Google Maps</small></h2>
        <div class="mp-cols">${used.map(s => `<div class="mp-group"><p class="mp-zone" style="--c:${s.color}"><i></i>${esc(s.name)}</p>${pts.filter(p => p.sest === s.name).map(p => `
          <div class="mp-it" style="--c:${s.color}"><a class="mp-num${p.tipo === "pausa" ? " pausa" : ""}" href="#p${p.n}">${p.n}</a><span><a href="${gmaps(p)}">${esc(p.nome)} <u>↗</u></a>${p.nota || (p.isola && s.name === "The lagoon islands") ? `<em>${esc([p.isola && s.name === "The lagoon islands" ? p.isola : "", p.nota].filter(Boolean).join(" · "))}</em>` : ""}</span></div>`).join("")}</div>`).join("")}</div>
        <p class="mp-foot"><span>Field Notes · ${esc(g.titolo)} · <a href="#map-page">back to the map</a></span><span>fabiocostaph.com</span></p>
      </section>`;

    const tileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
    const map = L.map("map", { zoomControl: false, attributionControl: false, zoomSnap: 0.1, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false });
    const tiles = L.tileLayer(tileUrl, { maxZoom: 20, maxNativeZoom: 19, detectRetina: true, className: "mp-tiles" }).addTo(map);
    const far = p => p.sest === "The lagoon islands" && !/giudecca|san giorgio/i.test(p.zona);
    const core = pts.filter(p => !far(p));
    map.fitBounds(L.latLngBounds(core.map(p => [+p.lat, +p.lon])), { paddingTopLeft: [520, 60], paddingBottomRight: [60, 60] });
    // sestieri: campiture leggere e nome grande
    for (const f of feats) {
      const c = colOf(f.properties.name);
      L.geoJSON(f, { style: { color: c, weight: 2.5, opacity: .8, dashArray: "8 6", fillColor: c, fillOpacity: .16 }, interactive: false }).addTo(map);
      L.marker(labelPoint(f.geometry), { interactive: false, icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<div class="mp-sname" style="--c:${c}">${esc(f.properties.name)}</div>` }) }).addTo(map);
    }
    // numeri che non si coprono: si scostano un poco e una linea sottile li lega al punto vero
    const D = 31, inMap = core.filter(p => map.getBounds().contains([+p.lat, +p.lon]));
    const nodes = inMap.map(p => { const a = map.latLngToContainerPoint([+p.lat, +p.lon]); return { p, ax: a.x, ay: a.y, x: a.x, y: a.y }; });
    for (let it = 0; it < 400; it++) {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i], B = nodes[j]; let dx = B.x - A.x, dy = B.y - A.y; let d = Math.hypot(dx, dy);
        if (d >= D) continue; if (d < .01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
        const push = (D - d) / 2 / d; A.x -= dx * push; A.y -= dy * push; B.x += dx * push; B.y += dy * push;
      }
      for (const n of nodes) { n.x += (n.ax - n.x) * .03; n.y += (n.ay - n.y) * .03; }
    }
    let moved = 0;
    for (const n of nodes) {
      const at = map.containerPointToLatLng([n.x, n.y]);
      if (Math.hypot(n.x - n.ax, n.y - n.ay) > 6) {
        moved++;
        L.polyline([[+n.p.lat, +n.p.lon], at], { color: "#222", weight: 1.2, opacity: .75, interactive: false }).addTo(map);
        L.circleMarker([+n.p.lat, +n.p.lon], { radius: 2.6, color: "#fff", weight: 1, fillColor: colOf(n.p.sest), fillOpacity: 1, interactive: false }).addTo(map);
      }
      L.marker(at, { icon: L.divIcon({ className: "", iconSize: [0, 0], html: pin(n.p) }) }).addTo(map);
    }
    // riquadro della laguna: le isole lontane, cliccabili anche loro
    const inset = L.map("inset", { zoomControl: false, attributionControl: false, dragging: false, zoomSnap: 0.1, fadeAnimation: false, zoomAnimation: false });
    const t2 = L.tileLayer(tileUrl, { maxZoom: 20, maxNativeZoom: 19, className: "mp-tiles" }).addTo(inset);
    inset.fitBounds(L.latLngBounds(pts.map(p => [+p.lat, +p.lon])), { padding: [24, 24] });
    for (const f of feats) L.geoJSON(f, { style: { color: colOf(f.properties.name), weight: 1, fillColor: colOf(f.properties.name), fillOpacity: .25 }, interactive: false }).addTo(inset);
    L.rectangle(map.getBounds(), { color: "#111", weight: 1.4, fill: false, dashArray: "4 4" }).addTo(inset);
    const shown = new Set(inMap);
    for (const p of pts) {
      if (shown.has(p)) continue;
      L.marker([+p.lat, +p.lon], { icon: L.divIcon({ className: "", iconSize: [0, 0], html: pin(p).replace('class="mp-pin', 'class="mp-pin small') }) }).addTo(inset);
    }
    window.MAPPA.moved = moved; window.MAPPA.onMain = inMap.length; window.MAPPA.inInset = pts.length - inMap.length; window.MAPPA.zoom = map.getZoom();
    const loaded = l => new Promise(res => { let done = false; l.on("load", () => { if (!done) { done = true; res(); } }); setTimeout(res, 40000); });
    await Promise.all([loaded(tiles), loaded(t2)]); await new Promise(res => setTimeout(res, 800));
    window.MAPPA.ready = true; window.MAPPA.count = pts.length;
  })().catch(e => { document.getElementById("sheet").innerHTML = `<p class="mp-loading">${esc(e.message)}</p>`; window.MAPPA.error = String(e); });
})();
