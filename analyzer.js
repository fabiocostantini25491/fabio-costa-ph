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
    return { hist, meanLin: lin / n, clipHi: hi / n, clipLo: lo / n, channelClip: chHi / n, noise: nc > 200 ? nz / nc : null, w, h };
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
      <li><span>Noise in the dark areas</span><strong class="${noise === "High" ? "bad" : ""}">${noise}</strong></li>`;
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

  function plan() {
    const box = $a("#shotPlan");
    if (!stats) return;
    if (!scene) { box.hidden = false; box.innerHTML = `<span class="eyebrow">Your shooting plan</span><p class="tool-note">Choose what you're shooting (step 1) to get your plan.</p>`; return; }
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

    // 4. gamma dinamica → bracketing
    const hiClip = s.clipHi + s.channelClip / 3, loClip = s.clipLo;
    let bracket = null;
    if (hiClip > 0.03 && loClip > 0.08) bracket = [5, 2, "the scene has both strong lights and deep shadows"];
    else if (hiClip > 0.008 && loClip > 0.04) bracket = [3, 2, "the lights are burnt and the shadows are black"];
    else if (hiClip > 0.01) bracket = [2, 2, "the brightest lights are burnt"];
    else if (scene === "sunset" || scene === "city" || scene === "village") bracket = [3, 1.5, "a safety margin for the lights"];
    if (bracket) {
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
      <ul class="shot-tips">${S.tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
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

  return { show, _test: { readExif, parseShutter } };
})();
const ICON_STAR_AI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
window.Analyzer = Analyzer;
