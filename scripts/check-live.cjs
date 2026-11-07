// Verifica il sito pubblicato (Journal → Guides) con Chrome e con il motore di Safari (iPhone).
const { chromium, webkit, devices } = require("playwright");
(async () => {
  for (const [name, type, dev] of [["chrome-desktop", chromium, { viewport: { width: 1300, height: 900 } }], ["iphone-safari", webkit, devices["iPhone 13"]]]) {
    const b = await type.launch(); const ctx = await b.newContext(dev); const p = await ctx.newPage();
    p.on("pageerror", e => console.log(name, "PAGEERROR", e.message));
    p.on("console", m => { if (m.type() === "error") console.log(name, "console", m.text().slice(0, 200)); });
    p.on("response", r => { if (r.status() >= 400) console.log(name, "HTTP", r.status(), r.url()); });
    await p.goto("https://fabiocostaph.com/#guides", { waitUntil: "load" }); await p.waitForTimeout(4000);
    console.log(name, "shelf", JSON.stringify(await p.evaluate(() => ({ books: document.querySelectorAll(".gd-book").length, tabs: [...document.querySelectorAll(".fn-modes a")].map(a => a.textContent.trim()), text: document.querySelector("#journalLayout")?.innerText.slice(0, 120) }))));
    const book = await p.$(".gd-book"); if (book) { await book.click(); await p.waitForTimeout(3000); }
    console.log(name, "guide", JSON.stringify(await p.evaluate(() => ({ hash: location.hash, zones: document.querySelectorAll(".gd-zone").length, spots: document.querySelectorAll(".gd-spot").length, text: document.querySelector("#journalLayout")?.innerText.slice(0, 120) }))));
    await p.goto("https://fabiocostaph.com/#g-venice", { waitUntil: "load" }); await p.waitForTimeout(4000);
    console.log(name, "direct", JSON.stringify(await p.evaluate(() => ({ hash: location.hash, zones: document.querySelectorAll(".gd-zone").length }))));
    const p2 = await ctx.newPage(); p2.on("pageerror", e => console.log(name, "PDF PAGEERROR", e.message));
    await p2.addInitScript(() => { window.print = () => { window.__printed = true; }; });
    await p2.goto("https://fabiocostaph.com/guida.html?g=venice&print=1", { waitUntil: "load" });
    try { await p2.waitForFunction(() => window.GUIDA && (window.GUIDA.pages || window.GUIDA.error), null, { timeout: 60000 }); } catch {}
    console.log(name, "pdf", JSON.stringify(await p2.evaluate(() => ({ g: window.GUIDA, printed: !!window.__printed, text: document.body.innerText.slice(0, 100) }))));
    await b.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
