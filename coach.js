/* Fabio Costa Ph — coach.js
   «Field coach»: a workshop in your pocket. A guided session on location, step by step, with Fabio's method
   (the «Shooting cities after dark» guide): checklists, the exposure ladder (from the analyzer or an example),
   countdowns for long exposures and blue hour, voice guidance, a red night mode and the screen kept awake.
   Everything runs on the phone: nothing is sent anywhere. */
"use strict";

const Coach = (() => {
  const it = () => (window.I18N?.lang || "").startsWith("it");
  const L = o => typeof o === "string" ? o : (it() ? o.it : o.en) || o.en;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtT = t => t >= 60 ? `${+(t / 60).toFixed(t % 60 ? 1 : 0)} min` : t >= 1 ? `${Math.round(t)}″` : `1/${Math.round(1 / t)}`;
  const sayT = t => t >= 60 ? L({ en: `${+(t / 60).toFixed(t % 60 ? 1 : 0)} minutes`, it: `${String(+(t / 60).toFixed(t % 60 ? 1 : 0)).replace(".", ",")} minuti` })
    : t >= 1 ? L({ en: `${Math.round(t)} seconds`, it: `${Math.round(t)} secondi` }) : L({ en: `one ${Math.round(1 / t)}th`, it: `un ${Math.round(1 / t)}esimo` });
  const SAVE = "fcph-coach";

  /* ---------- example ladders (from the guide), used when there's no test shot ---------- */
  const EX_A = [[4, 30, "shadows"], [5.6, 30, "lights"], [8, 30, "lights"], [8, 15, "lights"], [8, 8, "lights"], [8, 4, "lights"], [8, 2, "lights"], [8, 1, "lights"], [8, 1 / 2, "highlights"]];
  const EX_B = [[8, 120, "shadows"], [8, 60, "lights"], [8, 30, "lights"], [8, 15, "lights"], [8, 8, "lights"], [8, 4, "lights"], [8, 2, "lights"], [8, 1, "lights"], [8, 1 / 2, "highlights"]];
  const asFrames = a => a.map(([N, t, role]) => ({ N, t, iso: 100, role }));

  /* ---------- the techniques ---------- */
  const SETUP_TRIPOD = [
    { en: "Tripod steady, legs locked, hook or bag weighing it down", it: "Treppiede stabile, gambe bloccate, zaino appeso per appesantirlo" },
    { en: "Stabilisation off (on a tripod it can add blur)", it: "Stabilizzatore spento (sul treppiede può aggiungere mosso)" },
    { en: "RAW, white balance around 3800–4200 K", it: "RAW, bilanciamento del bianco intorno a 3800–4200 K" },
    { en: "Remote release or the Shutter app — hands off the camera", it: "Telecomando o app Shutter: mani lontane dalla fotocamera" },
    { en: "Manual focus, set once and not touched again", it: "Messa a fuoco manuale, impostata una volta e poi non toccata" }
  ];
  const TECH = {
    city: { icon: "🏙", name: { en: "City · bracketing", it: "Città · bracketing" },
      sub: { en: "Aperture Priority, 5 frames, darkest first", it: "Priorità di diaframma, 5 scatti, dal più scuro" } },
    villageA: { icon: "🏘", name: { en: "Far-off village · close down, then shorten", it: "Borgo lontano · chiudi, poi accorci" },
      sub: { en: "Manual: shadows, then f/7–f/8 at 30 s, then shorter", it: "Manuale: ombre, poi f/7–f/8 a 30 s, poi tempi più brevi" } },
    villageB: { icon: "🎯", name: { en: "Far-off village · one aperture", it: "Borgo lontano · diaframma fisso" },
      sub: { en: "Manual: same aperture, only the shutter changes", it: "Manuale: stesso diaframma, cambiano solo i tempi" } },
    milkyway: { icon: "🌌", name: { en: "Milky Way", it: "Via Lattea" },
      sub: { en: "Sharp stars, a stack for the sky, a frame for the land", it: "Stelle nitide, una serie per il cielo, uno scatto per il terreno" } }
  };

  function stepsFor(key, opts) {
    const S = [];
    const ladder = opts.ladder;
    if (key === "city") {
      const br = ladder?.bracket;
      const n = br?.n || 5, step = br?.step || 1.5, c = br ? Math.round(br.shift * 2) / 2 : 0;
      S.push({ kind: "check", title: { en: "Set up", it: "Preparazione" }, items: [...SETUP_TRIPOD,
        { en: "Aperture Priority (A/Av), f/8, base ISO", it: "Priorità di diaframma (A/Av), f/8, ISO base" },
        { en: `AEB: ${n} frames, ${step} EV apart${c ? `, centred ${c > 0 ? "+" : "−"}${Math.abs(c)} EV` : ""}`, it: `AEB: ${n} scatti a ${String(step).replace(".", ",")} EV di distanza${c ? `, centrati a ${c > 0 ? "+" : "−"}${String(Math.abs(c)).replace(".", ",")} EV` : ""}` }],
        say: { en: "Set up the camera: tripod, RAW, remote, Aperture Priority at f 8, bracketing on.", it: "Prepara la fotocamera: treppiede, RAW, telecomando, priorità di diaframma a f 8, bracketing attivo." } });
      S.push({ kind: "info", title: { en: "Compose and take a test shot", it: "Componi e fai uno scatto di prova" },
        text: { en: "Look at the histogram: if the lights are burnt and the shadows black in the same frame, that's what the bracket is for. Need more than 5–7 frames? Switch to the village sequence.", it: "Guarda l'istogramma: se nello stesso scatto le luci bruciano e le ombre sono nere, è proprio il lavoro del bracketing. Servono più di 5–7 scatti? Passa alla sequenza per i borghi." },
        say: { en: "Compose, then take a test shot and check the histogram.", it: "Componi, poi fai uno scatto di prova e controlla l'istogramma." } });
      S.push({ kind: "info", title: { en: "Fire the bracket", it: "Scatta il bracketing" }, big: `${n} × AEB`,
        text: { en: "Darkest frame first, with the remote. Don't touch the tripod until the last frame is done.", it: "Prima lo scatto più scuro, con il telecomando. Non toccare il treppiede finché non è finito l'ultimo scatto." },
        say: { en: `Fire the bracket: ${n} frames, darkest first.`, it: `Scatta il bracketing: ${n} scatti, dal più scuro.` } });
      S.push({ kind: "info", title: { en: "Motion frame", it: "Scatto per il movimento" },
        text: { en: "People, leaves or water moving? One extra frame fast enough to freeze them — you'll use it to patch blurry areas.", it: "Persone, foglie o acqua in movimento? Uno scatto in più abbastanza veloce da congelarle: ti servirà per correggere le zone mosse." },
        say: { en: "If something moves, take one fast frame to freeze it.", it: "Se qualcosa si muove, fai uno scatto veloce per congelarlo." } });
      S.push({ kind: "repeat", title: { en: "Repeat through blue hour", it: "Ripeti durante l'ora blu" }, every: 180,
        text: { en: "The light changes every minute: repeat the bracket every 2–3 minutes and pick the best set at home.", it: "La luce cambia ogni minuto: ripeti il bracketing ogni 2–3 minuti e a casa scegli la serie migliore." },
        say: { en: "Repeat the bracket every few minutes while the sky is blue.", it: "Ripeti il bracketing ogni pochi minuti finché il cielo è blu." } });
    }
    if (key === "villageA" || key === "villageB") {
      const A = key === "villageA";
      const frames = ladder?.[A ? "A" : "B"]?.length ? ladder[A ? "A" : "B"] : asFrames(A ? EX_A : EX_B);
      const fromTest = !!ladder?.[A ? "A" : "B"]?.length;
      S.push({ kind: "check", title: { en: "Set up", it: "Preparazione" }, items: [...SETUP_TRIPOD,
        { en: "Manual mode (M), base ISO, Bulb ready on the remote for frames over 30 s", it: "Modalità manuale (M), ISO base, Bulb pronto sul telecomando per gli scatti oltre i 30 s" },
        A ? { en: "Foreground close to the lens? Then prefer the one-aperture session", it: "Primo piano vicino all'obiettivo? Allora preferisci la sessione a diaframma fisso" }
          : { en: "Set the aperture once (f/8 or what your depth of field needs) and never touch it again", it: "Imposta il diaframma una volta (f/8 o quello che serve alla profondità di campo) e non toccarlo più" }],
        say: { en: "Set up: tripod, RAW, manual mode, base ISO, remote ready.", it: "Preparazione: treppiede, RAW, modalità manuale, ISO base, telecomando pronto." } });
      S.push({ kind: "info", title: fromTest ? { en: "Your sequence, from the test shot", it: "La tua sequenza, dallo scatto di prova" } : { en: "An example sequence", it: "Una sequenza d'esempio" },
        ladder: frames,
        text: fromTest ? { en: "Calculated from your test shot. Adjust as you go: the buttons on each frame add a longer or a shorter one.", it: "Calcolata dal tuo scatto di prova. Correggila strada facendo: i pulsanti di ogni scatto ne aggiungono uno più lungo o più breve." }
          : { en: "Real values depend on the scene: analyze a test shot first for your own sequence, or adjust as you go with the buttons on each frame.", it: "I valori reali dipendono dalla scena: analizza prima uno scatto di prova per avere la tua sequenza, oppure correggi strada facendo con i pulsanti di ogni scatto." },
        say: { en: `${frames.length} frames in this sequence. Let's start with the shadows.`, it: `${frames.length} scatti in questa sequenza. Cominciamo dalle ombre.` } });
      frames.forEach((f, i) => S.push(frameStep(f, i, frames.length, A)));
      if (A) S.push({ kind: "info", title: { en: "Check the glow", it: "Controlla il glow" },
        text: { en: "Zoom in on a lamp: at f/7–f/8 it should be a soft star, not a hard spike. Too harsh? Next time stop at f/7.", it: "Ingrandisci un lampione: a f/7–f/8 deve essere una stella morbida, non una punta dura. Troppo marcata? La prossima volta fermati a f/7." },
        say: { en: "Zoom in on a lamp and check the glow.", it: "Ingrandisci un lampione e controlla il glow." } });
      S.push({ kind: "check", title: { en: "Sky and motion", it: "Cielo e movimento" }, items: [
        { en: "A frame for the sky (stars: 500 rule or NPF for the time)", it: "Uno scatto per il cielo (stelle: regola del 500 o NPF per il tempo)" },
        { en: "A frame for what moves: people, boats, water — fast to freeze, long to smooth", it: "Uno scatto per ciò che si muove: persone, barche, acqua — veloce per congelare, lungo per ammorbidire" }],
        say: { en: "Now a frame for the sky, and one for what moves.", it: "Ora uno scatto per il cielo, e uno per ciò che si muove." } });
    }
    if (key === "milkyway") {
      S.push({ kind: "check", title: { en: "Set up", it: "Preparazione" }, items: [...SETUP_TRIPOD.slice(0, 4),
        { en: "Manual focus on a bright star: live view 10×, a tiny point, then tape the ring", it: "Fuoco manuale su una stella brillante: live view 10×, un puntino, poi blocca la ghiera con il nastro" },
        { en: "Aperture wide open (f/1.8–f/2.8), ISO 3200–6400", it: "Diaframma tutto aperto (f/1.8–f/2.8), ISO 3200–6400" },
        { en: "Shutter under the NPF limit (the analyzer calculates it)", it: "Tempo sotto il limite NPF (lo calcola l'analyzer)" },
        { en: "Long-exposure noise reduction off", it: "Riduzione rumore sulle pose lunghe spenta" }],
        say: { en: "Set up for the Milky Way: focus on a star, wide open, high ISO.", it: "Preparazione per la Via Lattea: fuoco su una stella, diaframma aperto, ISO alti." } });
      S.push({ kind: "repeat", title: { en: "Sky frames for the stack", it: "Scatti del cielo per lo stacking" }, count: 12,
        text: { en: "12 identical frames of the sky, one after the other: stacked at home they cut the noise by about 3.5×.", it: "12 scatti identici del cielo, uno dopo l'altro: uniti a casa riducono il rumore di circa 3,5 volte." },
        say: { en: "Take twelve identical sky frames for the stack.", it: "Fai dodici scatti identici del cielo per lo stacking." } });
      S.push({ kind: "info", title: { en: "A frame for the land", it: "Uno scatto per il terreno" },
        text: { en: "1–3 longer frames for the foreground (2–4× the time, lower ISO). Blend them with the sky later.", it: "1–3 scatti più lunghi per il primo piano (2–4 volte il tempo, ISO più bassi). Li unirai al cielo dopo." },
        say: { en: "Now one or more longer frames for the land.", it: "Ora uno o più scatti più lunghi per il terreno." } });
    }
    S.push({ kind: "done", title: { en: "Done — well shot", it: "Fatto, bel lavoro" },
      text: { en: "Back home: blend the frames (luminosity masks or a manual blend), then dodge & burn. Check your sequence in the guide if something didn't work.", it: "A casa: unisci gli scatti (maschere di luminosità o fusione manuale), poi dodge & burn. Se qualcosa non ha funzionato, ricontrolla la sequenza nella guida." },
      say: { en: "Session done. Well shot.", it: "Sessione finita. Bel lavoro." } });
    return S;
  }
  function frameStep(f, i, n, A) {
    const role = f.role === "shadows" ? { en: "Shadows", it: "Ombre" } : f.role === "highlights" ? { en: "Last lights", it: "Ultime luci" } : { en: "Lights", it: "Luci" };
    const bulb = f.t > 30.5;
    return { kind: "shot", frame: f, title: { en: `Frame ${i + 1} of ${n} · ${role.en}`, it: `Scatto ${i + 1} di ${n} · ${role.it}` },
      text: f.role === "shadows" ? { en: `Expose for the darkest parts${bulb ? " — Bulb with the remote" : ""}. Not enough? Add a longer frame.`, it: `Esponi per le parti più scure${bulb ? ", in Bulb con il telecomando" : ""}. Non basta? Aggiungi uno scatto più lungo.` }
        : A && i <= 2 && f.t >= 30 ? { en: "Close the aperture one step, still at 30 s.", it: "Chiudi il diaframma di uno stop, sempre a 30 s." }
        : { en: "Same aperture, shorter shutter.", it: "Stesso diaframma, tempo più breve." },
      say: { en: `${role.en}: f ${f.N}, ${sayT(f.t)}${f.iso !== 100 ? `, ISO ${f.iso}` : ""}${bulb ? ", in Bulb" : ""}.`, it: `${role.it}: f ${String(f.N).replace(".", ",")}, ${sayT(f.t)}${f.iso !== 100 ? `, ISO ${f.iso}` : ""}${bulb ? ", in Bulb" : ""}.` } };
  }

  /* ---------- state ---------- */
  let ctx = null, rootEl = null, box = null, tech = null, steps = [], idx = 0, opts = {}, done = new Set();
  let voice = true, red = false, wake = null, timer = null, timerEnd = 0, audio = null, tick = null;
  const loadPrefs = () => { try { const p = JSON.parse(localStorage.getItem(SAVE) || "{}"); voice = p.voice !== false; red = !!p.red; } catch {} };
  const savePrefs = () => { try { localStorage.setItem(SAVE, JSON.stringify({ voice, red })); } catch {} };

  function speak(text) {
    if (!voice || !("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = it() ? "it-IT" : "en-GB"; u.rate = 1;
      const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith(it() ? "it" : "en"));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {}
  }
  function beep(n = 2) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      for (let k = 0; k < n; k++) {
        const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + k * 0.28;
        o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + 0.25);
      }
      navigator.vibrate?.([120, 80, 120]);
    } catch {}
  }
  async function keepAwake(on) {
    try {
      if (on && "wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener?.("release", () => { wake = null; }); }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch { wake = null; }
  }
  document.addEventListener("visibilitychange", () => { if (box && document.visibilityState === "visible") keepAwake(true); });

  /* ---------- tonight's light, for the place chosen in the Tools ---------- */
  function lightInfo() {
    const p = ctx?.place;
    if (!p || typeof Astro === "undefined") return null;
    const now = Date.now(), base = new Date(); base.setHours(12, 0, 0, 0);
    const T = Astro.sunTimes(base.getTime(), p.lat, p.lon, [-0.833, -4, -8, -18]);
    const fmt = ms => ms ? new Intl.DateTimeFormat(window.I18N?.locale || "en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms)) : "—";
    const set = T[-0.833]?.set, bStart = T[-4]?.set, bEnd = T[-8]?.set, dark = T[-18]?.set;
    let now_ = "";
    if (bStart && bEnd) {
      if (now < bStart) now_ = L({ en: `Blue hour starts in ${Math.round((bStart - now) / 60000)} min`, it: `L'ora blu inizia tra ${Math.round((bStart - now) / 60000)} min` });
      else if (now < bEnd) now_ = L({ en: `Blue hour now — ${Math.round((bEnd - now) / 60000)} min left`, it: `Ora blu adesso: restano ${Math.round((bEnd - now) / 60000)} min` });
    }
    return { place: p.name || "", set: fmt(set), blue: `${fmt(bStart)}–${fmt(bEnd)}`, dark: fmt(dark), now: now_ };
  }

  /* ---------- the tab: choose a technique ---------- */
  function show(c) {
    ctx = c || ctx;
    rootEl = document.getElementById("coachRoot");
    if (!rootEl) return;
    loadPrefs();
    const li = lightInfo();
    rootEl.innerHTML = `
      <div class="cch-home">
        <article class="tool-card">
          <span class="eyebrow">${L({ en: "Field coach", it: "Coach sul campo" })}</span>
          <h2>${L({ en: "A workshop in your pocket", it: "Un workshop in tasca" })}</h2>
          <p class="tool-note">${L({ en: "Pick what you're shooting and I'll walk you through it, frame by frame, the way I shoot it — with a voice, timers for long exposures and a red screen that won't blind you at night. It all runs on your phone, even without signal.", it: "Scegli cosa stai fotografando e ti accompagno passo per passo, scatto dopo scatto, come scatto io: con la voce, i timer per le pose lunghe e uno schermo rosso che di notte non abbaglia. Funziona tutto sul telefono, anche senza campo." })}</p>
          ${li ? `<p class="cch-light"><b>${esc(li.place)}</b> · ${L({ en: "sunset", it: "tramonto" })} ${li.set} · ${L({ en: "blue hour", it: "ora blu" })} ${li.blue} · ${L({ en: "dark", it: "buio" })} ${li.dark}${li.now ? `<br><strong>${esc(li.now)}</strong>` : ""}</p>`
            : `<p class="cch-light">${L({ en: "Choose a place in Sun & Moon to see tonight's blue hour here.", it: "Scegli un luogo in Sole e Luna per vedere qui l'ora blu di stasera." })}</p>`}
          ${opts.ladder ? `<p class="cch-ladder-note">✓ ${L({ en: "Using the sequence from your test shot", it: "Uso la sequenza del tuo scatto di prova" })}</p>` : ""}
        </article>
        <div class="cch-techs">${Object.entries(TECH).map(([k, t]) => `<button type="button" class="cch-tech" data-tech="${k}"><span class="cch-ic">${t.icon}</span><span><b>${esc(L(t.name))}</b><small>${esc(L(t.sub))}</small></span></button>`).join("")}</div>
        <p class="tool-foot">${L({ en: "Tip: analyze a test shot first (Analyze your shot) to get a sequence calculated for your scene.", it: "Consiglio: analizza prima uno scatto di prova (Analyze your shot) per avere una sequenza calcolata sulla tua scena." })}</p>
      </div>`;
    rootEl.querySelectorAll("[data-tech]").forEach(b => b.addEventListener("click", () => start(b.dataset.tech, opts)));
  }
  // from the analyzer: suggest the technique that fits the ladder
  function fromAnalyzer(o, c) {
    opts = o || {};
    show(c || ctx);
    const L2 = opts.ladder || {};
    const pick = opts.scene === "milkyway" ? "milkyway" : L2.bracket ? "city" : L2.A?.length ? "villageA" : null;
    rootEl?.querySelector(`[data-tech="${pick}"]`)?.classList.add("suggest");
    if (opts.tech && TECH[opts.tech]) start(opts.tech, opts);
  }

  /* ---------- the session ---------- */
  function start(key, o) {
    tech = key; opts = o || opts; steps = stepsFor(key, opts); idx = 0; done = new Set();
    box?.remove();
    box = document.createElement("div");
    box.className = "cch" + (red ? " red" : "");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    document.body.appendChild(box);
    document.documentElement.classList.add("cch-open");
    keepAwake(true);
    box.addEventListener("click", onClick);
    render(true);
    window.fcTrack?.("Coach: session started", { technique: key });
  }
  function close() {
    stopTimer();
    try { speechSynthesis.cancel(); } catch {}
    keepAwake(false);
    box?.remove(); box = null;
    document.documentElement.classList.remove("cch-open");
  }
  const chip = f => `<span class="lad-${f.role}"><small>f/${f.N}${f.iso !== 100 ? ` · ISO ${f.iso}` : ""}</small>${fmtT(f.t)}${f.t > 30.5 ? "<em>Bulb</em>" : ""}</span>`;
  function render(speakIt) {
    const s = steps[idx], n = steps.length, li = lightInfo();
    let body = "";
    if (s.kind === "check") body = `<ul class="cch-check">${s.items.map((x, k) => `<li><label><input type="checkbox" data-ck="${k}"${done.has(`${idx}:${k}`) ? " checked" : ""}><span>${esc(L(x))}</span></label></li>`).join("")}</ul>`;
    if (s.text) body += `<p class="cch-text">${esc(L(s.text))}</p>`;
    if (s.ladder) body += `<div class="lad cch-lad">${s.ladder.map(chip).join("")}</div>`;
    if (s.big) body = `<p class="cch-big">${esc(s.big)}</p>` + body;
    if (s.kind === "shot") {
      const f = s.frame;
      body = `<p class="cch-big">f/${f.N} · ${fmtT(f.t)}${f.iso !== 100 ? ` · ISO ${f.iso}` : ""}</p>${f.t > 30.5 ? `<p class="cch-bulb">Bulb</p>` : ""}` + body;
      if (f.t >= 1) body += `<button type="button" class="cch-timer" data-timer="${f.t}">${timer ? `<span data-left></span>` : L({ en: `Start the ${fmtT(f.t)} countdown`, it: `Avvia il conto alla rovescia di ${fmtT(f.t)}` })}</button>`;
      body += `<div class="cch-adj">${f.role === "shadows" ? `<button type="button" data-adj="longer">${L({ en: "Shadows still black → add a longer frame", it: "Ombre ancora nere → aggiungi uno scatto più lungo" })}</button>` : ""}
        ${f.role === "highlights" ? `<button type="button" data-adj="shorter">${L({ en: "Lights still burnt → add a shorter frame", it: "Luci ancora bruciate → aggiungi uno scatto più breve" })}</button>` : ""}</div>`;
    }
    if (s.kind === "repeat") {
      if (s.every) body += `<button type="button" class="cch-timer" data-timer="${s.every}" data-repeat="1">${L({ en: `Remind me in ${Math.round(s.every / 60)} minutes`, it: `Ricordamelo tra ${Math.round(s.every / 60)} minuti` })}</button>`;
      if (s.count) body += `<p class="cch-count"><button type="button" data-cnt="-1">−</button><b data-cntv>${done.size ? [...done].filter(x => x.startsWith(`${idx}:c`)).length : 0}</b> / ${s.count}<button type="button" data-cnt="1">+</button></p>`;
    }
    box.innerHTML = `
      <header class="cch-bar">
        <button type="button" class="cch-x" data-act="close" aria-label="${L({ en: "Close", it: "Chiudi" })}">✕</button>
        <b>${esc(L(TECH[tech].name))}</b>
        <button type="button" class="cch-tg${voice ? " on" : ""}" data-act="voice" aria-pressed="${voice}" title="${L({ en: "Voice", it: "Voce" })}">🔊</button>
        <button type="button" class="cch-tg${red ? " on" : ""}" data-act="red" aria-pressed="${red}" title="${L({ en: "Night red", it: "Rosso notte" })}">●</button>
      </header>
      ${li?.now ? `<p class="cch-blue">${esc(li.now)}</p>` : ""}
      <div class="cch-prog"><i style="width:${Math.round((idx + 1) / n * 100)}%"></i></div>
      <main class="cch-step">
        <p class="cch-n">${idx + 1} / ${n}</p>
        <h2>${esc(L(s.title))}</h2>
        ${body}
      </main>
      <footer class="cch-nav">
        <button type="button" data-act="prev"${idx === 0 ? " disabled" : ""}>‹ ${L({ en: "Back", it: "Indietro" })}</button>
        <button type="button" data-act="say">${L({ en: "Repeat", it: "Ripeti" })}</button>
        <button type="button" class="cch-next" data-act="${idx === n - 1 ? "close" : "next"}">${idx === n - 1 ? L({ en: "Finish", it: "Fine" }) : L({ en: "Next", it: "Avanti" }) + " ›"}</button>
      </footer>`;
    if (timer) updateTimer();
    if (speakIt) speak(L(s.say || s.title));
  }
  function onClick(e) {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "close") return close();
    if (a === "next" && idx < steps.length - 1) { stopTimer(); idx++; return render(true); }
    if (a === "prev" && idx > 0) { stopTimer(); idx--; return render(true); }
    if (a === "say") return speak(L(steps[idx].say || steps[idx].title));
    if (a === "voice") { voice = !voice; savePrefs(); if (!voice) try { speechSynthesis.cancel(); } catch {} return render(false); }
    if (a === "red") { red = !red; savePrefs(); box.classList.toggle("red", red); return render(false); }
    const ck = e.target.closest("[data-ck]"); if (ck) { const k = `${idx}:${ck.dataset.ck}`; ck.checked ? done.add(k) : done.delete(k); return; }
    const cnt = e.target.closest("[data-cnt]");
    if (cnt) { const have = [...done].filter(x => x.startsWith(`${idx}:c`)).length, want = Math.max(0, have + +cnt.dataset.cnt);
      [...done].filter(x => x.startsWith(`${idx}:c`)).forEach(x => done.delete(x)); for (let k = 0; k < want; k++) done.add(`${idx}:c${k}`);
      box.querySelector("[data-cntv]").textContent = want; if (want === steps[idx].count) { beep(1); speak(L({ en: "That's the full set.", it: "Serie completa." })); } return; }
    const tb = e.target.closest("[data-timer]");
    if (tb) { if (timer) { stopTimer(); return render(false); } return startTimer(+tb.dataset.timer, !!tb.dataset.repeat); }
    const adj = e.target.closest("[data-adj]");
    if (adj) {
      const f = steps[idx].frame, longer = adj.dataset.adj === "longer";
      const nf = { ...f, t: longer ? Math.round(f.t * 2) : f.t / 2, role: f.role };
      steps.splice(idx + 1, 0, frameStep(nf, 0, 0, tech === "villageA"));
      renumber();
      speak(L(longer ? { en: "Added a longer frame for the shadows.", it: "Aggiunto uno scatto più lungo per le ombre." } : { en: "Added a shorter frame for the lights.", it: "Aggiunto uno scatto più breve per le luci." }));
      idx++; return render(true);
    }
  }
  function renumber() {
    const shots = steps.filter(s => s.kind === "shot"), n = shots.length;
    shots.forEach((s, i) => { const f = s.frame, A = tech === "villageA"; Object.assign(s, frameStep(f, i, n, A)); });
  }
  function startTimer(sec, repeat) {
    stopTimer();
    timerEnd = Date.now() + sec * 1000;
    timer = { sec, repeat };
    speak(repeat ? L({ en: `I'll remind you in ${Math.round(sec / 60)} minutes.`, it: `Te lo ricordo tra ${Math.round(sec / 60)} minuti.` }) : L({ en: "Open the shutter now.", it: "Apri l'otturatore adesso." }));
    render(false);
    let said10 = false;
    tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      updateTimer();
      if (!repeat && left === 10 && !said10 && sec > 20) { said10 = true; speak(L({ en: "Ten seconds.", it: "Dieci secondi." })); }
      if (left <= 0) {
        stopTimer(); beep(3);
        speak(repeat ? L({ en: "Time for the next bracket.", it: "È ora del prossimo bracketing." }) : L({ en: "Close the shutter. Done.", it: "Chiudi l'otturatore. Fatto." }));
        render(false);
      }
    }, 250);
  }
  function updateTimer() {
    const el = box?.querySelector("[data-left]"); if (!el) return;
    const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
    el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} · ${L({ en: "tap to stop", it: "tocca per fermare" })}`;
  }
  function stopTimer() { if (tick) clearInterval(tick); tick = null; timer = null; }

  return { show, start, close, fromAnalyzer, _test: { stepsFor } };
})();
window.Coach = Coach;
