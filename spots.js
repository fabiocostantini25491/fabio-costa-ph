/* Fabio Costa Ph — spots.js
   Mappa degli spot riservata ai membri (accesso a invito) + importazione da Google Maps.
   I dati NON stanno su GitHub: sono in un database Supabase protetto da regole di accesso.
   Questo file usa solo l'API pubblica di Supabase via fetch (nessuna libreria esterna). */
"use strict";

/* =========================================================
   CONFIGURAZIONE — da compilare con i dati del progetto Supabase
   (Project Settings → API). La "anon key" è pubblica per natura:
   la protezione vera sono le regole del database.
   ========================================================= */
const SPOTS_CONFIG = {
  url: "https://hfidpbssartkmjlqcqvz.supabase.co",
  anonKey: "sb_publishable_5vB1AGpYjMyh2Kv5TgPD0w_xfFzUdXV",   // chiave pubblica (publishable): la protezione la fanno le regole del database
  showInMenu: false   // false = la voce SPOTS compare nel menu solo a chi ha fatto l'accesso (ora: solo tu)
};

const Spots = (() => {
  const SESSION_KEY = "fcph-session";
  const PAGE_SIZE = 1000;
  const configured = () => !!(SPOTS_CONFIG.url && SPOTS_CONFIG.anonKey);
  const siteUrl = () => location.origin + location.pathname;

  let session = null;       // { access_token, refresh_token, expires_at }
  let spots = [];
  let admin = false;
  let map = null, layer = null, satLabels = null;
  let activeLists = null;   // Set delle liste visibili (null = tutte)
  let query = "";
  let notice = "";          // messaggio da mostrare nella schermata di accesso
  let loaded = false;

  /* ---------- sessione ---------- */
  function updateNav() {
    const link = document.querySelector(".nav-spots");
    if (link) link.hidden = !(configured() && (SPOTS_CONFIG.showInMenu || session));
  }
  function saveSession(s) { session = s; updateNav(); try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {} }
  function loadSession() { try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { session = null; } updateNav(); }
  function jwtEmail(token) {
    try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || ""; } catch { return ""; }
  }

  /* Ritorno dal link ricevuto per email: #access_token=...&refresh_token=... */
  function handleCallback() {
    const h = location.hash.slice(1);
    if (!/(^|&)(access_token|error_description)=/.test(h)) return;
    const p = new URLSearchParams(h);
    if (p.get("access_token")) {
      saveSession({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"),
        expires_at: Date.now() + (parseInt(p.get("expires_in") || "3600", 10) * 1000) });
    } else if (p.get("error_description")) {
      notice = /expired|invalid/i.test(p.get("error_description"))
        ? "This login link has expired or was already used. Ask for a new one below."
        : p.get("error_description").replace(/\+/g, " ");
    }
    history.replaceState(null, "", location.pathname + location.search + "#spots");
  }

  async function api(path, { method = "GET", body, headers = {}, auth = true } = {}) {
    const h = { apikey: SPOTS_CONFIG.anonKey, "Content-Type": "application/json", ...headers };
    if (auth && session) h.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(SPOTS_CONFIG.url.replace(/\/$/, "") + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) { const err = new Error((data && (data.msg || data.message || data.error_description || data.error)) || `HTTP ${res.status}`); err.status = res.status; throw err; }
    return { data, res };
  }

  async function ensureSession() {
    if (!session) return false;
    if (session.expires_at - 60000 > Date.now()) return true;
    try {
      const { data } = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", auth: false, body: { refresh_token: session.refresh_token } });
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
      return true;
    } catch { saveSession(null); notice = "Your session has expired. Please log in again."; return false; }
  }

  /* Accesso con email e password: gli account li crei tu da Supabase (nessuna email da inviare) */
  async function signIn(email, password) {
    const { data } = await api("/auth/v1/token?grant_type=password", { method: "POST", auth: false, body: { email, password } });
    saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
  }
  async function logout() {
    try { await api("/auth/v1/logout", { method: "POST" }); } catch {}
    saveSession(null); spots = []; loaded = false; admin = false;
    render();
  }

  /* ---------- dati ---------- */
  async function fetchSpots() {
    const all = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data } = await api(`/rest/v1/spots?select=id,name,lat,lon,list,note,url&order=list.asc,name.asc`, {
        headers: { "Range-Unit": "items", Range: `${from}-${from + PAGE_SIZE - 1}` }
      });
      all.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return all.filter(s => Number.isFinite(+s.lat) && Number.isFinite(+s.lon)).map(s => ({ ...s, lat: +s.lat, lon: +s.lon, list: s.list || "Spots" }));
  }
  async function checkAdmin() {
    try { const { data } = await api("/rest/v1/rpc/is_admin", { method: "POST", body: {} }); return data === true; } catch { return false; }
  }
  async function upsert(rows, onProgress) {
    for (let i = 0; i < rows.length; i += 400) {
      await api("/rest/v1/spots?on_conflict=source_key", { method: "POST", body: rows.slice(i, i + 400),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
      onProgress?.(Math.min(rows.length, i + 400), rows.length);
    }
  }
  async function removeSpot(id) { await api(`/rest/v1/spots?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); }

  /* ---------- pagina ---------- */
  const root = () => $("#spotsRoot");
  const LIST_COLORS = ["#9cc8ff", "#ffbe7a", "#9fe3c8", "#f7a6c4", "#d2b8ff", "#ffe08a", "#8fd3ff", "#ffa98f"];
  const listColor = name => { const lists = [...new Set(spots.map(s => s.list))].sort(); return LIST_COLORS[Math.max(0, lists.indexOf(name)) % LIST_COLORS.length]; };

  function show() {
    render();
    if (map) setTimeout(() => { map.invalidateSize(); drawClusters(); }, 40);
  }

  async function render() {
    const el = root();
    if (!el) return;
    if (!configured()) {
      el.innerHTML = gateHtml(`<p class="gate-note">The members' map is being set up. Please come back soon.</p>`);
      return;
    }
    if (!(await ensureSession())) { renderGate(); return; }
    if (!loaded) {
      el.innerHTML = gateHtml(`<p class="gate-note">Loading the map…</p>`);
      try {
        [spots, admin] = await Promise.all([fetchSpots(), checkAdmin()]);
        loaded = true;
      } catch (err) {
        if (err.status === 401) { saveSession(null); notice = "Please log in again."; return renderGate(); }
        el.innerHTML = gateHtml(`<p class="gate-note">The map could not be loaded (${esc(err.message)}). Please try again later.</p>`);
        return;
      }
    }
    renderApp();
  }

  function gateHtml(inner) {
    return `<div class="spots-gate">
      <div class="gate-icon" aria-hidden="true">${LOCK_SVG}</div>
      <h2>Members only</h2>
      <p>This map collects every photo spot and point of interest I have saved over the years. Access is by invitation only.</p>
      ${inner}
    </div>`;
  }
  function renderGate() {
    root().innerHTML = gateHtml(`
      ${notice ? `<p class="gate-note warn">${esc(notice)}</p>` : ""}
      <form class="gate-form" id="gateForm" novalidate>
        <label for="gateEmail">Email</label>
        <input id="gateEmail" type="email" autocomplete="username" placeholder="you@example.com" required>
        <label for="gatePassword">Password</label>
        <input id="gatePassword" type="password" autocomplete="current-password" required>
        <button class="outline-link" type="submit" id="gateSend">LOG IN <span aria-hidden="true">→</span></button>
        <p class="gate-note" id="gateMsg" role="status"></p>
        <p class="gate-help">Forgot your password or need access? Contact me and I will help you.</p>
      </form>`);
    $("#gateForm").addEventListener("submit", async e => {
      e.preventDefault();
      const email = $("#gateEmail").value.trim(), password = $("#gatePassword").value, msg = $("#gateMsg"), btn = $("#gateSend");
      msg.className = "gate-note warn";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Please enter a valid email address."; return; }
      if (!password) { msg.textContent = "Please enter your password."; return; }
      btn.disabled = true; msg.className = "gate-note"; msg.textContent = "Logging in…";
      try {
        await signIn(email, password);
        notice = ""; loaded = false;
        render();
      } catch (err) {
        msg.className = "gate-note warn";
        msg.textContent = /invalid|credentials|grant/i.test(err.message) ? "Wrong email or password."
          : /rate|too many|seconds/i.test(err.message) ? "Too many attempts. Please wait a few minutes and try again."
          : `Login failed (${err.message}).`;
        btn.disabled = false;
      }
    });
  }

  function renderApp() {
    const lists = [...new Set(spots.map(s => s.list))].sort((a, b) => a.localeCompare(b));
    if (!activeLists) activeLists = new Set(lists);
    const email = session ? jwtEmail(session.access_token) : "";
    root().innerHTML = `
      <div class="spots-toolbar">
        <div class="spots-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
          <input id="spotsQuery" type="search" placeholder="Search a spot…" value="${esc(query)}" aria-label="Search a spot" autocomplete="off">
        </div>
        <p class="spots-count" id="spotsCount"></p>
        <div class="spots-user">
          ${admin ? `<button class="text-link" type="button" id="spotsImport">${ICON_UPLOAD}Importa da Google Maps</button>` : ""}
          <span class="spots-email">${esc(email)}</span>
          <button class="text-link" type="button" id="spotsLogout">Log out</button>
        </div>
      </div>
      <div class="filters spots-lists" role="group" aria-label="Lists">
        <button class="filter${activeLists.size === lists.length ? " active" : ""}" type="button" data-list="__all">All</button>
        ${lists.map(l => `<button class="filter${activeLists.has(l) && activeLists.size !== lists.length ? " active" : ""}" type="button" data-list="${esc(l)}">
          <span class="list-dot" style="--c:${listColor(l)}"></span>${esc(l)} <small>${spots.filter(s => s.list === l).length}</small></button>`).join("")}
      </div>
      <div class="spots-stage">
        <div id="spotsMap" class="map map-spots" aria-label="Members map of photo spots"></div>
        <span class="hud-frame" aria-hidden="true"></span>
      </div>
      ${spots.length ? "" : `<p class="empty-state">No spots yet.${admin ? " Use «Importa da Google Maps» to add them." : ""}</p>`}`;

    $("#spotsQuery").addEventListener("input", e => { query = e.target.value; drawClusters(); });
    $("#spotsQuery").addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const hits = visibleSpots();
      if (hits.length) map.flyToBounds(L.latLngBounds(hits.map(s => [s.lat, s.lon])).pad(0.2), { maxZoom: 15, duration: 1 });
    });
    $$(".spots-lists [data-list]").forEach(b => b.addEventListener("click", () => {
      const l = b.dataset.list;
      if (l === "__all") activeLists = new Set(lists);
      else if (activeLists.size === lists.length) activeLists = new Set([l]);
      else { activeLists.has(l) ? activeLists.delete(l) : activeLists.add(l); if (!activeLists.size) activeLists = new Set(lists); }
      renderApp();
    }));
    $("#spotsLogout").addEventListener("click", logout);
    $("#spotsImport")?.addEventListener("click", openImport);
    buildMap();
  }

  /* ---------- mappa satellite con raggruppamento ---------- */
  function visibleSpots() {
    const q = norm(query);
    return spots.filter(s => activeLists.has(s.list) && (!q || norm(s.name).includes(q) || norm(s.note).includes(q) || norm(s.list).includes(q)));
  }

  function buildMap() {
    const keep = map && map.getCenter ? { c: map.getCenter(), z: map.getZoom() } : null;
    if (map) { try { map.remove(); } catch {} map = null; }
    map = L.map("spotsMap", { zoomControl: false, minZoom: 2, maxZoom: 19, worldCopyJump: true, zoomSnap: 0.5 });
    L.control.zoom({ position: "topleft", zoomInTitle: "Zoom in", zoomOutTitle: "Zoom out" }).addTo(map);
    map.attributionControl.setPrefix(false);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, maxNativeZoom: 18, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS community" }).addTo(map);
    map.createPane("spotLabels"); map.getPane("spotLabels").style.zIndex = 450; map.getPane("spotLabels").style.pointerEvents = "none";
    satLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, maxNativeZoom: 18, pane: "spotLabels", opacity: .9 }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on("moveend zoomend", drawClusters);
    const pts = visibleSpots().map(s => [s.lat, s.lon]);
    if (keep) map.setView(keep.c, keep.z, { animate: false });
    else if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 12, animate: false });
    else map.setView([42.5, 12.5], 5);
    setTimeout(() => { map.invalidateSize(); drawClusters(); }, 30);
  }

  /* raggruppa gli spot vicini (griglia in pixel), solo quelli nell'area visibile */
  function drawClusters() {
    if (!map || !layer) return;
    layer.clearLayers();
    const list = visibleSpots();
    const count = $("#spotsCount");
    if (count) count.textContent = `${list.length} ${list.length === 1 ? "spot" : "spots"}`;
    const bounds = map.getBounds().pad(0.2), cell = 64, z = map.getZoom();
    const cells = new Map();
    list.forEach(s => {
      if (!bounds.contains([s.lat, s.lon])) return;
      const p = map.latLngToLayerPoint([s.lat, s.lon]);
      const key = z >= 16 ? s.id : `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      (cells.get(key) || cells.set(key, []).get(key)).push(s);
    });
    cells.forEach(group => {
      if (group.length === 1) return addSpotMarker(group[0]);
      const lat = group.reduce((a, s) => a + s.lat, 0) / group.length, lon = group.reduce((a, s) => a + s.lon, 0) / group.length;
      const size = group.length < 10 ? 36 : group.length < 100 ? 44 : 54;
      L.marker([lat, lon], { keyboard: true, title: `${group.length} spots`,
        icon: L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: `<div class="spot-cluster" style="--s:${size}px">${group.length}</div>` }) })
        .addTo(layer)
        .on("click", () => map.flyToBounds(L.latLngBounds(group.map(s => [s.lat, s.lon])).pad(0.3), { maxZoom: Math.min(19, z + 4), duration: .8 }));
    });
  }

  function addSpotMarker(s) {
    const m = L.marker([s.lat, s.lon], { keyboard: true, title: s.name, riseOnHover: true,
      icon: L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], tooltipAnchor: [0, -10],
        html: `<div class="spot-dot" style="--c:${listColor(s.list)}"></div>` }) }).addTo(layer);
    m.bindTooltip(esc(s.name), { direction: "top" });
    m.bindPopup(() => popupHtml(s), { maxWidth: 300, minWidth: 220 });
    m.on("popupopen", e => {
      const el = e.popup.getElement();
      el.querySelector("[data-copy]")?.addEventListener("click", ev => copyText(ev.currentTarget, `${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}`));
      el.querySelector("[data-delete]")?.addEventListener("click", async ev => {
        const b = ev.currentTarget;
        if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Conferma eliminazione"; return; }
        b.disabled = true;
        try { await removeSpot(s.id); spots = spots.filter(x => x.id !== s.id); map.closePopup(); drawClusters(); toast("Spot eliminato."); }
        catch (err) { toast(`Eliminazione non riuscita: ${err.message}`, true); b.disabled = false; }
      });
    });
  }

  function popupHtml(s) {
    const gm = s.url && /^https?:\/\//.test(s.url) ? s.url : `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lon.toFixed(6)}`;
    return `<div class="spot-pop">
      <span class="spot-list"><span class="list-dot" style="--c:${listColor(s.list)}"></span>${esc(s.list)}</span>
      <strong>${esc(s.name)}</strong>
      ${s.note ? `<p>${esc(s.note)}</p>` : ""}
      <p class="spot-coords">${ICON.pin}<span>${fmtCoord(s.lat, s.lon).replace("  |  ", " · ")}</span>
        <button type="button" class="spot-copy" data-copy>Copy</button></p>
      <a class="text-link" href="${esc(gm)}" target="_blank" rel="noopener">${ICON.ext}Open in Google Maps</a>
      ${admin ? `<button type="button" class="spot-delete" data-delete>Elimina spot</button>` : ""}
    </div>`;
  }

  async function copyText(btn, text) {
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
    catch { btn.textContent = text; }
    setTimeout(() => (btn.textContent = "Copy"), 1800);
  }

  /* =========================================================
     IMPORTAZIONE DA GOOGLE MAPS (solo admin)
     ========================================================= */
  let pending = [];   // spot letti dai file, pronti da caricare

  function openImport() {
    let d = $("#importDialog");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "importDialog"; d.className = "import-dialog";
      document.body.appendChild(d);
      d.addEventListener("click", e => { if (e.target === d) d.close(); });
    }
    pending = [];
    d.innerHTML = `
      <button class="dialog-close" type="button" data-close aria-label="Chiudi">${ICON.close}</button>
      <div class="import-body">
        <span class="eyebrow">Solo per te</span>
        <h2>Importa da Google Maps</h2>
        <ol class="import-steps">
          <li><strong>Consigliato (coordinate esatte):</strong> su <em>takeout.google.com</em> esporta «Salvati», importa i file CSV delle liste in <em>Google My Maps</em> (posizione = colonna «Title»), poi dal menu della mappa scegli <em>Esporta in KML/KMZ</em> spuntando «Esporta in un file .KML». Carica qui il file .kml.</li>
          <li><strong>Veloce:</strong> carica direttamente i file <em>.csv</em> delle liste di Takeout (o <em>.json</em>/<em>.geojson</em>). Dove il link contiene le coordinate le uso subito; per gli altri posso cercarle per nome.</li>
        </ol>
        <label class="import-drop" for="importFiles">
          <input id="importFiles" type="file" accept=".kml,.csv,.json,.geojson" multiple>
          <span>Trascina qui i file o <u>sceglili</u> · KML, CSV, JSON</span>
        </label>
        <div id="importSummary"></div>
      </div>`;
    d.querySelector("[data-close]").addEventListener("click", () => d.close());
    const input = d.querySelector("#importFiles"), drop = d.querySelector(".import-drop");
    input.addEventListener("change", () => readFiles(input.files));
    ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => readFiles(e.dataTransfer.files));
    if (!d.open) d.showModal();
  }

  async function readFiles(files) {
    const out = [];
    for (const f of [...files]) {
      const text = await f.text();
      const base = f.name.replace(/\.[^.]+$/, "");
      try {
        if (/\.kml$/i.test(f.name)) out.push(...fromKML(text, base));
        else if (/\.(geo)?json$/i.test(f.name)) out.push(...fromGeoJSON(JSON.parse(text), base));
        else if (/\.csv$/i.test(f.name)) out.push(...fromCSV(text, base));
      } catch (err) { toast(`Non riesco a leggere ${f.name}: ${err.message}`, true); }
    }
    // niente doppioni (stessa chiave)
    const seen = new Map();
    out.forEach(s => seen.set(s.source_key, s));
    pending = [...seen.values()];
    renderSummary();
  }

  function renderSummary() {
    const box = $("#importSummary");
    const ok = pending.filter(s => s.lat != null), missing = pending.filter(s => s.lat == null);
    const byList = {};
    pending.forEach(s => { (byList[s.list] ||= { tot: 0, ok: 0 }).tot++; if (s.lat != null) byList[s.list].ok++; });
    box.innerHTML = !pending.length ? `<p class="gate-note warn">Nessuno spot trovato nei file scelti.</p>` : `
      <table class="import-table"><thead><tr><th>Lista</th><th>Spot</th><th>Con coordinate</th></tr></thead><tbody>
        ${Object.entries(byList).map(([l, v]) => `<tr><td>${esc(l)}</td><td>${v.tot}</td><td>${v.ok}</td></tr>`).join("")}
      </tbody></table>
      <p class="import-totals"><strong>${ok.length}</strong> pronti da caricare${missing.length ? ` · <strong>${missing.length}</strong> senza coordinate` : ""}</p>
      ${missing.length ? `<div class="import-missing">
        <p><strong>Coordinate esatte con Google My Maps (consigliato):</strong> scarica gli spot senza coordinate in
          ${Math.ceil(missing.length / MYMAPS_MAX)} ${Math.ceil(missing.length / MYMAPS_MAX) === 1 ? "file" : "file"} da massimo ${MYMAPS_MAX} righe, importali in My Maps e ricarica qui il KML esportato.</p>
        <button class="outline-link" type="button" id="importMyMaps">SCARICA FILE PER MY MAPS <span aria-hidden="true">↓</span></button>
        <p class="import-or">oppure</p>
        <p>Cerca le coordinate per nome su OpenStreetMap: circa 1 secondo per luogo (~${Math.ceil(missing.length / 60)} min), risultato approssimativo.</p>
        <button class="outline-link" type="button" id="importGeocode">CERCA SU OPENSTREETMAP</button>
        <p class="gate-note" id="geoProgress"></p>
      </div>` : ""}
      <div class="import-actions">
        <button class="outline-link" type="button" id="importUpload" ${ok.length ? "" : "disabled"}>CARICA ${ok.length} SPOT <span aria-hidden="true">→</span></button>
        <p class="gate-note" id="uploadProgress" role="status"></p>
      </div>`;
    $("#importGeocode")?.addEventListener("click", geocodeMissing);
    $("#importMyMaps")?.addEventListener("click", downloadForMyMaps);
    $("#importUpload")?.addEventListener("click", uploadPending);
  }

  /* File CSV per Google My Maps: solo gli spot senza coordinate, a blocchi da 2.000 righe.
     La colonna "List" torna indietro nel KML, così ogni spot rientra nella sua lista. */
  const MYMAPS_MAX = 2000;
  function downloadForMyMaps() {
    const missing = pending.filter(s => s.lat == null);
    const q = v => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    const parts = Math.ceil(missing.length / MYMAPS_MAX);
    for (let i = 0; i < parts; i++) {
      const rows = missing.slice(i * MYMAPS_MAX, (i + 1) * MYMAPS_MAX);
      const csv = "\uFEFFTitle,List,Note,URL\n" + rows.map(s => [s.name, s.list, s.note, s.url].map(q).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `spot-per-mymaps-${i + 1}-di-${parts}.csv`;
      document.body.appendChild(a);
      setTimeout(() => { a.click(); a.remove(); }, i * 400);
    }
    toast(`Scaricati ${parts} file con ${missing.length} spot. Importali in My Maps: ogni file in un livello.`);
  }

  let geocoding = false;
  async function geocodeMissing() {
    if (geocoding) return;
    geocoding = true;
    const btn = $("#importGeocode"), prog = $("#geoProgress");
    btn.disabled = true;
    const missing = pending.filter(s => s.lat == null);
    let found = 0;
    for (let i = 0; i < missing.length; i++) {
      const s = missing[i];
      prog.textContent = `Cerco ${i + 1} di ${missing.length}: ${s.name}…`;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(s.name)}`, { headers: { Accept: "application/json" } });
        const [hit] = r.ok ? await r.json() : [];
        if (hit) { s.lat = +hit.lat; s.lon = +hit.lon; s.note = [s.note, "(posizione approssimativa)"].filter(Boolean).join(" "); found++; }
      } catch {}
      await new Promise(r => setTimeout(r, 1100));   // regola d'uso di OpenStreetMap: max 1 richiesta al secondo
    }
    geocoding = false;
    renderSummary();
    toast(`Trovate le coordinate di ${found} spot su ${missing.length}.`);
  }

  async function uploadPending() {
    const rows = pending.filter(s => s.lat != null).map(({ source_key, name, lat, lon, list, note, url }) =>
      ({ source_key, name: name.slice(0, 300), lat, lon, list: list.slice(0, 120), note: note ? note.slice(0, 2000) : null, url: url || null }));
    const btn = $("#importUpload"), prog = $("#uploadProgress");
    btn.disabled = true;
    try {
      if (!(await ensureSession())) throw new Error("sessione scaduta, rifai l'accesso");
      await upsert(rows, (n, t) => (prog.textContent = `Caricati ${n} di ${t}…`));
      prog.textContent = `Fatto: ${rows.length} spot caricati.`;
      spots = await fetchSpots();
      activeLists = null;
      $("#importDialog").close();
      renderApp();
      toast(`${rows.length} spot importati.`);
    } catch (err) {
      prog.className = "gate-note warn";
      prog.textContent = `Caricamento non riuscito: ${err.message}`;
      btn.disabled = false;
    }
  }

  /* ---------- lettura dei formati ---------- */
  const keyOf = (list, name, url, lat, lon) =>
    norm(`${list}|${url && /maps|goo\.gl/.test(url) ? url : `${name}|${lat != null ? (+lat).toFixed(5) + "," + (+lon).toFixed(5) : ""}`}`).slice(0, 500);

  function coordsFromText(t) {
    if (!t) return null;
    const pats = [/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|ll|query|center|destination)=(-?\d+\.\d+)(?:,|%2C)\s*\+?(-?\d+\.\d+)/i,
      /\/(?:search|place|dir)\/(-?\d+\.\d+)(?:,|%2C)\s*\+?(-?\d+\.\d+)/i, /^\s*(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})\s*$/];
    for (const re of pats) {
      const m = String(t).match(re);
      if (m) { const lat = +m[1], lon = +m[2]; if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) return { lat, lon }; }
    }
    return null;
  }
  const cleanList = l => (l || "Spots").replace(/\.(csv|tsv|xlsx|kml|json|geojson)$/i, "").replace(/\s+/g, " ").trim() || "Spots";
  const make = (list, name, note, url, c) => {
    list = cleanList(list);
    name = (name || "").trim() || (c ? `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}` : "Untitled spot");
    return { list, name, note: (note || "").trim(), url: (url || "").trim(),
      lat: c ? c.lat : null, lon: c ? c.lon : null, source_key: keyOf(list, name, url, c && c.lat, c && c.lon) };
  };

  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  function fromCSV(text, list) {
    const [head, ...rows] = parseCSV(text);
    if (!head) return [];
    const idx = names => head.findIndex(h => names.includes(h.trim().toLowerCase()));
    const iName = idx(["title", "titolo", "name", "nome"]), iNote = idx(["note", "nota", "notes", "description", "descrizione"]),
      iUrl = idx(["url", "google maps url", "link"]), iComment = idx(["comment", "commento"]),
      iLat = idx(["latitude", "latitudine", "lat"]), iLon = idx(["longitude", "longitudine", "lon", "lng"]);
    return rows.map(r => {
      const url = iUrl >= 0 ? r[iUrl] : "", name = iName >= 0 ? r[iName] : "";
      let c = iLat >= 0 && iLon >= 0 && Number.isFinite(parseFloat(r[iLat])) ? { lat: parseFloat(r[iLat]), lon: parseFloat(r[iLon]) } : null;
      c = c || coordsFromText(url) || coordsFromText(name);
      const note = [iNote >= 0 ? r[iNote] : "", iComment >= 0 ? r[iComment] : ""].filter(Boolean).join(" — ");
      return make(list, name, note, url, c);
    }).filter(s => s.name || s.lat != null);
  }
  function fromKML(text, fallbackList) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("file KML non valido");
    const docName = doc.querySelector("Document > name")?.textContent.trim();
    return [...doc.getElementsByTagName("Placemark")].map(pm => {
      const child = tag => [...pm.children].find(c => c.localName === tag);
      const name = child("name")?.textContent || "";
      const desc = (child("description")?.textContent || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\s+\n/g, "\n").trim();
      const data = {};
      [...pm.getElementsByTagName("Data")].forEach(d => (data[(d.getAttribute("name") || "").toLowerCase()] = d.getElementsByTagName("value")[0]?.textContent || ""));
      const coordText = pm.getElementsByTagName("Point")[0]?.getElementsByTagName("coordinates")[0]?.textContent.trim()
        || pm.getElementsByTagName("coordinates")[0]?.textContent.trim().split(/\s+/)[0];
      let c = null;
      if (coordText) { const [lon, lat] = coordText.split(",").map(Number); if (Number.isFinite(lat) && Number.isFinite(lon)) c = { lat, lon }; }
      let folder = pm.parentElement;
      while (folder && folder.localName !== "Folder" && folder.localName !== "Document") folder = folder.parentElement;
      const folderName = folder && folder.localName === "Folder" ? [...folder.children].find(c => c.localName === "name")?.textContent.trim() : "";
      const url = data.url || data["google maps url"] || "";
      const hasData = Object.keys(data).length > 0;   // file di My Maps: le note stanno nelle colonne, la descrizione è solo un riepilogo
      const note = data.note || data.nota || data.comment || (!hasData && desc ? desc : "");
      return make(data.list || data.lista || folderName || docName || fallbackList, name, note, url, c || coordsFromText(url));
    });
  }
  function fromGeoJSON(obj, list) {
    const feats = obj.type === "FeatureCollection" ? obj.features : Array.isArray(obj) ? obj : [obj];
    return feats.map(f => {
      const p = f.properties || {}, g = f.geometry || {};
      let c = g.type === "Point" && Array.isArray(g.coordinates) ? { lon: +g.coordinates[0], lat: +g.coordinates[1] } : null;
      if (c && c.lat === 0 && c.lon === 0) c = null;
      const loc = p.location || p.Location || {};
      const name = p.Title || p.title || p.name || loc.name || loc["Business Name"] || loc.address || loc.Address || "";
      const url = p.google_maps_url || p["Google Maps URL"] || p.url || "";
      return make(list, name, p.Comment || p.comment || p.note || "", url, c || coordsFromText(url));
    });
  }

  return { show, handleCallback, loadSession, parse: { fromCSV, fromKML, fromGeoJSON, coordsFromText } };
})();

const LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3"/></svg>';
const ICON_UPLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>';

/* subito, prima che app.js legga l'indirizzo */
document.querySelector(".nav-spots")?.setAttribute("hidden", "");   // nascosta finché non si sa chi sta guardando
Spots.loadSession();
Spots.handleCallback();
window.Spots = Spots;
