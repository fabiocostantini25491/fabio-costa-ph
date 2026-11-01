// App installabile (PWA): registra il service worker e mostra, solo da telefono, un piccolo invito
// a "installare" il sito sulla schermata Home. Su Android usa il pulsante nativo; su iPhone spiega i due tocchi.
(function () {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  const t = s => (window.I18N ? I18N.t(s) : s);
  const track = e => { try { window.fcTrack && window.fcTrack(e); } catch {} };
  const KEY = "fcph-install-dismissed";
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV/.test(ua);
  const isMobile = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
  if (standalone) { track("PWA: opened as app"); return; }

  const dismissedRecently = () => {
    try { return Date.now() - (+localStorage.getItem(KEY) || 0) < 1000 * 60 * 60 * 24 * 21; } catch { return false; }
  };
  let deferred = null;

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    schedule();
  });
  window.addEventListener("appinstalled", () => { track("PWA: installed"); hide(); });

  const SHARE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
  let box = null, timer = null;

  function schedule() {
    if (box || timer || dismissedRecently() || !isMobile) return;
    timer = setTimeout(show, 25000);   // non disturbare subito: dopo 25 secondi di visita
  }

  function show() {
    if (box) return;
    box = document.createElement("div");
    box.className = "install-tip";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", t("Install the app"));
    const body = deferred
      ? `<p><strong>${t("Install the app")}</strong>${t("Fabio Costa Ph on your home screen: full screen, quicker, and Tools work offline.")}</p>
         <button type="button" class="install-go">${t("Install")}</button>`
      : `<p><strong>${t("Install the app")}</strong>${t("Tap")} <span class="install-share">${SHARE}</span> ${t("Share, then “Add to Home Screen”.")}</p>`;
    box.innerHTML = `<img src="/img/icon-192.png" alt="" width="40" height="40">${body}
      <button type="button" class="install-x" aria-label="${t("Close")}">×</button>`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add("show"));
    track(deferred ? "PWA: prompt shown (Android)" : "PWA: prompt shown (iOS)");
    box.querySelector(".install-x").addEventListener("click", () => {
      try { localStorage.setItem(KEY, Date.now()); } catch {}
      track("PWA: prompt dismissed");
      hide();
    });
    box.querySelector(".install-go")?.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt();
      const { outcome } = await deferred.userChoice.catch(() => ({}));
      track(`PWA: install ${outcome || "unknown"}`);
      deferred = null;
      hide();
    });
  }

  function hide() {
    if (!box) return;
    box.classList.remove("show");
    const b = box; box = null;
    setTimeout(() => b.remove(), 400);
  }

  if (isSafari) schedule();     // iPhone/iPad: Safari non ha un evento di installazione, mostriamo le istruzioni
  window.FCPWA = { show: () => { clearTimeout(timer); show(); } };
})();
