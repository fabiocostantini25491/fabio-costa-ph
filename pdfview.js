/* Field Notes — PDF guides read right on the site (PDF.js), with a separate Download button */
(function () {
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  const T = s => (window.I18N ? I18N.t(s) : s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let lib = null, box = null, doc = null, zoom = 1, token = 0, io = null, onClose = null;

  const loadLib = () => lib || (lib = new Promise((ok, ko) => {
    if (window.pdfjsLib) return ok(window.pdfjsLib);
    const s = document.createElement("script");
    s.src = PDFJS + "pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; ok(window.pdfjsLib); };
    s.onerror = () => { lib = null; ko(new Error("pdf.js")); };
    document.head.appendChild(s);
  }));

  function close() {
    if (!box) return;
    token++; io?.disconnect(); io = null;
    try { doc?.destroy(); } catch {}
    doc = null; box.remove(); box = null;
    document.documentElement.classList.remove("pdv-open");
    document.removeEventListener("keydown", onKey);
    const cb = onClose; onClose = null; cb?.();
  }
  const onKey = e => { if (e.key === "Escape") close(); };

  async function paint(c) {
    if (!doc || c.dataset.done === String(zoom)) return;
    const my = token, n = +c.dataset.n;
    c.dataset.done = String(zoom);
    const page = await doc.getPage(n);
    if (my !== token) return;
    const wrap = box.querySelector(".pdv-pages"), w = Math.min(wrap.clientWidth - 24, 900) * zoom;
    const base = page.getViewport({ scale: 1 }), css = w / base.width, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: css * dpr });
    const cv = document.createElement("canvas");
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    cv.style.width = Math.floor(vp.width / dpr) + "px"; cv.style.height = Math.floor(vp.height / dpr) + "px";
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    if (my !== token) return;
    c.style.aspectRatio = ""; c.replaceChildren(cv);
  }

  function layout() {
    const wrap = box.querySelector(".pdv-pages");
    io?.disconnect();
    io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && paint(e.target)), { root: wrap, rootMargin: "600px 0px" });
    wrap.querySelectorAll(".pdv-page").forEach(c => { delete c.dataset.done; io.observe(c); });
    box.querySelector("[data-pdvz]").textContent = Math.round(zoom * 100) + "%";
  }

  // g: { titolo, file (url to read), download (url to save), mb }, share: html of the share button
  async function open(g, opts = {}) {
    close();
    onClose = opts.onClose || null;
    const my = ++token;
    zoom = 1;
    box = document.createElement("div");
    box.className = "pdv";
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", g.titolo);
    box.innerHTML = `<header class="pdv-bar">
        <button type="button" class="pdv-x" data-pdvx aria-label="${esc(T("Close"))}">✕</button>
        <b class="pdv-t">${esc(g.titolo)}<small data-pdvn></small></b>
        <span class="pdv-zoom"><button type="button" data-pdvzoom="-1" aria-label="${esc(T("Zoom out"))}">−</button><span data-pdvz>100%</span><button type="button" data-pdvzoom="1" aria-label="${esc(T("Zoom in"))}">+</button></span>
        ${opts.share || ""}
        <a class="pdv-dl" href="${esc(g.download || g.file)}" download target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 19h14"/></svg><span>${esc(T("Download"))}${g.mb ? ` · ${esc(g.mb)} MB` : ""}</span></a>
      </header>
      <div class="pdv-pages"><p class="pdv-msg">${esc(T("Loading the guide…"))}</p></div>`;
    document.body.appendChild(box);
    document.documentElement.classList.add("pdv-open");
    document.addEventListener("keydown", onKey);
    box.addEventListener("click", e => {
      if (e.target.closest("[data-pdvx]")) return close();
      const z = e.target.closest("[data-pdvzoom]");
      if (z) { const nz = Math.max(1, Math.min(3, zoom + (+z.dataset.pdvzoom) * 0.5)); if (nz !== zoom) { zoom = nz; layout(); } }
    });
    box.querySelector("[data-pdvx]").focus();
    const wrap = box.querySelector(".pdv-pages");
    try {
      const pdfjs = await loadLib();
      const d = await pdfjs.getDocument({ url: g.file, isEvalSupported: false }).promise;
      if (my !== token) { d.destroy(); return; }
      doc = d;
      const first = await doc.getPage(1), v = first.getViewport({ scale: 1 });
      wrap.innerHTML = Array.from({ length: doc.numPages }, (_, i) =>
        `<div class="pdv-page" data-n="${i + 1}" style="aspect-ratio:${v.width} / ${v.height}"></div>`).join("");
      box.querySelector("[data-pdvn]").textContent = ` · ${doc.numPages} ${T(doc.numPages === 1 ? "page" : "pages")}`;
      layout();
      let rt; window.addEventListener("resize", function rs() { if (!box) return window.removeEventListener("resize", rs); clearTimeout(rt); rt = setTimeout(layout, 200); });
    } catch (err) {
      console.warn("pdf view:", err);
      if (my !== token) return;
      wrap.innerHTML = `<p class="pdv-msg">${esc(T("This guide can't be shown here."))}<br><a class="pdv-dl" href="${esc(g.download || g.file)}" target="_blank" rel="noopener">${esc(T("Open the PDF"))}</a></p>`;
    }
  }

  window.PdfView = { open, close };
})();
