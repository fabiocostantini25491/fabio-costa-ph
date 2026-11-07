const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on("pageerror", e => console.log("ERR", e.message));
  await p.goto("http://localhost:8000/guida.html?g=venice&noprint=1");
  await p.waitForFunction(() => window.GUIDA && (window.GUIDA.pages || window.GUIDA.error), null, { timeout: 120000 });
  console.log("guida", JSON.stringify(await p.evaluate(() => window.GUIDA)));
  await p.evaluate(() => document.querySelector(".gp-printbtn")?.remove());
  await p.pdf({ path: "preview/Venice-guide-draft.pdf", preferCSSPageSize: true, printBackground: true });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
