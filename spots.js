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
  const COMMUNITY = "Community";   // lista per i posti aggiunti dai membri
  const CATS = {
    spot:       { label: "Photo spots", color: "#9cc8ff",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20V19H4z"/><circle cx="12" cy="13" r="3.4"/></svg>' },
    restaurant: { label: "Food & drink", color: "#ffbe7a",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3v18M4 3v5.5a2.5 2.5 0 0 0 5 0V3M17.5 21V3c-2.2 1.2-3.5 4-3.5 7.5V13h3.5"/></svg>' },
    hotel:      { label: "Stay", color: "#d2b8ff",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v15M21 20v-6.5a3 3 0 0 0-3-3h-7.5V14M3 14h18M3 17.5h18"/><circle cx="7" cy="11.2" r="1.7"/></svg>' },
    workshop:   { label: "Workshops", color: "#9fe3c8",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4M12 12.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z"/></svg>' },
    trekking:   { label: "Trekking", color: "#f7a6c4",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2.5 20 6.5-11 4 6.5 2.5-3.5 6 8z"/><path d="M8 13.5l1.6 1.2M14.5 16l1.5-1"/><circle cx="17" cy="5.5" r="1.8"/></svg>' }
  };
  const CAT_KEYS = Object.keys(CATS);
  const NAME_KEY = "fcph-display-name";
  const jwtClaims = () => { try { return JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return {}; } };
  const myUid = () => (session && jwtClaims().sub) || "";
  function displayName() {
    try { const n = localStorage.getItem(NAME_KEY); if (n) return n; } catch {}
    const e = session ? jwtEmail(session.access_token) : "";
    const base = e.split("@")[0].replace(/[._-]+/g, " ").replace(/\d+/g, "").trim();
    return base ? base.replace(/\b\w/g, c => c.toUpperCase()) : "Member";
  }
  const setDisplayName = n => { try { localStorage.setItem(NAME_KEY, n.slice(0, 60)); } catch {} };
  const configured = () => !!(SPOTS_CONFIG.url && SPOTS_CONFIG.anonKey);
  const siteUrl = () => location.origin + location.pathname;

  let session = null;       // { access_token, refresh_token, expires_at }
  let spots = [];
  let admin = false;
  let map = null, layer = null, satLabels = null, originLayer = null;
  let markerById = new Map(), openId = null;   // marker singoli disegnati ora (per aprire il popup da ricerca/vicini)
  let origin = null;            // { lat, lon, label, kind: "me" | "place", acc } — punto da cui calcolare i vicini
  let placeResults = [], placeTimer = 0, placeSeq = 0, suggestIdx = -1;
  let activeLists = null;   // Set delle liste visibili (null = tutte)
  let activeCats = null;    // Set delle categorie visibili
  let knownLists = new Set();
  let schemaV2 = true;      // false finché non è stato eseguito supabase-community.sql
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
    const cols = "id,source_key,name,lat,lon,list,note,url";
    const all = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let data;
      try {
        ({ data } = await api(`/rest/v1/spots?select=${cols}${schemaV2 ? ",category,starts_on,ends_on,created_by,author_name" : ""}&order=list.asc,name.asc`, {
          headers: { "Range-Unit": "items", Range: `${from}-${from + PAGE_SIZE - 1}` } }));
      } catch (err) {
        // database non ancora aggiornato (colonne nuove assenti): funziona come prima
        if (schemaV2 && err.status === 400 && from === 0) { schemaV2 = false; from -= PAGE_SIZE; continue; }
        throw err;
      }
      all.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    const today = new Date().toISOString().slice(0, 10);
    return all
      .filter(s => Number.isFinite(+s.lat) && Number.isFinite(+s.lon))
      .filter(s => !(s.ends_on || s.starts_on) || (s.ends_on || s.starts_on) >= today)   // eventi finiti: spariscono da soli
      .map(s => ({ ...s, lat: +s.lat, lon: +s.lon, list: s.list || "Spots", category: CATS[s.category] ? s.category : "spot" }));
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
      <p>Photo spots, places to eat and stay, workshops and trails — collected over the years and shared by members. Access is by invitation only.</p>
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
    else lists.forEach(l => { if (!knownLists.has(l)) activeLists.add(l); });   // liste nuove: visibili
    knownLists = new Set(lists);
    if (!activeCats) activeCats = new Set(CAT_KEYS);
    const email = session ? jwtEmail(session.access_token) : "";
    root().innerHTML = `
      <div class="spots-toolbar">
        <div class="spots-search" id="spotsSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
          <input id="spotsQuery" type="search" placeholder="Search a spot or a place…" value="${esc(query)}" aria-label="Search a spot or a place"
            autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="spotsSuggest">
          <button type="button" class="spots-locate" id="spotsLocate" title="Spots near me" aria-label="Find spots near me">${ICON_LOCATE}<span>Near me</span></button>
          <div class="spots-suggest" id="spotsSuggest" role="listbox" hidden></div>
        </div>
        <p class="spots-count" id="spotsCount"></p>
        <div class="spots-user">
          ${schemaV2 || admin ? `<button class="outline-link spots-add" type="button" id="spotsAdd">${ICON_PLUS}Add a place</button>` : ""}
          ${admin ? `<button class="text-link" type="button" id="spotsImport">${ICON_UPLOAD}Importa da Google Maps</button>` : ""}
          <span class="spots-email">${esc(email)}</span>
          <button class="text-link" type="button" id="spotsLogout">Log out</button>
        </div>
      </div>
      ${schemaV2 ? `<div class="filters spots-cats" role="group" aria-label="Categories">
        <button class="filter${activeCats.size === CAT_KEYS.length ? " active" : ""}" type="button" data-cat="__all">Everything</button>
        ${CAT_KEYS.map(k => `<button class="filter cat-filter${activeCats.has(k) && activeCats.size !== CAT_KEYS.length ? " active" : ""}" type="button" data-cat="${k}" style="--c:${CATS[k].color}">
          ${CATS[k].icon}${CATS[k].label} <small>${spots.filter(s => s.category === k).length}</small></button>`).join("")}
      </div>` : ""}
      <div class="filters spots-lists" role="group" aria-label="Lists">
        <button class="filter${activeLists.size === lists.length ? " active" : ""}" type="button" data-list="__all">All</button>
        ${lists.map(l => `<button class="filter${activeLists.has(l) && activeLists.size !== lists.length ? " active" : ""}" type="button" data-list="${esc(l)}">
          ${esc(l)} <small>${spots.filter(s => s.list === l).length}</small></button>`).join("")}
      </div>
      <div class="spots-stage">
        <div id="spotsMap" class="map map-spots" aria-label="Members map of photo spots"></div>
        <span class="hud-frame" aria-hidden="true"></span>
        <section class="spots-near" id="spotsNear" aria-live="polite" hidden></section>
      </div>
      <aside class="spots-disclaimer" role="note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3zm0 6v6m0 3v.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div>
          <strong>Before you go</strong>
          <p>Many of these spots are places I have saved but <em>not visited myself</em>. Locations, access, opening times and conditions may be inaccurate or out of date.
          Always check current information before you go — access rights, private property, permits, local rules, safety and weather.</p>
          <p>The map is shared for inspiration only. You visit any spot entirely at your own risk: Fabio Costantini accepts no responsibility for any injury, damage, loss, fine or other consequence arising from the use of this information.</p>
        </div>
      </aside>
      ${spots.length ? "" : `<p class="empty-state">No spots yet.${admin ? " Use «Importa da Google Maps» to add them." : ""}</p>`}`;

    wireSearch();
    $$(".spots-lists [data-list]").forEach(b => b.addEventListener("click", () => {
      const l = b.dataset.list;
      if (l === "__all") activeLists = new Set(lists);
      else if (activeLists.size === lists.length) activeLists = new Set([l]);
      else { activeLists.has(l) ? activeLists.delete(l) : activeLists.add(l); if (!activeLists.size) activeLists = new Set(lists); }
      renderApp();
    }));
    $$(".spots-cats [data-cat]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.cat;
      if (k === "__all") activeCats = new Set(CAT_KEYS);
      else if (activeCats.size === CAT_KEYS.length) activeCats = new Set([k]);
      else { activeCats.has(k) ? activeCats.delete(k) : activeCats.add(k); if (!activeCats.size) activeCats = new Set(CAT_KEYS); }
      renderApp();
    }));
    $("#spotsLogout").addEventListener("click", logout);
    $("#spotsImport")?.addEventListener("click", openImport);
    $("#spotsAdd")?.addEventListener("click", () => openAdd());
    buildMap();
    if (origin) renderNear();
  }

  /* ---------- ricerca: spot per nome + luoghi (città, laghi, zone) ---------- */
  function wireSearch() {
    const input = $("#spotsQuery"), box = $("#spotsSuggest");
    input.addEventListener("input", () => {
      query = input.value; drawClusters();
      if (origin) renderNear();
      const q = query.trim();
      placeResults = []; clearTimeout(placeTimer);
      if (q.length >= 3) placeTimer = setTimeout(() => searchPlaces(q).then(r => { if (input.value.trim() === q) { placeResults = r; renderSuggest(); } }), 380);
      renderSuggest();
    });
    input.addEventListener("focus", () => { if (input.value.trim()) renderSuggest(); });
    input.addEventListener("keydown", async e => {
      const items = $$("#spotsSuggest [data-i]");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        suggestIdx = (suggestIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((el, i) => el.setAttribute("aria-selected", i === suggestIdx ? "true" : "false"));
        items[suggestIdx].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Escape") { closeSuggest(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (suggestIdx >= 0 && items[suggestIdx]) return items[suggestIdx].click();
        const q = input.value.trim();
        if (!q) return;
        const hits = visibleSpots();
        if (hits.length) { closeSuggest(); return map.flyToBounds(L.latLngBounds(hits.map(s => [s.lat, s.lon])).pad(0.2), { maxZoom: 15, duration: 1 }); }
        const places = placeResults.length ? placeResults : await searchPlaces(q);
        if (places.length) pickPlace(places[0]);
        else toast(`Nothing found for “${q}”.`, true);
      }
    });
    input.addEventListener("search", () => { if (!input.value) { query = ""; drawClusters(); closeSuggest(); if (origin) renderNear(); } });
    box.addEventListener("mousedown", e => e.preventDefault());   // non perdere il focus prima del clic
    if (!wireSearch.doc) { wireSearch.doc = true; document.addEventListener("click", e => { if (!e.target.closest("#spotsSearch")) closeSuggest(); }); }
    $("#spotsLocate").addEventListener("click", locateMe);
  }

  async function searchPlaces(q) {
    const seq = ++placeSeq;
    try {
      const c = map ? map.getCenter() : null;
      const bias = c ? `&lat=${c.lat.toFixed(3)}&lon=${L.Util.wrapNum(c.lng, [-180, 180], true).toFixed(3)}` : "";
      const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5${bias}`);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (seq !== placeSeq) return placeResults;
      return (j.features || []).map(f => {
        const p = f.properties || {}, [lon, lat] = f.geometry.coordinates;
        const ctx = [p.city !== p.name ? p.city : "", p.state, p.country].filter(Boolean);
        return { lat, lon, name: p.name || p.city || p.country || q, context: [...new Set(ctx)].join(", "), extent: p.extent };
      });
    } catch {
      try {   // riserva: OpenStreetMap Nominatim
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "en" } });
        const j = await r.json();
        return j.map(p => ({ lat: +p.lat, lon: +p.lon, name: p.name || p.display_name.split(",")[0], context: p.display_name.split(",").slice(1, 4).join(",").trim(),
          extent: p.boundingbox ? [+p.boundingbox[2], +p.boundingbox[1], +p.boundingbox[3], +p.boundingbox[0]] : null }));
      } catch { return []; }
    }
  }

  function renderSuggest() {
    const box = $("#spotsSuggest"), input = $("#spotsQuery");
    if (!box) return;
    const q = norm(input.value.trim());
    suggestIdx = -1;
    if (!q) return closeSuggest();
    const spotHits = q.length >= 2 ? visibleSpots().slice(0, 6) : [];
    let i = 0, html = "";
    if (spotHits.length) html += `<p class="sg-head">Spots</p>` + spotHits.map(s =>
      `<button type="button" role="option" class="sg-item" data-i="${i++}" data-spot="${s.id}">
        <span class="sg-cat" style="--c:${(CATS[s.category] || CATS.spot).color}">${(CATS[s.category] || CATS.spot).icon}</span><span class="sg-text"><strong>${esc(s.name)}</strong><small>${esc(s.list)}</small></span></button>`).join("");
    if (placeResults.length) html += `<p class="sg-head">Places</p>` + placeResults.map((p, k) =>
      `<button type="button" role="option" class="sg-item" data-i="${i++}" data-place="${k}">
        ${ICON.pin}<span class="sg-text"><strong>${esc(p.name)}</strong><small>${esc(p.context)}</small></span></button>`).join("");
    else if (q.length >= 3) html += `<p class="sg-head sg-wait">Places · searching…</p>`;
    box.innerHTML = html;
    box.hidden = !html;
    input.setAttribute("aria-expanded", html ? "true" : "false");
    box.querySelectorAll("[data-spot]").forEach(b => b.addEventListener("click", () => {
      const s = spots.find(x => String(x.id) === b.dataset.spot);
      if (!s) return;
      input.value = s.name; query = ""; drawClusters(); closeSuggest(); focusSpot(s);
    }));
    box.querySelectorAll("[data-place]").forEach(b => b.addEventListener("click", () => pickPlace(placeResults[+b.dataset.place])));
  }
  function closeSuggest() {
    const box = $("#spotsSuggest");
    if (box) { box.hidden = true; box.innerHTML = ""; }
    $("#spotsQuery")?.setAttribute("aria-expanded", "false");
    suggestIdx = -1;
  }

  function pickPlace(p) {
    if (!p) return;
    const input = $("#spotsQuery");
    input.value = p.name; query = ""; closeSuggest(); input.blur();
    setOrigin({ lat: p.lat, lon: p.lon, label: p.name, kind: "place" }, p.extent);
  }

  function locateMe() {
    const btn = $("#spotsLocate");
    if (!navigator.geolocation) return toast("Your browser can't share its location.", true);
    btn.classList.add("busy"); btn.disabled = true;
    navigator.geolocation.getCurrentPosition(pos => {
      btn.classList.remove("busy"); btn.disabled = false;
      const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
      const input = $("#spotsQuery");
      if (input) input.value = ""; query = ""; drawClusters(); closeSuggest();
      setOrigin({ lat, lon, label: "your position", kind: "me", acc });
    }, err => {
      btn.classList.remove("busy"); btn.disabled = false;
      toast(err.code === 1 ? "Location access was blocked. Allow it in your browser settings and try again." : "Couldn't find your position. Try again in a moment.", true);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function setOrigin(o, extent) {
    origin = o;
    drawOrigin();
    renderNear();
    map.invalidateSize();   // sul telefono il pannello cambia l'altezza della mappa
    const near = nearestSpots(5).filter(n => n.d <= 60);
    if (extent && extent.length === 4 && Math.abs(extent[2] - extent[0]) > 0.05) {
      // area grande (regione, lago, parco): mostra tutta l'area
      map.flyToBounds([[extent[3], extent[0]], [extent[1], extent[2]]], { maxZoom: 13, duration: 1 });
    } else if (near.length) {
      map.flyToBounds(L.latLngBounds([[o.lat, o.lon], ...near.map(n => [n.s.lat, n.s.lon])]).pad(0.25), { maxZoom: 14, duration: 1 });
    } else map.flyTo([o.lat, o.lon], 11, { duration: 1 });
  }

  function drawOrigin() {
    if (!originLayer) return;
    originLayer.clearLayers();
    if (!origin) return;
    if (origin.kind === "me" && origin.acc && origin.acc < 3000)
      L.circle([origin.lat, origin.lon], { radius: origin.acc, color: "#6fb4ff", weight: 1, opacity: .6, fillOpacity: .08, interactive: false }).addTo(originLayer);
    L.marker([origin.lat, origin.lon], { interactive: false, keyboard: false, zIndexOffset: 1000,
      icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11],
        html: `<div class="origin-dot ${origin.kind}"></div>` }) }).addTo(originLayer);
  }

  const distKm = (a, b) => {
    const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const fmtKm = d => d < 1 ? `${Math.round(d * 1000 / 10) * 10} m` : d < 10 ? `${d.toFixed(1)} km` : `${Math.round(d)} km`;
  function nearestSpots(n) {
    if (!origin) return [];
    return visibleSpots().map(s => ({ s, d: distKm(origin, s) })).sort((a, b) => a.d - b.d).slice(0, n);
  }

  function renderNear() {
    const el = $("#spotsNear");
    if (!el) return;
    if (!origin) { el.hidden = true; el.innerHTML = ""; return; }
    const all = visibleSpots().map(s => distKm(origin, s));
    const in10 = all.filter(d => d <= 10).length, in50 = all.filter(d => d <= 50).length;
    const top = nearestSpots(8);
    const where = origin.kind === "me" ? "you" : esc(origin.label);
    el.hidden = false;
    el.innerHTML = `
      <header class="near-head">
        <div><span class="eyebrow">${origin.kind === "me" ? "Near you" : "Near"}</span>
          <h3>${origin.kind === "me" ? "Spots around you" : esc(origin.label)}</h3></div>
        <button type="button" class="near-close" id="nearClose" aria-label="Close">${ICON.close}</button>
      </header>
      <p class="near-sum">${!top.length ? "No spots match the current filters."
        : in50 ? `<strong>${in10}</strong> within 10 km · <strong>${in50}</strong> within 50 km`
        : `No spots within 50 km of ${where}. The nearest is <strong>${fmtKm(top[0].d)}</strong> away.`}</p>
      <ol class="near-list">${top.map(({ s, d }) => `
        <li><button type="button" data-near="${s.id}">
          <span class="sg-cat" style="--c:${(CATS[s.category] || CATS.spot).color}">${(CATS[s.category] || CATS.spot).icon}</span>
          <span class="sg-text"><strong>${esc(s.name)}</strong><small>${esc(s.list)}</small></span>
          <span class="near-d">${fmtKm(d)}</span></button></li>`).join("")}</ol>`;
    el.querySelectorAll("[data-near]").forEach(b => b.addEventListener("click", () => {
      const s = spots.find(x => String(x.id) === b.dataset.near);
      if (s) focusSpot(s);
    }));
    $("#nearClose").addEventListener("click", () => { origin = null; drawOrigin(); renderNear(); map.invalidateSize(); drawClusters(); });
  }

  function focusSpot(s) {
    let done = false;
    const open = () => { if (done) return; const m = markerById.get(s.id); if (m) { done = true; m.openPopup(); } };
    map.once("moveend", () => setTimeout(open, 60));
    map.flyTo([s.lat, s.lon], Math.max(16, map.getZoom()), { duration: .9 });
    setTimeout(open, 1300);
  }

  /* ---------- mappa satellite con raggruppamento ---------- */
  function visibleSpots() {
    const q = norm(query);
    return spots.filter(s => activeLists.has(s.list) && (!activeCats || activeCats.has(s.category))
      && (!q || norm(s.name).includes(q) || norm(s.note).includes(q) || norm(s.list).includes(q) || norm(CATS[s.category].label).includes(q)));
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
    originLayer = L.layerGroup().addTo(map);
    drawOrigin();
    map.on("moveend zoomend", drawClusters);
    if (admin || schemaV2) map.on("contextmenu", e => openAdd({ lat: e.latlng.lat, lon: L.Util.wrapNum(e.latlng.lng, [-180, 180], true) }));
    const pts = visibleSpots().map(s => [s.lat, s.lon]);
    if (keep) map.setView(keep.c, keep.z, { animate: false });
    else if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 12, animate: false });
    else map.setView([42.5, 12.5], 5);
    setTimeout(() => { map.invalidateSize(); drawClusters(); }, 30);
  }

  /* raggruppa gli spot vicini (griglia in pixel), solo quelli nell'area visibile */
  function drawClusters() {
    if (!map || !layer) return;
    // lo spot con la scheda aperta resta sulla mappa (altrimenti la scheda si chiuderebbe a ogni spostamento)
    const keep = openId != null ? markerById.get(openId) : null;
    layer.eachLayer(l => { if (l !== keep) layer.removeLayer(l); });
    markerById = new Map(); if (keep) markerById.set(openId, keep);
    const list = visibleSpots();
    const count = $("#spotsCount");
    if (count) count.textContent = `${list.length} ${list.length === 1 ? "place" : "places"}`;
    const bounds = map.getBounds().pad(0.2), cell = 64, z = map.getZoom();
    const cells = new Map();
    list.forEach(s => {
      if (keep && s.id === openId) return;
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
    const cat = CATS[s.category] || CATS.spot;
    const m = L.marker([s.lat, s.lon], { keyboard: true, title: s.name, riseOnHover: true,
      icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14], tooltipAnchor: [0, -14], popupAnchor: [0, -12],
        html: `<div class="spot-pin" style="--c:${cat.color}">${cat.icon}</div>` }) }).addTo(layer);
    markerById.set(s.id, m);
    m.bindTooltip(esc(s.name), { direction: "top" });
    // la scheda è un nodo creato una sola volta: Leaflet la ridisegna a ogni update() e così non perde foto, recensioni e pulsanti
    let node = null;
    m.bindPopup(() => node || (node = Object.assign(document.createElement("div"), { innerHTML: popupHtml(s) }).firstElementChild),
      { maxWidth: 320, minWidth: 260, className: "spot-popup" });
    m.on("popupopen", e => { openId = s.id; if (!node.dataset.wired) { node.dataset.wired = "1"; wirePopup(e.popup, s); } else if (schemaV2) loadExtras(e.popup, s); });
    m.on("popupclose", () => { if (openId === s.id) { openId = null; setTimeout(drawClusters, 0); } });
  }

  const canEdit = s => admin || (s.created_by && s.created_by === myUid());
  const fmtDay = d => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  function datesText(s) {
    if (!s.starts_on && !s.ends_on) return "";
    if (s.starts_on && s.ends_on && s.starts_on !== s.ends_on) return `${fmtDay(s.starts_on)} – ${fmtDay(s.ends_on)}`;
    return fmtDay(s.starts_on || s.ends_on);
  }

  function popupHtml(s) {
    const cat = CATS[s.category] || CATS.spot;
    const gm = s.url && /^https?:\/\//.test(s.url) ? s.url : `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lon.toFixed(6)}`;
    const dates = datesText(s);
    return `<div class="spot-pop">
      <span class="spot-cat" style="--c:${cat.color}">${cat.icon}${cat.label}<em>${esc(s.list)}</em></span>
      <strong>${esc(s.name)}</strong>
      <p class="pop-rating" data-rating hidden></p>
      ${dates ? `<p class="pop-dates">${ICON.cal}<span>${dates}</span></p>` : ""}
      ${s.note ? `<p class="pop-desc">${esc(s.note)}</p>` : ""}
      ${schemaV2 ? `<div class="pop-photos" data-photos></div>` : ""}
      <p class="spot-coords">${ICON.pin}<span>${fmtCoord(s.lat, s.lon).replace("  |  ", " · ")}</span>
        <button type="button" class="spot-copy" data-copy>Copy</button></p>
      <a class="text-link" href="${esc(gm)}" target="_blank" rel="noopener">${ICON.ext}Open in Google Maps</a>
      ${schemaV2 ? `<div class="pop-actions">
          <button type="button" class="pop-btn" data-addphoto>${ICON.img}Add photo</button>
          <button type="button" class="pop-btn" data-review>${ICON_STAR}Review</button>
          <input type="file" accept="image/*" multiple hidden data-photofile>
        </div>
        <form class="pop-review" data-reviewform hidden>
          <div class="stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n =>
            `<button type="button" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? "s" : ""}" data-star="${n}">★</button>`).join("")}</div>
          <textarea rows="3" maxlength="2000" placeholder="What is it like? Tips for others…" aria-label="Your review"></textarea>
          <button type="submit" class="pop-btn primary">Post review</button>
        </form>
        <div class="pop-reviews" data-reviews></div>` : ""}
      ${s.author_name ? `<p class="pop-author">Added by ${esc(s.author_name)}</p>` : ""}
      ${canEdit(s) ? `<button type="button" class="spot-delete" data-delete>Delete</button>` : ""}
    </div>`;
  }

  async function wirePopup(popup, s) {
    const el = popup.getElement();
    el.querySelector("[data-copy]")?.addEventListener("click", ev => copyText(ev.currentTarget, `${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}`));
    el.querySelector("[data-delete]")?.addEventListener("click", async ev => {
      const b = ev.currentTarget;
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm delete"; return; }
      b.disabled = true;
      try { await removeSpot(s.id); spots = spots.filter(x => x.id !== s.id); map.closePopup(); drawClusters(); toast("Place deleted."); }
      catch (err) { toast(`Could not delete: ${err.message}`, true); b.disabled = false; }
    });
    if (!schemaV2) return;
    const fileIn = el.querySelector("[data-photofile]");
    el.querySelector("[data-addphoto]").addEventListener("click", () => fileIn.click());
    fileIn.addEventListener("change", async () => {
      const files = [...fileIn.files].slice(0, 4);
      fileIn.value = "";
      if (!files.length) return;
      const box = el.querySelector("[data-photos]");
      box.insertAdjacentHTML("beforeend", `<span class="pop-uploading">Uploading ${files.length} photo${files.length > 1 ? "s" : ""}…</span>`);
      try { for (const f of files) await uploadPhoto(s.id, f); toast("Photo added."); }
      catch (err) { toast(`Upload failed: ${err.message}`, true); }
      loadExtras(popup, s);
    });
    const form = el.querySelector("[data-reviewform]");
    el.querySelector("[data-review]").addEventListener("click", () => { form.hidden = !form.hidden; popup.update(); if (!form.hidden) form.querySelector("textarea").focus(); });
    let rating = 0;
    const paint = () => form.querySelectorAll("[data-star]").forEach(b => { const on = +b.dataset.star <= rating; b.classList.toggle("on", on); b.setAttribute("aria-checked", +b.dataset.star === rating ? "true" : "false"); });
    form.querySelectorAll("[data-star]").forEach(b => b.addEventListener("click", () => { rating = +b.dataset.star === rating ? 0 : +b.dataset.star; paint(); }));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const body = form.querySelector("textarea").value.trim(), btn = form.querySelector("[type=submit]");
      if (!rating && !body) { form.querySelector("textarea").focus(); return; }
      btn.disabled = true;
      try {
        await api("/rest/v1/spot_reviews?on_conflict=spot_id,user_id", { method: "POST",
          body: { spot_id: s.id, rating: rating || null, body: body || null, author_name: displayName() },
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
        form.hidden = true; toast("Thanks for your review!");
        loadExtras(popup, s);
      } catch (err) { toast(`Could not post: ${err.message}`, true); }
      btn.disabled = false;
    });
    form._setMine = r => { rating = r?.rating || 0; form.querySelector("textarea").value = r?.body || ""; paint(); };
    loadExtras(popup, s);
  }

  async function loadExtras(popup, s) {
    const el = popup.getElement();
    if (!el) return;
    try {
      const [{ data: photos }, { data: reviews }] = await Promise.all([
        api(`/rest/v1/spot_photos?select=id,path,user_id,author_name&spot_id=eq.${s.id}&order=created_at.desc`),
        api(`/rest/v1/spot_reviews?select=id,user_id,author_name,rating,body,created_at&spot_id=eq.${s.id}&order=created_at.desc`)
      ]);
      const urls = photos.length ? await signPhotos(photos.map(p => p.path)) : {};
      const pbox = el.querySelector("[data-photos]");
      pbox.innerHTML = photos.map((p, i) => urls[p.path] ? `<button type="button" class="pop-thumb" data-photo="${i}" aria-label="Open photo ${i + 1}">
        <img src="${esc(urls[p.path])}" alt="" loading="lazy"></button>` : "").join("");
      pbox.querySelectorAll("[data-photo]").forEach(b => b.addEventListener("click", () => openPhotos(photos, urls, +b.dataset.photo, s)));
      const rated = reviews.filter(r => r.rating);
      const rbox = el.querySelector("[data-rating]");
      if (rated.length) {
        const avg = rated.reduce((a, r) => a + r.rating, 0) / rated.length;
        rbox.hidden = false;
        rbox.innerHTML = `<span class="stars-static" style="--v:${(avg / 5 * 100).toFixed(0)}%">★★★★★</span> <strong>${avg.toFixed(1)}</strong> · ${rated.length} review${rated.length > 1 ? "s" : ""}`;
      } else rbox.hidden = true;
      const uid = myUid();
      el.querySelector("[data-reviews]").innerHTML = reviews.map(r => `<div class="pop-rev">
        <p class="rev-head">${r.rating ? `<span class="rev-stars">${"★".repeat(r.rating)}<i>${"★".repeat(5 - r.rating)}</i></span>` : ""}
          <b>${esc(r.author_name || "Member")}</b><time>${fmtDay(r.created_at.slice(0, 10))}</time>
          ${r.user_id === uid || admin ? `<button type="button" class="rev-del" data-delrev="${r.id}" aria-label="Delete review">${ICON.close}</button>` : ""}</p>
        ${r.body ? `<p>${esc(r.body)}</p>` : ""}</div>`).join("");
      el.querySelectorAll("[data-delrev]").forEach(b => b.addEventListener("click", async () => {
        try { await api(`/rest/v1/spot_reviews?id=eq.${b.dataset.delrev}`, { method: "DELETE" }); loadExtras(popup, s); }
        catch (err) { toast(`Could not delete: ${err.message}`, true); }
      }));
      const mine = reviews.find(r => r.user_id === uid);
      const form = el.querySelector("[data-reviewform]");
      form?._setMine?.(mine);
      const rb = el.querySelector("[data-review]");
      if (rb) rb.lastChild.textContent = mine ? "Edit review" : "Review";
      popup.update();
    } catch { /* foto e recensioni non disponibili: la scheda resta comunque utile */ }
  }

  /* ---------- foto ---------- */
  async function signPhotos(paths) {
    const { data } = await api("/storage/v1/object/sign/spot-photos", { method: "POST", body: { expiresIn: 3600, paths } });
    const out = {};
    (data || []).forEach(x => { if (x.signedURL) out[x.path] = SPOTS_CONFIG.url.replace(/\/$/, "") + "/storage/v1" + x.signedURL; });
    return out;
  }
  function resizeImage(file, max = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error("could not read the image")), "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("this file is not an image")); };
      img.src = url;
    });
  }
  async function uploadPhoto(spotId, file) {
    if (!(await ensureSession())) throw new Error("please log in again");
    const blob = await resizeImage(file);
    const path = `${myUid()}/${spotId}-${crypto.randomUUID()}.jpg`;
    const res = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/storage/v1/object/spot-photos/${path}`, {
      method: "POST", body: blob,
      headers: { apikey: SPOTS_CONFIG.anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "image/jpeg", "x-upsert": "false" } });
    if (!res.ok) { let m = `HTTP ${res.status}`; try { const j = await res.json(); m = j.message || j.error || m; } catch {} throw new Error(m); }
    await api("/rest/v1/spot_photos", { method: "POST", body: { spot_id: spotId, path, author_name: displayName() }, headers: { Prefer: "return=minimal" } });
  }
  function openPhotos(photos, urls, start, s) {
    let i = start, d = $("#photoDialog");
    if (!d) {
      d = document.createElement("dialog"); d.id = "photoDialog"; d.className = "photo-dialog";
      document.body.appendChild(d);
      d.addEventListener("click", e => { if (e.target === d) d.close(); });
    }
    const list = photos.filter(p => urls[p.path]);
    const draw = () => {
      const p = list[i];
      d.innerHTML = `<button class="dialog-close" type="button" data-close aria-label="Close">${ICON.close}</button>
        <img src="${esc(urls[p.path])}" alt="Photo of ${esc(s.name)}">
        <p class="photo-meta"><span>${esc(s.name)}${p.author_name ? ` · by ${esc(p.author_name)}` : ""}</span>
          ${list.length > 1 ? `<span class="photo-nav"><button type="button" data-prev aria-label="Previous photo">${ICON.prev}</button>${i + 1} / ${list.length}<button type="button" data-next aria-label="Next photo">${ICON.next}</button></span>` : ""}
          ${p.user_id === myUid() || admin ? `<button type="button" class="spot-delete" data-delphoto>Delete photo</button>` : ""}</p>`;
      d.querySelector("[data-close]").onclick = () => d.close();
      d.querySelector("[data-prev]")?.addEventListener("click", () => { i = (i - 1 + list.length) % list.length; draw(); });
      d.querySelector("[data-next]")?.addEventListener("click", () => { i = (i + 1) % list.length; draw(); });
      d.querySelector("[data-delphoto]")?.addEventListener("click", async ev => {
        const b = ev.currentTarget;
        if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm delete"; return; }
        try {
          await api(`/rest/v1/spot_photos?id=eq.${p.id}`, { method: "DELETE" });
          try { await api(`/storage/v1/object/spot-photos/${p.path}`, { method: "DELETE" }); } catch {}
          d.close(); toast("Photo deleted.");
          const m = markerById.get(s.id); if (m?.isPopupOpen()) loadExtras(m.getPopup(), s);
        } catch (err) { toast(`Could not delete: ${err.message}`, true); }
      });
    };
    draw();
    if (!d.open) d.showModal();
  }

  async function copyText(btn, text) {
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
    catch { btn.textContent = text; }
    setTimeout(() => (btn.textContent = "Copy"), 1800);
  }

  /* =========================================================
     IMPORTAZIONE DA GOOGLE MAPS (solo admin)
     ========================================================= */
  /* ---------- aggiunta rapida di uno spot (solo admin) ---------- */
  function parseCoordsInput(t) {
    t = String(t || "").trim();
    const c = coordsFromText(t);
    if (c) return c;
    const m = t.replace(/[°]/g, "").match(/^\s*(-?\d{1,2}(?:[.]\d+)?)\s*([NS])?\s*[,;\s]\s*(-?\d{1,3}(?:[.]\d+)?)\s*([EOW])?\s*$/i);
    if (!m) return null;
    let lat = +m[1], lon = +m[3];
    if (/s/i.test(m[2] || "")) lat = -Math.abs(lat);
    if (/w/i.test(m[4] || "")) lon = -Math.abs(lon);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  }

  function openAdd(pre) {
    let d = $("#addDialog");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "addDialog"; d.className = "import-dialog add-dialog";
      document.body.appendChild(d);
      d.addEventListener("click", e => { if (e.target === d) d.close(); });
    }
    const lists = [...new Set(spots.map(s => s.list))].sort((a, b) => a.localeCompare(b));
    const lastList = (() => { try { return localStorage.getItem("fcph-last-list") || ""; } catch { return ""; } })();
    const lastCat = (() => { try { return localStorage.getItem("fcph-last-cat") || "spot"; } catch { return "spot"; } })();
    const c0 = pre ? `${pre.lat.toFixed(6)}, ${pre.lon.toFixed(6)}` : "";
    d.innerHTML = `
      <button class="dialog-close" type="button" data-close aria-label="Close">${ICON.close}</button>
      <form class="import-body gate-form add-form" novalidate>
        <span class="eyebrow">Share with members</span>
        <h2>Add a place</h2>
        ${schemaV2 ? `<fieldset class="cat-pick"><legend>Category</legend>
          ${CAT_KEYS.map(k => `<label class="cat-opt" style="--c:${CATS[k].color}">
            <input type="radio" name="addCat" value="${k}"${k === lastCat ? " checked" : ""}>${CATS[k].icon}<span>${CATS[k].label}</span></label>`).join("")}
        </fieldset>` : ""}
        <label for="addName">Name</label>
        <input id="addName" type="text" maxlength="300" placeholder="e.g. Capo Testa lighthouse" required>
        <label for="addCoords">Coordinates or Google Maps link</label>
        <div class="gkey-row">
          <input id="addCoords" type="text" inputmode="text" placeholder="41.902782, 12.496366" value="${esc(c0)}" autocomplete="off" required>
          <button class="text-link" type="button" id="addPaste">Paste</button>
        </div>
        <p class="gate-note" id="addCoordsNote" role="status"></p>
        <p class="gate-help left">In Google Maps, press and hold on the place, then tap the coordinates to copy them. On this map you can also right-click (or press and hold) on the exact point.</p>
        ${schemaV2 ? `<div class="add-dates" id="addDates" hidden>
          <div><label for="addFrom">From</label><input id="addFrom" type="date"></div>
          <div><label for="addTo">To</label><input id="addTo" type="date"></div>
          <p class="gate-help left">The workshop disappears from the map by itself once it's over.</p>
        </div>` : ""}
        <label for="addNote">Description <small>(optional)</small></label>
        <textarea id="addNote" maxlength="2000" rows="3" placeholder="What makes it worth it? Best time, access, tips…"></textarea>
        ${schemaV2 ? `<label for="addPhotos">Photos <small>(optional, up to 4)</small></label>
          <input id="addPhotos" type="file" accept="image/*" multiple>
          <label for="addAuthor">Your name <small>(shown to members)</small></label>
          <input id="addAuthor" type="text" maxlength="60" value="${esc(displayName())}" autocomplete="nickname">` : ""}
        ${admin ? `<label for="addList">Lista <small>(solo tu)</small></label>
          <input id="addList" type="text" maxlength="120" list="addLists" value="${esc(lastList || COMMUNITY)}" autocomplete="off">
          <datalist id="addLists">${lists.map(l => `<option value="${esc(l)}">`).join("")}</datalist>` : ""}
        <button class="outline-link" type="submit" id="addSave">SAVE PLACE <span aria-hidden="true">→</span></button>
        <p class="gate-note" id="addStatus" role="status"></p>
      </form>`;
    const f = d.querySelector("form"), ci = d.querySelector("#addCoords"), note = d.querySelector("#addCoordsNote");
    const catVal = () => d.querySelector("[name=addCat]:checked")?.value || "spot";
    const syncCat = () => { const box = d.querySelector("#addDates"); if (box) box.hidden = catVal() !== "workshop"; };
    d.querySelectorAll("[name=addCat]").forEach(r => r.addEventListener("change", syncCat)); syncCat();
    const check = () => {
      const c = parseCoordsInput(ci.value);
      note.className = "gate-note" + (ci.value && !c ? " warn" : "");
      note.textContent = c ? `📍 ${fmtCoord(c.lat, c.lon).replace("  |  ", " · ")}`
        : ci.value ? (/goo\.gl|maps\.app/.test(ci.value) ? "Short share links (maps.app.goo.gl) don't contain the coordinates: copy the coordinates instead." : "Coordinates not recognised. Format: 41.902782, 12.496366") : "";
      return c;
    };
    ci.addEventListener("input", check); check();
    d.querySelector("#addPaste").addEventListener("click", async () => {
      try { ci.value = (await navigator.clipboard.readText()).trim(); check(); d.querySelector("#addName").focus(); }
      catch { ci.focus(); toast("Your browser doesn't allow pasting here: use Ctrl+V.", true); }
    });
    d.querySelector("[data-close]").addEventListener("click", () => d.close());
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const status = d.querySelector("#addStatus"), btn = d.querySelector("#addSave");
      const warn = (msg, el) => { status.className = "gate-note warn"; status.textContent = msg; el?.focus(); };
      const name = d.querySelector("#addName").value.trim(), c = check();
      if (!name) return warn("Give the place a name.", d.querySelector("#addName"));
      if (!c) return warn("Add the coordinates or a full Google Maps link.", ci);
      const cat = catVal();
      const from = d.querySelector("#addFrom")?.value || null, to = d.querySelector("#addTo")?.value || null;
      if (cat === "workshop" && from && to && to < from) return warn("The end date is before the start date.", d.querySelector("#addTo"));
      const author = d.querySelector("#addAuthor")?.value.trim() || "";
      if (author) setDisplayName(author);
      const raw = ci.value.trim(), url = /^https?:\/\//.test(raw) ? raw : "";
      const list = cleanList(d.querySelector("#addList")?.value || COMMUNITY);
      const row = { source_key: `u:${crypto.randomUUID()}`, name: name.slice(0, 300), lat: c.lat, lon: c.lon, list,
        note: d.querySelector("#addNote").value.trim() || null, url: url || null };
      if (schemaV2) Object.assign(row, { category: cat, starts_on: cat === "workshop" ? from : null, ends_on: cat === "workshop" ? (to || from) : null, author_name: author || displayName() });
      const files = [...(d.querySelector("#addPhotos")?.files || [])].slice(0, 4);
      btn.disabled = true; status.className = "gate-note"; status.textContent = "Saving…";
      try {
        if (!(await ensureSession())) throw new Error("please log in again");
        const { data } = await api("/rest/v1/spots", { method: "POST", body: row, headers: { Prefer: "return=representation" } });
        const saved = Array.isArray(data) ? data[0] : data;
        let photoErr = "";
        for (let i = 0; i < files.length; i++) {
          status.textContent = `Uploading photo ${i + 1} of ${files.length}…`;
          try { await uploadPhoto(saved.id, files[i]); } catch (err) { photoErr = err.message; }
        }
        try { localStorage.setItem("fcph-last-list", list); localStorage.setItem("fcph-last-cat", cat); } catch {}
        spots = await fetchSpots();
        if (activeLists) activeLists.add(list);
        if (activeCats) activeCats.add(cat);
        d.close();
        renderApp();
        const s = spots.find(x => x.id === saved.id);
        if (s) focusSpot(s); else map.flyTo([row.lat, row.lon], 16, { duration: 1 });
        toast(photoErr ? `Place saved, but a photo failed: ${photoErr}` : `«${row.name}» added to the map.`, !!photoErr);
      } catch (err) {
        warn(/row-level|policy|permission/i.test(err.message) ? "Your account can't add places yet." : `Could not save: ${err.message}`);
        btn.disabled = false;
      }
    });
    if (!d.open) d.showModal();
    d.querySelector("#addName").focus();
  }

  let alreadyThere = 0;  // spot dei file già presenti sulla mappa
  let pending = [];   // spot letti dai file, pronti da caricare

  function openImport() {
    let d = $("#importDialog");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "importDialog"; d.className = "import-dialog";
      document.body.appendChild(d);
      d.addEventListener("click", e => { if (e.target === d) d.close(); });
    }
    pending = []; alreadyThere = 0;
    d.innerHTML = `
      <button class="dialog-close" type="button" data-close aria-label="Chiudi">${ICON.close}</button>
      <div class="import-body">
        <span class="eyebrow">Solo per te</span>
        <h2>Importa da Google Maps</h2>
        <ol class="import-steps">
          <li>Su <em>takeout.google.com</em> esporta solo <strong>«Salvati»</strong> e prendi i file <em>.csv</em> delle liste (cartella Takeout → Salvati).</li>
          <li>Trascinali qui sotto. Ogni link di Google contiene il codice del luogo: lo trasformo nel suo <strong>Place ID</strong>.</li>
          <li>Con la tua <strong>chiave API di Google Maps</strong> chiedo a Google le coordinate esatte di ogni luogo, poi premi <strong>Carica</strong>.</li>
        </ol>
        <label class="import-drop" for="importFiles">
          <input id="importFiles" type="file" accept=".kml,.kmz,.csv,.json,.geojson,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" multiple>
          <span>Trascina qui i file o <u>sceglili</u> · KML, KMZ, CSV, JSON</span>
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

  /* Legge un .kmz (zip) e restituisce il testo del primo .kml contenuto */
  async function kmlFromKmz(file) {
    const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
    for (let i = 0; i + 30 < buf.length; ) {
      if (dv.getUint32(i, true) !== 0x04034b50) break;                 // intestazione di un file nello zip
      const method = dv.getUint16(i + 8, true), size = dv.getUint32(i + 18, true);
      const nameLen = dv.getUint16(i + 26, true), extraLen = dv.getUint16(i + 28, true);
      const name = new TextDecoder().decode(buf.subarray(i + 30, i + 30 + nameLen));
      const start = i + 30 + nameLen + extraLen, data = buf.subarray(start, start + size);
      if (/\.kml$/i.test(name)) {
        if (method === 0) return new TextDecoder().decode(data);
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(stream).text();
      }
      i = start + size;
    }
    throw new Error("nessun file KML dentro il KMZ");
  }

  async function readFiles(files) {
    const out = [], report = [];
    const box = $("#importSummary");
    box.innerHTML = `<p class="gate-note">Leggo ${files.length} ${files.length === 1 ? "file" : "file"}…</p>`;
    for (const f of [...files]) {
      const base = f.name.replace(/\.[^.]+$/, "");
      try {
        let found = [];
        if (/\.kmz$/i.test(f.name)) found = fromKML(await kmlFromKmz(f), base);
        else {
          const text = await f.text(), head = text.slice(0, 600).trim();
          if (/\.kml$/i.test(f.name) || /<kml[\s>]/i.test(head)) found = fromKML(text, base);
          else if (/\.(geo)?json$/i.test(f.name) || /^[{[]/.test(head)) found = fromGeoJSON(JSON.parse(text), base);
          else if (/\.csv$/i.test(f.name) || /^\uFEFF?[^\n]*,/.test(head)) found = fromCSV(text, base);
          else throw new Error("formato non riconosciuto (servono .kml, .kmz, .csv o .json)");
        }
        out.push(...found);
        report.push(`<li><strong>${esc(f.name)}</strong>: ${found.length} spot, ${found.filter(s => s.lat != null).length} con coordinate</li>`);
      } catch (err) {
        report.push(`<li class="warn"><strong>${esc(f.name)}</strong>: non letto (${esc(err.message)})</li>`);
      }
    }
    const seen = new Map();
    out.forEach(s => seen.set(s.source_key, s));
    // salta gli spot già presenti sulla mappa: si cercano (e si pagano) solo quelli nuovi
    const known = new Set(spots.map(s => s.source_key).filter(Boolean));
    const fresh = [...seen.values()];
    pending = fresh.filter(s => !known.has(s.source_key));
    alreadyThere = fresh.length - pending.length;
    if (alreadyThere) report.push(`<li><strong>${alreadyThere}</strong> spot sono già sulla mappa e vengono saltati: restano solo quelli nuovi.</li>`);
    renderSummary();
    box.insertAdjacentHTML("afterbegin", `<ul class="import-report">${report.join("")}</ul>`);
    $("#importFiles").value = "";   // si può riscegliere lo stesso file
  }

  function renderSummary() {
    const box = $("#importSummary");
    const ok = pending.filter(s => s.lat != null), missing = pending.filter(s => s.lat == null), withPid = missing.filter(s => s.placeId);
    const byList = {};
    pending.forEach(s => { (byList[s.list] ||= { tot: 0, ok: 0 }).tot++; if (s.lat != null) byList[s.list].ok++; });
    box.innerHTML = !pending.length ? (alreadyThere ? `<p class="gate-note">Nessuno spot nuovo: sono già tutti sulla mappa.</p>` : `<p class="gate-note warn">Nessuno spot trovato nei file scelti.</p>`) : `
      <table class="import-table"><thead><tr><th>Lista</th><th>Spot</th><th>Con coordinate</th></tr></thead><tbody>
        ${Object.entries(byList).map(([l, v]) => `<tr><td>${esc(l)}</td><td>${v.tot}</td><td>${v.ok}</td></tr>`).join("")}
      </tbody></table>
      <p class="import-totals"><strong>${ok.length}</strong> pronti da caricare${missing.length ? ` · <strong>${missing.length}</strong> senza coordinate` : ""}</p>
      ${missing.length ? `<div class="import-missing">
        ${withPid.length ? `<p><strong>Coordinate esatte da Google (consigliato):</strong> ${withPid.length} spot hanno il codice del luogo.
          Google ne regala 10.000 al mese, quindi resta gratis. Tempo stimato: ~${Math.max(1, Math.ceil(withPid.length / 600))} min.</p>
        <div class="gkey-row">
          <input id="gmapsKey" type="password" placeholder="Chiave API di Google Maps (AIza…)" autocomplete="off" value="${esc(savedKey())}">
          <button class="outline-link" type="button" id="importGoogle">TROVA LE COORDINATE <span aria-hidden="true">→</span></button>
        </div>
        <p class="gate-help left">La chiave resta solo in questo browser: non viene salvata sul sito.</p>
        <p class="gate-note" id="googleProgress" role="status"></p>
        <p class="import-or">oppure</p>` : ""}
        <p>Cerca le coordinate per nome su OpenStreetMap: circa 1 secondo per luogo (~${Math.ceil(missing.length / 60)} min), risultato approssimativo.</p>
        <button class="outline-link" type="button" id="importGeocode">CERCA SU OPENSTREETMAP</button>
        <p class="gate-note" id="geoProgress"></p>
      </div>` : ""}
      <div class="import-actions">
        <button class="outline-link" type="button" id="importUpload" ${ok.length ? "" : "disabled"}>CARICA ${ok.length} SPOT <span aria-hidden="true">→</span></button>
        <p class="gate-note" id="uploadProgress" role="status"></p>
      </div>`;
    $("#importGeocode")?.addEventListener("click", geocodeMissing);
    $("#importGoogle")?.addEventListener("click", geocodeWithGoogle);
    $("#importUpload")?.addEventListener("click", uploadPending);
  }

  /* Codice del luogo nei link di Google (…!1s0xAAA:0xBBB) → Place ID ufficiale (ChIJ…).
     Formato: protobuf di 20 byte con i due numeri a 64 bit in little-endian, in base64url. */
  function placeIdFromUrl(url) {
    const m = String(url || "").match(/(?:!1s|ftid=)(0x[0-9a-f]{1,16}):(0x[0-9a-f]{1,16})/i);
    if (!m) return null;
    const le = h => { h = h.slice(2).padStart(16, "0"); const o = []; for (let i = 0; i < 16; i += 2) o.unshift(parseInt(h.slice(i, i + 2), 16)); return o; };
    const bytes = [0x0a, 0x12, 0x09, ...le(m[1]), 0x11, ...le(m[2])];
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  const KEY_STORE = "fcph-gmaps-key";
  const savedKey = () => { try { return localStorage.getItem(KEY_STORE) || ""; } catch { return ""; } };

  let googleLoading = null;
  function loadGoogleMaps(key) {
    if (window.google?.maps?.Geocoder) return Promise.resolve();
    if (googleLoading) return googleLoading;
    googleLoading = new Promise((resolve, reject) => {
      window.__fcphGmapsReady = () => resolve();
      window.gm_authFailure = () => reject(new Error("chiave non valida o non autorizzata per questo sito"));
      const sc = document.createElement("script");
      sc.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__fcphGmapsReady`;
      sc.onerror = () => reject(new Error("impossibile caricare Google Maps"));
      document.head.appendChild(sc);
      setTimeout(() => reject(new Error("Google Maps non risponde")), 20000);
    }).catch(err => { googleLoading = null; throw err; });
    return googleLoading;
  }

  let googleRunning = false, googleStop = false;
  async function geocodeWithGoogle() {
    const btn = $("#importGoogle"), prog = $("#googleProgress");
    if (googleRunning) { googleStop = true; btn.textContent = "INTERRUZIONE…"; return; }
    const key = $("#gmapsKey").value.trim();
    if (!/^AIza[\w-]{30,}$/.test(key)) { prog.className = "gate-note warn"; prog.textContent = "Incolla una chiave API valida: inizia con «AIza»."; return; }
    try { localStorage.setItem(KEY_STORE, key); } catch {}
    prog.className = "gate-note"; prog.textContent = "Collegamento a Google…";
    try { await loadGoogleMaps(key); }
    catch (err) { prog.className = "gate-note warn"; prog.textContent = `Google non ha accettato la richiesta: ${err.message}.`; return; }

    const geocoder = new google.maps.Geocoder();
    const todo = pending.filter(s => s.lat == null && s.placeId);
    let done = 0, found = 0, failed = 0, authError = null;
    googleRunning = true; googleStop = false;
    btn.innerHTML = "INTERROMPI";
    const one = s => new Promise(resolve => {
      geocoder.geocode({ placeId: s.placeId }, (res, status) => resolve({ res, status }));
    });
    const worker = async () => {
      while (!googleStop && !authError) {
        const s = todo.shift();
        if (!s) return;
        let tries = 0, r;
        do {
          r = await one(s);
          if (r.status === "OVER_QUERY_LIMIT") await new Promise(x => setTimeout(x, 1500 * ++tries));
        } while (r.status === "OVER_QUERY_LIMIT" && tries < 5);
        if (r.status === "OK" && r.res[0]) {
          const loc = r.res[0].geometry.location;
          s.lat = loc.lat(); s.lon = loc.lng(); found++;
        } else if (r.status === "REQUEST_DENIED") { authError = "richiesta rifiutata: controlla che la «Geocoding API» sia attiva e la chiave autorizzata"; }
        else failed++;
        done++;
        if (done % 20 === 0 || !todo.length) prog.textContent = `Trovati ${found} su ${done} controllati (${todo.length} rimanenti)…`;
        await new Promise(x => setTimeout(x, 120));
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    googleRunning = false;
    renderSummary();
    const msg = authError ? `Interrotto: ${authError}. Trovati ${found} spot.`
      : `${googleStop ? "Interrotto. " : ""}Coordinate trovate per ${found} spot${failed ? `; ${failed} non trovati (luoghi chiusi o rimossi da Google)` : ""}. Ora premi «Carica».`;
    const p = $("#googleProgress") || $("#uploadProgress");   // se non manca più nulla, il riquadro di Google sparisce
    if (p) { p.className = authError ? "gate-note warn" : "gate-note"; p.textContent = msg; }
    toast(msg, !!authError);
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
    return { list, name, note: (note || "").trim(), url: (url || "").trim(), placeId: placeIdFromUrl(url),
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
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_LOCATE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
const ICON_UPLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>';

/* subito, prima che app.js legga l'indirizzo */
document.querySelector(".nav-spots")?.setAttribute("hidden", "");   // nascosta finché non si sa chi sta guardando
Spots.loadSession();
Spots.handleCallback();
window.Spots = Spots;
