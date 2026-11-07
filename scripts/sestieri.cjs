// Scarica una volta i confini dei sestieri di Venezia da OpenStreetMap (Overpass) e li salva in content/sestieri-venezia.json
const fs = require("fs");
const OUT = "content/sestieri-venezia.json";
const NAMES = ["Cannaregio", "Castello", "Dorsoduro", "San Marco", "San Polo", "Santa Croce"];
if (fs.existsSync(OUT) && !process.argv.includes("--force")) { console.log("sestieri: già presenti"); process.exit(0); }
const osmtogeojson = require("osmtogeojson");
const q = `[out:json][timeout:90];
(
  relation["name"~"(Cannaregio|Castello|Dorsoduro|San Marco|San Polo|Santa Croce)",i](45.40,12.29,45.46,12.38);
  way["name"~"^(Sestiere )?(di )?(Cannaregio|Castello|Dorsoduro|San Marco|San Polo|Santa Croce)$",i]["place"](45.40,12.29,45.46,12.38);
  relation["admin_level"~"^(9|10|11)$"](45.40,12.29,45.46,12.38);
);
out geom;`;
const servers = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
(async () => {
  let data = null;
  for (const s of servers) {
    try {
      const r = await fetch(s, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "fabiocostaph-map-builder" } });
      if (!r.ok) { console.log(s, r.status); continue; }
      data = await r.json(); console.log("ok da", s); break;
    } catch (e) { console.log(s, e.message); }
  }
  if (!data) { console.log("sestieri: nessun server raggiungibile"); return; }
  for (const el of data.elements) console.log("trovato", el.type, el.id, JSON.stringify(el.tags).slice(0, 300));
  const gj = osmtogeojson(data);
  const feats = [];
  for (const f of gj.features) {
    if (!/Polygon/.test(f.geometry.type)) continue;
    const nm = NAMES.find(n => new RegExp("^(sestiere )?(di )?" + n + "$", "i").test(String(f.properties.name || "").trim()));
    if (!NAMES.includes(nm)) continue;
    if (feats.some(x => x.properties.name === nm)) continue;   // uno per sestiere (il primo trovato)
    const round = c => Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];
    feats.push({ type: "Feature", properties: { name: nm, osm: f.id, tags: f.properties.boundary || f.properties.place || "" }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } });
  }
  console.log("sestieri salvati:", feats.map(f => f.properties.name).join(", "));
  if (feats.length) fs.writeFileSync(OUT, JSON.stringify({ source: "© OpenStreetMap contributors (ODbL)", type: "FeatureCollection", features: feats }));
})();
