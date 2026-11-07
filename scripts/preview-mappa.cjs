const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const b = await chromium.launch();
  // 841×594 mm a 96 dpi; scala 2 = tasselli della mappa in alta definizione
  const p = await b.newPage({ viewport: { width: 3179, height: 2245 }, deviceScaleFactor: 2 });
  p.on("console", m => console.log("[page]", m.type(), m.text().slice(0, 200)));
  await p.goto("http://localhost:8000/mappa.html?g=venice", { waitUntil: "load" });
  await p.waitForFunction(() => window.MAPPA && (window.MAPPA.ready || window.MAPPA.error), null, { timeout: 120000 });
  console.log(JSON.stringify(await p.evaluate(() => window.MAPPA)));
  fs.mkdirSync("preview", { recursive: true });
  await p.pdf({ path: "preview/mappa-venezia.pdf", preferCSSPageSize: true, printBackground: true });
  const pages = await p.$$(".mp-page");
  await p.setViewportSize({ width: 3179, height: 2245 });
  await pages[0].screenshot({ path: "preview/mappa-venezia-p1.png", scale: "css" });
  await pages[1].screenshot({ path: "preview/mappa-venezia-p2.png", scale: "css" });
  // ritaglio a grandezza reale del centro (per vedere come appare ingrandita)
  const box = await pages[0].boundingBox();
  await p.screenshot({ path: "preview/mappa-venezia-zoom.png", clip: { x: box.x + 1500, y: box.y + 900, width: 900, height: 650 } });
  console.log("pdf MB", (fs.statSync("preview/mappa-venezia.pdf").size / 1e6).toFixed(1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
