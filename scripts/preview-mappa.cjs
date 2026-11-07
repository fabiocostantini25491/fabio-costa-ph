const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1588, height: 1123 }, deviceScaleFactor: 2 });
  p.on("console", m => console.log("[page]", m.type(), m.text().slice(0, 200)));
  await p.goto("http://localhost:8000/mappa.html?g=venice", { waitUntil: "load" });
  await p.waitForFunction(() => window.MAPPA && (window.MAPPA.ready || window.MAPPA.error), null, { timeout: 60000 });
  console.log(JSON.stringify(await p.evaluate(() => window.MAPPA)));
  fs.mkdirSync("preview", { recursive: true });
  await p.pdf({ path: "preview/mappa-venezia.pdf", preferCSSPageSize: true, printBackground: true });
  await (await p.$(".mp-page")).screenshot({ path: "preview/mappa-venezia-p1.png" });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
