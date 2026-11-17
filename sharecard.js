/* Field Notes — share an article, a guide or the magazine as an Instagram story (9:16) or post (4:5) image */
(function () {
  const T = s => (window.I18N ? I18N.t(s) : s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SERIF = '"Cormorant Garamond", Georgia, serif', SANS = '"DM Sans", system-ui, sans-serif';
  const SIZES = { story: [1080, 1920], post: [1080, 1350] };
  let box = null, info = null, fmt = "story", blobs = {}, urls = {}, pdfImg;

  const loadImg = src => new Promise(ok => {
    if (!src) return ok(null);
    const im = new Image();
    if (/^https?:/.test(src) && !src.startsWith(location.origin)) im.crossOrigin = "anonymous";
    im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src;
  });
  const fonts = () => Promise.all([`600 100px ${SERIF}`, `italic 500 60px ${SERIF}`, `500 30px ${SANS}`, `600 30px ${SANS}`]
    .map(f => document.fonts?.load(f).catch(() => {}))).catch(() => {});

  function cover(ctx, im, x, y, w, h) {
    const r = Math.max(w / im.width, h / im.height), sw = w / r, sh = h / r;
    ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2.4, sw, sh, x, y, w, h);
  }
  function lines(ctx, text, maxW, maxLines) {
    const words = String(text || "").replace(/\s+/g, " ").trim().split(" "), out = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    if (out.length > maxLines) { out.length = maxLines; let l = out[maxLines - 1]; while (l && ctx.measureText(l + "…").width > maxW) l = l.replace(/\s*\S+$/, ""); out[maxLines - 1] = l + "…"; }
    return out;
  }
  const spaced = (ctx, px) => { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; };

  async function draw(kind) {
    const [W, H] = SIZES[kind], story = kind === "story";
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    // ground: night blue with a warm glow
    ctx.fillStyle = "#050b14"; ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W * .9, 0, 0, W * .9, 0, W * 1.1); g.addColorStop(0, "rgba(242,140,30,.24)"); g.addColorStop(1, "rgba(242,140,30,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(0, H, 0, 0, H, W); g.addColorStop(0, "rgba(90,140,255,.16)"); g.addColorStop(1, "rgba(90,140,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const im = await loadImg(info.img);
    let textTop;
    if (im) {
      const ih = Math.round(H * (story ? .62 : .6));
      cover(ctx, im, 0, 0, W, ih);
      const f = ctx.createLinearGradient(0, ih * .45, 0, ih); f.addColorStop(0, "rgba(5,11,20,0)"); f.addColorStop(1, "#050b14");
      ctx.fillStyle = f; ctx.fillRect(0, 0, W, ih + 2);
      // the ground's blue glow again over the fade, so the photo melts into it without a seam
      g = ctx.createRadialGradient(0, H, 0, 0, H, W); g.addColorStop(0, "rgba(90,140,255,.16)"); g.addColorStop(1, "rgba(90,140,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, ih * .6, W, ih * .4 + 2);
      if (story) { const t = ctx.createLinearGradient(0, 0, 0, 300); t.addColorStop(0, "rgba(5,11,20,.55)"); t.addColorStop(1, "rgba(5,11,20,0)"); ctx.fillStyle = t; ctx.fillRect(0, 0, W, 300); }
      textTop = ih - (story ? 170 : 120);
    } else if (info.pdfPage) {
      pdfImg = pdfImg || await info.pdfPage().catch(() => null);
      if (pdfImg) {
        const pw = story ? 560 : 470, ph = pw * pdfImg.height / pdfImg.width, maxH = story ? 900 : 640, s = Math.min(1, maxH / ph);
        const w = pw * s, h = ph * s, x = (W - w) / 2, y = story ? 250 : 70;
        ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-.035);
        ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 26;
        ctx.drawImage(pdfImg, -w / 2, -h / 2, w, h); ctx.restore();
        textTop = y + h + (story ? 70 : 50);
      }
    }
    if (textTop == null) {
      // no picture: a few stars and the words take the stage
      ctx.fillStyle = "rgba(255,255,255,.55)";
      for (let i = 0; i < 70; i++) { const x = (i * 197 % 1000) / 1000 * W, y = (i * 389 % 1000) / 1000 * H * .5, r = (i % 3) * .6 + .6; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      textTop = story ? 560 : 260;
    }

    const X = 84, MW = W - X * 2;
    // the text block, measured first, then placed so it ends above the footer
    const bottom = H - (story ? 300 : 160), minTop = story ? 260 : 70;
    const ks = story ? 30 : 26, ss = story ? 40 : 32, cs = story ? 36 : 30;
    let size = story ? 112 : 88, tl, sl, total;
    for (; ; size -= 6) {
      ctx.font = `600 ${size}px ${SERIF}`; tl = lines(ctx, info.title, MW, story ? 4 : 3);
      ctx.font = `italic 500 ${ss + 6}px ${SERIF}`; sl = info.sub ? lines(ctx, info.sub, MW, story ? 3 : 2) : [];
      total = ks + 30 + tl.length * size * .98 + (sl.length ? 26 + sl.length * ss * 1.35 : 0) + (story ? 78 : 56);
      if ((tl.length <= (story ? 3 : 2) && bottom - total >= minTop) || size <= 56) break;
    }
    if (bottom - total < minTop && sl.length > 1) { sl.length = 1; sl[0] = sl[0].replace(/[\s,.;:–—-]*$/, "") + "…"; total -= ss * 1.35; }
    let y = Math.max(minTop, Math.min(textTop, bottom - total)) + ks;
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${ks}px ${SANS}`; spaced(ctx, story ? 6 : 5); ctx.fillStyle = "#ffbe7a";
    ctx.fillText(String(info.kicker).toUpperCase(), X, y); spaced(ctx, 0);
    ctx.font = `600 ${size}px ${SERIF}`; ctx.fillStyle = "#f2f6fb"; y += 30 - size * .22;
    for (const l of tl) { y += size * .98; ctx.fillText(l, X, y); }
    if (sl.length) {
      ctx.font = `italic 500 ${ss + 6}px ${SERIF}`; ctx.fillStyle = "#c9d6e6"; y += 26;
      for (const l of sl) { y += ss * 1.35; ctx.fillText(l, X, y); }
    }
    ctx.font = `600 ${cs}px ${SANS}`; ctx.fillStyle = "#ffbe7a"; y += story ? 78 : 56;
    ctx.fillText((info.cta || "Read it on fabiocostaph.com") + (story ? "  ↓" : ""), X, y);
    // the whole site, not just this page: stories, photographs and SpotFolk
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, H - (story ? 236 : 128)); ctx.lineTo(W - X, H - (story ? 236 : 128)); ctx.stroke();
    ctx.font = `600 ${story ? 26 : 22}px ${SANS}`; spaced(ctx, 5); ctx.fillStyle = "#c9d6e6";
    const sf = info.brand === "spotfolk";   // a place of SpotFolk: its own address, Fabio's name under it
    ctx.fillText("FABIOCOSTAPH.COM", W / 2, H - (story ? 186 : 86));
    ctx.font = `500 ${story ? 24 : 21}px ${SANS}`; spaced(ctx, 1); ctx.fillStyle = "#7f91a6";
    ctx.fillText(sf ? "SpotFolk · the places behind the photographs" : "Field Notes · Photographs · SpotFolk", W / 2, H - (story ? 146 : 50));
    ctx.textAlign = "left"; spaced(ctx, 0);
    return new Promise(ok => cv.toBlob(ok, "image/jpeg", .9));
  }

  async function show(kind) {
    fmt = kind;
    box.querySelectorAll("[data-shfmt]").forEach(b => b.classList.toggle("on", b.dataset.shfmt === kind));
    const pv = box.querySelector(".shc-pv");
    pv.className = "shc-pv " + kind;
    if (!blobs[kind]) { pv.innerHTML = `<p>${esc(T("Preparing the image…"))}</p>`; await fonts(); blobs[kind] = await draw(kind); urls[kind] = URL.createObjectURL(blobs[kind]); }
    if (!box || fmt !== kind) return;
    pv.innerHTML = `<img src="${urls[kind]}" alt="">`;
  }
  const fileName = () => `${String(info.title).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "field-notes"}-${fmt}.jpg`;

  function close() {
    if (!box) return;
    Object.values(urls).forEach(u => URL.revokeObjectURL(u));
    box.remove(); box = null; blobs = {}; urls = {}; pdfImg = null;
    document.documentElement.classList.remove("shc-open");
  }

  // i: { kind, kicker, title, sub, img, pdfPage, url, shareLink() }
  function open(i) {
    close(); info = i;
    box = document.createElement("div");
    box.className = "shc"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.innerHTML = `<div class="shc-card">
      <header><b>${esc(T("Share"))}</b><button type="button" class="shc-x" data-shx aria-label="${esc(T("Close"))}">✕</button></header>
      <nav class="shc-fmt"><button type="button" data-shfmt="story">${esc(T("Story"))} <small>9:16</small></button><button type="button" data-shfmt="post">${esc(T("Post"))} <small>4:5</small></button></nav>
      <div class="shc-pv story"></div>
      <div class="shc-acts">
        <button type="button" class="shc-go" data-shgo>${esc(T("Share image"))}</button>
        <button type="button" data-shsave>${esc(T("Save image"))}</button>
        <button type="button" data-shlink>${esc(T("Share link"))}</button>
      </div>
      <p class="shc-tip">${esc(T("On Instagram, add the link with the Link sticker: it's already copied."))}</p>
    </div>`;
    document.body.appendChild(box);
    document.documentElement.classList.add("shc-open");
    box.addEventListener("click", async e => {
      if (e.target === box || e.target.closest("[data-shx]")) return close();
      const f = e.target.closest("[data-shfmt]"); if (f) return show(f.dataset.shfmt);
      if (e.target.closest("[data-shlink]")) { close(); return i.shareLink(); }
      const blob = blobs[fmt]; if (!blob) return;
      const file = new File([blob], fileName(), { type: "image/jpeg" });
      try { navigator.clipboard?.writeText(i.url).catch(() => {}); } catch {}
      window.fcTrack?.(`${i.brand === "spotfolk" ? "SpotFolk" : "Field Notes"}: ${fmt} image (${i.kind})`);
      if (e.target.closest("[data-shgo]") && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: i.title }); return; } catch (err) { if (err?.name === "AbortError") return; }
      }
      const a = document.createElement("a"); a.href = urls[fmt]; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    });
    try { navigator.clipboard?.writeText(i.url).catch(() => {}); } catch {}
    show("story");
  }
  window.ShareCard = { open, close };
})();
