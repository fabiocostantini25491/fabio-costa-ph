/* Impagina il PDF mensile «Field Notes From Planet Earth».
   Uso: node scripts/build-rivista.cjs [--mese 2026-11] [--out dist/rivista.pdf] [--meta dist/rivista.json]
   Senza --mese prende il mese appena chiuso (ora italiana).
   Come funziona: apre rivista.html in Chromium (Playwright), stampa a parte copertina, sommario e ogni articolo
   per contarne le pagine, scrive i numeri di pagina nel sommario e infine stampa il numero completo. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : ""; };
const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(arg("out") || "dist/rivista.pdf");
const META = path.resolve(arg("meta") || "dist/rivista.json");
const month = /^\d{4}-\d{2}$/.test(arg("mese") || "") ? arg("mese") : "";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(p).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv)));
}
const pageCount = buf => (buf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
const lastDayOfNextMonth = m => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo + 1, 0)).toISOString().slice(0, 10); };

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") console.log("[pagina]", m.text()); });
  const url = `http://127.0.0.1:${srv.address().port}/rivista.html${month ? `?mese=${month}` : ""}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(() => window.RIVISTA && window.RIVISTA.info, null, { timeout: 120000 });
  const info = await page.evaluate(() => window.RIVISTA.info);
  if (info.error) throw new Error(info.error);
  fs.mkdirSync(path.dirname(META), { recursive: true });
  if (!info.count) {
    console.log(`Nessun articolo in ${info.month}: nessun PDF.`);
    fs.writeFileSync(META, JSON.stringify({ month: info.month, number: info.number, empty: true }));
    await browser.close(); srv.close(); return;
  }
  const pdf = () => page.pdf({ preferCSSPageSize: true, printBackground: true });
  // verifica del PDF su richiesta (quello impaginato nel browser con Paged.js), per confrontarlo con quello ufficiale
  if (process.argv.includes("--check-print")) {
    const p2 = await browser.newPage();
    p2.on("console", m => console.log("[stampa]", m.type(), m.text().slice(0, 200)));
    await p2.addInitScript(() => { window.print = () => { window.__printed = true; }; });
    await p2.goto(url.replace("rivista.html", "rivista.html") + `${url.includes("?") ? "&" : "?"}print=1`, { waitUntil: "networkidle", timeout: 120000 });
    await p2.waitForFunction(() => window.RIVISTA && window.RIVISTA.paged, null, { timeout: 180000 });
    const r = await p2.evaluate(() => ({ paged: window.RIVISTA.paged, printed: !!window.__printed,
      toc: [...document.querySelectorAll(".rv-pref")].map(a => getComputedStyle(a, "::after").content),
      starts: [...document.querySelectorAll(".pagedjs_page")].map((pg, i) => pg.querySelector("[data-part^='art-']:not([data-split-from])") ? i + 1 : 0).filter(Boolean),
      overflow: [...document.querySelectorAll(".pagedjs_page_content")].filter(c => c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2).length }));
    console.log("VERIFICA STAMPA:", JSON.stringify(r));
    const b2 = await p2.pdf({ preferCSSPageSize: true, printBackground: true });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT.replace(/\.pdf$/, "-su-richiesta.pdf"), b2);
    console.log("PDF su richiesta:", pageCount(b2), "pagine");
    await p2.close();
  }
  // 1) pagine di ogni parte
  const pages = {};
  for (const part of info.parts) {
    await page.evaluate(p => window.RIVISTA.show(p), part);
    pages[part] = Math.max(1, pageCount(await pdf()));
  }
  // 2) pagina d'inizio di ogni articolo (la copertina è la pagina 1)
  const start = {};
  let n = 1;
  for (const part of info.parts) { start[part] = n; n += pages[part]; }
  await page.evaluate(m => { window.RIVISTA.setPages(m); window.RIVISTA.show("all"); }, start);
  // 3) il numero completo
  const buf = await pdf();
  const total = pageCount(buf);
  if (total !== n - 1) console.warn(`Attenzione: pagine attese ${n - 1}, ottenute ${total}.`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  const file = `field-notes-from-planet-earth-${String(info.number).padStart(2, "0")}-${info.month}.pdf`;
  const meta = { month: info.month, number: info.number, label: info.label, stories: info.count, pages: total, until: lastDayOfNextMonth(info.month), file,
    contents: info.titles.map((t, i) => ({ title: t, page: start[`art-${i}`] })) };
  fs.writeFileSync(META, JSON.stringify(meta, null, 2));
  console.log(`PDF pronto: ${OUT} — N° ${info.number}, ${info.label}, ${info.count} articoli, ${total} pagine, ${(buf.length / 1048576).toFixed(1)} MB`);
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
