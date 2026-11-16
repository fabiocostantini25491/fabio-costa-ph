/* Fabio Costa Ph — analyzer.js
   «Analyze your shot»: legge i dati di scatto (EXIF) e la luce della foto di prova, direttamente nel browser
   (la foto non viene inviata a nessuno), e propone un piano di scatto con regole da fotografo.
   Facoltativo: riconoscimento della scena con un piccolo modello di AI gratuito che gira sul dispositivo (CLIP). */
"use strict";

const Analyzer = (() => {

  /* =========================================================
     CONSIGLI PER SCENA — testi modificabili
     (qui andranno i consigli di Fabio: ogni scena ha bilanciamento del bianco, ISO tipici e suggerimenti)
     ========================================================= */
  const SCENES = {
    village:   { label: "Village or town at night", stars: false, target: 0.10, wb: "3800–4200 K",
      tips: ["Use a tripod and the 2-second timer (or a remote) so the camera doesn't move.",
             "Keep ISO low (100–400) and let the shutter do the work: on a tripod there's no need for high ISO.",
             "Shoot during blue hour, 20–40 minutes after sunset, to keep some colour in the sky.",
             "Street lights flare at small apertures: f/8 gives sun-stars, f/4 keeps them soft."] },
    milkyway:  { label: "Milky Way", stars: true, target: 0.045, wb: "3800–4200 K",
      tips: ["Pick a moonless night with the core above the horizon (see the Planner).",
             "Shoot wide open (f/1.8–f/2.8) and stay under the maximum shutter time for sharp stars.",
             "Focus manually on a bright star in live view at 10× zoom, then tape the focus ring.",
             "Take a separate, longer exposure for the foreground at lower ISO and blend it later."] },
    trails:    { label: "Star trails", stars: true, target: 0.05, wb: "3800–4200 K", trails: true,
      tips: ["Point towards the North Star (Polaris) for circular trails, east or west for straight lines.",
             "Use continuous shooting with an intervalometer, 1 second between frames.",
             "Turn off long-exposure noise reduction, or there will be gaps in the trails.",
             "Bring spare batteries: cold nights drain them fast."] },
    city:      { label: "City at night", stars: false, target: 0.12, wb: "3200–3800 K",
      tips: ["Light trails need 10–30 s exposures: use f/8–f/11 and ISO 100.",
             "Start during blue hour, when the sky matches the brightness of the lights.",
             "Bracket for the brightest signs and windows."] },
    sunset:    { label: "Sunset or sunrise", stars: false, target: 0.2, wb: "5200–5800 K",
      tips: ["Bracket: the sky and the land differ by 3–5 stops.",
             "Use f/8–f/11 and focus at the hyperfocal distance to keep everything sharp.",
             "Stay after the sun has set: the best colours often come 10–20 minutes later.",
             "A graduated ND filter can replace bracketing for simple horizons."] },
    bluehour:  { label: "Blue hour", stars: false, target: 0.12, wb: "4500–5200 K",
      tips: ["The light changes every minute: take a shot every 2–3 minutes and pick the best.",
             "Use a tripod, ISO 100 and exposures of a few seconds.",
             "Turn on lights in the scene (houses, lanterns) to balance warm and cool tones."] },
    moonlit:   { label: "Moonlit landscape", stars: false, target: 0.10, wb: "4000–4500 K",
      tips: ["A half to full moon lights the land like a soft day: exposures of 10–30 s at ISO 800–1600.",
             "Keep the moon behind you or to the side, out of the frame, to avoid flare.",
             "Only the brightest stars will show: it's a landscape, not an astro shot."] },
    aurora:    { label: "Northern lights", stars: true, target: 0.06, wb: "3500–4000 K",
      tips: ["Fast auroras need short exposures (2–6 s) to keep their structure.",
             "Open wide (f/1.4–f/2.8) and raise ISO to 1600–3200.",
             "Include a foreground and keep shooting: it changes in seconds."] },
    day:       { label: "Landscape by day", stars: false, target: 0.18, wb: "Auto / 5500 K",
      tips: ["Use f/8–f/11 for maximum sharpness and depth of field.",
             "A polarising filter deepens skies and cuts reflections on water and leaves.",
             "Check the histogram: nothing should touch the right edge."] },
    waterfall: { label: "Waterfall / long exposure", stars: false, target: 0.16, wb: "5500 K",
      tips: ["For silky water use 0.5–2 s; for misty water 10–30 s with an ND filter.",
             "ISO 100 and f/8–f/11, on a tripod, with the timer.",
             "Wipe the lens often: spray settles quickly near falls."] }
  };
  const CROPS = [["1", "Full frame"], ["1.5", "APS-C (Nikon, Sony, Fuji)"], ["1.6", "APS-C (Canon)"], ["2", "Micro Four Thirds"], ["2.7", "1-inch"], ["6", "Smartphone"]];
  const AI_PROMPTS = {
    village: "a photo of an old village at night", milkyway: "a photo of the milky way over a landscape", trails: "a photo of star trails in the night sky",
    city: "a photo of a city skyline at night", sunset: "a photo of a sunset or sunrise", bluehour: "a photo of a landscape at blue hour, deep blue sky",
    moonlit: "a photo of a landscape lit by the full moon", aurora: "a photo of the northern lights", day: "a landscape photo in daylight",
    waterfall: "a long exposure photo of a waterfall"
  };

  let built = false, img = null, stats = null, exif = {}, scene = null, aiPipe = null;
  let reading = null, readingBusy = false, readingErr = "", turns = [], asked = 0;
  const AI_CONSENT = "fcph-ai-consent", MAX_Q = 5;
  const $a = sel => document.querySelector(`#shotRoot ${sel}`);

  /* ---------- lettura EXIF dei JPEG (senza librerie) ---------- */
  function readExif(buf) {
    const v = new DataView(buf), out = {};
    if (v.getUint16(0) !== 0xFFD8) return out;
    let o = 2;
    while (o < v.byteLength - 4) {
      const marker = v.getUint16(o), len = v.getUint16(o + 2);
      if (marker === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) { parseTiff(v, o + 10, out); break; }
      if ((marker & 0xFF00) !== 0xFF00) break;
      o += 2 + len;
    }
    return out;
  }
  function parseTiff(v, start, out) {
    const le = v.getUint16(start) === 0x4949;
    const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
    const TAGS = { 0x010F: "make", 0x0110: "model", 0x829A: "exposure", 0x829D: "fnumber", 0x8827: "iso", 0x9003: "date",
      0x920A: "focal", 0xA405: "focal35", 0xA434: "lens", 0x8769: "exifIFD", 0xA002: "width", 0xA003: "height" };
    const readIFD = off => {
      if (off <= 0 || start + off + 2 > v.byteLength) return;
      const n = u16(start + off);
      for (let i = 0; i < n; i++) {
        const e = start + off + 2 + i * 12;
        if (e + 12 > v.byteLength) return;
        const tag = u16(e), type = u16(e + 2), count = u32(e + 4), name = TAGS[tag];
        if (!name) continue;
        const size = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8][type] || 1, dataOff = size * count > 4 ? start + u32(e + 8) : e + 8;
        let val;
        try {
          if (type === 2) { val = ""; for (let k = 0; k < count - 1; k++) val += String.fromCharCode(v.getUint8(dataOff + k)); val = val.trim(); }
          else if (type === 3) val = u16(dataOff);
          else if (type === 4) val = u32(dataOff);
          else if (type === 5 || type === 10) { const a = type === 5 ? u32(dataOff) : v.getInt32(dataOff, le), b = type === 5 ? u32(dataOff + 4) : v.getInt32(dataOff + 4, le); val = b ? a / b : 0; }
        } catch { continue; }
        if (name === "exifIFD") readIFD(val); else out[name] = val;
      }
    };
    readIFD(u32(start + 4));
  }

  /* ---------- misura della luce ---------- */
  const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  function measure(image) {
    const max = 640, k = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const w = Math.max(1, Math.round(image.naturalWidth * k)), h = Math.max(1, Math.round(image.naturalHeight * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(image, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, n = w * h, hist = new Uint32Array(256), L = new Uint8Array(n);
    let lin = 0, hi = 0, lo = 0, chHi = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      L[p] = y; hist[y]++;
      lin += 0.2126 * toLin(d[i]) + 0.7152 * toLin(d[i + 1]) + 0.0722 * toLin(d[i + 2]);
      if (y >= 250) hi++;
      if (y <= 4) lo++;
      if (d[i] >= 254 || d[i + 1] >= 254 || d[i + 2] >= 254) chHi++;
    }
    // rumore: differenza fra ogni pixel scuro e la media dei vicini (solo zone uniformi e scure)
    let nz = 0, nc = 0;
    for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
      const p = y * w + x, v0 = L[p];
      if (v0 < 12 || v0 > 90) continue;
      const m = (L[p - 1] + L[p + 1] + L[p - w] + L[p + w]) / 4;
      if (Math.abs(L[p - 1] - L[p + 1]) > 18 || Math.abs(L[p - w] - L[p + w]) > 18) continue;   // bordo, non rumore
      nz += Math.abs(v0 - m); nc++;
    }
    // percentili della luce (per la scala di esposizioni): ombre profonde e luci più forti
    const pct = q => { let acc = 0; const lim = q * n; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= lim) return i; } return 255; };
    // nitidezza: energia del laplaciano sui bordi più marcati (ignora le zone piatte e buie)
    const lap = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x, gx = Math.abs(L[p + 1] - L[p - 1]), gy = Math.abs(L[p + w] - L[p - w]);
      if (gx + gy < 24) continue;
      lap.push(Math.abs(4 * L[p] - L[p - 1] - L[p + 1] - L[p - w] - L[p + w]) / (gx + gy));
    }
    lap.sort((a, b) => b - a);
    const top = lap.slice(0, Math.max(50, Math.floor(lap.length * 0.1)));
    const sharp = lap.length > 400 ? top.reduce((a, b) => a + b, 0) / top.length : null;
    return { hist, meanLin: lin / n, clipHi: hi / n, clipLo: lo / n, channelClip: chHi / n, noise: nc > 200 ? nz / nc : null,
      p05: pct(0.05), p50: pct(0.5), p997: pct(0.997), sharp, edges: lap.length, w, h };
  }

  /* ---------- interfaccia ---------- */
  function show() {
    if (built) return;
    built = true;
    document.getElementById("shotRoot").innerHTML = `
      <div class="shot">
        <article class="tool-card shot-intro">
          <span class="eyebrow">Analyze your shot</span>
          <h2>Take a test shot, get a shooting plan</h2>
          <p class="tool-note">Load a test photo straight from your camera or phone (JPEG). The page reads its settings and its light <strong>on your device</strong> — the photo is never uploaded — and tells you how many shots to take, at which settings, and why.</p>
          <label class="shot-drop" id="shotDrop">
            <input type="file" id="shotFile" accept="image/jpeg,image/png,image/webp,image/*">
            ${ICON.img}<span><strong>Choose a test shot</strong><small>or drop it here · JPEG keeps the camera settings</small></span>
          </label>
        </article>
        <div class="shot-work" id="shotWork" hidden>
          <article class="tool-card shot-preview">
            <div class="shot-img"><img id="shotImg" alt="Your test shot"></div>
            <canvas id="shotHist" width="512" height="120" aria-label="Brightness histogram" role="img"></canvas>
            <ul class="shot-meter" id="shotMeter"></ul>
          </article>
          <article class="tool-card shot-setup">
            <span class="eyebrow">1 · What are you shooting?</span>
            <div class="shot-scenes" id="shotScenes" role="radiogroup" aria-label="Scene">
              ${Object.entries(SCENES).map(([k, s]) => `<button type="button" role="radio" aria-checked="false" class="filter" data-scene="${k}">${s.label}</button>`).join("")}
            </div>
            <button type="button" class="pop-btn shot-ai" id="shotAi">${ICON_STAR_AI}Detect it automatically <small>(free AI on your device · ~90 MB the first time)</small></button>
            <p class="gate-note" id="shotAiNote" role="status"></p>
            <span class="eyebrow">2 · Check the settings</span>
            <form class="shot-form" id="shotForm">
              <label>Focal length <span><input type="number" id="fFocal" min="1" max="2000" step="0.1" inputmode="decimal"> mm</span></label>
              <label>Aperture <span>f/<input type="number" id="fAperture" min="0.7" max="64" step="0.1" inputmode="decimal"></span></label>
              <label>Shutter <span><input type="text" id="fShutter" placeholder="1/60 or 15" inputmode="text"> s</span></label>
              <label>ISO <span><input type="number" id="fIso" min="25" max="409600" step="1" inputmode="numeric"></span></label>
              <label>Sensor <span><select id="fCrop">${CROPS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></span></label>
              <label>Megapixels <span><input type="number" id="fMp" min="1" max="200" step="1" value="24" inputmode="numeric"></span></label>
              <label class="shot-check"><input type="checkbox" id="fTripod" checked> On a tripod</label>
            </form>
            <p class="gate-help left" id="shotCam"></p>
          </article>
        </div>
        <article class="tool-card shot-plan" id="shotPlan" hidden></article>
        <p class="tool-foot shot-disclaimer">The plan follows common rules of night and landscape photography: treat it as a starting point and check your results on location.</p>
      </div>`;
    const input = $a("#shotFile"), drop = $a("#shotDrop");
    input.addEventListener("change", () => input.files[0] && load(input.files[0]));
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) load(f); });
    $a("#shotScenes").addEventListener("click", e => { const b = e.target.closest("[data-scene]"); if (b) setScene(b.dataset.scene); });
    $a("#shotForm").addEventListener("input", plan);
    $a("#shotForm").addEventListener("submit", e => e.preventDefault());
    $a("#shotAi").addEventListener("click", detectScene);
  }

  async function load(file) {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) return toast("Please choose a photo.", true);
    exif = {};
    try { exif = readExif(await file.slice(0, 256 * 1024).arrayBuffer()); } catch {}
    const url = URL.createObjectURL(file);
    img = new Image();
    img.onload = () => {
      stats = measure(img);
      reading = null; readingErr = ""; turns = []; asked = 0;
      $a("#shotImg").src = url;
      $a("#shotWork").hidden = false;
      fillForm();
      drawHist();
      meter();
      plan();
      $a("#shotWork").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    img.onerror = () => toast("This photo can't be read by the browser. Try a JPEG.", true);
    img.src = url;
  }

  function fillForm() {
    const set = (id, v) => { const el = $a(id); el.value = v ?? ""; };
    set("#fFocal", exif.focal ? +exif.focal.toFixed(1) : "");
    set("#fAperture", exif.fnumber ? +exif.fnumber.toFixed(1) : "");
    set("#fShutter", exif.exposure ? (exif.exposure < 0.5 ? `1/${Math.round(1 / exif.exposure)}` : +exif.exposure.toFixed(1)) : "");
    set("#fIso", exif.iso || "");
    if (exif.focal && exif.focal35) {
      const cf = exif.focal35 / exif.focal;
      const best = CROPS.map(([v]) => +v).reduce((a, b) => Math.abs(b - cf) < Math.abs(a - cf) ? b : a);
      $a("#fCrop").value = String(best);
    } else if (/apple|samsung|google|xiaomi|huawei|oneplus/i.test(exif.make || "")) $a("#fCrop").value = "6";
    const cam = [exif.make, exif.model].filter(Boolean).join(" ").replace(/^(\w+) \1/i, "$1");
    $a("#shotCam").innerHTML = exif.focal || exif.iso
      ? `Read from the photo: <strong>${esc(cam || "camera")}</strong>${exif.lens ? ` · ${esc(exif.lens)}` : ""}. Change anything that's wrong.`
      : "This photo has no camera settings (often after sending it on WhatsApp or taking a screenshot): fill them in by hand.";
  }

  function drawHist() {
    const c = $a("#shotHist"), g = c.getContext("2d"), H = stats.hist, max = Math.max(...Array.from(H).slice(2, 254)) || 1;
    g.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < 256; i++) {
      const v = Math.min(1, H[i] / max), x = i * 2;
      g.fillStyle = i <= 4 ? "#4f86dd" : i >= 250 ? "#ff7a59" : "rgba(156,200,255,.75)";
      g.fillRect(x, c.height - v * (c.height - 4), 2, v * (c.height - 4));
    }
  }

  function meter() {
    const s = stats, pct = x => x < 0.001 ? "0%" : x < 0.01 ? "<1%" : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
    const noise = s.noise == null ? "—" : s.noise < 2.2 ? "Low" : s.noise < 4.5 ? "Medium" : "High";
    $a("#shotMeter").innerHTML = `
      <li><span>Burnt highlights</span><strong class="${s.clipHi > 0.01 ? "bad" : ""}">${pct(s.clipHi)}</strong></li>
      <li><span>Black shadows</span><strong class="${s.clipLo > 0.08 ? "bad" : ""}">${pct(s.clipLo)}</strong></li>
      <li><span>Noise in the dark areas</span><strong class="${noise === "High" ? "bad" : ""}">${noise}</strong></li>
      <li><span>Sharpness</span><strong class="${s.sharp != null && s.sharp < 0.62 ? "bad" : ""}">${s.sharp == null ? "—" : s.sharp >= 0.8 ? "Sharp" : s.sharp >= 0.62 ? "Slightly soft" : "Soft"}</strong></li>`;
  }

  function setScene(k) {
    scene = k;
    $a("#shotScenes").querySelectorAll("[data-scene]").forEach(b => { const on = b.dataset.scene === k; b.classList.toggle("active", on); b.setAttribute("aria-checked", String(on)); });
    plan();
  }

  /* ---------- il piano di scatto ---------- */
  const parseShutter = t => {
    t = String(t || "").trim().replace(",", ".").replace(/s$/i, "");
    const m = t.match(/^1\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (m) return 1 / +m[1];
    const v = parseFloat(t.replace(/"$/, ""));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const fmtShutter = t => t >= 1 ? `${t >= 10 ? Math.round(t) : +t.toFixed(1)} s` : `1/${Math.round(1 / t)} s`;
  const roundIso = i => [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600].reduce((a, b) => Math.abs(Math.log2(b / i)) < Math.abs(Math.log2(a / i)) ? b : a);
  const STOPS_F = [1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16];

  /* ---------- la scala di esposizioni (il metodo della guida «Shooting cities after dark») ----------
     Quanti stop servono per aprire le ombre e per recuperare le luci, rispetto allo scatto di prova.
     Poco divario → basta il bracketing; molto divario → sequenza manuale, in due varianti. */
  const xOf = (t, N, I) => Math.log2(t) + Math.log2(I / 100) - 2 * Math.log2(N);     // «quanta luce» entra, in stop
  const tFor = (x, N, I) => 2 ** (x - Math.log2(I / 100) + 2 * Math.log2(N));
  const SHUTTERS = [240, 120, 60, 30, 15, 8, 4, 2, 1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500, 1 / 1000, 1 / 2000, 1 / 4000];
  const fmtT = t => t >= 60 ? `${+(t / 60).toFixed(t % 60 ? 1 : 0)} min` : t >= 1 ? `${Math.round(t)}″` : `1/${Math.round(1 / t)}`;
  const bulb = t => t > 30.5;
  const nearT = t => SHUTTERS.reduce((a, b) => Math.abs(Math.log2(b / t)) < Math.abs(Math.log2(a / t)) ? b : a);
  // a long shadow frame in Bulb: keep its real length, rounded to 5 s (or half a minute past 2 minutes)
  const longT = t => t <= 30.5 ? nearT(t) : t < 120 ? Math.round(t / 5) * 5 : Math.round(t / 30) * 30;
  function needs(s) {
    // ombre: il 5% più scuro della foto deve arrivare a una luce «leggibile» (~ grigio scuro)
    const linLo = toLin(Math.max(1, s.p05)), sh = Math.max(0, Math.min(8, Math.log2(0.035 / linLo) + (s.clipLo > 0.12 ? 1 : 0)));
    // luci: se qualcosa brucia, servono almeno 2 stop, di più se le zone bruciate sono tante
    const clip = s.clipHi + s.channelClip / 3;
    const hi = clip < 0.0015 ? (s.p997 >= 245 ? 1 : 0) : Math.max(2, Math.min(6, 1.6 + Math.log2(1 + clip * 400)));
    return { sh, hi };
  }
  function ladder(s, t, N, iso) {
    const { sh, hi } = needs(s), span = sh + hi;
    const out = { sh, hi, span, bracket: null, A: [], B: [], shadowAlt: null };
    if (span <= 6.2) {
      // basta l'AEB: 3, 5 o 7 scatti attorno al centro giusto
      const n = span <= 3 ? 3 : span <= 5 ? 5 : 7, step = n === 3 ? 2 : n === 5 ? (span > 4 ? 1.5 : 1) : 1;
      out.bracket = { n, step, shift: (sh - hi) / 2 };
      return out;
    }
    if (!(t && N && iso)) return out;
    const x0 = xOf(t, N, iso), xs = x0 + sh, xh = x0 - hi;
    // A — il tuo metodo: ombre a diaframma aperto e ISO base, poi chiudi fino a f/8 restando a 30 s, poi accorci i tempi
    const Na = Math.min(N, 4), tA = tFor(xs, Na, 100);
    const shadowA = { N: Na, t: longT(tA), iso: 100, role: "shadows" };
    if (tA > 30.5) {
      const iso400 = Math.min(400, 100 * 2 ** Math.ceil(Math.log2(tA / 30)));
      out.shadowAlt = { N: Na, t: Math.max(1, Math.round(tFor(xs, Na, iso400))), iso: iso400 };
    }
    out.A.push(shadowA);
    const seqA = [[5.6, 30], [8, 30], ...SHUTTERS.filter(x => x < 30).map(x => [8, x])].filter(([n]) => n > Na || n === 8);
    for (const [n, tt] of seqA) {
      const x = xOf(tt, n, 100);
      if (x > xs - 0.6) continue;
      out.A.push({ N: n, t: tt, iso: 100, role: x <= xh + 0.5 ? "highlights" : "lights" });
      if (x <= xh + 0.5 || out.A.length >= 12) break;
    }
    // B — diaframma fisso (f/8, o quello della prova se più chiuso), solo i tempi
    const Nb = N >= 7 ? N : 8, tB = longT(tFor(xs, Nb, 100));
    out.B.push({ N: Nb, t: tB, iso: 100, role: "shadows" });
    for (const tt of SHUTTERS.filter(x => x < tB)) {
      const x = xOf(tt, Nb, 100);
      if (x > xs - 0.6) continue;
      out.B.push({ N: Nb, t: tt, iso: 100, role: x <= xh + 0.5 ? "highlights" : "lights" });
      if (x <= xh + 0.5 || out.B.length >= 12) break;
    }
    return out;
  }
  const chip = f => `<span class="lad-${f.role}"><small>f/${f.N} · ISO ${f.iso}</small>${fmtT(f.t)}${bulb(f.t) ? "<em>Bulb</em>" : ""}</span>`;
  function ladderHtml(s, t, N, iso) {
    const L = ladder(s, t, N, iso);
    lastLadder = L;
    if (L.span < 0.8) return `<p>The test shot already holds the whole scene: <strong>one frame is enough</strong> (add a motion frame if something moves).</p>`;
    const head = `<p>To open the shadows you need about <strong>+${L.sh.toFixed(1)} stops</strong>, to save the lights about <strong>−${L.hi.toFixed(1)} stops</strong> (the lights are an estimate: what's burnt can't be measured).</p>`;
    if (L.bracket) {
      const { n, step, shift } = L.bracket, evs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);
      const c = Math.round(shift * 2) / 2;
      return `${head}<p><strong>Bracketing is enough:</strong> AEB with <strong>${n} frames</strong> at ${evs.map(v => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`).join(" / ")} EV${Math.abs(c) >= 0.5 ? `, centred <strong>${c > 0 ? "+" : "−"}${Math.abs(c)} EV</strong> from your test shot` : ""}. Aperture Priority, darkest first, remote release.</p>`;
    }
    if (!L.A.length) return `${head}<p>That's more than a 5–7 frame bracket can hold: <strong>go Manual</strong> — one or more frames for the shadows (+${Math.round(L.sh)} EV), then shorter and shorter frames down to −${Math.round(L.hi)} EV. Fill in shutter, aperture and ISO to get the exact sequence.</p>`;
    return `${head}<p>That's more than a 5–7 frame bracket can hold: <strong>go Manual</strong>.</p>
      <h4 class="lad-h">Close down, then shorten <small>my usual sequence</small></h4>
      <div class="lad">${L.A.map(chip).join("")}</div>
      ${L.shadowAlt ? `<p class="lad-note">Shadow frame longer than 30 s: Bulb with a remote — or <strong>${fmtT(L.shadowAlt.t)} at ISO ${L.shadowAlt.iso}</strong> (still clean on most recent sensors).</p>` : ""}
      <h4 class="lad-h">Better: one aperture, only the shutter <small>identical frames, cleaner blend</small></h4>
      <div class="lad">${L.B.map(chip).join("")}</div>
      <p class="lad-note">Prefer one aperture with a foreground close to the lens or lamps with stars; close down instead when everything is far and the light changes fast. Then a frame for the sky and one for what moves.</p>`;
  }
  let lastLadder = null;

  function plan() {
    const box = $a("#shotPlan");
    if (!stats) return;
    if (!scene) { box.hidden = false; box.innerHTML = `<span class="eyebrow">Your shooting plan</span><p class="tool-note">${window.FC_LAB ? "Choose what you're shooting (step 1) to get your plan — or let the AI read the whole scene." : "Choose what you're shooting (step 1) to get your plan."}</p>${window.FC_LAB ? `<section class="ai-read" id="aiRead" data-no-i18n>${aiHtml()}</section>` : ""}`; wireAi(); return; }
    const S = SCENES[scene], s = stats;
    const f = parseFloat($a("#fFocal").value) || null, N = parseFloat($a("#fAperture").value) || null;
    const t = parseShutter($a("#fShutter").value), iso = parseFloat($a("#fIso").value) || null;
    const crop = parseFloat($a("#fCrop").value) || 1, mp = parseFloat($a("#fMp").value) || 24, tripod = $a("#fTripod").checked;
    const steps = [], warn = [];
    let settingsKnown = false;

    // 1. esposizione: di quanto è sotto/sovraesposta rispetto a una buona esposizione per questa scena
    let dEV = Math.log2(S.target / Math.max(1e-5, s.meanLin));
    if (s.clipHi > 0.02 && dEV > 0) dEV = Math.min(dEV, 0.7);   // non schiarire se le luci sono già bruciate
    dEV = Math.max(-4, Math.min(4, dEV));
    const exposureMsg = Math.abs(dEV) < 0.5 ? "The overall exposure is about right for this kind of scene."
      : dEV > 0 ? `The shot is about <strong>${dEV.toFixed(1)} stops too dark</strong> for this scene.`
      : `The shot is about <strong>${(-dEV).toFixed(1)} stops too bright</strong> for this scene.`;

    // 2. tempo massimo per stelle puntiformi (regola NPF semplificata e regola del 500)
    let maxStar = null;
    if (S.stars && f && N) {
      const pitch = (36 / crop) / Math.sqrt(mp * 1e6 * 1.5) * 1000;   // µm, sensore 3:2
      maxStar = (35 * N + 30 * pitch) / f;
      const r500 = 500 / (f * crop);
      steps.push(["Sharp stars", `Keep the shutter under <strong>${fmtShutter(Math.max(1, Math.floor(maxStar)))}</strong> (NPF rule). The simpler 500 rule gives ${fmtShutter(Math.max(1, Math.floor(r500)))}, fine for small prints.`]);
    }

    // 3. nuove impostazioni suggerite
    if (t && N && iso) {
      let T = t, A = N, I = iso, need = dEV;
      const tMax = S.trails ? 30 : S.stars ? (maxStar ? Math.max(1, Math.floor(maxStar)) : 20) : tripod ? 120 : 1 / Math.max(1, (f || 50) * crop);
      // prima il tempo (fino al limite), poi il diaframma, poi gli ISO
      if (need > 0) {
        const up = Math.min(need, Math.log2(tMax / T)); if (up > 0) { T *= 2 ** up; need -= up; }
        if (need > 0 && S.stars) { const wide = Math.min(need, Math.max(0, 2 * Math.log2(A / 2.8))); if (wide > 0) { A /= 2 ** (wide / 2); need -= wide; } }
        if (need > 0) { I *= 2 ** need; need = 0; }
        if (!S.stars && tripod && I > 400) { const back = Math.min(Math.log2(I / 400), Math.log2(120 / T)); if (back > 0) { I /= 2 ** back; T *= 2 ** back; } }
      } else if (need < 0) {
        const down = Math.min(-need, Math.max(0, Math.log2(I / 100))); I /= 2 ** down; need += down;
        if (need < 0) T *= 2 ** need;
      }
      // stelle: mai oltre il tempo massimo, si recupera con gli ISO
      if (S.stars && !S.trails && maxStar && T > Math.max(1, Math.floor(maxStar))) { const cap = Math.max(1, Math.floor(maxStar)); I *= T / cap; T = cap; }
      A = STOPS_F.reduce((a, b) => Math.abs(b - A) < Math.abs(a - A) ? b : a);
      if (A < N && !S.stars) A = N;
      const sug = `${fmtShutter(T)} · f/${A} · ISO ${roundIso(I)}`;
      const same = Math.abs(Math.log2(T / t)) < 0.3 && Math.abs(Math.log2(I / iso)) < 0.3 && Math.abs(A - N) < 0.2;
      const capped = S.stars && maxStar && t > Math.floor(maxStar) + 0.5;
      steps.unshift(["Exposure", `${exposureMsg}${capped ? " But the shutter is too long for sharp stars." : ""} ${same ? `Keep <strong>${fmtShutter(t)} · f/${N} · ISO ${iso}</strong>.` : `Try <strong>${sug}</strong> (now ${fmtShutter(t)} · f/${N} · ISO ${iso}).`}`]);
      settingsKnown = true;
      if (T > 30.5) steps.push(["Long exposure", `${fmtShutter(T)} is longer than the camera's 30 s limit: use <strong>Bulb mode with a remote</strong> or the camera's built-in timer.`]);
      if (!tripod && T > 1 / Math.max(1, (f || 50) * crop) * 1.01) warn.push(`Handheld, ${fmtShutter(T)} will be blurry: put the camera on a tripod or something stable.`);
      if (roundIso(I) >= 12800) warn.push("The ISO is very high: expect strong noise. Use a wider aperture or stack more frames.");
    } else steps.unshift(["Exposure", `${exposureMsg} Fill in shutter, aperture and ISO to get exact settings.`]);

    // 4. gamma dinamica → la scala di esposizioni (bracketing o sequenza manuale)
    const lab = !!window.FC_LAB;
    if (!S.stars && lab) steps.push(["Your exposure ladder", ladderHtml(s, t, N, iso)]);
    if (s.sharp != null && s.sharp < 0.62 && s.edges > 400) warn.push(tripod
      ? "The test shot looks soft: check the focus (zoom in on live view) and use a remote or the 2-second timer."
      : "The test shot looks soft: at this shutter speed the camera probably moved. Use a tripod or a faster shutter.");
    const hiClip = s.clipHi + s.channelClip / 3, loClip = s.clipLo;
    let bracket = null;
    if (hiClip > 0.03 && loClip > 0.08) bracket = [5, 2, "the scene has both strong lights and deep shadows"];
    else if (hiClip > 0.008 && loClip > 0.04) bracket = [3, 2, "the lights are burnt and the shadows are black"];
    else if (hiClip > 0.01) bracket = [2, 2, "the brightest lights are burnt"];
    else if (scene === "sunset" || scene === "city" || scene === "village") bracket = [3, 1.5, "a safety margin for the lights"];
    if (bracket && (S.stars || !lab)) {
      const [n, step, why] = bracket;
      const evs = n === 2 ? ["0", `−${step}`] : Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step).map(v => v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`);
      steps.push(["Bracketing", `Take <strong>${n} shots at ${evs.join(" / ")} EV</strong>: ${why}. Merge them in Lightroom (HDR merge) or blend by hand.`]);
    }

    // 5. rumore → stacking, oppure meno ISO
    const highNoise = (s.noise != null && s.noise >= 3.5) || (iso && iso >= 3200);
    if (S.trails) {
      const tt = Math.min(30, t || 30);
      steps.push(["Star trails", `Shoot continuously at <strong>${fmtShutter(tt)}</strong> with 1 s gaps: <strong>${Math.round(3600 / (tt + 1))} frames</strong> for 1 hour of trails (${Math.round(1800 / (tt + 1))} for 30 minutes). Stack them with StarStaX or Sequator.`]);
    } else if (S.stars) {
      const n = iso >= 6400 || (s.noise != null && s.noise >= 4.5) ? 20 : highNoise ? 12 : 6;
      steps.push(["Stacking", `Take <strong>${n} identical frames</strong> of the sky and stack them (Sequator on Windows, Starry Landscape Stacker on Mac) to cut the noise by about ${Math.round(Math.sqrt(n) * 10) / 10}×.`]);
      steps.push(["Foreground", "Then take <strong>1–3 longer frames for the land</strong> (2–4× the time, lower ISO) and blend them with the sky."]);
    } else if (highNoise && tripod && !settingsKnown) {
      steps.push(["Noise", "On a tripod you don't need high ISO: <strong>lower it to 100–400</strong> and use a longer shutter. If people or cars are moving, take 5–8 frames and stack them instead."]);
    }

    // 6. messa a fuoco
    if (f && N && !S.stars) {
      const c = 0.03 / crop, H = (f * f) / (N * c) / 1000 + f / 1000;
      steps.push(["Focus", `Focus at about <strong>${H < 10 ? H.toFixed(1) : Math.round(H)} m</strong> (hyperfocal distance at ${f} mm f/${N}): everything from ${(H / 2).toFixed(H < 10 ? 1 : 0)} m to infinity will be sharp.`]);
    } else if (S.stars) steps.push(["Focus", "Switch to manual focus, zoom 10× on a bright star in live view and turn the ring until it's a tiny point."]);

    steps.push(["White balance", `Start from <strong>${S.wb}</strong> and shoot RAW so you can fine-tune it later.`]);

    box.hidden = false;
    box.innerHTML = `
      <span class="eyebrow">Your shooting plan · ${S.label}</span>
      <h2>Here's what to do</h2>
      ${warn.length ? `<ul class="shot-warn">${warn.map(w => `<li>${w}</li>`).join("")}</ul>` : ""}
      <ol class="shot-steps">${steps.map(([k, v]) => `<li><b>${k}</b><p>${v}</p></li>`).join("")}</ol>
      <h3>Tips for this scene</h3>
      <ul class="shot-tips">${S.tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      ${lab ? `<button type="button" class="pop-btn shot-coach" id="shotCoach">Start a guided session with this plan <span aria-hidden="true">→</span></button>
      <section class="ai-read" id="aiRead" data-no-i18n>${aiHtml()}</section>` : ""}`;
    lastSettings = { t, N, iso, f, crop, tripod };
    $a("#shotCoach")?.addEventListener("click", () => window.Tools?.openCoach?.({ scene, ladder: lastLadder, settings: { t, N, iso } }));
    wireAi();
  }


  /* ---------- «Read the whole scene»: Gemini (free tier) via the Supabase function «scene-coach» ---------- */
  let lastSettings = {};
  const LG = () => (window.I18N?.lang || "en");
  const T = o => o[LG()] || o.en;
  const TX = {
    title: { en: "Read the whole scene with AI", it: "Fai leggere all'IA l'intera scena", es: "Que la IA lea toda la escena", fr: "Faire lire toute la scène par l'IA", de: "Die ganze Szene von der KI lesen lassen" },
    lead: { en: "The AI looks at your photo — subject, foreground, sky, lights, what moves — and coaches you for this exact scene, the way I'd do it in a workshop.", it: "L'IA guarda la tua foto (soggetto, primo piano, cielo, luci, cosa si muove) e ti consiglia per questa scena precisa, come farei io in un workshop.", es: "La IA mira tu foto (sujeto, primer plano, cielo, luces, lo que se mueve) y te aconseja para esta escena concreta, como lo haría yo en un taller.", fr: "L'IA regarde ta photo (sujet, premier plan, ciel, lumières, ce qui bouge) et te conseille pour cette scène précise, comme je le ferais en workshop.", de: "Die KI betrachtet dein Foto (Motiv, Vordergrund, Himmel, Lichter, Bewegung) und coacht dich für genau diese Szene, wie ich es in einem Workshop tun würde." },
    consent: { en: "Your photo (reduced to 1024 px, without camera data or location) and the measurements are sent to Google Gemini to read the scene. Fabio Costa Ph doesn't keep them. On Google's free service, Google may use what you send to improve its products: don't send photos of people or private places. The AI can be wrong: check on location, and your safety comes first.", it: "La foto (ridotta a 1024 px, senza dati di scatto né posizione) e le misure vengono inviate a Google Gemini per leggere la scena. Fabio Costa Ph non le conserva. Sul servizio gratuito di Google, Google può usare ciò che invii per migliorare i suoi prodotti: non inviare foto di persone o di luoghi privati. L'IA può sbagliare: verifica sul posto, e la tua sicurezza viene prima di tutto.", es: "Tu foto (reducida a 1024 px, sin datos de cámara ni ubicación) y las mediciones se envían a Google Gemini para leer la escena. Fabio Costa Ph no las guarda. En el servicio gratuito de Google, Google puede usar lo que envías para mejorar sus productos: no envíes fotos de personas ni de lugares privados. La IA puede equivocarse: compruébalo en el lugar, y tu seguridad es lo primero.", fr: "Ta photo (réduite à 1024 px, sans données de prise de vue ni position) et les mesures sont envoyées à Google Gemini pour lire la scène. Fabio Costa Ph ne les conserve pas. Sur le service gratuit de Google, Google peut utiliser ce que tu envoies pour améliorer ses produits : n'envoie pas de photos de personnes ni de lieux privés. L'IA peut se tromper : vérifie sur place, et ta sécurité passe avant tout.", de: "Dein Foto (auf 1024 px verkleinert, ohne Kameradaten und Standort) und die Messwerte werden an Google Gemini gesendet, um die Szene zu lesen. Fabio Costa Ph speichert sie nicht. Beim kostenlosen Dienst kann Google das Gesendete zur Verbesserung seiner Produkte nutzen: sende keine Fotos von Personen oder privaten Orten. Die KI kann sich irren: prüfe vor Ort, deine Sicherheit geht vor." },
    go: { en: "Read my scene", it: "Leggi la mia scena", es: "Lee mi escena", fr: "Lis ma scène", de: "Meine Szene lesen" },
    busy: { en: "Looking at the whole scene…", it: "Sto guardando l'intera scena…", es: "Mirando toda la escena…", fr: "Je regarde toute la scène…", de: "Ich sehe mir die ganze Szene an…" },
    sees: { en: "What I see", it: "Cosa vedo", es: "Lo que veo", fr: "Ce que je vois", de: "Was ich sehe" },
    coach: { en: "For this scene", it: "Per questa scena", es: "Para esta escena", fr: "Pour cette scène", de: "Für diese Szene" },
    next: { en: "Next shot", it: "Prossimo scatto", es: "Próxima toma", fr: "Prochaine prise", de: "Nächste Aufnahme" },
    comp: { en: "Composition", it: "Composizione", es: "Composición", fr: "Composition", de: "Bildaufbau" },
    watch: { en: "Watch out", it: "Attenzione", es: "Cuidado", fr: "Attention", de: "Achtung" },
    post: { en: "At home", it: "A casa", es: "En casa", fr: "À la maison", de: "Zu Hause" },
    session: { en: "Start the guided session", it: "Avvia la sessione guidata", es: "Iniciar la sesión guiada", fr: "Lancer la session guidée", de: "Geführte Session starten" },
    ask: { en: "Ask about this shot…", it: "Chiedi qualcosa su questo scatto…", es: "Pregunta sobre esta toma…", fr: "Pose une question sur cette photo…", de: "Frag etwas zu diesem Foto…" },
    send: { en: "Ask", it: "Chiedi", es: "Preguntar", fr: "Demander", de: "Fragen" },
    left: { en: "questions left for this photo", it: "domande rimaste per questa foto", es: "preguntas restantes para esta foto", fr: "questions restantes pour cette photo", de: "Fragen übrig für dieses Foto" },
    again: { en: "Read it again", it: "Rileggi", es: "Leer de nuevo", fr: "Relire", de: "Neu lesen" },
    rows: { kind: { en: "Scene", it: "Scena", es: "Escena", fr: "Scène", de: "Szene" }, subject: { en: "Subject", it: "Soggetto", es: "Sujeto", fr: "Sujet", de: "Motiv" }, foreground: { en: "Foreground", it: "Primo piano", es: "Primer plano", fr: "Premier plan", de: "Vordergrund" }, sky: { en: "Sky", it: "Cielo", es: "Cielo", fr: "Ciel", de: "Himmel" }, light: { en: "Light", it: "Luce", es: "Luz", fr: "Lumière", de: "Licht" }, motion: { en: "Moving", it: "In movimento", es: "En movimiento", fr: "En mouvement", de: "Bewegung" } },
    note: { en: "Read by Google Gemini (free). It can be wrong — trust what you see on location.", it: "Letta da Google Gemini (gratuito). Può sbagliare: fidati di ciò che vedi sul posto.", es: "Leída por Google Gemini (gratis). Puede equivocarse: confía en lo que ves en el lugar.", fr: "Lue par Google Gemini (gratuit). Elle peut se tromper : fie-toi à ce que tu vois sur place.", de: "Gelesen von Google Gemini (kostenlos). Sie kann sich irren – vertrau dem, was du vor Ort siehst." },
    errors: {
      quota: { en: "The free AI has reached today's limit. Try again later — the plan above still works without it.", it: "L'IA gratuita ha raggiunto il limite di oggi. Riprova più tardi: il piano qui sopra funziona anche senza.", es: "La IA gratuita alcanzó el límite de hoy. Inténtalo más tarde: el plan de arriba funciona igual.", fr: "L'IA gratuite a atteint la limite du jour. Réessaie plus tard : le plan ci-dessus fonctionne sans elle.", de: "Die kostenlose KI hat das heutige Limit erreicht. Versuch es später – der Plan oben funktioniert auch ohne." },
      slow: { en: "Too many requests in a few minutes: wait a little and try again.", it: "Troppe richieste in pochi minuti: aspetta un po' e riprova.", es: "Demasiadas solicitudes en pocos minutos: espera un poco y vuelve a intentarlo.", fr: "Trop de demandes en quelques minutes : attends un peu et réessaie.", de: "Zu viele Anfragen in kurzer Zeit: warte kurz und versuch es erneut." },
      off: { en: "The AI reading isn't switched on yet. The plan above works without it.", it: "La lettura con IA non è ancora attiva. Il piano qui sopra funziona anche senza.", es: "La lectura con IA aún no está activa. El plan de arriba funciona igual.", fr: "La lecture par IA n'est pas encore active. Le plan ci-dessus fonctionne sans elle.", de: "Die KI-Lesung ist noch nicht aktiv. Der Plan oben funktioniert auch ohne." },
      net: { en: "No connection to the AI right now (it needs signal). The plan above works offline.", it: "Nessuna connessione con l'IA in questo momento (serve campo). Il piano qui sopra funziona anche offline.", es: "Sin conexión con la IA ahora (necesita cobertura). El plan de arriba funciona sin conexión.", fr: "Pas de connexion à l'IA pour l'instant (il faut du réseau). Le plan ci-dessus marche hors ligne.", de: "Gerade keine Verbindung zur KI (Netz nötig). Der Plan oben funktioniert offline." }
    }
  };
  const TECH_NAME = { city: { en: "City · bracketing", it: "Città · bracketing" }, villageA: { en: "Village · close down, then shorten", it: "Borgo · chiudi, poi accorci" }, villageB: { en: "Village · one aperture", it: "Borgo · diaframma fisso" }, milkyway: { en: "Milky Way", it: "Via Lattea" } };
  const consentOk = () => { try { return localStorage.getItem(AI_CONSENT) === "1"; } catch { return false; } };

  function aiHtml() {
    const e = s => esc(s || "");
    if (readingBusy) return `<span class="eyebrow">${ICON_STAR_AI}${T(TX.title)}</span><p class="ai-busy"><span class="ai-dot"></span>${T(TX.busy)}</p>`;
    if (!reading) return `
      <span class="eyebrow">${ICON_STAR_AI}${T(TX.title)}</span>
      <p class="tool-note">${T(TX.lead)}</p>
      ${consentOk() ? "" : `<p class="ai-consent">${T(TX.consent)}</p>`}
      ${readingErr ? `<p class="gate-note warn">${e(readingErr)}</p>` : ""}
      <button type="button" class="pop-btn ai-go" data-ai="read">${ICON_STAR_AI}${T(TX.go)}</button>`;
    const r = reading, sc = r.scene || {};
    const rows = Object.keys(TX.rows).filter(k => sc[k] && !/^(none|nothing|nulla|niente|—)$/i.test(sc[k])).map(k => `<li><b>${T(TX.rows[k])}</b><span>${e(sc[k])}</span></li>`).join("");
    const tn = TECH_NAME[r.technique];
    return `
      <span class="eyebrow">${ICON_STAR_AI}${T(TX.sees)}</span>
      <p class="ai-sum">${e(r.summary)}</p>
      ${rows ? `<ul class="ai-scene">${rows}</ul>` : ""}
      ${r.settings ? `<p class="ai-next"><small>${T(TX.next)}</small><strong>${e(r.settings)}</strong></p>` : ""}
      ${r.advice?.length ? `<h3>${T(TX.coach)}</h3><ol class="shot-steps ai-advice">${r.advice.map(a => `<li><b>${e(a.title)}</b><p>${e(a.text)}</p></li>`).join("")}</ol>` : ""}
      ${r.composition?.length ? `<h3>${T(TX.comp)}</h3><ul class="shot-tips">${r.composition.map(x => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
      ${r.watch_out?.length ? `<ul class="shot-warn">${r.watch_out.map(x => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
      ${r.post ? `<p class="ai-post"><b>${T(TX.post)}:</b> ${e(r.post)}</p>` : ""}
      ${tn ? `<button type="button" class="pop-btn shot-coach" data-ai="coach">${T(TX.session)}: ${e(LG() === "it" ? tn.it : tn.en)} <span aria-hidden="true">→</span></button>${r.why_technique ? `<p class="gate-help left">${e(r.why_technique)}</p>` : ""}` : ""}
      <div class="ai-chat">
        ${turns.map(t => `<p class="ai-${t.role === "user" ? "q" : "a"}">${e(t.text)}</p>`).join("")}
        ${asked < MAX_Q ? `<form class="ai-ask" data-ai-form><input type="text" maxlength="500" placeholder="${T(TX.ask)}" aria-label="${T(TX.ask)}"><button type="submit" class="pop-btn">${T(TX.send)}</button></form>
        <p class="gate-help left">${MAX_Q - asked} ${T(TX.left)}</p>` : ""}
        ${readingErr ? `<p class="gate-note warn">${e(readingErr)}</p>` : ""}
      </div>
      <p class="tool-foot">${T(TX.note)} <button type="button" class="text-link" data-ai="read">${T(TX.again)}</button></p>`;
  }
  function wireAi() {
    const box = $a("#aiRead"); if (!box || box.dataset.wired) return;
    box.dataset.wired = "1";
    box.addEventListener("click", e => {
      const a = e.target.closest("[data-ai]")?.dataset.ai;
      if (a === "read") readScene();
      if (a === "coach" && reading) window.Tools?.openCoach?.({ scene: scene || reading.category, ladder: lastLadder, settings: lastSettings, tech: reading.technique });
    });
    box.addEventListener("submit", e => { e.preventDefault(); const i = e.target.querySelector("input"); const q = i?.value.trim(); if (q) askScene(q); });
  }
  const redraw = () => { const b = $a("#aiRead"); if (b) b.innerHTML = aiHtml(); };
  function photoB64() {
    const im = img, M = 1024, k = Math.min(1, M / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82).split(",")[1];   // re-encoded: no EXIF, no GPS
  }
  function facts() {
    const v = id => $a(id)?.value || "";
    const S = { t: parseShutter(v("#fShutter")), N: parseFloat(v("#fAperture")) || null, iso: parseFloat(v("#fIso")) || null, f: parseFloat(v("#fFocal")) || null, crop: parseFloat(v("#fCrop")) || 1, tripod: !!$a("#fTripod")?.checked };
    lastSettings = S;
    const s = stats, L = lastLadder, p = window.Tools?.ctx?.place;
    const r2 = x => x == null ? null : Math.round(x * 1000) / 1000;
    const f = { chosen_scene: scene ? SCENES[scene].label : "not chosen",
      settings: { shutter_s: S.t || null, aperture: S.N || null, iso: S.iso || null, focal_mm: S.f || null, crop: S.crop, tripod: S.tripod },
      measured: { burnt_highlights: r2(s.clipHi), black_shadows: r2(s.clipLo), noise: s.noise == null ? null : s.noise < 2.2 ? "low" : s.noise < 4.5 ? "medium" : "high",
        sharpness: s.sharp == null ? null : s.sharp >= 0.8 ? "sharp" : s.sharp >= 0.62 ? "slightly soft" : "soft" },
      local_time: new Date().toTimeString().slice(0, 5) };
    if (L) f.exposure_ladder = L.bracket ? { bracket: L.bracket } : { stops_of_range: Math.round(L.span * 10) / 10, close_then_shorten: (L.A || []).map(x => `f/${x.N} ${fmtShutter(x.t)}`), one_aperture: (L.B || []).map(x => `f/${x.N} ${fmtShutter(x.t)}`) };
    if (p && typeof Astro !== "undefined") { const alt = Astro.sunAlt(Date.now(), p.lat, p.lon); f.sun_altitude_now_deg = Math.round(alt); }
    return f;
  }
  async function call(body) {
    if (typeof SPOTS_CONFIG === "undefined" || !SPOTS_CONFIG.url) throw Object.assign(new Error("off"), { code: "off" });
    let r;
    try {
      r = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/functions/v1/scene-coach`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SPOTS_CONFIG.anonKey, Authorization: `Bearer ${SPOTS_CONFIG.anonKey}` }, body: JSON.stringify(body) });
    } catch { throw Object.assign(new Error("net"), { code: "net" }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || r.status), { code: r.status === 429 ? (j.error === "slow down" ? "slow" : "quota") : r.status === 503 || r.status === 404 ? "off" : "net" });
    return j;
  }
  async function readScene() {
    if (!img || readingBusy) return;
    try { localStorage.setItem(AI_CONSENT, "1"); } catch {}
    readingBusy = true; readingErr = ""; redraw();
    try {
      const j = await call({ image: photoB64(), lang: LG(), facts: facts() });
      reading = j.reading; turns = []; asked = 0;
      window.fcTrack?.("Analyzer: AI scene reading");
      readingBusy = false;
      if (!scene && SCENES[reading.category]) return setScene(reading.category);   // re-renders the plan with the reading
    } catch (err) { readingErr = T(TX.errors[err.code] || TX.errors.net); }
    readingBusy = false; redraw();
  }
  async function askScene(q) {
    if (!reading || readingBusy || asked >= MAX_Q) return;
    const prev = [{ role: "model", text: JSON.stringify(reading).slice(0, 1200) }, ...turns];
    turns.push({ role: "user", text: q }); asked++; readingErr = ""; readingBusy = false; redraw();
    const box = $a("#aiRead .ai-chat"); box?.insertAdjacentHTML("beforeend", `<p class="ai-busy"><span class="ai-dot"></span>${T(TX.busy)}</p>`);
    try {
      const j = await call({ image: photoB64(), lang: LG(), facts: facts(), turns: prev, question: q });
      turns.push({ role: "model", text: j.answer });
    } catch (err) { readingErr = T(TX.errors[err.code] || TX.errors.net); }
    redraw();
    $a("#aiRead .ai-ask input")?.focus();
  }

  /* ---------- riconoscimento della scena con AI gratuita sul dispositivo ---------- */
  async function detectScene() {
    const note = $a("#shotAiNote"), btn = $a("#shotAi");
    if (!img) return;
    btn.disabled = true; note.className = "gate-note";
    note.textContent = aiPipe ? "Looking at your photo…" : "Downloading the AI model (once, then it's saved in your browser)…";
    try {
      if (!aiPipe) {
        const tf = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2");
        aiPipe = await tf.pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", {
          progress_callback: p => { if (p.status === "progress" && p.total) note.textContent = `Downloading the AI model… ${Math.round(p.loaded / p.total * 100)}%`; }
        });
        note.textContent = "Looking at your photo…";
      }
      const keys = Object.keys(AI_PROMPTS);
      const res = await aiPipe($a("#shotImg").src, keys.map(k => AI_PROMPTS[k]));
      const top = res[0], k = keys[keys.map(x => AI_PROMPTS[x]).indexOf(top.label)];
      setScene(k);
      note.textContent = `Looks like: ${SCENES[k].label} (${Math.round(top.score * 100)}% sure). Change it if it's wrong.`;
    } catch (err) {
      console.error(err);
      note.className = "gate-note warn";
      note.textContent = "The automatic detection isn't available on this device. Choose the scene by hand.";
    }
    btn.disabled = false;
  }

  return { show, _test: { readExif, parseShutter, ladder, needs } };
})();
const ICON_STAR_AI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
window.Analyzer = Analyzer;
