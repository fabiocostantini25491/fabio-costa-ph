/* Mappa PDF di tutti i luoghi di una guida (A3 orizzontale): cartina vera, punti numerati per zona, indice sulle pagine seguenti. */
(() => {
  const COLORS = ["#b20d0d", "#1f5f8b", "#7a5a12", "#2d6a4f", "#6b3fa0", "#a0522d", "#3d5a80", "#8a1c7c"];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  window.MAPPA = {};
  (async () => {
    const r = await (await fetch("content/guide.json", { cache: "no-store" })).json();
    const g = (r.guide || []).find(x => x.slug === params.get("g"));
    if (!g || !(g.mappa || []).length) throw new Error("no map for this guide");
    const pts = g.mappa.filter(p => Number.isFinite(+p.lat) && Number.isFinite(+p.lon));
    const zones = [...new Set(pts.map(p => p.zona))];
    const col = z => COLORS[zones.indexOf(z) % COLORS.length];
    document.title = `${g.titolo} — all places map · Fabio Costa Ph`;
    // indice: 4 colonne per pagina, circa 60 righe per colonna
    const PER = 230, pages = [];
    for (let i = 0; i < pts.length; i += PER) pages.push(pts.slice(i, i + PER));
    document.getElementById("sheet").innerHTML = `
      <section class="mp-page"><div id="map"></div>
        <div class="mp-title"><small>Field Notes · Map</small><h1>${esc(g.titolo)}</h1><p>All ${pts.length} places on my map, by area</p></div>
        <div class="mp-legend">${zones.map(z => `<div><i style="background:${col(z)}"></i>${esc(z)}</div>`).join("")}<div><i style="background:#6b4a2b;border-radius:1mm"></i>Coffee & food</div></div>
        <p class="mp-credit">Map © Esri, HERE, Garmin, © OpenStreetMap contributors · fabiocostaph.com</p>
      </section>
      ${pages.map((list, pi) => {
        let last = "";
        return `<section class="mp-page mp-index"><h2>${esc(g.titolo)} · Index${pages.length > 1 ? ` ${pi + 1}/${pages.length}` : ""}</h2><div class="mp-cols">${list.map(p => {
          const head = p.zona !== last ? `<p class="mp-zone"><i style="background:${col(p.zona)}"></i>${esc(p.zona)}</p>` : ""; last = p.zona;
          return `${head}<div class="mp-it" style="--zc:${col(p.zona)}"><b>${p.n}</b><span>${esc(p.nome)}${p.nota ? `<em>${esc(p.nota)}</em>` : ""}</span></div>`;
        }).join("")}</div><p class="mp-foot"><span>Field Notes · ${esc(g.titolo)}</span><span>fabiocostaph.com</span></p></section>`;
      }).join("")}`;
    const map = L.map("map", { zoomControl: false, attributionControl: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false });
    const tiles = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 19, detectRetina: true }).addTo(map);
    // inquadra il centro storico (i punti sulle isole lontane restano dentro, la mappa si adatta)
    map.fitBounds(L.latLngBounds(pts.map(p => [+p.lat, +p.lon])), { paddingTopLeft: [40, 40], paddingBottomRight: [40, 40] });
    pts.forEach(p => L.marker([+p.lat, +p.lon], { icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<div class="mp-pin ${p.tipo === "pausa" ? "pausa" : ""}" style="background:${col(p.zona)}">${p.n}</div>` }) }).addTo(map));
    await new Promise(res => { let done = false; tiles.on("load", () => { if (!done) { done = true; setTimeout(res, 600); } }); setTimeout(res, 20000); });
    window.MAPPA.ready = true; window.MAPPA.count = pts.length;
    if (params.get("print") === "1" && !params.has("noprint")) setTimeout(() => window.print(), 300);
  })().catch(e => { document.getElementById("sheet").innerHTML = `<p class="mp-loading">${esc(e.message)}</p>`; window.MAPPA.error = String(e); });
})();
