// Segna il giorno in cui compare ogni nuovo articolo o foto (per le «Novità» della home, visibili 5 giorni).
// Lo esegue GitHub da solo a ogni salvataggio dal pannello: vedi .github/workflows/novita.yml
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const read = (p, fallback) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; } };
const list = (v, key) => (Array.isArray(v) ? v : Array.isArray(v?.[key]) ? v[key] : []);
const slug = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const OUT = "content/novita.json";
const seen = read(OUT, { articoli: {}, foto: {} });
seen.articoli ||= {}; seen.foto ||= {};
const now = new Date().toISOString();
const first = !existsSync(OUT);            // primo avvio: tutto ciò che c'è già non è una novità
const stamp = first ? "2000-01-01T00:00:00.000Z" : now;
let changed = first;

list(read("content/articoli.json", {}), "articoli").forEach(a => {
  const k = slug(a?.slug || a?.titolo);
  if (k && !seen.articoli[k]) { seen.articoli[k] = stamp; changed = true; }
});
// foto con i dettagli, foto caricate insieme («immagini») e foto delle sottosezioni
const paths = v => (Array.isArray(v) ? v : v ? [v] : []).map(x => typeof x === "string" ? x : x?.immagine || "").filter(Boolean);
const mark = k => { if (k && !seen.foto[k]) { seen.foto[k] = stamp; changed = true; } };
const scan = o => { (Array.isArray(o?.foto) ? o.foto : []).forEach(f => mark(f?.immagine)); paths(o?.immagini).forEach(mark); };
list(read("content/viaggi.json", {}), "viaggi").forEach(t => {
  scan(t);
  (Array.isArray(t?.sottosezioni) ? t.sottosezioni : []).forEach(scan);
});

if (changed) {
  writeFileSync(OUT, JSON.stringify(seen, null, 1) + "\n");
  console.log("novita.json aggiornato");
} else console.log("nessuna novità");
