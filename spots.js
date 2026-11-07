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
  showInMenu: true    // la voce SPOTS è nel menu per tutti: i visitatori vedono una selezione, i membri tutto
};

const Spots = (() => {
  const SESSION_KEY = "fcph-session";
  const PAGE_SIZE = 1000;
  const COMMUNITY = "Community";
  const OWNER = "Fabio Costantini";   // autore degli spot importati da Google Maps   // lista per i posti aggiunti dai membri
  const CATS = {
    spot:       { label: "Photo spots", color: "#9cc8ff",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20V19H4z"/><circle cx="12" cy="13" r="3.4"/></svg>' },
    restaurant: { label: "Food & drink", color: "#ffbe7a",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3v18M4 3v5.5a2.5 2.5 0 0 0 5 0V3M17.5 21V3c-2.2 1.2-3.5 4-3.5 7.5V13h3.5"/></svg>' },
    hotel:      { label: "Stay", color: "#d2b8ff",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v15M21 20v-6.5a3 3 0 0 0-3-3h-7.5V14M3 14h18M3 17.5h18"/><circle cx="7" cy="11.2" r="1.7"/></svg>' },
    workshop:   { label: "Workshops", color: "#9fe3c8",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4M12 12.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z"/></svg>' },
    experience: { label: "Experiences", color: "#7fd8ff",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 14.5 9l6 .6-4.5 4 1.3 5.9L12 16.5l-5.3 3 1.3-5.9-4.5-4 6-.6z"/></svg>' },
    trekking:   { label: "Trekking", color: "#f7a6c4",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2.5 20 6.5-11 4 6.5 2.5-3.5 6 8z"/><path d="M8 13.5l1.6 1.2M14.5 16l1.5-1"/><circle cx="17" cy="5.5" r="1.8"/></svg>' }
  };
  const CAT_KEYS = Object.keys(CATS);
  const NAME_KEY = "fcph-display-name";
  const jwtClaims = () => { try { return JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return {}; } };
  const myUid = () => (session && jwtClaims().sub) || "";
  function displayName() {
    try { const n = localStorage.getItem(NAME_KEY); if (n) return n; } catch {}
    const meta = session ? jwtMeta(session.access_token) : {};
    const full = (meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(" ")).trim();
    if (full) return full;
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
  let markerById = new Map(), openId = null;
  let osmLayer = null, osmItems = [], osmState = "", osmSeq = 0, showOsm = true;
  const RADII = [1, 2, 5, 10, 25, 50];
  const trS = s => (window.I18N ? I18N.t(s) : s);
  const fmtN = n => n.toLocaleString(window.I18N?.locale || "en-GB");
  let nearKm = (() => { try { const v = +localStorage.getItem("fcph-near-km"); return RADII.includes(v) ? v : 5; } catch { return 5; } })();   // marker singoli disegnati ora (per aprire il popup da ricerca/vicini)
  let origin = null;            // { lat, lon, label, kind: "me" | "place", acc } — punto da cui calcolare i vicini
  let placeResults = [], placeTimer = 0, placeSeq = 0, suggestIdx = -1;
  let activeLists = null;   // Set delle liste visibili (null = tutte)
  let activeCats = null;    // Set delle categorie visibili
  let knownLists = new Set();
  let schemaV2 = true;      // false finché non è stato eseguito supabase-community.sql
  let socialV = true;       // false finché non è stato eseguito supabase-sociale.sql
  let guest = false;        // visitatore senza account: vede solo la selezione pubblica
  let guestLoaded = false, guestLoading = false, publicTotal = 0, wantLogin = false;
  let nodiV = true;          // false finché non è stato eseguito supabase-nodi.sql
  let contribs = new Map();  // user_id → { display_name, roles } — contributor del Journal
  let experts = new Map();   // user_id → { area_name, lat, lon, radius_km, display_name }
  let commV = true;         // false finché non è stato eseguito supabase-community2.sql
  let meetups = [], meetupJoins = new Map(), favs = new Set(), profiles = [], openFlags = 0;
  let onlyFavs = false, showPhotographers = false, commLayer = null;
  let tkV = true;           // false finché non è stato eseguito supabase-trekking.sql
  let wsV = true;           // false finché non è stato eseguito supabase-workshop.sql
  let pubV = true;          // false finché non è stato eseguito supabase-pubblico.sql
  let reports = new Map();  // spot_id → segnalazioni attive
  let alertMode = "show";   // show | hide | only
  let onlySupport = false;
  let query = "";
  let notice = "";          // messaggio da mostrare nella schermata di accesso
  let loaded = false;
  let memberStatus = "approved";   // approved | pending | rejected — chi si iscrive dal sito aspetta l'approvazione
  let memberName = "";
  let wantJoin = false;            // mostra il modulo di iscrizione invece dell'accesso
  let pendingMembers = [];         // solo admin: richieste da approvare

  /* ---------- sessione ---------- */
  function updateNav() {
    const link = document.querySelector(".nav-spots");
    if (link) link.hidden = !(configured() && (SPOTS_CONFIG.showInMenu || session));
  }
  function saveSession(s) { session = s; updateNav(); try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {} }
  function loadSession() { try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { session = null; } updateNav(); }
  function jwtPayload(token) {
    try { return JSON.parse(decodeURIComponent(escape(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch { return {}; }
  }
  const jwtMeta = token => jwtPayload(token).user_metadata || {};
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
  /* Iscrizione dal sito: nome, cognome, email, password. L'account entra «in attesa» finché non lo approvi */
  async function signUp(first, last, email, password) {
    const { data } = await api("/auth/v1/signup", { method: "POST", auth: false,
      body: { email, password, data: { first_name: first, last_name: last, full_name: `${first} ${last}`.trim() } } });
    if (data && data.access_token) {
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
      return "session";
    }
    // se su Supabase è attiva la conferma via email, la sessione arriva dopo il clic sul link
    if (data && (data.id || data.user) && !(data.identities && data.identities.length === 0)) return "confirm";
    throw new Error("already registered");
  }
  /* Accesso con Google: il pulsante compare solo se Google è attivo su Supabase (Authentication → Providers) */
  let googleOn = null;
  // browser interni delle app (Instagram, Facebook, TikTok…): Google spesso vi blocca l'accesso
  const IN_APP = (ua => /Instagram/i.test(ua) ? "Instagram" : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua) ? "Facebook" : /musical_ly|TikTok|BytedanceWebview/i.test(ua) ? "TikTok"
    : /LinkedInApp/i.test(ua) ? "LinkedIn" : /Line\//.test(ua) ? "LINE" : "")(navigator.userAgent || "");
  async function checkGoogle() {
    if (googleOn !== null) return googleOn;
    try { const { data } = await api("/auth/v1/settings", { auth: false }); googleOn = !!data?.external?.google; } catch { googleOn = false; }
    return googleOn;
  }
  function signInGoogle() {
    window.fcTrack?.("Spots: Google sign-in");
    const back = `${location.origin}${location.pathname}#spots`;
    location.href = `${SPOTS_CONFIG.url.replace(/\/$/, "")}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
  }
  const GOOGLE_G = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"/></svg>';
  async function fetchMemberStatus() {
    const uid = session ? jwtPayload(session.access_token).sub : "";
    try {
      const { data } = await api(`/rest/v1/members?select=status,first_name,last_name&user_id=eq.${encodeURIComponent(uid)}`);
      const row = (data || [])[0];
      memberName = row ? [row.first_name, row.last_name].filter(Boolean).join(" ") : "";
      return row ? row.status : "pending";
    } catch (err) {
      return "approved";   // tabella «members» non ancora creata (supabase-iscrizioni.sql non eseguito): come prima
    }
  }
  async function fetchPending() {
    try {
      const { data } = await api("/rest/v1/members?select=user_id,email,first_name,last_name,status,created_at&status=eq.pending&order=created_at.asc");
      pendingMembers = data || [];
    } catch { pendingMembers = []; }
  }
  async function logout() {
    try { await api("/auth/v1/logout", { method: "POST" }); } catch {}
    saveSession(null); spots = []; loaded = false; admin = false; guestLoaded = false; activeCats = null; memberStatus = "approved"; pendingMembers = [];
    render();
  }

  /* ---------- dati ---------- */
  /* ---------- copia dei luoghi sul dispositivo (IndexedDB): si scaricano solo novità e modifiche ----------
     Prima: a ogni apertura tutta la lista (migliaia di righe). Ora: la prima volta tutta, poi solo ciò che è
     cambiato dall'ultima volta, più un controllo leggerissimo sul numero totale (per accorgersi delle eliminazioni).
     Un aggiornamento completo resta ogni 7 giorni, o quando cambiano le colonne. Riduce molto il traffico Supabase. */
  const idb = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => {
      const r = indexedDB.open("fcph", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    return {
      get: async k => { try { const db = await open(); return await new Promise(res => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; } },
      set: async (k, v) => { try { const db = await open(); await new Promise(res => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = res; t.onabort = res; }); } catch {} },
      del: async k => { try { const db = await open(); await new Promise(res => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").delete(k); t.oncomplete = res; t.onerror = res; }); } catch {} }
    };
  })();
  const FULL_EVERY = 7 * 864e5;
  const spotCols = () => "id,source_key,name,lat,lon,list,note,url,created_at"
    + (schemaV2 ? ",category,starts_on,ends_on,created_by,author_name" : "")
    + (schemaV2 && socialV ? ",support_local,fragile,best_months" + (pubV ? ",public_pick" : "") : "")
    + (schemaV2 && wsV ? ",ws_capacity,ws_enrolled,ws_price,ws_currency,ws_link,support_since,ws_offer,ws_offer_until" : "")
    + (schemaV2 && tkV ? ",tk_difficulty,tk_minutes,tk_km,tk_gain,tk_route,tk_parking,tk_park_lat,tk_park_lon" : "")
    + (schemaV2 && nodiV ? ",verified_at,verified_name,outdated" : "")
    + (schemaV2 && profV ? ",subcategory,info,status,updated_at" : "");
  /* scarica le righe (a pagine), adattandosi a un database non ancora aggiornato */
  async function pullSpots(filter = "") {
    const all = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let data;
      try {
        ({ data } = await api(`/rest/v1/spots?select=${spotCols()}${filter}&order=id.asc`, {
          headers: { "Range-Unit": "items", Range: `${from}-${from + PAGE_SIZE - 1}` } }));
      } catch (err) {
        // database non ancora aggiornato (colonne nuove assenti): funziona come prima
        if (err.status === 400 && from === 0) {
          if (profV && schemaV2) { profV = false; from -= PAGE_SIZE; continue; }
          if (nodiV && schemaV2) { nodiV = false; from -= PAGE_SIZE; continue; }
          if (tkV && schemaV2) { tkV = false; from -= PAGE_SIZE; continue; }
          if (wsV && schemaV2) { wsV = false; from -= PAGE_SIZE; continue; }
          if (pubV && socialV && schemaV2) { pubV = false; from -= PAGE_SIZE; continue; }
          if (socialV && schemaV2) { socialV = false; from -= PAGE_SIZE; continue; }
          if (schemaV2) { schemaV2 = false; from -= PAGE_SIZE; continue; }
        }
        throw err;
      }
      all.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return all;
  }
  async function countSpots() {
    try {
      const { res } = await api("/rest/v1/spots?select=id&limit=1", { headers: { Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" } });
      const n = +(res.headers.get("content-range") || "").split("/")[1];
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  }
  const stamp = r => [r.created_at, r.updated_at].filter(Boolean).sort().pop() || "";
  async function fetchSpots() {
    const key = `spots:${myUid() || "anon"}`;
    const cache = await idb.get(key);
    let rows = null, full = Date.now();
    const sig0 = spotCols();
    // solo con lo storico delle modifiche (colonna updated_at) si possono scaricare le sole differenze
    if (cache && cache.sig === sig0 && profV && Date.now() - cache.full < FULL_EVERY && Array.isArray(cache.rows)) {
      try {
        const since = cache.mark || "1970-01-01T00:00:00Z";
        const q = encodeURIComponent(`"${since}"`);
        const delta = await pullSpots(`&or=(created_at.gt.${q},updated_at.gt.${q})`);
        if (spotCols() === sig0) {
          const byId = new Map(cache.rows.map(r => [r.id, r]));
          delta.forEach(r => byId.set(r.id, r));
          rows = [...byId.values()];
          const total = await countSpots();
          if (total != null && total !== rows.length) {   // qualcosa è stato eliminato: si allinea con i soli id
            const ids = new Set();
            for (let from = 0; ; from += PAGE_SIZE) {
              const { data } = await api("/rest/v1/spots?select=id&order=id.asc", { headers: { "Range-Unit": "items", Range: `${from}-${from + PAGE_SIZE - 1}` } });
              (data || []).forEach(x => ids.add(x.id));
              if (!data || data.length < PAGE_SIZE) break;
            }
            rows = rows.filter(r => ids.has(r.id));
          }
          full = cache.full;
        }
      } catch { rows = null; }
    }
    if (!rows) rows = await pullSpots();
    const mark = rows.reduce((m, r) => { const t = stamp(r); return t > m ? t : m; }, cache?.mark && rows === cache.rows ? cache.mark : "");
    idb.set(key, { sig: spotCols(), full, mark, rows });
    const today = new Date().toISOString().slice(0, 10);
    return rows
      .filter(s => Number.isFinite(+s.lat) && Number.isFinite(+s.lon))
      .filter(s => s.category === "workshop" && s.starts_on ? s.starts_on > today                      // workshop: spariscono il giorno della partenza
        : !(s.ends_on || s.starts_on) || (s.ends_on || s.starts_on) >= today)                          // altri eventi: spariscono quando finiscono
      .map(s => ({ ...s, lat: +s.lat, lon: +s.lon, list: s.list || "Spots", category: CATS[s.category] ? s.category : "spot" }))
      .sort((a, b) => String(a.list).localeCompare(String(b.list)) || String(a.name).localeCompare(String(b.name)));
  }
  const ALERTS = {
    closed: { label: "Closed", icon: "⛔" }, works: { label: "Works or landslide", icon: "🚧" }, event: { label: "Event on", icon: "🎪" },
    crowded: { label: "Very crowded", icon: "👥" }, danger: { label: "Danger", icon: "⚠️" }, access: { label: "Access changed", icon: "🚪" }
  };
  const REQUESTS = { fragile: "Suggested as fragile", support: "Suggested for Support local" };
  async function fetchReports() {
    reports = new Map();
    if (!schemaV2 || !socialV) return;
    try {
      const { data } = await api("/rest/v1/spot_reports?select=id,spot_id,user_id,author_name,kind,note,until,confirmations,created_at&resolved=eq.false&order=created_at.desc&limit=3000");
      const today = new Date().toISOString().slice(0, 10), cut = Date.now() - 14 * 864e5;
      (data || []).forEach(r => {
        const active = REQUESTS[r.kind] ? true : r.until ? r.until >= today : Date.parse(r.created_at) >= cut;
        if (active) (reports.get(r.spot_id) || reports.set(r.spot_id, []).get(r.spot_id)).push(r);
      });
    } catch { socialV = false; }
  }
  const alertsOf = s => (reports.get(s.id) || []).filter(r => ALERTS[r.kind]);

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

  function show(join, me) {
    if (ui === "earth" && viewMode === "globe" && !globeFailed) loadMapLibre().catch(() => {});   // il globo si scarica mentre arrivano i dati
    if (join && !session) { wantJoin = true; wantLogin = false; }
    meView = !!me;
    if (me && !session) { wantLogin = true; wantJoin = false; }
    render();
    setTimeout(() => { if (map) { map.invalidateSize(); drawClusters(); } }, 40);
  }

  async function render() {
    const el = root();
    if (!el) return;
    if (!configured()) {
      el.innerHTML = gateHtml(`<p class="gate-note">The members' map is being set up. Please come back soon.</p>`);
      return;
    }
    if (!(await ensureSession())) {
      // visitatori: la mappa compare subito; il riquadro di accesso solo se lo chiedono (Log in / Join)
      if (wantLogin || wantJoin || notice) return renderGate();
      guest = true;
      if (guestLoaded) { renderApp(); return; }
      if (!map || !guestLoading) { spots = []; guestLoading = true; renderApp(); }
      await loadPublic();
      guestLoading = false; guest = true;
      if (!session && !wantLogin && !wantJoin && document.body.dataset.page === "spots") renderApp();
      return;
    }
    guest = false;
    if (!loaded) {
      el.innerHTML = `<div class="spots-loading"><p class="gate-note">Loading the map…</p></div>`;
      try {
        admin = await checkAdmin();
        memberStatus = admin ? "approved" : await fetchMemberStatus();
        if (memberStatus !== "approved") {
          // in attesa di approvazione: vede la mappa pubblica, come un visitatore
          wantLogin = false; wantJoin = false;
          if (await loadPublic()) { meView ? renderMe() : renderApp(); return; }
          el.innerHTML = gateHtml(`<p class="gate-note">${esc(pendingText())}</p>`);
          return;
        }
        spots = await fetchSpots();
        await Promise.all([fetchReports(), admin ? fetchPending() : null, fetchCommunity()]);
        loaded = true;
      } catch (err) {
        if (err.status === 401) { saveSession(null); notice = "Please log in again."; return renderGate(); }
        el.innerHTML = gateHtml(`<p class="gate-note">The map could not be loaded (${esc(err.message)}). Please try again later.</p>`);
        return;
      }
    }
    meView ? renderMe() : renderApp();
  }

  function gateHtml(inner) {
    return `<div class="spots-gate">
      <div class="gate-icon" aria-hidden="true">${LOCK_SVG}</div>
      <h2>Members only</h2>
      <p>Photo spots, places to eat and stay, workshops and trails — collected over the years and shared by members. Membership is free: sign up in a minute, and I approve every account personally.</p>
      ${inner}
    </div>`;
  }
  /* ---------- visitatori: la selezione pubblica (vista «public_spots» del database) ---------- */
  async function loadPublic() {
    if (guestLoaded) { guest = true; return true; }
    try {
      // la selezione pubblica cambia di rado: resta sul dispositivo per 12 ore (meno traffico su Supabase)
      const c = await idb.get("public");
      let all = c && Date.now() - c.at < 12 * 36e5 && Array.isArray(c.rows) ? c.rows : null;
      if (all) publicTotal = c.total || 0;
      else {
        all = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data } = await api("/rest/v1/public_spots?select=id,name,category,lat,lon,support_local,reviews,avg_rating", {
            auth: false, headers: { "Range-Unit": "items", Range: `${from}-${from + PAGE_SIZE - 1}` } });
          all.push(...(data || []));
          if (!data || data.length < PAGE_SIZE) break;
        }
        try { const { data } = await api("/rest/v1/rpc/spots_total", { method: "POST", body: {}, auth: false }); publicTotal = +data || 0; } catch {}
        idb.set("public", { at: Date.now(), rows: all, total: publicTotal });
      }
      spots = all.filter(x => Number.isFinite(+x.lat)).map(x => ({ ...x, lat: +x.lat, lon: +x.lon, list: "Public", category: CATS[x.category] ? x.category : "spot", fragile: false }));
      admin = false; guest = true; guestLoaded = true; reports = new Map();
      return true;
    } catch { return false; }
  }

  function renderGate() {
    const join = wantJoin;
    root().innerHTML = gateHtml(`
      ${notice ? `<p class="gate-note warn">${esc(notice)}</p>` : ""}
      <div class="gate-tabs" role="tablist">
        <button type="button" role="tab" class="${join ? "" : "on"}" aria-selected="${!join}" data-gtab="login">Log in</button>
        <button type="button" role="tab" class="${join ? "on" : ""}" aria-selected="${join}" data-gtab="join">Join — it's free</button>
      </div>
      ${join ? `<form class="gate-form" id="joinForm" novalidate>
        <div class="gate-row">
          <div><label for="joinFirst">First name</label>
            <input id="joinFirst" type="text" autocomplete="given-name" maxlength="60" required></div>
          <div><label for="joinLast">Last name</label>
            <input id="joinLast" type="text" autocomplete="family-name" maxlength="60" required></div>
        </div>
        <label for="joinEmail">Email</label>
        <input id="joinEmail" type="email" autocomplete="email" placeholder="you@example.com" required>
        <label for="joinPassword">Password</label>
        <input id="joinPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required>
        <label class="gate-check"><input type="checkbox" id="joinCode"> <span>I accept the <button type="button" class="text-link" id="joinShowCode">community code</button>, the <a href="#terms" target="_blank">terms</a> and the <a href="#privacy" target="_blank">privacy policy</a>. I'm 16 or older.</span></label>
        <button class="outline-link" type="submit" id="joinSend">JOIN <span aria-hidden="true">→</span></button>
        <p class="gate-note" id="gateMsg" role="status"></p>
        <p class="gate-help">I approve every request personally, usually within a day. Until then you can browse the public map.</p>
      </form>` : `<form class="gate-form" id="gateForm" novalidate>
        <label for="gateEmail">Email</label>
        <input id="gateEmail" type="email" autocomplete="username" placeholder="you@example.com" required>
        <label for="gatePassword">Password</label>
        <input id="gatePassword" type="password" autocomplete="current-password" required>
        <button class="outline-link" type="submit" id="gateSend">LOG IN <span aria-hidden="true">→</span></button>
        <p class="gate-note" id="gateMsg" role="status"></p>
        <p class="gate-help">Forgot your password? <a href="#about">Contact me</a> and I will reset it.</p>
      </form>`}
      <div class="gate-google" id="gateGoogle" hidden><p class="gate-or"><span>or</span></p>
        <button type="button" class="google-btn" id="googleBtn">${GOOGLE_G}<span>Continue with Google</span></button>
        <p class="gate-help">${join ? "Your Google name and email are used to create the request — I still approve it personally." : "Works for accounts created with Google."}</p>
        <p class="gate-note google-domain">🔒 Google will say <b>“Continue to hfidpbssartkmjlqcqvz.supabase.co”</b>: that's Supabase, the secure service that runs Spots accounts for fabiocostaph.com. It's safe to continue.</p>
        ${IN_APP ? `<p class="gate-note warn inapp-note">You're browsing inside ${IN_APP}: Google often blocks sign-in here. Tap <b>⋯</b> (top right) → <b>Open in browser</b>, then come back to this page. Email and password work fine here.</p>` : ""}</div>
      ${guestLoaded ? `<button type="button" class="text-link gate-back" id="gateBack">← Back to the public map</button>` : ""}`);
    checkGoogle().then(on => { const g = $("#gateGoogle"); if (g) g.hidden = !on; });
    $("#googleBtn")?.addEventListener("click", signInGoogle);
    $("#gateBack")?.addEventListener("click", () => { wantLogin = false; wantJoin = false; notice = ""; render(); });
    $$("[data-gtab]").forEach(b => b.addEventListener("click", () => {
      wantJoin = b.dataset.gtab === "join"; wantLogin = !wantJoin; notice = ""; renderGate();
      (wantJoin ? $("#joinFirst") : $("#gateEmail"))?.focus();
    }));
    $("#joinShowCode")?.addEventListener("click", () => showConduct());
    $("#joinForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const first = $("#joinFirst").value.trim(), last = $("#joinLast").value.trim(), email = $("#joinEmail").value.trim(),
        password = $("#joinPassword").value, msg = $("#gateMsg"), btn = $("#joinSend");
      msg.className = "gate-note warn";
      if (!first || !last) { msg.textContent = "Please enter your first and last name."; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Please enter a valid email address."; return; }
      if (password.length < 8) { msg.textContent = "The password needs at least 8 characters."; return; }
      if (!$("#joinCode").checked) { msg.textContent = "Please accept the community code."; return; }
      btn.disabled = true; msg.className = "gate-note"; msg.textContent = "Sending your request…";
      try {
        const how = await signUp(first, last, email, password);
        window.fcTrack?.("Spots: signed up");
        try { localStorage.setItem(CONDUCT_KEY, "1"); } catch {}
        wantJoin = false; wantLogin = false; notice = ""; loaded = false; guestLoaded = false;
        if (how === "confirm") {
          msg.className = "gate-note ok";
          msg.textContent = "Almost done: check your inbox and click the link to confirm your email.";
          return;
        }
        await render();
        setTimeout(() => (document.querySelector(".pending-banner") || root()).scrollIntoView({ behavior: "smooth", block: "center" }), 400);
      } catch (err) {
        msg.className = "gate-note warn";
        msg.textContent = /already|registered|exists/i.test(err.message) ? "This email is already registered. Log in instead."
          : /not allowed|disabled|signups/i.test(err.message) ? "Sign-ups are closed right now. Please contact me."
          : /password/i.test(err.message) ? "Please choose a stronger password."
          : /rate|too many|seconds/i.test(err.message) ? "Too many attempts. Please wait a few minutes and try again."
          : `Sign-up failed (${err.message}).`;
        btn.disabled = false;
      }
    });
    $("#gateForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const email = $("#gateEmail").value.trim(), password = $("#gatePassword").value, msg = $("#gateMsg"), btn = $("#gateSend");
      msg.className = "gate-note warn";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Please enter a valid email address."; return; }
      if (!password) { msg.textContent = "Please enter your password."; return; }
      btn.disabled = true; msg.className = "gate-note"; msg.textContent = "Logging in…";
      try {
        await signIn(email, password);
        window.fcTrack?.("Spots: logged in");
        notice = ""; loaded = false; wantLogin = false; guest = false; guestLoaded = false;
        render();
      } catch (err) {
        msg.className = "gate-note warn";
        msg.textContent = /invalid|credentials|grant/i.test(err.message) ? "Wrong email or password."
          : /not confirmed/i.test(err.message) ? "Please confirm your email first: check your inbox."
          : /rate|too many|seconds/i.test(err.message) ? "Too many attempts. Please wait a few minutes and try again."
          : `Login failed (${err.message}).`;
        btn.disabled = false;
      }
    });
  }

  function pendingText() {
    if (memberStatus === "suspended") return "Your account is suspended. If you think this is a mistake, contact me.";
    return memberStatus === "rejected"
      ? "Your request to join was not approved. If you think this is a mistake, contact me."
      : "Thanks for joining! Your request is waiting for my approval — usually within a day. Until then, here is the public map.";
  }

  /* =========================================================
     «EXPLORE THE EARTH»: la nuova interfaccia di Spots
     - un globo 3D (MapLibre 5) con le foto satellitari, come Google Earth: si parte dal pianeta e si scende
     - avvicinandosi (o toccando uno spot) si passa da sé alla mappa satellitare di dettaglio (Leaflet),
       che ha tutte le funzioni di sempre: schede, foto, recensioni, aggiungere posti, cerca nell'area…
     - allontanandosi si torna al globo. Satellite e Terrain restano mappe piane; c'è anche la mappa classica.
     ========================================================= */
  const UI_KEY = "fcph-spots-ui", MODE_KEY = "fcph-spots-mode";
  const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  let ui = lsGet(UI_KEY, "earth") === "classic" ? "classic" : "earth";
  let viewMode = ["globe", "sat", "terrain"].includes(lsGet(MODE_KEY, "globe")) ? lsGet(MODE_KEY, "globe") : "globe";
  let baseSat = null, baseTopo = null;
  let globe = null, globeEl = null, onGlobe = false, handing = false, globeMarkers = [], globeFailed = false;
  const sxTouch = matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  const sxOpen = new Set(matchMedia("(max-width: 980px)").matches ? [] : ["places"]);   // sul telefono i gruppi partono chiusi
  const ML_VER = "5.24.0";
  const GLOBE_TO_FLAT = 6.3;     // zoom del globo oltre il quale si scende sulla mappa di dettaglio
  const FLAT_TO_GLOBE = 3.5;     // zoom della mappa piana sotto il quale si torna al globo
  const SX_ICON = {
    places: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2.5 19.5 6.5-11 4 6.5 2.5-3.5 6 8z"/></svg>',
    essentials: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v15M21 20v-6.5a3 3 0 0 0-3-3h-7.5V14M3 14h18M3 17.5h18"/><circle cx="7" cy="11.2" r="1.7"/></svg>',
    community: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c.6-3.4 3-5.3 5.5-5.3s4.9 1.9 5.5 5.3M14.6 14.3c.8-.4 1.6-.6 2.4-.6 2.1 0 3.9 1.5 4.5 4.3"/></svg>',
    outdoors: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13.5" cy="4.5" r="1.8"/><path d="m10 21 2.2-6.2L15 17v4M12.2 14.8l1-5.3-3.2 1.2L8.5 14M13.2 9.5l2.3 3 3 .5M17.5 8.5 19 21"/></svg>',
    near: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5 3.5 10.6l7.1 2.8 2.8 7.1z"/></svg>',
    target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>',
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/></svg>',
    sat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2.5 19.5 6.5-11 4 6.5 2.5-3.5 6 8z"/></svg>',
    terrain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    fullExit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>'
  };
  const SX_GROUPS = [
    { id: "places", title: "Places", sub: "Photo spots · Viewpoints · Nature · Urban", cats: ["spot"] },
    { id: "essentials", title: "Essentials", sub: "Stay · Food & drink", cats: ["hotel", "restaurant"] },
    { id: "community", title: "Community", sub: "Photographers · Local experts · Meetups", cats: [] },
    { id: "outdoors", title: "Outdoors", sub: "Trekking · Workshops · Experiences", cats: ["trekking", "workshop", "experience"] }
  ];

  function earthHtml({ searchHtml, userHtml, bannerHtml, tailHtml }) {
    const base = baseSpots();
    const n = k => base.filter(s => s.category === k).length;
    const item = k => `<button type="button" class="sx-item${activeCats.has(k) ? " on" : ""}" data-sxcat="${k}" style="--c:${CATS[k].color}" aria-pressed="${activeCats.has(k)}">
        <span class="sx-ico">${CATS[k].icon}</span><span class="sx-name">${CATS[k].label}</span><small data-sxcount="${k}">${fmtN(n(k))}</small><span class="sx-check" aria-hidden="true"></span></button>`;
    const subOn = k => activeCats.has("spot") && activeSubs.has(k);
    const subItems = () => `<div class="sx-subs">${SUB_KEYS.map(k => `<button type="button" class="sx-item sx-sub${subOn(k) ? " on" : ""}" data-sxsub="${k}" style="--c:${CATS.spot.color}" aria-pressed="${subOn(k)}">
        <span class="sx-name">${SUBS[k].label}</span><small data-sxsubcount="${k}">${fmtN(base.filter(s => s.category === "spot" && spotSub(s) === k).length)}</small><span class="sx-check" aria-hidden="true"></span></button>`).join("")}</div>`;
    const lockItem = (label, ico) => `<button type="button" class="sx-item is-locked" data-sxjoin><span class="sx-ico">${ico}</span><span class="sx-name">${label}</span><span class="sx-lock">${SX_ICON.lock}Members</span></button>`;
    const body = g => {
      if (g.id === "places") return g.cats.map(item).join("") + subItems() + (!guest && schemaV2 && socialV ? `
        <button type="button" class="sx-item${onlySupport ? " on" : ""}" id="onlySupport" aria-pressed="${onlySupport}" style="--c:#9fe3c8"><span class="sx-ico">🌱</span><span class="sx-name">Support local</span><small>${spots.filter(x => x.support_local).length}</small><span class="sx-check" aria-hidden="true"></span></button>
        <label class="sx-select">Alerts <select id="alertMode">
          <option value="show"${alertMode === "show" ? " selected" : ""}>Show</option>
          <option value="hide"${alertMode === "hide" ? " selected" : ""}>Hide places with alerts</option>
          <option value="only"${alertMode === "only" ? " selected" : ""}>Only places with alerts</option></select></label>` : "")
        + (!guest && commV ? `<button type="button" class="sx-item${onlyFavs ? " on" : ""}" id="onlyFavs" aria-pressed="${onlyFavs}" style="--c:#ff8fb1"><span class="sx-ico">♥</span><span class="sx-name">My spots</span><small>${favs.size}</small><span class="sx-check" aria-hidden="true"></span></button>` : "");
      if (g.id === "community") {
        if (guest || !commV) return lockItem("Photographers", "📷") + lockItem("Local experts", "🧭") + lockItem("Meetups", "👥");
        return `<button type="button" class="sx-item${showPhotographers ? " on" : ""}" id="showPh" aria-pressed="${showPhotographers}" style="--c:#c9a7ff"><span class="sx-ico">📷</span><span class="sx-name">Photographers</span><small>${profiles.filter(p => p.visible && p.on_map !== false && p.lat != null).length}</small><span class="sx-check" aria-hidden="true"></span></button>
          <p class="sx-links"><button type="button" class="text-link" id="phList">List</button><button type="button" class="text-link" id="myProfile">${profiles.some(p => p.user_id === myUid()) ? "My photographer profile" : "Join the photographers' map"}</button>${nodiV && profiles.some(p => p.user_id === myUid()) ? `<button type="button" class="text-link" id="iPosted">📣 I just posted</button>` : ""}</p>
          ${nodiV ? `<button type="button" class="sx-item" id="expList" style="--c:#ffd9a0"><span class="sx-ico">🧭</span><span class="sx-name">Local experts</span><small>${experts.size}</small><span class="sx-go" aria-hidden="true">›</span></button>` : ""}
          ${nodiV && myExpert() ? `<button type="button" class="sx-item" id="myArea" style="--c:#ffd9a0"><span class="sx-ico">🧭</span><span class="sx-name">My area</span><span class="sx-go" aria-hidden="true">›</span></button>` : ""}
          <button type="button" class="sx-item" id="meetList" style="--c:#ffd166"><span class="sx-ico">👥</span><span class="sx-name">Meetups</span><small>${upcomingMeetups().length}</small><span class="sx-go" aria-hidden="true">›</span></button>
          <p class="sx-links"><button type="button" class="text-link" id="meetAdd">＋ Organise a meetup</button></p>`;
      }
      return g.cats.map(item).join("");
    };
    const groups = SX_GROUPS.map(g => {
      const open = sxOpen.has(g.id), on = g.cats.some(k => activeCats.has(k)) || (g.id === "community" && showPhotographers);
      const count = g.cats.reduce((a, k) => a + n(k), 0);
      return `<section class="sx-group${open ? " open" : ""}${on ? " on" : ""}" data-g="${g.id}">
        <button type="button" class="sx-ghead" data-sxg="${g.id}" aria-expanded="${open}">
          <span class="sx-gico">${SX_ICON[g.id]}</span>
          <span class="sx-gtext"><b>${g.title}</b><small>${g.sub}</small></span>
          ${g.cats.length ? `<span class="sx-gcount" data-sxgcount="${g.id}">${fmtN(count)}</span>` : ""}
          <span class="sx-chev" aria-hidden="true"></span>
        </button>
        <div class="sx-gbody">${body(g)}</div>
      </section>`;
    }).join("");
    return `<div class="sx">
      <aside class="sx-side">
        <p class="sx-kick">Spots <span aria-hidden="true">///</span></p>
        <h2 class="sx-title">Explore the Earth</h2>
        <p class="sx-lead">Photo spots, essential services and experiences for your next exploration.</p>
        <div class="sx-panel">
          ${searchHtml}
          <div class="sx-groups">${groups}</div>
          <div class="sx-foot">
            <span>${ICON.pin}<span id="spotsCount"></span></span>
            <a class="text-link" href="#guide-spots">How it works</a>
          </div>
        </div>
        <div class="sx-user">${userHtml}</div>
        <p class="sx-more">
          ${!guest && schemaV2 && socialV ? `<button type="button" class="text-link" id="openConduct">Community code</button>` : ""}
          <a class="text-link" href="guides/spots-quick-guide.pdf" target="_blank" rel="noopener">📄 Spots in one page</a>
          <button type="button" class="text-link sx-switch" id="sxToClassic">Use the classic map</button>
          ${admin && !guest ? `<button type="button" class="text-link" id="sxExport" title="Admin only: download the spots in the current map view">⬇ Export this area (CSV)</button>` : ""}
        </p>
      </aside>
      <div class="sx-stage spots-stage" data-mode="${viewMode}">
        <div id="spotsMap" class="map map-spots" aria-label="Map of photo spots"></div>
        <div class="sx-globe-slot" id="sxGlobeSlot"></div>
        <div class="sx-ctrl">
          <button type="button" class="sx-btn is-gold" id="sxNear" title="Spots near me" aria-label="Find spots near me">${SX_ICON.near}</button>
          <div class="sx-zoom"><button type="button" class="sx-btn" id="sxIn" aria-label="Zoom in">+</button><button type="button" class="sx-btn" id="sxOut" aria-label="Zoom out">−</button></div>
          <button type="button" class="sx-btn" id="sxHome" title="The whole Earth" aria-label="Back to the whole Earth">${SX_ICON.target}</button>
          <button type="button" class="sx-btn" id="sxFull" title="Full screen" aria-label="Full screen">${SX_ICON.full}</button>
        </div>
        <div class="sx-modes" role="group" aria-label="Map view">
          ${[["globe", "Globe"], ["sat", "Satellite"], ["terrain", "Terrain"]].map(([k, l]) => `<button type="button" data-sxmode="${k}" class="${viewMode === k ? "on" : ""}" aria-pressed="${viewMode === k}">${SX_ICON[k]}<span>${l}</span></button>`).join("")}
        </div>
        ${schemaV2 ? `<button type="button" class="osm-scan" id="osmScan">${ICON_SCAN}Scan this area</button>` : ""}
        <p class="sx-hint" id="sxHint" hidden></p>
        <div class="sx-sheet" id="sxSheet"></div>
      </div>
    </div>
    ${bannerHtml}
    ${tailHtml}`;
  }

  /* solo amministratore: scarica gli spot inquadrati sulla mappa in un file CSV (per preparare guide e articoli).
     Usa i dati già caricati sul dispositivo: nessuna richiesta in più al database. */
  function exportArea() {
    if (!admin || !map) return;
    const b = map.getBounds();
    const rows = spots.filter(s => Number.isFinite(+s.lat) && Number.isFinite(+s.lon) && b.contains([+s.lat, +s.lon]));
    if (!rows.length) { const bt = $("#sxExport"); if (bt) bt.textContent = "No spots in this view: zoom out a little"; return; }
    const cols = ["name", "category", "subcategory", "lat", "lon", "note", "info", "url", "best_months", "fragile", "public_pick", "status", "author_name", "created_at", "id"];
    const cell = v => {
      if (v === null || v === undefined) return "";
      const t = typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = "\ufeff" + [cols.join(","), ...rows.map(s => cols.map(k => cell(s[k])).join(","))].join("\r\n");
    const c = b.getCenter(), a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `spots-${c.lat.toFixed(2)}_${c.lng.toFixed(2)}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const btn = $("#sxExport"); if (btn) { const t = btn.textContent; btn.textContent = `✓ ${rows.length} spots exported`; setTimeout(() => (btn.textContent = t), 3000); }
  }

  /* conteggi del pannello: seguono la ricerca e gli altri filtri, senza ridisegnare tutto */
  function updateSxCounts() {
    if (!document.querySelector(".sx")) return;
    const base = baseSpots(), by = {}, subs = {};
    base.forEach(s => { by[s.category] = (by[s.category] || 0) + 1; if (s.category === "spot") { const k = spotSub(s); subs[k] = (subs[k] || 0) + 1; } });
    document.querySelectorAll("[data-sxcount]").forEach(el => { el.textContent = fmtN(by[el.dataset.sxcount] || 0); });
    document.querySelectorAll("[data-sxsubcount]").forEach(el => { el.textContent = fmtN(subs[el.dataset.sxsubcount] || 0); });
    document.querySelectorAll("[data-sxgcount]").forEach(el => {
      const g = SX_GROUPS.find(x => x.id === el.dataset.sxgcount);
      el.textContent = fmtN(g.cats.reduce((a, k) => a + (!activeCats.has(k) ? 0 : k === "spot" ? SUB_KEYS.filter(x => activeSubs.has(x)).reduce((c, x) => c + (subs[x] || 0), 0) : by[k] || 0), 0) || 0);
    });
  }

  /* fondo della mappa piana: satellite (con nomi) oppure rilievo */
  function applyBase() {
    if (!map || !baseSat) return;
    const topo = ui === "earth" && viewMode === "terrain";
    [baseSat, baseTopo, satLabels].forEach(l => l && map.hasLayer(l) && map.removeLayer(l));
    (topo ? baseTopo : baseSat).addTo(map);
    if (!topo) satLabels.addTo(map);
  }

  /* MapLibre 5 tutto per il globo: non tocca la versione 4 usata dal planner 3D di Tools (e viceversa) */
  let ML5 = null;
  function loadMapLibre() {
    if (ML5) return Promise.resolve(ML5);
    if (loadMapLibre.p) return loadMapLibre.p;
    const before = window.maplibregl;
    if (before) delete window.maplibregl;
    loadMapLibre.p = new Promise((res, rej) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`;
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`;
      js.onload = () => {
        ML5 = window.maplibregl;
        if (before) window.maplibregl = before; else delete window.maplibregl;   // il planner troverà (o caricherà) la sua versione
        res(ML5);
      };
      js.onerror = () => { if (before) window.maplibregl = before; loadMapLibre.p = null; rej(new Error("MapLibre not loaded")); };
      document.head.appendChild(js);
    });
    return loadMapLibre.p;
  }

  async function ensureGlobe() {
    if (globe) return globe;
    if (globeFailed) throw new Error("globe unavailable");
    const ml = await loadMapLibre();
    if (!ml || !ml.Map || typeof ml.Map.prototype.setProjection !== "function") { globeFailed = true; throw new Error("old MapLibre"); }
    globeEl = document.createElement("div");
    globeEl.className = "sx-globe";
    globeEl.setAttribute("aria-label", "3D globe of the spots");
    $("#sxGlobeSlot")?.appendChild(globeEl);
    const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
    globe = new ml.Map({
      container: globeEl, center: [12, 30], zoom: earthZoom(), minZoom: 0, maxZoom: 7.5, attributionControl: { compact: true }, renderWorldCopies: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false,   // si gira e si avvicina, senza inclinare per sbaglio
      style: {
        version: 8, projection: { type: "globe" },
        sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
        sources: {
          sat: { type: "raster", tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 18,
            attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS community" },
          lbl: { type: "raster", tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 18 }
        },
        layers: [{ id: "sat", type: "raster", source: "sat" }, { id: "lbl", type: "raster", source: "lbl", paint: { "raster-opacity": 0.8 } }]
      }
    });
    globe.on("moveend", () => { drawGlobe(); maybeDescend(); });
    // pressione lunga sul globo: per aggiungere uno spot serve la mappa di dettaglio
    let gt = null, gs = null;
    globeEl.addEventListener("touchstart", e => { clearTimeout(gt); if (e.touches.length !== 1) return; gs = [e.touches[0].clientX, e.touches[0].clientY];
      gt = setTimeout(() => hint("Zoom in on the map, then press and hold to add a spot."), 600); }, { passive: true });
    globeEl.addEventListener("touchmove", e => { if (gs && Math.hypot(e.touches[0].clientX - gs[0], e.touches[0].clientY - gs[1]) > 10) clearTimeout(gt); }, { passive: true });
    ["touchend", "touchcancel"].forEach(ev => globeEl.addEventListener(ev, () => clearTimeout(gt), { passive: true }));
    globeEl.classList.add("is-loading");   // si mostra solo quando è già una sfera (mai la mappa piana ripetuta)
    const reveal = () => { if (!globeEl.classList.contains("is-loading")) return; try { globe.setProjection({ type: "globe" }); } catch {} globeEl.classList.remove("is-loading"); drawGlobe(); };
    globe.once("style.load", () => setTimeout(reveal, 120));
    globe.on("load", reveal);
    return globe;
  }

  /* Telefono: tenendo premuto il dito su un punto della mappa compare «Add a spot here», senza passare dal pulsante Add.
     Un tocco breve resta per i pin e per spostare la mappa; due dita = zoom (nessuna aggiunta). */
  function setupLongPressAdd(m) {
    const el = m.getContainer();
    let t = null, start = null, pop = null, pid = null;
    const cancel = () => { clearTimeout(t); t = null; };
    // iPhone: senza questo la pressione lunga avvia la selezione del testo («Copia», «Trova selezione») e annulla il gesto
    const stage = el.closest(".sx-stage, .spots-stage") || el;
    stage.addEventListener("selectstart", e => e.preventDefault());
    el.addEventListener("contextmenu", e => { if (Date.now() - (m._fcLong || 0) < 1500) e.preventDefault(); });
    const fire = () => {
      t = null; m._fcLong = Date.now();
      const r = el.getBoundingClientRect(), ll = m.containerPointToLatLng([start.x - r.left, start.y - r.top]);
      const lat = ll.lat, lon = L.Util.wrapNum(ll.lng, [-180, 180], true);
      try { navigator.vibrate?.(15); } catch {}
      pop?.remove();
      const box = document.createElement("div");
      box.className = "lp-add";
      box.innerHTML = guest
        ? `<button type="button" class="lp-add-btn">Log in to add a spot here</button><small>${lat.toFixed(5)}, ${lon.toFixed(5)}</small>`
        : `<button type="button" class="lp-add-btn">＋ Add a spot here</button><small>${lat.toFixed(5)}, ${lon.toFixed(5)}${m.getZoom() < 12 ? " · zoom in for a precise point" : ""}</small>`;
      pop = L.popup({ closeButton: true, autoPan: true, closeOnClick: false, className: "lp-pop", offset: [0, -6] }).setLatLng([lat, lon]).setContent(box).openOn(m);
      box.querySelector("button").addEventListener("click", () => {
        m.closePopup(pop);
        if (guest) { wantLogin = true; wantJoin = false; render(); root()?.scrollIntoView({ behavior: "smooth" }); return; }
        withConduct(() => openAdd({ lat, lon }));
      });
    };
    const down = (x, y, id, target) => {
      cancel();
      if (target.closest(".leaflet-marker-icon, .leaflet-popup, .leaflet-control, button, a")) return;
      start = { x, y }; pid = id; t = setTimeout(fire, 550);
    };
    const move = (x, y) => { if (t && start && Math.hypot(x - start.x, y - start.y) > 10) cancel(); };
    if (window.PointerEvent) {
      const touches = new Set();
      el.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") return; touches.add(e.pointerId); if (touches.size > 1) return cancel(); down(e.clientX, e.clientY, e.pointerId, e.target); });
      el.addEventListener("pointermove", e => { if (e.pointerId === pid) move(e.clientX, e.clientY); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(ev => el.addEventListener(ev, e => { touches.delete(e.pointerId); if (e.pointerId === pid && ev !== "pointerleave") cancel(); }));
    } else {
      el.addEventListener("touchstart", e => { if (e.touches.length !== 1) return cancel(); down(e.touches[0].clientX, e.touches[0].clientY, 1, e.target); }, { passive: true });
      el.addEventListener("touchmove", e => { if (e.touches.length > 1) return cancel(); move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
      ["touchend", "touchcancel"].forEach(ev => el.addEventListener(ev, cancel, { passive: true }));
    }
    m.on("zoomstart", () => { if (t) cancel(); });
  }

  /* globo → mappa di dettaglio, nello stesso punto (lo zoom di Leaflet è più alto di 1 rispetto a MapLibre) */
  function maybeDescend() {
    if (!onGlobe || viewMode !== "globe" || handing) return;
    if (globe.getZoom() >= GLOBE_TO_FLAT) { const c = globe.getCenter(); toFlat([c.lat, c.lng], globe.getZoom() + 1); }
  }
  function toFlat(center, zoom, opts = {}) {
    if (!map) return;
    onGlobe = false;
    stageEl()?.classList.remove("on-globe");
    if (center) { handing = true; map.setView(center, Math.max(3, Math.min(19, zoom)), { animate: false }); setTimeout(() => { handing = false; }, 60); }
    map.invalidateSize();
    if (!opts.quiet) hint(viewMode === "globe" ? "Zoom out to return to the globe." : "");
    drawClusters();
  }
  async function toGlobe(center, zoom, fly) {
    if (!globe) stageEl()?.classList.add("globe-wait");
    try { await ensureGlobe(); } catch { globeFailed = true; stageEl()?.classList.remove("globe-wait"); return toFlat(null); }
    stageEl()?.classList.remove("globe-wait");
    const slot = $("#sxGlobeSlot");
    if (slot && globeEl && globeEl.parentElement !== slot) slot.appendChild(globeEl);
    onGlobe = true;
    stageEl()?.classList.add("on-globe");
    globe.resize(); sheetPad();
    handing = true;
    if (center) globe.jumpTo({ center: [center[1], center[0]], zoom: Math.max(earthZoom() - 0.3, zoom) });
    if (fly) globe.flyTo({ center: globe.getCenter(), zoom: earthZoom(), duration: 1600, essential: true });
    setTimeout(() => { handing = false; }, fly ? 1700 : 80);
    hint("");
    drawGlobe();
  }
  const stageEl = () => document.querySelector(".sx-stage");
  /* zoom che mostra il pianeta intero nello spazio disponibile (il globo è largo ~470 px a zoom 1.35) */
  const earthZoom = () => { const el = stageEl(); const m = el ? Math.min(el.clientWidth, el.clientHeight - (el.classList.contains("has-sheet") ? 150 : 0)) : 700; return Math.max(0.1, 1.35 + Math.log2(m * 0.8 / 470)); };
  function hint(t) { const h = $("#sxHint"); if (!h) return; h.textContent = t; h.hidden = !t; clearTimeout(hint.t); if (t) hint.t = setTimeout(() => { h.hidden = true; }, 4000); }

  function setViewMode(m) {
    viewMode = m; lsSet(MODE_KEY, m);
    document.querySelectorAll("[data-sxmode]").forEach(b => { const on = b.dataset.sxmode === m; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    stageEl()?.setAttribute("data-mode", m);
    applyBase();
    if (m === "globe") { const c = map.getCenter(); toGlobe([c.lat, c.lng], Math.min(map.getZoom() - 1, GLOBE_TO_FLAT - 0.5), true); }
    else if (onGlobe) { const c = globe.getCenter(); toFlat([c.lat, c.lng], Math.max(3, globe.getZoom() + 1), { quiet: true }); }
  }

  /* dopo ogni costruzione della mappa: comandi, gruppi e (se serve) il globo */
  function earthAfterBuild() {
    // mosse della mappa piana chieste dal sito (cerca, vicino a me, apri uno spot…) mentre si vede il globo: si scende sulla mappa
    setTimeout(() => map && map.on("movestart", () => { if (onGlobe && !handing) toFlat(null); }), 120);
    map.on("zoomend", () => {
      if (viewMode === "globe" && !onGlobe && !handing && map.getZoom() <= FLAT_TO_GLOBE) { const c = map.getCenter(); toGlobe([c.lat, c.lng], map.getZoom() - 1); }
    });
    wireEarth();
    if (viewMode === "globe" && !globeFailed) {
      const c = map.getCenter();
      if (globe && globeEl) { $("#sxGlobeSlot")?.appendChild(globeEl); }
      // primo arrivo: il pianeta intero; dopo un aggiornamento della pagina resta dov'era
      if (globe && onGlobe) toGlobe(null);
      else if (!globe) toGlobe([c.lat, c.lng], earthZoom());
      else if (map.getZoom() <= FLAT_TO_GLOBE + 1.5) toGlobe([c.lat, c.lng], Math.max(earthZoom(), map.getZoom() - 1));
      else toFlat(null, null, { quiet: true });
    } else toFlat(null, null, { quiet: true });
  }

  const sxPhone = () => matchMedia("(max-width: 700px)").matches;
  /* sul telefono il centro del globo sale sopra il pannello in basso */
  function sheetPad() { try { globe?.setPadding({ top: 0, left: 0, right: 0, bottom: stageEl()?.classList.contains("has-sheet") ? 140 : 0 }); } catch {} }
  function wireEarth() {
    // telefono: le quattro macrocategorie diventano un pannello in basso, dentro la mappa, che si apre verso l'alto
    const sheet = $("#sxSheet"), groupsEl = document.querySelector(".sx-groups");
    if (sxPhone() && sheet && groupsEl) {
      sxOpen.clear();
      groupsEl.querySelectorAll(".sx-group").forEach(g => { g.classList.remove("open"); g.querySelector("[data-sxg]")?.setAttribute("aria-expanded", "false"); });
      sheet.appendChild(groupsEl);
      stageEl()?.classList.add("has-sheet");
    }
    if (!wireEarth.mq) { wireEarth.mq = true; matchMedia("(max-width: 700px)").addEventListener("change", () => { if (ui === "earth" && document.querySelector(".sx")) renderApp(); }); }
    const closeSheet = () => document.querySelectorAll(".sx-sheet .sx-group.open").forEach(g => { g.classList.remove("open"); g.querySelector("[data-sxg]")?.setAttribute("aria-expanded", "false"); sxOpen.delete(g.dataset.g); stageEl()?.classList.remove("sheet-open"); });
    if (sxPhone()) { $("#sxGlobeSlot")?.addEventListener("pointerdown", closeSheet); $("#spotsMap")?.addEventListener("pointerdown", closeSheet); }
    document.querySelectorAll("[data-sxg]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.sxg, sec = b.closest(".sx-group"), open = !sec.classList.contains("open");
      if (sxPhone()) closeSheet();   // sul telefono se ne apre uno alla volta
      sec.classList.toggle("open", open); b.setAttribute("aria-expanded", open);
      open ? sxOpen.add(id) : sxOpen.delete(id);
      if (sxPhone()) stageEl()?.classList.toggle("sheet-open", open);
    }));
    const syncCats = () => {
      document.querySelectorAll("[data-sxcat]").forEach(b => { const on = activeCats.has(b.dataset.sxcat); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
      document.querySelectorAll("[data-sxsub]").forEach(b => { const on = activeCats.has("spot") && activeSubs.has(b.dataset.sxsub); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
      document.querySelectorAll(".sx-group").forEach(sec => {
        const g = SX_GROUPS.find(x => x.id === sec.dataset.g);
        sec.classList.toggle("on", g.cats.some(c => activeCats.has(c)) || (g.id === "community" && showPhotographers));
      });
      drawClusters(); if (origin) renderNear();
    };
    document.querySelectorAll("[data-sxcat]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.sxcat;
      if (activeCats.has(k)) activeCats.delete(k);
      else { activeCats.add(k); if (k === "spot" && !activeSubs.size) SUB_KEYS.forEach(x => activeSubs.add(x)); }
      syncCats();
    }));
    document.querySelectorAll("[data-sxsub]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.sxsub;
      if (!activeCats.has("spot")) { activeCats.add("spot"); activeSubs.clear(); activeSubs.add(k); }   // solo questa sottocategoria
      else if (activeSubs.has(k)) { activeSubs.delete(k); if (!activeSubs.size) { activeCats.delete("spot"); SUB_KEYS.forEach(x => activeSubs.add(x)); } }
      else activeSubs.add(k);
      syncCats();
    }));
    document.querySelectorAll("[data-sxjoin]").forEach(b => b.addEventListener("click", () => { wantJoin = true; render(); root().scrollIntoView({ behavior: "smooth" }); }));
    document.querySelectorAll("[data-sxmode]").forEach(b => b.addEventListener("click", () => setViewMode(b.dataset.sxmode)));
    $("#sxNear")?.addEventListener("click", locateMe);
    $("#sxIn")?.addEventListener("click", () => onGlobe ? globe.zoomIn() : map.zoomIn());
    $("#sxOut")?.addEventListener("click", () => onGlobe ? globe.zoomOut() : map.zoomOut());
    $("#sxHome")?.addEventListener("click", () => { if (viewMode !== "globe") setViewMode("globe"); else if (onGlobe) globe.flyTo({ zoom: earthZoom(), duration: 1400 }); else { const c = map.getCenter(); toGlobe([c.lat, c.lng], Math.min(map.getZoom() - 1, 5), true); } });
    $("#sxToClassic")?.addEventListener("click", () => { ui = "classic"; lsSet(UI_KEY, ui); onGlobe = false; renderApp(); });
    $("#sxExport")?.addEventListener("click", exportArea);
    $("#sxFull")?.addEventListener("click", () => document.querySelector(".sx-stage .map-full-ctrl a")?.click());
    const st = stageEl();
    let wasFull = st?.classList.contains("map-full");
    if (st) new MutationObserver(() => {
      const full = st.classList.contains("map-full"), b = $("#sxFull");
      if (full === wasFull) return;   // solo quando cambia lo schermo intero
      wasFull = full;
      if (b) { b.innerHTML = full ? SX_ICON.fullExit : SX_ICON.full; b.title = full ? "Exit full screen" : "Full screen"; b.setAttribute("aria-label", b.title); }
      [60, 350].forEach(t => setTimeout(() => { globe?.resize(); drawGlobe(); }, t));
      setTimeout(() => { sheetPad(); if (globe && onGlobe && globe.getZoom() < earthZoom() + 0.3) globe.easeTo({ zoom: earthZoom(), duration: 500 }); }, 400);
    }).observe(st, { attributes: true, attributeFilter: ["class"] });
  }

  /* marker sul globo: gruppi in pixel, solo sul lato visibile del pianeta */
  function drawGlobe() {
    if (!globe) return;
    globeMarkers.forEach(m => m.remove()); globeMarkers = [];
    if (!onGlobe) return;
    const ml = ML5, c = globe.getCenter(), cell = sxTouch ? 64 : 78, w = globeEl.clientWidth, h = globeEl.clientHeight;
    const rad = Math.PI / 180, cLat = c.lat * rad, cLon = c.lng * rad;
    const ang = (lat, lon) => {   // distanza angolare dal centro della vista (oltre ~80° è dietro al pianeta)
      const la = lat * rad, lo = lon * rad;
      return Math.acos(Math.min(1, Math.sin(cLat) * Math.sin(la) + Math.cos(cLat) * Math.cos(la) * Math.cos(lo - cLon))) / rad;
    };
    const far = s => ang(s.lat, s.lon) > 80;
    // verso il bordo del pianeta i punti sfumano, così non coprono la Terra
    const fade = (lat, lon) => globe.getZoom() >= 4 ? 1 : Math.max(0.15, Math.min(1, (84 - ang(lat, lon)) / 30));
    const cells = new Map();
    visibleSpots().forEach(s => {
      if (globe.getZoom() < 4 && far(s)) return;
      const p = globe.project([s.lon, s.lat]);
      if (p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) return;
      const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      const c0 = cells.get(key) || cells.set(key, { list: [], x: 0, y: 0 }).get(key);
      c0.list.push(s); c0.x += p.x; c0.y += p.y;
    });
    // i gruppi troppo vicini (a qualsiasi zoom) si fondono: mai cerchi o numeri sovrapposti
    let blobs = [...cells.values()].map(b => ({ list: b.list, x: b.x / b.list.length, y: b.y / b.list.length }));
    const minGap = sxTouch ? 40 : 46;
    blobs.sort((a, b) => b.list.length - a.list.length);
    for (let changed = true, guard = 0; changed && guard < 6; guard++) {
      changed = false;
      const out = [];
      blobs.forEach(b => {
        const t = out.find(o => Math.hypot(o.x - b.x, o.y - b.y) < minGap);
        if (!t) return out.push(b);
        const n = t.list.length + b.list.length;
        t.x = (t.x * t.list.length + b.x * b.list.length) / n; t.y = (t.y * t.list.length + b.y * b.list.length) / n;
        t.list = t.list.concat(b.list); changed = true;
      });
      blobs = out;
    }
    blobs.map(b => b.list).forEach(group => {
      const el = document.createElement("button");
      el.type = "button";
      if (group.length === 1) {
        const s = group[0], k = CATS[s.category] || CATS.spot;
        el.className = "sx-gpin"; el.style.setProperty("--c", k.color); el.style.opacity = fade(s.lat, s.lon); el.innerHTML = `<span>${k.icon}</span>`;
        el.title = s.name; el.setAttribute("aria-label", s.name);
        el.addEventListener("click", ev => { ev.stopPropagation(); openFromGlobe(s); });
        globeMarkers.push(new ml.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(globe));
      } else {
        const lat = group.reduce((a, s) => a + s.lat, 0) / group.length, lon = group.reduce((a, s) => a + s.lon, 0) / group.length;
        // grandezza discreta, cresce piano con il numero di spot; il numero si legge solo sui gruppi grandi
        const n = group.length, size = Math.round(Math.min(34, 10 + Math.log10(n) * 9) * (sxTouch ? .9 : 1));
        el.className = `sx-gcl${n >= 10 ? " has-n" : ""}`; el.style.setProperty("--s", `${size}px`); el.style.opacity = fade(lat, lon);
        el.innerHTML = `<span>${fmtN(n)}</span>`;
        el.setAttribute("aria-label", `${n} spots`);
        el.addEventListener("click", ev => {
          ev.stopPropagation();
          const z = Math.min(globe.getZoom() + 2.2, GLOBE_TO_FLAT + 0.2);
          if (z >= GLOBE_TO_FLAT) return cinematic(lat, lon, () => map.flyTo([lat, lon], Math.min(12, z + 2.5), { duration: 1.2 }));
          cinematic(lat, lon, () => {}, { zoom: z, stayOnGlobe: true });
        });
        globeMarkers.push(new ml.Marker({ element: el }).setLngLat([lon, lat]).addTo(globe));
      }
    });
  }
  /* tocco su uno spot del globo: la Terra ruota, si avvicina e si apre la sua scheda */
  function openFromGlobe(s) { focusSpot(s); }

  /* VOLO CINEMATOGRAFICO: 1) la Terra ruota e porta il luogo al centro  2) ci si avvicina piano
     3) si scende senza stacchi sulla mappa satellitare di dettaglio, dove continua l'avvicinamento */
  const sxCalm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  let flying = false;
  function arcDeg(lat, lon) {
    const r = Math.PI / 180, c = globe.getCenter();
    return Math.acos(Math.min(1, Math.sin(c.lat * r) * Math.sin(lat * r) + Math.cos(c.lat * r) * Math.cos(lat * r) * Math.cos((lon - c.lng) * r))) / r;
  }
  function cinematic(lat, lon, then, opts = {}) {
    if (!globe || !onGlobe) return then();
    if (sxCalm) { toFlat([lat, lon], GLOBE_TO_FLAT + 1, { quiet: true }); return then(); }
    if (flying) return;
    flying = true; handing = true;
    stageEl()?.classList.add("is-flying");
    const arc = arcDeg(lat, lon), z0 = globe.getZoom(), whole = earthZoom();
    const spin = Math.round(Math.min(2400, 700 + arc * 14));
    const target = opts.zoom ?? (GLOBE_TO_FLAT - 0.05);
    const dur2 = Math.round(1400 + Math.max(0, target - Math.min(z0, whole)) * 260);
    const step2 = () => globe.easeTo({ center: [lon, lat], zoom: target, duration: dur2, easing: easeOut });
    const finish = () => {
      flying = false; handing = false;
      stageEl()?.classList.remove("is-flying");
      if (opts.stayOnGlobe) { drawGlobe(); return then(); }
      toFlat([lat, lon], target + 1, { quiet: true });
      then();
    };
    // 1) rotazione: se il luogo è lontano, ci si allontana un poco per vedere girare il pianeta
    globe.easeTo({ center: [lon, lat], zoom: arc > 35 ? Math.min(z0, whole + 0.1) : z0, duration: spin, easing: easeInOut });
    setTimeout(() => { step2(); setTimeout(finish, dur2 + 80); }, spin + 80);
  }

  function renderApp() {
    const lists = [...new Set(spots.map(s => s.list))].sort((a, b) => a.localeCompare(b));
    if (!activeLists) activeLists = new Set(lists);
    else lists.forEach(l => { if (!knownLists.has(l)) activeLists.add(l); });   // liste nuove: visibili
    knownLists = new Set(lists);
    if (!activeCats) activeCats = new Set(CAT_KEYS);
    const email = session ? jwtEmail(session.access_token) : "";
    const searchHtml = `
        <div class="spots-search" id="spotsSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
          <input id="spotsQuery" type="search" placeholder="Search a spot or a place…" value="${esc(query)}" aria-label="Search a spot or a place"
            autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="spotsSuggest">
          <button type="button" class="spots-locate" id="spotsLocate" title="Spots near me" aria-label="Find spots near me">${ICON_LOCATE}<span>Near me</span></button>
          <div class="spots-suggest" id="spotsSuggest" role="listbox" hidden></div>
        </div>
`;
    const userHtml = `
        <div class="spots-user">
          ${guest && session ? `<span class="spots-email">${esc(memberName || email)}</span>
          <button class="text-link" type="button" id="spotsLogout">Log out</button>` : guest ? `<button class="text-link" type="button" id="spotsLogin">Log in</button>
          <button class="outline-link spots-add" type="button" id="spotsJoin">${LOCK_SVG}Join free</button>` : `
          <a class="outline-link spots-add me-link" href="#me">◉ My Spots</a>
          ${admin ? `<button class="outline-link spots-add req-btn${pendingMembers.length + openFlags ? " has" : ""}" type="button" id="spotsRequests">Admin <b>${pendingMembers.length + openFlags}</b></button>` : ""}
          ${schemaV2 || admin ? `<button class="outline-link spots-add" type="button" id="spotsAdd">${ICON_PLUS}Add a place</button>` : ""}
          ${admin ? `<button class="text-link" type="button" id="spotsImport">${ICON_UPLOAD}Importa da Google Maps</button>` : ""}
          <span class="spots-email">${esc(email)}</span>
          <button class="text-link" type="button" id="spotsLogout">Log out</button>`}
        </div>
`;
    const bannerHtml = `
      ${guest && session ? `<div class="guest-banner pending-banner">${LOCK_SVG}<p>${esc(pendingText())}</p></div>` : ""}
      ${guest && !session ? `<div class="guest-banner">${LOCK_SVG}<p>${guestLoading || !spots.length ? `<strong>${guestLoading ? "Loading the shared spots…" : "The community map"}</strong>
          Members see every spot with its exact location, photos, reviews, prices and live alerts — and can add their own.
          <em>Membership is free:</em> <a href="#join">join in a minute</a>.` : (() => {
          const tr = window.I18N ? I18N.t("GUEST_BANNER") : "GUEST_BANNER";
          const tpl = tr !== "GUEST_BANNER" ? tr : `<strong>You're seeing {n} of {total} spots</strong>, in approximate positions.
          Members see every spot with its exact location, photos, reviews, prices and live alerts — and can add their own.
          <em>Membership is free:</em> <a href="#join">join in a minute</a>.`;
          return tpl.replace("{n}", fmtN(spots.length)).replace("{total}", fmtN(Math.max(publicTotal, spots.length)));
        })()}</p>
          <button type="button" class="outline-link" id="guestJoin">JOIN FREE <span aria-hidden="true">→</span></button>
          <a class="text-link guest-guide" href="#guide-spots">How Spots works</a> <a class="text-link guest-guide" href="guides/spots-quick-guide.pdf" target="_blank" rel="noopener">📄 One-page guide</a></div>` : ""}
`;
    const tailHtml = `
      ${!guest ? workshopsHtml() : ""}
      <section class="spots-around" id="spotsAround" aria-live="polite" hidden>
        <header class="around-head">
          <div><span class="eyebrow" id="aroundEyebrow"></span><h2 id="aroundTitle"></h2></div>
          <label class="near-radius">Within
            <select id="nearKm">${RADII.map(k => `<option value="${k}"${k === nearKm ? " selected" : ""}>${k} km</option>`).join("")}</select></label>
          <button type="button" class="near-close" id="nearClose" aria-label="Close">${ICON.close}</button>
        </header>
        <div class="around-cols">
          <div class="around-col" id="spotsNear"></div>
          <div class="around-col osm-col" id="osmCol"></div>
        </div>
      </section>
      <aside class="spots-disclaimer" role="note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3zm0 6v6m0 3v.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div>
          <strong>Before you go</strong>
          <p>Many of these spots are places I have saved but <em>not visited myself</em>. Locations, access, opening times and conditions may be inaccurate or out of date.
          Always check current information before you go — access rights, private property, permits, local rules, safety and weather.</p>
          <p>Places, descriptions, photos and reviews added by members are their own responsibility and are not checked in advance.</p>
          <p>The map is shared for inspiration only. You visit any spot entirely at your own risk: Fabio Costantini accepts no responsibility for any injury, damage, loss, fine or other consequence arising from the use of this information.</p>
        </div>
      </aside>
      <aside class="spots-disclaimer photo-rights" id="photoRights" role="note"${guest ? " hidden" : ""}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M14.8 9.6a3.6 3.6 0 1 0 0 4.8"/></svg>
        <div>
          <strong>Photo terms</strong>
          <p>Every photo shows the name of the member who uploaded it. By uploading a photo you confirm that <em>you took it yourself</em>, or that you hold the rights to share it, and that it doesn't show identifiable people without their consent.</p>
          <p><em>You keep the copyright.</em> You only grant Fabio Costa Ph a free, non-exclusive permission to show the photo to members inside this map, and you can withdraw it at any time by deleting the photo. Photos are not used elsewhere, sold or shared outside the map.</p>
          <p>All photos remain the property of their authors: they may not be downloaded, copied or reused without the author's permission. Photos that break these terms will be removed.</p>
        </div>
      </aside>
      ${spots.length || guest ? "" : `<p class="empty-state">No spots yet.${admin ? " Use «Importa da Google Maps» to add them." : ""}</p>`}`;
    const classicHtml = () => `
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
          ${guest && session ? `<span class="spots-email">${esc(memberName || email)}</span>
          <button class="text-link" type="button" id="spotsLogout">Log out</button>` : guest ? `<button class="text-link" type="button" id="spotsLogin">Log in</button>
          <button class="outline-link spots-add" type="button" id="spotsJoin">${LOCK_SVG}Join free</button>` : `
          ${admin ? `<button class="outline-link spots-add req-btn${pendingMembers.length + openFlags ? " has" : ""}" type="button" id="spotsRequests">Admin <b>${pendingMembers.length + openFlags}</b></button>` : ""}
          ${schemaV2 || admin ? `<button class="outline-link spots-add" type="button" id="spotsAdd">${ICON_PLUS}Add a place</button>` : ""}
          ${admin ? `<button class="text-link" type="button" id="spotsImport">${ICON_UPLOAD}Importa da Google Maps</button>` : ""}
          <span class="spots-email">${esc(email)}</span>
          <button class="text-link" type="button" id="spotsLogout">Log out</button>`}
        </div>
      </div>
      ${schemaV2 ? `<div class="filters spots-cats" role="group" aria-label="Categories">
        <button class="filter${activeCats.size === CAT_KEYS.length ? " active" : ""}" type="button" data-cat="__all">Everything</button>
        ${CAT_KEYS.map(k => `<button class="filter cat-filter${activeCats.has(k) && activeCats.size !== CAT_KEYS.length ? " active" : ""}" type="button" data-cat="${k}" style="--c:${CATS[k].color}">
          ${CATS[k].icon}${CATS[k].label} <small>${spots.filter(s => s.category === k).length}</small></button>`).join("")}
      </div>` : ""}
      ${guest && session ? `<div class="guest-banner pending-banner">${LOCK_SVG}<p>${esc(pendingText())}</p></div>` : ""}
      ${guest && !session ? `<div class="guest-banner">${LOCK_SVG}<p>${guestLoading || !spots.length ? `<strong>${guestLoading ? "Loading the shared spots…" : "The community map"}</strong>
          Members see every spot with its exact location, photos, reviews, prices and live alerts — and can add their own.
          <em>Membership is free:</em> <a href="#join">join in a minute</a>.` : (() => {
          const tr = window.I18N ? I18N.t("GUEST_BANNER") : "GUEST_BANNER";
          const tpl = tr !== "GUEST_BANNER" ? tr : `<strong>You're seeing {n} of {total} spots</strong>, in approximate positions.
          Members see every spot with its exact location, photos, reviews, prices and live alerts — and can add their own.
          <em>Membership is free:</em> <a href="#join">join in a minute</a>.`;
          return tpl.replace("{n}", fmtN(spots.length)).replace("{total}", fmtN(Math.max(publicTotal, spots.length)));
        })()}</p>
          <button type="button" class="outline-link" id="guestJoin">JOIN FREE <span aria-hidden="true">→</span></button>
          <a class="text-link guest-guide" href="#guide-spots">How Spots works</a> <a class="text-link guest-guide" href="guides/spots-quick-guide.pdf" target="_blank" rel="noopener">📄 One-page guide</a></div>` : ""}
      ${schemaV2 && socialV && !guest ? `<div class="spots-social" role="group" aria-label="Alerts and community">
        <label class="soc-pick">${ICON_ALERT}<span class="sr-only">Alerts</span>
          <select id="alertMode">
            <option value="show"${alertMode === "show" ? " selected" : ""}>Alerts: show</option>
            <option value="hide"${alertMode === "hide" ? " selected" : ""}>Hide places with alerts</option>
            <option value="only"${alertMode === "only" ? " selected" : ""}>Only places with alerts</option>
          </select></label>
        <button type="button" class="filter soc-support${onlySupport ? " active" : ""}" id="onlySupport" aria-pressed="${onlySupport}">🌱 Support local <small>${spots.filter(x => x.support_local).length}</small></button>
        <button type="button" class="text-link" id="openConduct">Community code</button>
        <a class="text-link" href="#guide-spots">How Spots works</a>
        <a class="text-link" href="guides/spots-quick-guide.pdf" target="_blank" rel="noopener">📄 Spots in one page</a>
      </div>` : ""}
      ${commV && !guest ? `<div class="spots-community" role="group" aria-label="Community">
        <button type="button" class="filter comm-btn${onlyFavs ? " active" : ""}" id="onlyFavs" aria-pressed="${onlyFavs}">♥ My spots <small>${favs.size}</small></button>
        <button type="button" class="filter comm-btn" id="meetList">👥 Meetups <small>${upcomingMeetups().length}</small></button>
        <button type="button" class="filter comm-btn" id="meetAdd">＋ Meetup</button>
        <button type="button" class="filter comm-btn${showPhotographers ? " active" : ""}" id="showPh" aria-pressed="${showPhotographers}">📷 Photographers <small>${profiles.filter(p => p.visible && p.on_map !== false && p.lat != null).length}</small></button>
        <button type="button" class="text-link" id="phList">List</button>
        ${nodiV ? `<button type="button" class="filter comm-btn" id="expList">🧭 Local experts <small>${experts.size}</small></button>` : ""}
        ${nodiV && myExpert() ? `<button type="button" class="filter comm-btn xp-mine" id="myArea">🧭 My area</button>` : ""}
        ${nodiV && profiles.some(p => p.user_id === myUid()) ? `<button type="button" class="filter comm-btn" id="iPosted">📣 I just posted</button>` : ""}
        <button type="button" class="text-link" id="myProfile">${profiles.some(p => p.user_id === myUid()) ? "My photographer profile" : "Join the photographers' map"}</button>
      </div>` : ""}
      <p class="sx-switch-row"><button type="button" class="text-link sx-switch" id="sxToEarth">🌍 Try the new Earth view</button></p>
      <div class="spots-stage">
        <div id="spotsMap" class="map map-spots" aria-label="Members map of photo spots"></div>
        <span class="hud-frame" aria-hidden="true"></span>
        ${schemaV2 ? `<button type="button" class="osm-scan" id="osmScan">${ICON_SCAN}Scan this area</button>` : ""}
      </div>
      ${!guest ? workshopsHtml() : ""}
      <section class="spots-around" id="spotsAround" aria-live="polite" hidden>
        <header class="around-head">
          <div><span class="eyebrow" id="aroundEyebrow"></span><h2 id="aroundTitle"></h2></div>
          <label class="near-radius">Within
            <select id="nearKm">${RADII.map(k => `<option value="${k}"${k === nearKm ? " selected" : ""}>${k} km</option>`).join("")}</select></label>
          <button type="button" class="near-close" id="nearClose" aria-label="Close">${ICON.close}</button>
        </header>
        <div class="around-cols">
          <div class="around-col" id="spotsNear"></div>
          <div class="around-col osm-col" id="osmCol"></div>
        </div>
      </section>
      <aside class="spots-disclaimer" role="note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3zm0 6v6m0 3v.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div>
          <strong>Before you go</strong>
          <p>Many of these spots are places I have saved but <em>not visited myself</em>. Locations, access, opening times and conditions may be inaccurate or out of date.
          Always check current information before you go — access rights, private property, permits, local rules, safety and weather.</p>
          <p>Places, descriptions, photos and reviews added by members are their own responsibility and are not checked in advance.</p>
          <p>The map is shared for inspiration only. You visit any spot entirely at your own risk: Fabio Costantini accepts no responsibility for any injury, damage, loss, fine or other consequence arising from the use of this information.</p>
        </div>
      </aside>
      <aside class="spots-disclaimer photo-rights" id="photoRights" role="note"${guest ? " hidden" : ""}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M14.8 9.6a3.6 3.6 0 1 0 0 4.8"/></svg>
        <div>
          <strong>Photo terms</strong>
          <p>Every photo shows the name of the member who uploaded it. By uploading a photo you confirm that <em>you took it yourself</em>, or that you hold the rights to share it, and that it doesn't show identifiable people without their consent.</p>
          <p><em>You keep the copyright.</em> You only grant Fabio Costa Ph a free, non-exclusive permission to show the photo to members inside this map, and you can withdraw it at any time by deleting the photo. Photos are not used elsewhere, sold or shared outside the map.</p>
          <p>All photos remain the property of their authors: they may not be downloaded, copied or reused without the author's permission. Photos that break these terms will be removed.</p>
        </div>
      </aside>
      ${spots.length || guest ? "" : `<p class="empty-state">No spots yet.${admin ? " Use «Importa da Google Maps» to add them." : ""}</p>`}`;
    root().innerHTML = ui === "earth" ? earthHtml({ searchHtml, userHtml, bannerHtml, tailHtml }) : classicHtml();
    wireSearch();
    $("#nearKm")?.addEventListener("change", e => {
      nearKm = +e.target.value;
      try { localStorage.setItem("fcph-near-km", nearKm); } catch {}
      if (!origin) return;
      if (origin.kind === "scan") origin.radius = nearKm * 1000;
      drawOrigin(); renderNear(); fitRadius();
      if (schemaV2) scanOsm(origin);
    });
    $("#osmScan")?.addEventListener("click", () => {
      if (map.getZoom() < 9) return toast("Zoom in a little more to scan an area.", true);
      const c = map.getCenter(), b = map.getBounds();
      const r = Math.min(15000, map.distance(c, b.getNorthEast()) * 0.8);
      setOriginScan({ lat: c.lat, lon: L.Util.wrapNum(c.lng, [-180, 180], true), label: "This area", kind: "scan", radius: Math.min(r, nearKm * 1000) });
    });
    $$(".spots-cats [data-cat]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.cat;
      if (k === "__all") activeCats = new Set(CAT_KEYS);
      else if (activeCats.size === CAT_KEYS.length) activeCats = new Set([k]);
      else { activeCats.has(k) ? activeCats.delete(k) : activeCats.add(k); if (!activeCats.size) activeCats = new Set(CAT_KEYS); }
      renderApp();
    }));
    $("#spotsLogout")?.addEventListener("click", logout);
    $("#spotsLogin")?.addEventListener("click", () => { wantLogin = true; wantJoin = false; render(); root().scrollIntoView({ behavior: "smooth" }); });
    [$("#spotsJoin"), $("#guestJoin")].forEach(b => b?.addEventListener("click", () => { wantJoin = true; render(); root().scrollIntoView({ behavior: "smooth" }); }));
    $("#spotsRequests")?.addEventListener("click", openRequests);
    $$("[data-wsgo]").forEach(b => b.addEventListener("click", () => {
      const s = spots.find(x => x.id === +b.dataset.wsgo);
      if (!s) return;
      if (activeCats && !activeCats.has("workshop")) { activeCats.add("workshop"); }
      $("#spotsMap")?.scrollIntoView({ behavior: "smooth", block: "center" });
      focusSpot(s);
    }));
    $("#spotsImport")?.addEventListener("click", openImport);
    $("#sxToEarth")?.addEventListener("click", () => { ui = "earth"; lsSet(UI_KEY, ui); renderApp(); });
    $("[data-addws]")?.addEventListener("click", () => withConduct(() => openAdd(null, { category: "workshop" })));
    $("#spotsAdd")?.addEventListener("click", () => withConduct(() => openAdd()));
    $("#alertMode")?.addEventListener("change", e => { alertMode = e.target.value; drawClusters(); renderNear(); });
    $("#onlySupport")?.addEventListener("click", () => { onlySupport = !onlySupport; renderApp(); });
    $("#openConduct")?.addEventListener("click", () => showConduct());
    $("#onlyFavs")?.addEventListener("click", () => {
      if (!favs.size && !onlyFavs) return toast("Tap ♡ Save on any place to add it to your spots.");
      onlyFavs = !onlyFavs; renderApp();
    });
    $("#meetList")?.addEventListener("click", openMeetupList);
    $("#meetAdd")?.addEventListener("click", () => withConduct(() => openMeetup(map ? { lat: map.getCenter().lat, lon: L.Util.wrapNum(map.getCenter().lng, [-180, 180], true) } : null)));
    $("#showPh")?.addEventListener("click", () => {
      showPhotographers = !showPhotographers;
      $("#showPh").classList.toggle("active", showPhotographers);
      $("#showPh").setAttribute("aria-pressed", showPhotographers);
      drawCommunity();
      if (showPhotographers) { const pts = profiles.filter(p => p.visible && p.on_map !== false && p.lat != null).map(p => [p.lat, p.lon]); if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 8, duration: .8 }); else toast("No photographers on the map yet: be the first!"); }
    });
    $("#myProfile")?.addEventListener("click", openProfile);
    $("#expList")?.addEventListener("click", openExperts);
    $("#phList")?.addEventListener("click", () => openPhotographers(false));
    $("#myArea")?.addEventListener("click", openMyArea);
    $("#iPosted")?.addEventListener("click", openPosted);
    buildMap();
    if (origin) renderNear();
    consumeFocus();
  }

  /* ---------- ricerca: spot per nome + luoghi (città, laghi, zone) ---------- */
  function wireSearch() {
    const input = $("#spotsQuery"), box = $("#spotsSuggest");
    input.addEventListener("input", () => {
      coordHit = parseCoordsInput(input.value);
      query = coordHit ? "" : input.value; drawClusters();
      if (origin) renderNear();
      const q = query.trim();
      placeResults = []; clearTimeout(placeTimer);
      if (q.length >= 3 && !coordHit) placeTimer = setTimeout(() => searchPlaces(q).then(r => { if (input.value.trim() === q) { placeResults = r; renderSuggest(); } }), 380);
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
        const cc = parseCoordsInput(q);
        if (cc) return goCoords(cc);
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
    const cc = parseCoordsInput(input.value);
    const spotHits = q.length >= 2 && !cc ? visibleSpots().slice(0, 6) : [];
    let i = 0, html = "";
    if (cc) html += `<p class="sg-head">Coordinates</p><button type="button" role="option" class="sg-item" data-i="${i++}" data-coords>
        ${ICON.pin}<span class="sg-text"><strong>${fmtCoord(cc.lat, cc.lon).replace("  |  ", " · ")}</strong><small>Go to this point and see the spots around it</small></span></button>`;
    if (spotHits.length) html += `<p class="sg-head">Spots</p>` + spotHits.map(s =>
      `<button type="button" role="option" class="sg-item" data-i="${i++}" data-spot="${s.id}">
        <span class="sg-cat" style="--c:${(CATS[s.category] || CATS.spot).color}">${(CATS[s.category] || CATS.spot).icon}</span><span class="sg-text"><strong>${esc(s.name)}</strong><small>${(CATS[s.category] || CATS.spot).label}</small></span></button>`).join("");
    if (placeResults.length) html += `<p class="sg-head">Places</p>` + placeResults.map((p, k) =>
      `<button type="button" role="option" class="sg-item" data-i="${i++}" data-place="${k}">
        ${ICON.pin}<span class="sg-text"><strong>${esc(p.name)}</strong><small>${esc(p.context)}</small></span></button>`).join("");
    else if (q.length >= 3 && !cc) html += `<p class="sg-head sg-wait">Places · searching…</p>`;
    box.innerHTML = html;
    box.hidden = !html;
    input.setAttribute("aria-expanded", html ? "true" : "false");
    box.querySelectorAll("[data-spot]").forEach(b => b.addEventListener("click", () => {
      const s = spots.find(x => String(x.id) === b.dataset.spot);
      if (!s) return;
      input.value = s.name; query = ""; drawClusters(); closeSuggest(); focusSpot(s);
    }));
    box.querySelectorAll("[data-place]").forEach(b => b.addEventListener("click", () => pickPlace(placeResults[+b.dataset.place])));
    box.querySelector("[data-coords]")?.addEventListener("click", () => goCoords(cc));
  }
  function closeSuggest() {
    const box = $("#spotsSuggest");
    if (box) { box.hidden = true; box.innerHTML = ""; }
    $("#spotsQuery")?.setAttribute("aria-expanded", "false");
    suggestIdx = -1;
  }

  /* ricerca per coordinate: si va su quel punto, con il cerchio dei dintorni */
  let coordHit = null;
  function goCoords(c) {
    const input = $("#spotsQuery");
    const label = `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`;
    if (input) { input.value = label; input.blur(); }
    query = ""; coordHit = null; closeSuggest();
    setOrigin({ lat: c.lat, lon: c.lon, label, kind: "place" });
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
    if (ui === "earth" && onGlobe) return cinematic(o.lat, o.lon, () => setOrigin(o, extent));
    origin = o;
    drawOrigin();
    if (schemaV2) scanOsm(o, extent);
    renderNear();
    map.invalidateSize();   // sul telefono il pannello cambia l'altezza della mappa
    if (extent && extent.length === 4 && Math.abs(extent[2] - extent[0]) > 0.3) {
      // area grande (regione, parco): mostra tutta l'area
      map.flyToBounds([[extent[3], extent[0]], [extent[1], extent[2]]], { maxZoom: 13, duration: 1 });
    } else fitRadius();
  }

  function fitRadius() {
    if (!origin) return;
    map.flyToBounds(L.latLng(origin.lat, origin.lon).toBounds(nearKm * 2000), { duration: 0.8 });
  }
  function setOriginScan(o) {
    origin = o; drawOrigin(); renderNear(); scanOsm(o);
  }

  function drawOrigin() {
    if (!originLayer) return;
    originLayer.clearLayers();
    if (!origin) return;
    if (origin.kind === "me" && origin.acc && origin.acc < 3000)
      L.circle([origin.lat, origin.lon], { radius: origin.acc, color: "#6fb4ff", weight: 1, opacity: .6, fillOpacity: .08, interactive: false }).addTo(originLayer);
    L.circle([origin.lat, origin.lon], { radius: nearKm * 1000, color: "#9cc8ff", weight: 1.2, dashArray: "6 6", fillOpacity: 0.03, interactive: false }).addTo(originLayer);
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

  /* Vista Terra: «Cosa c'è intorno» non sta più sotto la mappa ma in un pannello che scorre da destra,
     aperto da una piccola icona sulla mappa (con il numero di posti trovati). */
  let aroundOpen = false;
  function aroundDrawer(count) {
    const box = $("#spotsAround"), stage = $(".sx-stage");
    if (!box || !stage || ui !== "earth") return false;
    if (box.parentElement !== stage) { stage.appendChild(box); box.classList.add("as-drawer"); }
    let tab = $("#aroundTab");
    if (!tab) {
      tab = document.createElement("button");
      tab.type = "button"; tab.id = "aroundTab"; tab.className = "around-tab";
      tab.setAttribute("aria-controls", "spotsAround");
      tab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/></svg><b></b>';
      stage.appendChild(tab);
      tab.addEventListener("click", () => setAround(true));
    }
    tab.querySelector("b").textContent = count > 99 ? "99+" : String(count);
    tab.title = tab.ariaLabel = `What's nearby: ${count} places`;
    if (!origin) { aroundOpen = false; }
    tab.hidden = !origin || aroundOpen;
    box.classList.toggle("open", !!origin && aroundOpen);
    box.hidden = !origin;
    box.inert = !aroundOpen;
    return true;
  }
  function setAround(open) {
    aroundOpen = open;
    const box = $("#spotsAround"), tab = $("#aroundTab");
    if (!box || !tab) return;
    box.classList.toggle("open", open); box.inert = !open;
    tab.hidden = open || !origin;
    if (!open) tab.classList.remove("pulse");
  }
  function renderNear() {
    const el = $("#spotsNear"), box = $("#spotsAround");
    if (!el) return;
    if (!origin) { box.hidden = true; el.innerHTML = ""; aroundDrawer(0); return; }
    box.hidden = false;
    $("#aroundEyebrow").textContent = origin.kind === "me" ? "Near you" : origin.kind === "scan" ? "This area" : "Around";
    $("#aroundTitle").textContent = origin.kind === "me" ? "What's around you" : origin.label;
    const inR = visibleSpots().map(s => ({ s, d: distKm(origin, s) })).filter(o => o.d <= nearKm).sort((a, b) => a.d - b.d);
    const top = inR.length ? inR.slice(0, 15) : nearestSpots(1);
    const where = origin.kind === "me" ? "you" : esc(origin.label);
    el.innerHTML = `
      <h3 class="col-title"><span class="col-dot community"></span>From the community</h3>
      <p class="near-sum">${!top.length ? "No spots match the current filters."
        : inR.length ? `<strong>${inR.length}</strong> place${inR.length > 1 ? "s" : ""} within ${nearKm} km${inR.length > 15 ? " · showing the 15 closest" : ""}`
        : `Nothing within ${nearKm} km of ${where}. The nearest is <strong>${fmtKm(top[0].d)}</strong> away — try a larger radius.`}</p>
      <ol class="near-list">${top.map(({ s, d }) => `
        <li><button type="button" data-near="${s.id}">
          <span class="sg-cat" style="--c:${(CATS[s.category] || CATS.spot).color}">${(CATS[s.category] || CATS.spot).icon}</span>
          <span class="sg-text"><strong>${esc(s.name)}</strong><small>${(CATS[s.category] || CATS.spot).label}</small></span>
          <span class="near-d">${fmtKm(d)}</span></button></li>`).join("")}</ol>`;
    el.querySelectorAll("[data-near]").forEach(b => b.addEventListener("click", () => {
      const s = spots.find(x => String(x.id) === b.dataset.near);
      if (s) focusSpot(s);
    }));
    const clearAll = () => { origin = null; osmItems = []; aroundOpen = false; drawOrigin(); drawOsm(); renderNear(); drawClusters(); };
    if (aroundDrawer(inR.length || top.length)) {
      // nella vista Terra la X fa solo scorrere via il pannello; «Clear» toglie la ricerca dalla mappa
      $("#nearClose").onclick = () => setAround(false);
      if (!$("#nearClear")) $("#nearClose").insertAdjacentHTML("beforebegin", `<button type="button" class="text-link near-clear" id="nearClear">Clear</button>`);
      $("#nearClear").onclick = clearAll;
      const tab = $("#aroundTab"); if (tab && !aroundOpen) { tab.classList.remove("pulse"); void tab.offsetWidth; tab.classList.add("pulse"); }
    } else $("#nearClose").onclick = clearAll;
    renderOsm();
  }

  /* =========================================================
     OPENSTREETMAP: cosa c'è di interessante intorno (oltre agli spot della community)
     ========================================================= */
  const OSM_TYPES = {
    viewpoint: { label: "Viewpoint", score: 3, icon: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>' },
    peak: { label: "Peak", score: 2, icon: '<svg viewBox="0 0 24 24"><path d="m3 19 7-12 3.5 6 2-3L21 19z"/></svg>' },
    waterfall: { label: "Waterfall", score: 3, icon: '<svg viewBox="0 0 24 24"><path d="M5 4h14M8 4v9M12 4v12M16 4v9M5 20c2-1.5 4-1.5 7 0s5 1.5 7 0"/></svg>' },
    nature: { label: "Nature", score: 2, icon: '<svg viewBox="0 0 24 24"><path d="M12 3c4 3 6 6 6 9a6 6 0 0 1-12 0c0-3 2-6 6-9zM12 21v-9"/></svg>' },
    castle: { label: "Castle & tower", score: 3, icon: '<svg viewBox="0 0 24 24"><path d="M4 20V8h3v2h2V8h2v2h2V8h2v2h2V8h3v12zM10 20v-4a2 2 0 0 1 4 0v4"/></svg>' },
    ruins: { label: "Ruins & archaeology", score: 3, icon: '<svg viewBox="0 0 24 24"><path d="M4 20h16M6 20V9M10 20v-7M14 20V9M18 20v-5M4 7l8-3 8 3"/></svg>' },
    church: { label: "Church & abbey", score: 1, icon: '<svg viewBox="0 0 24 24"><path d="M12 2v5M10 4h4M6 21V11l6-4 6 4v10zM10 21v-4h4v4"/></svg>' },
    landmark: { label: "Landmark", score: 2, icon: '<svg viewBox="0 0 24 24"><path d="M9 21l1.5-14h3L15 21zM8 7h8M12 3v4M6 12l-3 1M18 12l3 1"/></svg>' },
    attraction: { label: "Attraction", score: 1, icon: '<svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z"/></svg>' },
    hut: { label: "Hut & camp", score: 1, icon: '<svg viewBox="0 0 24 24"><path d="M3 20 12 5l9 15zM10 20l2-4 2 4"/></svg>' }
  };
  function osmType(t) {
    if (t.tourism === "viewpoint" || t["tower:type"] === "observation") return "viewpoint";
    if (t.natural === "peak" || t.natural === "volcano") return "peak";
    if (t.waterway === "waterfall" || t.natural === "waterfall") return "waterfall";
    if (t.natural) return "nature";
    if (/^(castle|fort|palace|manor|tower|city_gate)$/.test(t.historic)) return "castle";
    if (/^(ruins|archaeological_site|aqueduct)$/.test(t.historic)) return "ruins";
    if (t.historic === "monastery" || t.historic === "church" || t.amenity === "place_of_worship") return "church";
    if (t.man_made || t.historic === "lighthouse") return "landmark";
    if (/^(alpine_hut|wilderness_hut|camp_site|picnic_site)$/.test(t.tourism)) return "hut";
    return "attraction";
  }
  const osmCache = new Map();
  const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
  async function scanOsm(o, extent) {
    const seq = ++osmSeq;
    let r = Math.min(25000, o.radius || nearKm * 1000);   // OpenStreetMap: al massimo 25 km per non sovraccaricarlo
    r = Math.round(r);
    const key = `${o.lat.toFixed(3)},${o.lon.toFixed(3)},${r}`;
    osmState = "loading"; renderOsm();
    const A = `(around:${r},${o.lat.toFixed(5)},${o.lon.toFixed(5)})`;
    // richiesta leggera: niente relazioni grandi (parchi) nella ricerca a raggio, quelle si chiedono con «is_in» (solo il punto)
    const q = `[out:json][timeout:40];(
      nw["tourism"~"^(viewpoint|attraction|museum|alpine_hut|wilderness_hut)$"]${A};
      node["natural"~"^(peak|volcano)$"]["name"]${A};
      node["natural"~"^(cave_entrance|arch|hot_spring|waterfall)$"]${A};
      nw["waterway"="waterfall"]${A};
      nw["historic"~"^(castle|fort|palace|tower|city_gate|ruins|archaeological_site|aqueduct|monastery)$"]${A};
      nw["man_made"~"^(lighthouse|observatory|windmill|watermill)$"]${A};
      nw["tower:type"="observation"]${A};
    );out center meta 200;
    is_in(${o.lat.toFixed(5)},${o.lon.toFixed(5)})->.a;
    (area.a["boundary"~"^(protected_area|national_park)$"]; area.a["leisure"="nature_reserve"];);out tags;`;
    try {
      let data = osmCache.get(key);
      if (!data) {
        // più server pubblici di Overpass: se uno è occupato o non risponde, si prova il successivo
        let lastErr = null;
        for (const url of OVERPASS) {
          try {
            const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000);
            const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), signal: ctl.signal,
              headers: { "Content-Type": "application/x-www-form-urlencoded" } });
            clearTimeout(tm);
            if (!res.ok) throw new Error(res.status === 429 || res.status === 504 ? "busy" : `HTTP ${res.status}`);
            data = await res.json();
            break;
          } catch (err) { lastErr = err; }
        }
        if (!data) throw lastErr || new Error("no answer");
        osmCache.set(key, data);
      }
      if (seq !== osmSeq) return;
      const now = Date.now(), seen = new Set();
      osmProtected = [];
      osmItems = (data.elements || []).map(e => {
        const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
        if (e.type === "area" || t.boundary === "protected_area" || t.boundary === "national_park" || t.leisure === "nature_reserve") {
          if (t.name && !osmProtected.includes(t.name)) osmProtected.push(t.name); return null; }
        if (lat == null) return null;
        const type = osmType(t), name = t["name:en"] || t.name || OSM_TYPES[type].label;
        const k = `${name}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
        if (seen.has(k)) return null; seen.add(k);
        const age = e.timestamp ? (now - Date.parse(e.timestamp)) / 864e5 : 999;
        const d = distKm(o, { lat, lon });
        const score = OSM_TYPES[type].score + (t.wikipedia || t.wikidata ? 3 : 0) + (t.name ? 1 : 0) + (age <= 30 ? 1 : 0) - d / 4;
        return { id: `${e.type}/${e.id}`, lat, lon, tags: t, type, name, named: !!t.name, d, age, fresh: age <= 30, score };
      }).filter(Boolean).sort((a, b) => b.score - a.score);
      osmState = osmItems.length ? "ok" : "empty";
    } catch (err) {
      if (seq !== osmSeq) return;
      osmItems = []; osmState = err.message === "busy" ? "busy" : "error";
      if (!o._retried) { o._retried = true; setTimeout(() => { if (origin === o) scanOsm(o, extent); }, 9000); osmState = "retry"; }
    }
    drawOsm(); renderOsm();
    flashTop();
  }
  let osmProtected = [];

  function drawOsm() {
    if (!osmLayer) return;
    osmLayer.clearLayers();
    if (!showOsm || !origin) return;
    osmItems.slice(0, 200).forEach(it => {
      const T = OSM_TYPES[it.type];
      const m = L.marker([it.lat, it.lon], { zIndexOffset: -1000, title: it.name, keyboard: false,
        icon: L.divIcon({ className: "", iconSize: [24, 24], iconAnchor: [12, 12],
          html: `<div class="osm-pin${it.fresh ? " fresh" : ""}" data-osm="${it.id}">${T.icon}</div>` }) }).addTo(osmLayer);
      m.bindTooltip(esc(it.name), { direction: "top" });
      m.bindPopup(() => osmPopup(it), { maxWidth: 300, minWidth: 240, className: "spot-popup" });
      m.on("popupopen", e => wireOsmPopup(e.popup, it));
      it.marker = m;
    });
  }
  /* «lampi»: i posti più interessanti (e quelli appena aggiornati su OpenStreetMap) si accendono per un attimo */
  function flashTop() {
    const pick = [...osmItems.filter(i => i.fresh).slice(0, 6), ...osmItems.slice(0, 5)];
    pick.forEach((it, i) => setTimeout(() => {
      const el = it.marker?.getElement()?.querySelector(".osm-pin");
      if (!el) return;
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    }, 250 + i * 220));
  }

  const ago = d => d < 1 ? "today" : d < 2 ? "yesterday" : `${Math.round(d)} days ago`;
  function osmFacts(t) {
    const f = [];
    if (t.ele) f.push(`${Math.round(parseFloat(t.ele))} m`);
    if (t.fee === "yes" || t.charge) f.push(`🎟️ ${t.charge ? esc(t.charge) : "Ticket required"}`);
    else if (t.fee === "no") f.push("Free entry");
    if (t.opening_hours) f.push(`🕒 ${esc(t.opening_hours)}`);
    if (t.access === "private" || t.access === "no") f.push("⛔ Private / no access");
    else if (t.access === "permissive") f.push("Access tolerated by the owner");
    return f;
  }
  function osmPopup(it) {
    const t = it.tags, T = OSM_TYPES[it.type], web = t.website || t["contact:website"] || t.url;
    const wiki = t.wikipedia && /^([a-z-]+):(.+)$/.exec(t.wikipedia);
    const g = encodeURIComponent(`${it.named ? it.name : T.label} ${t["addr:city"] || origin?.label || ""} opening hours tickets access`.trim());
    return `<div class="spot-pop osm-pop">
      <span class="spot-cat" style="--c:#e6edf7">${T.icon}${T.label}<em>OpenStreetMap</em></span>
      <strong>${esc(it.name)}</strong>
      ${osmFacts(t).length ? `<p class="osm-facts">${osmFacts(t).join(" · ")}</p>` : ""}
      ${t.description ? `<p class="pop-desc">${esc(t.description)}</p>` : ""}
      <div class="osm-wiki" data-wiki></div>
      <p class="pop-author">${fmtKm(it.d)} from ${origin?.kind === "me" ? "you" : esc(origin?.label || "the point")}${it.fresh ? ` · ⚡ updated on OpenStreetMap ${ago(it.age)}` : ""}</p>
      <div class="osm-links">
        ${web ? `<a class="text-link" href="${esc(/^https?:/.test(web) ? web : "https://" + web)}" target="_blank" rel="noopener">${ICON.ext}Official website</a>` : ""}
        ${wiki ? `<a class="text-link" href="https://${wiki[1]}.wikipedia.org/wiki/${encodeURIComponent(wiki[2])}" target="_blank" rel="noopener">${ICON.ext}Wikipedia</a>` : ""}
        <a class="text-link" href="https://www.google.com/search?q=${g}" target="_blank" rel="noopener">${ICON.ext}Check tickets & access</a>
        <a class="text-link" href="https://www.google.com/maps/search/?api=1&query=${it.lat.toFixed(6)},${it.lon.toFixed(6)}" target="_blank" rel="noopener">${ICON.ext}Open in Google Maps</a>
        <a class="text-link" href="https://www.openstreetmap.org/${it.id}" target="_blank" rel="noopener">${ICON.ext}View on OpenStreetMap</a>
      </div>
      ${schemaV2 ? `<button type="button" class="pop-btn primary" data-addosm>${ICON_PLUS}Add to community spots</button>` : ""}
    </div>`;
  }
  async function wireOsmPopup(popup, it) {
    const el = popup.getElement();
    el.querySelector("[data-addosm]")?.addEventListener("click", () => {
      map.closePopup();
      openAdd({ lat: it.lat, lon: it.lon }, { name: it.named ? it.name : "", category: it.type === "hut" ? "hotel" : "spot" });
    });
    const t = it.tags, wiki = t.wikipedia && /^([a-z-]+):(.+)$/.exec(t.wikipedia), box = el.querySelector("[data-wiki]");
    if (!wiki || !box || box.dataset.done) return;
    box.dataset.done = "1";
    try {
      const r = await fetch(`https://${wiki[1]}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wiki[2])}`);
      const j = await r.json();
      if (j.extract) {
        box.innerHTML = `${j.thumbnail?.source ? `<img src="${esc(j.thumbnail.source)}" alt="" loading="lazy">` : ""}<p>${esc(j.extract.split(/(?<=\.)\s/).slice(0, 2).join(" "))}</p>`;
        popup.update();
      }
    } catch {}
  }

  function renderOsm() {
    const col = $("#osmCol");
    if (!col) return;
    if (!schemaV2 || !origin) { col.innerHTML = ""; return; }
    const fresh = osmItems.filter(i => i.fresh).length;
    const head = `<h3 class="col-title"><span class="col-dot osm"></span>Also around, from OpenStreetMap
      <label class="osm-toggle"><input type="checkbox" id="osmShow"${showOsm ? " checked" : ""}> on map</label></h3>`;
    const body = osmState === "loading" ? `<p class="near-sum">Looking for viewpoints, waterfalls, castles and more…</p>`
      : osmState === "error" ? `<p class="near-sum">OpenStreetMap didn't answer. <button type="button" class="text-link" id="osmRetry">Try again</button></p>`
      : osmState === "retry" ? `<p class="near-sum">OpenStreetMap is slow right now: trying again in a few seconds…</p>`
      : osmState === "busy" ? `<p class="near-sum">OpenStreetMap is busy right now. <button type="button" class="text-link" id="osmRetry">Try again</button> in a minute.</p>`
      : osmState === "empty" ? `<p class="near-sum">Nothing notable found on OpenStreetMap here.</p>`
      : `<p class="near-sum"><strong>${osmItems.length}</strong> places${fresh ? ` · <span class="osm-fresh-n">⚡ ${fresh} updated in the last 30 days</span>` : ""}</p>
        ${osmProtected.length ? `<p class="osm-protected">🌲 You are inside a protected area: <strong>${osmProtected.slice(0, 3).map(esc).join(", ")}</strong> — check local rules (drones, camping, night access).</p>` : ""}
        <ol class="near-list">${osmItems.slice(0, 12).map((it, i) => `
          <li><button type="button" data-osmi="${i}">
            <span class="sg-cat osm-ico${it.fresh ? " fresh" : ""}" style="--c:#e6edf7">${OSM_TYPES[it.type].icon}</span>
            <span class="sg-text"><strong>${esc(it.name)}</strong><small>${OSM_TYPES[it.type].label}${osmFacts(it.tags).length ? " · " + osmFacts(it.tags)[0] : ""}</small></span>
            <span class="near-d">${fmtKm(it.d)}</span></button></li>`).join("")}</ol>`;
    col.innerHTML = head + body + `<p class="osm-credit">Data © OpenStreetMap contributors. Prices and hours may be out of date: check before you go.</p>`;
    col.querySelector("#osmRetry")?.addEventListener("click", () => { osmCache.clear(); scanOsm(origin); });
    col.querySelector("#osmShow")?.addEventListener("change", e => { showOsm = e.target.checked; drawOsm(); });
    col.querySelectorAll("[data-osmi]").forEach(b => b.addEventListener("click", () => {
      const it = osmItems[+b.dataset.osmi];
      if (!showOsm) { showOsm = true; drawOsm(); }
      map.flyTo([it.lat, it.lon], Math.max(map.getZoom(), 15), { duration: .9 });
      map.once("moveend", () => setTimeout(() => it.marker?.openPopup(), 80));
    }));
  }

  function focusSpot(s) {
    if (ui === "earth" && onGlobe) return cinematic(s.lat, s.lon, () => focusSpot(s));
    let done = false;
    const open = () => { if (done) return; const m = markerById.get(s.id); if (m) { done = true; m.openPopup(); } };
    map.once("moveend", () => setTimeout(open, 60));
    map.flyTo([s.lat, s.lon], Math.max(16, map.getZoom()), { duration: .9 });
    setTimeout(open, 1300);
  }

  /* ---------- mappa satellite con raggruppamento ---------- */
  /* sottocategorie dei punti foto, ricavate da nome, descrizione e lista (in più lingue) */
  const SUBS = {
    viewpoint: { label: "Viewpoints", re: /belvedere|panoram|viewpoint|view ?point|lookout|overlook|mirador|aussicht|point de vue|scenic|terrazz|terrace|vista point|sunset point|sunrise point/i },
    urban: { label: "Urban", re: /chies|church|[ée]glise|kirche|iglesia|duomo|cattedral|cathedral|basilic|ponte\b|bridge|\bpont\b|br[üu]cke|puente|piazz|square|platz|plaza|\bvia\b|street|\brue\b|stra(ss|ß)e|calle|torre|tower|\btour\b|turm|castell|castle|ch[âa]teau|\bburg\b|palazz|palace|museo|museum|stazione|station|porto\b|harbou?r|\bport\b|\bcity\b|citt[àa]|borgo|village|town|centro|quartier|district|monaster|abbazi|abbey|\bfaro\b|lighthouse|tempi|temple|villa\b|skyline|rooftop|mural|urban|street art/i },
    nature: { label: "Nature", re: /\blag[oh]|lake|\blac\b|\bsee\b|cascat|waterfall|cascade|wasserfall|spiaggi|beach|plage|strand|playa|bosc|forest|for[êe]t|\bwald\b|monte\b|mount|\bmont\b|\bberg|vall[eé]|valley|\btal\b|parco|\bpark\b|\bgol[ae]\b|gorge|grott|\bcave|fiume|river|\bisol|island|\bcala\b|\bbai[ae]\b|\bbay\b|dune|glacier|ghiacciai|canyon|cliff|scogli|faraglion|\bpasso\b|\bpass\b|rifugio|\balp|\bcima\b|peak|picco|riserva|reserve|oasi|fjord|fiord|volcan|vulcan|meadow|prat[oi]\b|nature|natura/i },
    other: { label: "Other photo spots", re: null }
  };
  const SUB_KEYS = Object.keys(SUBS);
  const activeSubs = new Set(SUB_KEYS);
  const subCache = new Map();
  function spotSub(s) {
    if (s.subcategory && SUBS[s.subcategory]) return s.subcategory;
    if (subCache.has(s.id)) return subCache.get(s.id);
    const t = `${s.name || ""} ${s.note || ""} ${s.list || ""}`;
    const k = SUBS.viewpoint.re.test(t) ? "viewpoint" : SUBS.urban.re.test(t) ? "urban" : SUBS.nature.re.test(t) ? "nature" : "other";
    subCache.set(s.id, k); return k;
  }
  /* gli spot che rispettano i filtri di contorno (cerca, preferiti, avvisi…), senza quelli di categoria: per i conteggi */
  function baseSpots() {
    const q = norm(query);
    return spots.filter(s => shownStatus(s) && (!onlyFavs || favs.has(s.id)) && (!onlySupport || s.support_local)
      && (alertMode === "show" || (alertMode === "hide" ? !alertsOf(s).length : alertsOf(s).length > 0))
      && (!q || norm(s.name).includes(q) || norm(s.note).includes(q) || norm(s.list).includes(q) || norm(CATS[s.category].label).includes(q)));
  }
  const shownStatus = s => !s.status || s.status === "published" || admin || (s.created_by && s.created_by === myUid());
  function visibleSpots() {
    const q = norm(query);
    return spots.filter(s => shownStatus(s) && (!onlyFavs || favs.has(s.id)) && (!activeCats || activeCats.has(s.category))
      && (s.category !== "spot" || activeSubs.size === SUB_KEYS.length || activeSubs.has(spotSub(s)))
      && (!onlySupport || s.support_local)
      && (alertMode === "show" || (alertMode === "hide" ? !alertsOf(s).length : alertsOf(s).length > 0))
      && (!q || norm(s.name).includes(q) || norm(s.note).includes(q) || norm(s.list).includes(q) || norm(CATS[s.category].label).includes(q)));
  }

  function buildMap() {
    const keep = map && map.getCenter ? { c: map.getCenter(), z: map.getZoom() } : null;
    if (map) { try { map.remove(); } catch {} map = null; }
    map = L.map("spotsMap", { zoomControl: false, minZoom: ui === "earth" ? 3 : 2, maxZoom: 19, worldCopyJump: true, zoomSnap: 0.5 });
    if (ui !== "earth") L.control.zoom({ position: "topleft", zoomInTitle: "Zoom in", zoomOutTitle: "Zoom out" }).addTo(map);
    window.addMapFullscreen?.(map, document.querySelector(".spots-stage"));
    map.attributionControl.setPrefix(false);
    baseSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, maxNativeZoom: 18, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS community" });
    baseTopo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, maxNativeZoom: 17, subdomains: "abc", attribution: "Map &copy; OpenStreetMap contributors, SRTM · style &copy; OpenTopoMap (CC-BY-SA)" });
    map.createPane("spotLabels"); map.getPane("spotLabels").style.zIndex = 450; map.getPane("spotLabels").style.pointerEvents = "none";
    satLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, maxNativeZoom: 18, pane: "spotLabels", opacity: .9 });
    applyBase();
    layer = L.layerGroup().addTo(map);
    originLayer = L.layerGroup().addTo(map);
    osmLayer = L.layerGroup().addTo(map);
    commLayer = L.layerGroup().addTo(map);
    drawOsm();
    drawOrigin();
    map.on("moveend zoomend", drawClusters);
    if (!guest && (admin || schemaV2)) map.on("contextmenu", e => { if (Date.now() - (map._fcLong || 0) < 900) return; withConduct(() => openAdd({ lat: e.latlng.lat, lon: L.Util.wrapNum(e.latlng.lng, [-180, 180], true) })); });
    setupLongPressAdd(map);
    const pts = visibleSpots().map(s => [s.lat, s.lon]);
    if (keep) map.setView(keep.c, keep.z, { animate: false });
    else if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 12, animate: false });
    else map.setView([42.5, 12.5], 5);
    setTimeout(() => { if (map) { map.invalidateSize(); drawClusters(); } }, 30);
    if (ui === "earth") earthAfterBuild();
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
    if (count) count.textContent = guest ? trS("{n} of {total} spots").replace("{n}", fmtN(list.length)).replace("{total}", fmtN(Math.max(publicTotal, spots.length))) : (list.length === 1 ? trS("1 place") : trS("{n} places").replace("{n}", list.length));
    const bounds = map.getBounds().pad(0.2), cell = 64, z = map.getZoom();
    const cells = new Map();
    list.forEach(s => {
      if (keep && s.id === openId) return;
      if (!bounds.contains([s.lat, s.lon])) return;
      if (highlighted(s)) return addSpotMarker(s, true);   // novità e workshop quasi pieni: mai dentro un gruppo
      const p = map.latLngToLayerPoint([s.lat, s.lon]);
      const key = z >= 16 ? s.id : `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      (cells.get(key) || cells.set(key, []).get(key)).push(s);
    });
    // gruppi troppo vicini tra celle confinanti: si fondono, così cerchi e numeri non si sovrappongono
    let blobs = [...cells.values()].map(g => {
      const pts = g.map(s => map.latLngToLayerPoint([s.lat, s.lon]));
      return { list: g, x: pts.reduce((a, p) => a + p.x, 0) / g.length, y: pts.reduce((a, p) => a + p.y, 0) / g.length };
    }).sort((a, b) => b.list.length - a.list.length);
    if (z < 16) for (let changed = true, guard = 0; changed && guard < 5; guard++) {
      changed = false;
      const out = [];
      blobs.forEach(b => {
        const t = out.find(o => Math.hypot(o.x - b.x, o.y - b.y) < 48);
        if (!t) return out.push(b);
        const n = t.list.length + b.list.length;
        t.x = (t.x * t.list.length + b.x * b.list.length) / n; t.y = (t.y * t.list.length + b.y * b.list.length) / n;
        t.list = t.list.concat(b.list); changed = true;
      });
      blobs = out;
    }
    blobs.map(b => b.list).forEach(group => {
      if (group.length === 1) return addSpotMarker(group[0]);
      const lat = group.reduce((a, s) => a + s.lat, 0) / group.length, lon = group.reduce((a, s) => a + s.lon, 0) / group.length;
      const size = group.length < 10 ? 36 : group.length < 100 ? 44 : 54;
      L.marker([lat, lon], { keyboard: true, title: `${group.length} spots`,
        icon: L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: `<div class="spot-cluster" style="--s:${size}px">${group.length}</div>` }) })
        .addTo(layer)
        .on("click", () => map.flyToBounds(L.latLngBounds(group.map(s => [s.lat, s.lon])).pad(0.3), { maxZoom: Math.min(19, z + 4), duration: .8 }));
    });
    drawCommunity();
    if (ui === "earth") { drawGlobe(); updateSxCounts(); }
  }

  function addSpotMarker(s, front) {
    const m = L.marker([s.lat, s.lon], { keyboard: true, title: s.name, riseOnHover: true, icon: pinIcon(s), zIndexOffset: front ? 800 : 0 }).addTo(layer);
    if (s.fragile && map.getZoom() >= 11) L.circle([s.lat, s.lon], { radius: 800, color: "#9fe3c8", weight: 1, dashArray: "4 5", fillOpacity: 0.04, interactive: false }).addTo(layer);
    markerById.set(s.id, m);
    m.bindTooltip(esc(s.name), { direction: "top" });
    // la scheda è un nodo creato una sola volta: Leaflet la ridisegna a ogni update() e così non perde foto, recensioni e pulsanti
    let node = null;
    m.bindPopup(() => node || (node = Object.assign(document.createElement("div"), { innerHTML: guest ? guestPopup(s) : popupHtml(s) }).firstElementChild),
      { maxWidth: 320, minWidth: 260, className: "spot-popup" });
    m.on("popupopen", e => {
      openId = s.id;
      if (guest) {
        node.querySelector("[data-login]")?.addEventListener("click", () => { map.closePopup(); wantLogin = true; wantJoin = false; render(); });
        node.querySelector("[data-join]")?.addEventListener("click", () => { map.closePopup(); wantJoin = true; render(); });
        return;
      }
      if (!node.dataset.wired) { node.dataset.wired = "1"; wirePopup(e.popup, s); } else if (schemaV2) loadExtras(e.popup, s);
    });
    m.on("popupclose", () => { if (openId === s.id) { openId = null; setTimeout(drawClusters, 0); } });
  }

  /* ---------- workshop e «Support local»: segni speciali sulla mappa ---------- */
  const DAY = 864e5;
  const ageDays = t => (t ? (Date.now() - Date.parse(t)) / DAY : Infinity);
  const wsLeft = s => (s.ws_capacity ? Math.max(0, s.ws_capacity - (s.ws_enrolled || 0)) : null);
  const isWs = s => s.category === "workshop";
  const wsPlane = s => isWs(s) && wsLeft(s) != null && wsLeft(s) < 3;             // quasi pieno: l'aereo sta per partire
  const wsNew = s => isWs(s) && ageDays(s.created_at) <= 7;                          // nuovo workshop: brilla 7 giorni
  const localNew = s => s.support_local && ageDays(s.support_since) <= 30;           // nuovo «Support local»: brilla un mese
  const freshPlace = s => String(s.source_key || "").startsWith("u:") && ageDays(s.created_at) <= 7;   // aggiunto da un membro: brilla 7 giorni (gli import no)
  const wsOffer = s => isWs(s) && !!s.ws_offer && (!s.ws_offer_until || s.ws_offer_until >= new Date().toISOString().slice(0, 10));   // offerta in corso
  const highlighted = s => wsPlane(s) || wsOffer(s) || wsNew(s) || localNew(s) || freshPlace(s);   // sempre visibili, anche da lontano
  const ICON_PLANE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 19h19"/><path d="M3.8 13.6 6 15.4l12.3-3.3c1.2-.3 2-1.6 1.6-2.7-.3-.9-1.3-1.3-2.2-1.1l-3.6 1-5.4-4.6-2 .5 3 5.3-3.5 1-1.8-1.4-1.6.4z"/></svg>';
  const ICON_LOCAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21v-8"/><path d="M12 13c0-4 2.6-7 7.5-7.2C19.4 10.6 16.6 13 12 13z"/><path d="M12 15.5c0-3-2-5.3-6.5-5.5.1 3.7 2.3 5.5 6.5 5.5z"/></svg>';
  function pinIcon(s) {
    const cat = CATS[s.category] || CATS.spot;
    const plane = wsPlane(s), offer = wsOffer(s) && !plane, shineLocal = localNew(s) && !isWs(s), shineWs = (wsNew(s) || freshPlace(s)) && !plane && !offer && !shineLocal;
    const cls = ["spot-pin", s.outdated ? "outdated" : "", s.support_local ? "local" : "", s.fragile ? "fragile" : "", plane ? "plane" : "", offer ? "offer" : "", shineWs ? "shine" : "", shineLocal ? "shine-local" : ""].filter(Boolean).join(" ");
    const icon = plane ? ICON_PLANE : shineLocal ? ICON_LOCAL : cat.icon;
    const color = plane ? "#ffc46e" : shineLocal ? "#7ed69b" : cat.color;
    const alert = alertsOf(s).length ? `<span class="alert-dot" title="${esc(ALERTS[alertsOf(s)[0].kind].label)}"></span>` : "";
    return L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14], tooltipAnchor: [0, -14], popupAnchor: [0, -12],
      html: `<div class="${cls}" style="--c:${color}">${icon}${offer ? `<span class="offer-tag" aria-hidden="true">%</span>` : ""}${favs.has(s.id) ? `<span class="fav-dot" aria-hidden="true">♥</span>` : ""}${s.verified_at && !s.outdated ? `<span class="vf-dot" aria-hidden="true">✓</span>` : ""}${alert}</div>` });
  }
  const fmtMoneyWs = (v, cur) => { try { return new Intl.NumberFormat(window.I18N?.locale || "en-GB", { style: "currency", currency: cur || "EUR", maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); } catch { return `${v} ${cur || ""}`; } };
  function wsBoxHtml(s) {
    if (!isWs(s)) return "";
    const left = wsLeft(s), items = [];
    if (s.ws_price != null) items.push(`<span class="ws-chip">💶 <b>${s.ws_price > 0 ? fmtMoneyWs(+s.ws_price, s.ws_currency) : "Free"}</b>${s.ws_price > 0 ? " per person" : ""}</span>`);
    if (left != null) items.push(`<span class="ws-chip${left < 3 ? " hot" : ""}">👥 <b>${left === 0 ? "Full" : left === 1 ? "1 place left" : `${left} places left`}</b> · ${s.ws_enrolled || 0}/${s.ws_capacity}</span>`);
    if (wsPlane(s) && left > 0) items.push(`<span class="ws-chip hot">✈️ Almost full — about to take off</span>`);
    if (wsOffer(s)) items.push(`<span class="ws-chip offer">🏷️ <b>${esc(s.ws_offer)}</b>${s.ws_offer_until ? ` · until ${fmtDay(s.ws_offer_until)}` : ""}</span>`);
    if (wsNew(s)) items.push(`<span class="ws-chip new">✨ New</span>`);
    const link = s.ws_link && /^https?:\/\//.test(s.ws_link) ? `<a class="pop-btn primary ws-link" href="${esc(s.ws_link)}" target="_blank" rel="noopener">${ICON.ext}Workshop page${left === 0 ? "" : " · book"}</a>` : "";
    return items.length || link ? `<div class="ws-box">${items.join("")}${link}</div>` : "";
  }

  function workshopsHtml() {
    const list = spots.filter(isWs).sort((a, b) => String(a.starts_on || "9999").localeCompare(String(b.starts_on || "9999")) || a.name.localeCompare(b.name));
    const card = s => {
      const left = wsLeft(s), d = datesText(s);
      return `<li class="ws-card${wsPlane(s) ? " hot" : ""}${wsOffer(s) ? " has-offer" : ""}">
        <div class="ws-card-top">
          <span class="ws-date">${ICON.cal}${d ? esc(d) : "Dates to be announced"}</span>
          ${wsPlane(s) && left > 0 ? `<span class="ws-chip hot">✈️ Almost full</span>` : left === 0 ? `<span class="ws-chip">Full</span>` : wsNew(s) ? `<span class="ws-chip new">✨ New</span>` : ""}
        </div>
        ${wsOffer(s) ? `<span class="ws-chip offer ws-card-offer">🏷️ <b>${esc(s.ws_offer)}</b>${s.ws_offer_until ? ` · until ${fmtDay(s.ws_offer_until)}` : ""}</span>` : ""}
        <b class="ws-name">${esc(s.name)}</b>
        <span class="ws-meta">${[s.ws_price != null ? (s.ws_price > 0 ? `${fmtMoneyWs(+s.ws_price, s.ws_currency)} per person` : "Free") : "",
          left != null ? (left === 0 ? "No places left" : left === 1 ? "1 place left" : `${left} places left`) : "",
          s.author_name ? `by ${esc(s.author_name)}` : ""].filter(Boolean).join(" · ")}</span>
        <div class="ws-card-actions">
          <button type="button" class="pop-btn" data-wsgo="${s.id}">${ICON.pin}Show on map</button>
          ${s.ws_link && /^https?:\/\//.test(s.ws_link) ? `<a class="pop-btn primary" href="${esc(s.ws_link)}" target="_blank" rel="noopener">${ICON.ext}Details &amp; booking</a>` : ""}
        </div>
      </li>`;
    };
    return `<section class="spots-ws" id="spotsWorkshops">
      <header class="around-head"><div><span class="eyebrow">Members' calendar</span><h2>Upcoming workshops <small>${list.length}</small></h2></div></header>
      ${list.length ? `<ul class="ws-list">${list.map(card).join("")}</ul>`
        : `<p class="ws-empty">No upcoming workshops yet. Running one? <button type="button" class="text-link" data-addws>Add it to the map</button> — with dates, places, price and booking link.</p>`}
    </section>`;
  }

  /* ---------- trekking: punto di partenza, difficoltà, tempo, dislivello, parcheggio ---------- */
  const TK_DIFF = { T: "Easy (T)", E: "Moderate (E)", EE: "Hard (EE)", EEA: "Expert, via ferrata gear (EEA)" };
  const TK_ROUTE = { loop: "Loop", back: "Out and back", oneway: "One way" };
  const isTk = s => s.category === "trekking";
  const fmtDur = m => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ` ${String(r).padStart(2, "0")}` : ""}` : `${r} min`; };
  // pendenza media: dislivello in salita sulla parte in salita del percorso (metà, se andata e ritorno o anello)
  const tkGrade = s => (s.tk_gain && s.tk_km ? Math.round(s.tk_gain / ((s.tk_route === "oneway" ? s.tk_km : s.tk_km / 2) * 1000) * 100) : null);
  const gradeWord = g => (g < 6 ? "gentle" : g < 12 ? "moderate" : g < 20 ? "steep" : "very steep");
  function tkBoxHtml(s) {
    if (!isTk(s)) return "";
    const chips = [];
    if (s.tk_difficulty) chips.push(`<span class="ws-chip tk-diff d-${s.tk_difficulty}">⛰️ <b>${esc(TK_DIFF[s.tk_difficulty] || s.tk_difficulty)}</b></span>`);
    if (s.tk_minutes) chips.push(`<span class="ws-chip">⏱️ <b>${fmtDur(s.tk_minutes)}</b></span>`);
    if (s.tk_km) chips.push(`<span class="ws-chip">↔ <b>${(+s.tk_km).toLocaleString(window.I18N?.locale || "en-GB")} km</b>${s.tk_route ? ` · ${TK_ROUTE[s.tk_route]}` : ""}</span>`);
    else if (s.tk_route) chips.push(`<span class="ws-chip">${TK_ROUTE[s.tk_route]}</span>`);
    if (s.tk_gain != null) chips.push(`<span class="ws-chip">↗ <b>${s.tk_gain} m</b> up</span>`);
    const g = tkGrade(s);
    if (g != null) chips.push(`<span class="ws-chip">📐 <b>≈ ${g}%</b> ${gradeWord(g)}</span>`);
    const park = s.tk_parking || (s.tk_park_lat != null);
    const parkNav = s.tk_park_lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${(+s.tk_park_lat).toFixed(6)},${(+s.tk_park_lon).toFixed(6)}` : "";
    return `<div class="tk-box">
      <p class="tk-start">🚩 <b>Trailhead</b> — the pin marks where the walk starts.</p>
      ${chips.length ? `<div class="ws-box">${chips.join("")}</div>` : ""}
      ${park ? `<p class="tk-park">🅿️ <b>Parking</b>${s.tk_parking ? ` — ${esc(s.tk_parking)}` : ""}${parkNav ? ` <a class="text-link" href="${esc(parkNav)}" target="_blank" rel="noopener">${ICON.ext}Directions to parking</a>` : ""}</p>` : ""}
    </div>`;
  }
  function tkFieldsHtml(s, id) {
    const v = x => (x == null ? "" : esc(String(x)));
    const h = s.tk_minutes ? Math.floor(s.tk_minutes / 60) : "", m = s.tk_minutes ? s.tk_minutes % 60 : "";
    const park = s.tk_park_lat != null ? `${(+s.tk_park_lat).toFixed(6)}, ${(+s.tk_park_lon).toFixed(6)}` : "";
    return `<div class="ws-fields tk-fields">
      <label>Difficulty<select id="${id}Diff"><option value="">—</option>${Object.entries(TK_DIFF).map(([k, t]) => `<option value="${k}"${s.tk_difficulty === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Route<select id="${id}Route"><option value="">—</option>${Object.entries(TK_ROUTE).map(([k, t]) => `<option value="${k}"${s.tk_route === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Total time<span class="pay-row"><input type="number" id="${id}H" min="0" max="300" step="1" inputmode="numeric" value="${h}" placeholder="h" aria-label="Hours">
        <input type="number" id="${id}M" min="0" max="59" step="5" inputmode="numeric" value="${m}" placeholder="min" aria-label="Minutes"></span></label>
      <label>Length (km)<input type="number" id="${id}Km" min="0.1" max="9999" step="0.1" inputmode="decimal" value="${v(s.tk_km)}" placeholder="e.g. 8.5"></label>
      <label>Elevation gain (m)<input type="number" id="${id}Gain" min="0" max="9000" step="10" inputmode="numeric" value="${v(s.tk_gain)}" placeholder="e.g. 650"></label>
      <label>Average slope<output id="${id}Grade" class="tk-grade">—</output></label>
      <label class="ws-wide">Where to park<input type="text" id="${id}Park" maxlength="300" value="${v(s.tk_parking)}" placeholder="e.g. Free car park at Malga Zannes, fills up by 8am"></label>
      <label class="ws-wide">Parking coordinates <small>(optional)</small><input type="text" id="${id}ParkC" value="${park}" placeholder="46.6156, 11.7322" autocomplete="off"></label>
    </div>
    <p class="gate-help left">All optional. The slope is worked out from length and elevation gain.</p>`;
  }
  function readTk(root, id) {
    const q = n => root.querySelector(`#${id}${n}`);
    const num = n => { const x = q(n)?.value; return x === "" || x == null ? null : +x; };
    const h = num("H") || 0, m = num("M") || 0, pc = (q("ParkC")?.value || "").trim();
    const c = pc ? parseCoordsInput(pc) : null;
    return { tk_difficulty: q("Diff")?.value || null, tk_route: q("Route")?.value || null, tk_minutes: h * 60 + m || null,
      tk_km: num("Km"), tk_gain: num("Gain"), tk_parking: (q("Park")?.value || "").trim() || null,
      tk_park_lat: c ? c.lat : null, tk_park_lon: c ? c.lon : null, _badPark: !!pc && !c };
  }
  function wireTkGrade(root, id) {
    const upd = () => { const t = readTk(root, id), g = tkGrade(t); const o = root.querySelector(`#${id}Grade`); if (o) o.textContent = g != null ? `≈ ${g}% · ${gradeWord(g)}` : "—"; };
    ["Km", "Gain", "Route"].forEach(n => root.querySelector(`#${id}${n}`)?.addEventListener("input", upd)); upd();
  }

  function guestPopup(s) {
    const cat = CATS[s.category] || CATS.spot;
    return `<div class="spot-pop">
      <span class="spot-cat" style="--c:${cat.color}">${cat.icon}${cat.label}${subLabel(s) ? ` · ${esc(subLabel(s))}` : ""}</span>
      <strong>${esc(s.name)}</strong>
      ${s.status && s.status !== "published" ? `<span class="ws-chip st-chip">${s.status === "review" ? "In review" : "Hidden"}</span>` : ""}
      ${s.avg_rating ? `<p class="pop-rating"><span class="stars-static" style="--v:${(s.avg_rating / 5 * 100).toFixed(0)}%">★★★★★</span> <b>${(+s.avg_rating).toFixed(1)}</b> · ${s.reviews} review${s.reviews > 1 ? "s" : ""}</p>` : ""}
      ${s.support_local ? `<p class="soc-note">🌱 Support local — your visit helps this place</p>` : ""}
      <p class="spot-coords">${ICON.pin}<span>Approximate area (about 1 km)</span></p>
      ${session ? `<div class="guest-cta">${LOCK_SVG}<p><b>Members see more.</b> You'll see the exact location, photos, reviews and alerts as soon as your account is approved.</p></div>`
      : `<div class="guest-cta">${LOCK_SVG}<p><b>Members see more:</b> exact location and directions, photos, reviews, prices, live alerts and all the other spots nearby. Membership is free.</p>
        <button type="button" class="pop-btn primary" data-join>Join free</button> <button type="button" class="pop-btn" data-login>Log in</button></div>`}
    </div>`;
  }

  const canEdit = s => admin || (s.created_by && s.created_by === myUid());
  const subLabel = s => (WZ_SUBS[s.category] || []).find(([k]) => k === s.subcategory)?.[1] || "";
  const fmtDay = d => new Date(d + "T12:00:00").toLocaleDateString((window.I18N?.locale || "en-GB"), { day: "numeric", month: "short", year: "numeric" });
  function datesText(s) {
    if (!s.starts_on && !s.ends_on) return "";
    if (s.starts_on && s.ends_on && s.starts_on !== s.ends_on) return `${fmtDay(s.starts_on)} – ${fmtDay(s.ends_on)}`;
    return fmtDay(s.starts_on || s.ends_on);
  }

  function wsFieldsHtml(s, id) {
    const v = x => (x == null ? "" : esc(String(x)));
    return `<div class="ws-fields">
      <label>Places in total<input type="number" name="cap" id="${id}Cap" min="1" max="10000" step="1" inputmode="numeric" value="${v(s.ws_capacity)}" placeholder="e.g. 12"></label>
      <label>Booked so far<input type="number" name="enr" id="${id}Enr" min="0" max="10000" step="1" inputmode="numeric" value="${v(s.ws_enrolled)}" placeholder="e.g. 7"></label>
      <label>Price per person<span class="pay-row"><input type="number" name="price" id="${id}Price" min="0" max="100000" step="1" inputmode="decimal" value="${v(s.ws_price)}" placeholder="0 = free">
        <select name="cur" id="${id}Cur" aria-label="Currency">${CURRENCIES.map(c => `<option${c === (s.ws_currency || "EUR") ? " selected" : ""}>${c}</option>`).join("")}</select></span></label>
      <label class="ws-wide">Workshop link <small>(optional)</small><input type="url" name="link" id="${id}Link" maxlength="500" value="${v(s.ws_link)}" placeholder="https://…"></label>
      <label>Special offer <small>(optional)</small><input type="text" name="offer" id="${id}Offer" maxlength="120" value="${v(s.ws_offer)}" placeholder="e.g. −20% early bird"></label>
      <label>Offer ends<input type="date" name="offerUntil" id="${id}OfferUntil" value="${v(s.ws_offer_until)}"></label>
    </div>
    <p class="gate-help left">Places left are calculated for you. With fewer than 3 left, a ✈️ appears on the map; with an offer, the workshop glows.</p>`;
  }
  const readWs = (root, id) => {
    const num = n => { const x = root.querySelector(`#${id}${n}`)?.value; return x === "" || x == null ? null : +x; };
    const link = (root.querySelector(`#${id}Link`)?.value || "").trim();
    const offer = (root.querySelector(`#${id}Offer`)?.value || "").trim(), offerUntil = root.querySelector(`#${id}OfferUntil`)?.value || null;
    return { cap: num("Cap"), enr: num("Enr"), price: num("Price"), cur: root.querySelector(`#${id}Cur`)?.value || "EUR", link, offer, offerUntil: offer ? offerUntil : null };
  };

  function popupHtml(s) {
    const cat = CATS[s.category] || CATS.spot;
    const gm = s.url && /^https?:\/\//.test(s.url) ? s.url : `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lon.toFixed(6)}`;
    const dates = datesText(s);
    return `<div class="spot-pop">
      <span class="spot-cat" style="--c:${cat.color}">${cat.icon}${cat.label}</span>
      <strong>${esc(s.name)}</strong>
      ${localNew(s) ? `<span class="ws-chip new local-chip">🌱 New in Support local</span>` : freshPlace(s) ? `<span class="ws-chip new local-chip">✨ New on the map</span>` : ""}
      ${dates ? `<p class="pop-dates">${ICON.cal}<span>${dates}</span></p>` : ""}
      <div data-vfbox>${verifyHtml(s)}</div>
      <div data-wsbox>${wsBoxHtml(s)}</div>
      ${isTk(s) ? `<div data-tkbox>${tkBoxHtml(s)}</div>` : ""}
      ${isTk(s) && tkV && canEdit(s) ? `<button type="button" class="pop-btn ws-edit" data-tkedit>⛰️ Edit trail info</button>
        <form class="pop-review ws-form" data-tkform hidden>${tkFieldsHtml(s, "tk")}<button type="submit" class="pop-btn primary">Save</button></form>` : ""}
      ${isWs(s) && wsV && canEdit(s) ? `<button type="button" class="pop-btn ws-edit" data-wsedit>👥 Update places, price and link</button>
        <form class="pop-review ws-form" data-wsform hidden>${wsFieldsHtml(s, "ws")}<button type="submit" class="pop-btn primary">Save</button></form>` : ""}
      <div class="pop-alerts" data-alerts>${alertsHtml(s)}</div>
      <p class="pop-rating" data-rating hidden></p>
      ${PRICED[s.category] ? `<p class="pop-spend" data-spend></p>` : ""}
      ${s.note ? `<p class="pop-desc">${esc(s.note)}</p>` : ""}
      ${infoRows(s.info).length ? `<dl class="pop-info">${infoRows(s.info).map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${/^https?:\/\//.test(b) ? `<a href="${esc(b)}" target="_blank" rel="noopener">${ICON.ext}Open</a>` : esc(b)}</dd></div>`).join("")}</dl>` : ""}
      ${schemaV2 ? `<div class="pop-photos" data-photos></div>` : ""}
      ${s.support_local ? `<div class="soc-box local"><b>🌱 Support local</b><p>Your visit helps this place: eat, sleep and buy locally.${s.best_months ? ` Best visited: <em>${esc(s.best_months)}</em>.` : ""}</p><div data-nearby></div></div>` : ""}
      ${s.fragile ? `<div class="soc-box fragile"><b>🛡️ Fragile place</b><p>Please leave no trace: stay on paths, keep groups small, no drones, no geotags on social media.</p></div>` : ""}
      <div data-coords>${s.fragile ? `<p class="spot-coords">${ICON.pin}<span>Approximate area (about 1 km)</span></p>` : `<p class="spot-coords">${ICON.pin}<span>${fmtCoord(s.lat, s.lon).replace("  |  ", " · ")}</span>
        <button type="button" class="spot-copy" data-copy>Copy</button></p>
      <a class="text-link" href="${esc(gm)}" target="_blank" rel="noopener">${ICON.ext}Open in Google Maps</a>`}</div>
      ${schemaV2 ? `<div class="pop-actions">
          <button type="button" class="pop-btn" data-addphoto>${ICON.img}Add photo</button>
          <button type="button" class="pop-btn" data-review>${ICON_STAR}Review</button>
          ${commV ? `<button type="button" class="pop-btn fav-btn${favs.has(s.id) ? " on" : ""}" data-fav>${favs.has(s.id) ? "♥ Saved" : "♡ Save"}</button>` : ""}
          <input type="file" accept="image/*" multiple hidden data-photofile>
        </div>
        <p class="pop-rights">By adding a photo you confirm it's yours and accept the <a href="#photoRights" data-rights>photo terms</a>.</p>
        <form class="pop-review" data-reviewform hidden>
          <div class="stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n =>
            `<button type="button" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? "s" : ""}" data-star="${n}">★</button>`).join("")}</div>
          <textarea rows="3" maxlength="2000" placeholder="What is it like? Tips for others…" aria-label="Your review"></textarea>
          ${PRICED[s.category] ? `<fieldset class="pay">
            <legend>What did you pay? <small>(optional, helps others)</small></legend>
            <div class="pay-row">
              <input type="number" name="paid" min="0" max="100000" step="0.5" inputmode="decimal" placeholder="Total" aria-label="Total paid">
              <select name="currency" aria-label="Currency">${CURRENCIES.map(c => `<option>${c}</option>`).join("")}</select>
              <label>for <input type="number" name="people" min="1" max="50" step="1" value="2" inputmode="numeric"> people</label>
              ${s.category === "hotel" ? `<label><input type="number" name="nights" min="1" max="60" step="1" value="1" inputmode="numeric"> night(s)</label>` : ""}
            </div>
            ${s.category === "hotel" ? `<select name="stay" aria-label="Type of stay">${STAY_TYPES.map(t => `<option>${t}</option>`).join("")}</select>` : ""}
          </fieldset>` : ""}
          <button type="submit" class="pop-btn primary">Post review</button>
        </form>
        <div class="pop-reviews" data-reviews></div>` : ""}
      ${schemaV2 && socialV ? `<div class="pop-actions">
          <button type="button" class="pop-btn" data-report>${ICON_ALERT}Report</button>
          ${canEdit(s) || canCurate(s) ? `<button type="button" class="pop-btn" data-social>Community settings</button>` : ""}
          ${commV ? `<button type="button" class="pop-btn" data-meethere>👥 Meet here</button>` : ""}
          ${commV && !canEdit(s) ? `<button type="button" class="text-link pop-flag" data-flagspot>⚑ Flag</button>` : ""}
        </div>
        <form class="pop-review pop-reportform" data-reportform hidden>
          <label>What's going on?
            <select name="kind">${Object.entries(ALERTS).map(([k, a]) => `<option value="${k}">${a.icon} ${a.label}</option>`).join("")}
              <option value="fragile">🛡️ This place is fragile (needs protection)</option>
              <option value="support">🌱 This place needs visitors (Support local)</option></select></label>
          <textarea name="note" rows="2" maxlength="600" placeholder="Details: what, where exactly, until when…"></textarea>
          <label class="pay-row">Valid until <input type="date" name="until"> <small>(empty = 14 days)</small></label>
          <button type="submit" class="pop-btn primary">Send report</button>
        </form>
        ${canEdit(s) || canCurate(s) ? `<form class="pop-review" data-socialform hidden>
          <label class="shot-check"><input type="checkbox" name="support"${s.support_local ? " checked" : ""}> 🌱 Support local — this place benefits from visitors</label>
          <input type="text" name="months" maxlength="60" placeholder="Best months, e.g. Oct–Apr (optional)" value="${esc(s.best_months || "")}">
          <label class="shot-check"><input type="checkbox" name="fragile"${s.fragile ? " checked" : ""}> 🛡️ Fragile — hide it from the public map, ask members not to geotag it</label>
          ${admin ? `<label class="pub-pick">Public map (visitors)
            <select name="pub"><option value="auto"${s.public_pick == null ? " selected" : ""}>Automatic (1 spot every ~15 km)</option>
              <option value="yes"${s.public_pick === true ? " selected" : ""}>Always show to visitors</option>
              <option value="no"${s.public_pick === false ? " selected" : ""}>Never show to visitors</option></select></label>` : ""}
          <button type="submit" class="pop-btn primary">Save</button>
        </form>` : ""}` : ""}
      <p class="pop-author">Added by ${s.created_by && !guest ? `<button type="button" class="text-link pop-authorp" data-authorp>${esc(s.author_name || OWNER)}</button>` : esc(s.author_name || OWNER)}${xpBadge(s.created_by)}</p>
      <div data-curate>${curateHtml(s)}</div>
      ${canEdit(s) ? `<p class="pop-own"><button type="button" class="pop-btn" data-editspot>✎ Edit place</button><button type="button" class="spot-delete" data-delete>Delete</button></p>` : ""}
    </div>`;
  }

  async function wirePopup(popup, s) {
    const el = popup.getElement();
    el.querySelector("[data-copy]")?.addEventListener("click", ev => copyText(ev.currentTarget, `${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}`));
    el.querySelector("[data-editspot]")?.addEventListener("click", () => { map.closePopup(); openEditPlace(s); });
    el.querySelector("[data-authorp]")?.addEventListener("click", () => openMemberProfile(s.created_by));
    el.querySelector("[data-delete]")?.addEventListener("click", async ev => {
      const b = ev.currentTarget;
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm delete"; return; }
      b.disabled = true;
      try { await removeSpot(s.id); spots = spots.filter(x => x.id !== s.id); map.closePopup(); drawClusters(); toast("Place deleted."); }
      catch (err) { toast(`Could not delete: ${err.message}`, true); b.disabled = false; }
    });
    el.querySelector("[data-rights]")?.addEventListener("click", ev => { ev.preventDefault(); map.closePopup(); $("#photoRights")?.scrollIntoView({ behavior: "smooth", block: "center" }); });
    if (!schemaV2) return;
    if (socialV) wireSocial(popup, s);
    el.querySelector("[data-fav]")?.addEventListener("click", ev => toggleFav(s, ev.currentTarget));
    wireCurate(popup, s);
    el.querySelector("[data-meethere]")?.addEventListener("click", () => { map.closePopup(); withConduct(() => openMeetup({ lat: s.lat, lon: s.lon, spot: s })); });
    el.querySelector("[data-flagspot]")?.addEventListener("click", () => openFlag("spot", String(s.id), s.name));
    const tf = el.querySelector("[data-tkform]");
    if (tf) wireTkGrade(tf, "tk");
    el.querySelector("[data-tkedit]")?.addEventListener("click", () => { tf.hidden = !tf.hidden; popup.update(); });
    tf?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const t = readTk(tf, "tk");
      if (t._badPark) return toast("Parking coordinates not recognised. Format: 46.6156, 11.7322", true);
      delete t._badPark;
      const btn = tf.querySelector("[type=submit]"); btn.disabled = true;
      try {
        await api(`/rest/v1/spots?id=eq.${s.id}`, { method: "PATCH", body: t, headers: { Prefer: "return=minimal" } });
        Object.assign(s, t);
        el.querySelector("[data-tkbox]").innerHTML = tkBoxHtml(s);
        tf.hidden = true; popup.update(); toast("Trail updated.");
      } catch (err) { toast(`Could not save: ${err.message}`, true); }
      btn.disabled = false;
    });
    const wf = el.querySelector("[data-wsform]");
    el.querySelector("[data-wsedit]")?.addEventListener("click", () => { wf.hidden = !wf.hidden; popup.update(); });
    wf?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const w = readWs(wf, "ws");
      if (w.link && !/^https?:\/\//i.test(w.link)) return toast("The link must start with https://", true);
      if (w.cap != null && w.enr != null && w.enr > w.cap) return toast("Booked can't be more than the places in total.", true);
      const btn = wf.querySelector("[type=submit]"); btn.disabled = true;
      try {
        await api("/rest/v1/rpc/set_workshop", { method: "POST", body: { p_spot: s.id, p_capacity: w.cap, p_enrolled: w.enr, p_price: w.price, p_currency: w.cur, p_link: w.link || null, p_offer: w.offer || null, p_offer_until: w.offerUntil } });
        Object.assign(s, { ws_capacity: w.cap || null, ws_enrolled: w.enr, ws_price: w.price, ws_currency: w.cur, ws_link: w.link || null, ws_offer: w.offer || null, ws_offer_until: w.offerUntil });
        const wl = $("#spotsWorkshops"); if (wl) wl.outerHTML = workshopsHtml() || "";
        $$("#spotsWorkshops [data-wsgo]").forEach(b => b.addEventListener("click", () => { const x = spots.find(y => y.id === +b.dataset.wsgo); if (x) { $("#spotsMap")?.scrollIntoView({ behavior: "smooth", block: "center" }); focusSpot(x); } }));
        el.querySelector("[data-wsbox]").innerHTML = wsBoxHtml(s);
        markerById.get(s.id)?.setIcon(pinIcon(s));
        wf.hidden = true; popup.update();
        toast("Workshop updated.");
      } catch (err) { toast(`Could not save: ${err.message}`, true); }
      btn.disabled = false;
    });
    const fileIn = el.querySelector("[data-photofile]");
    el.querySelector("[data-addphoto]").addEventListener("click", () => withConduct(() => fileIn.click()));
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
    el.querySelector("[data-review]").addEventListener("click", () => withConduct(() => { form.hidden = !form.hidden; popup.update(); if (!form.hidden) form.querySelector("textarea").focus(); }));
    let rating = 0;
    const paint = () => form.querySelectorAll("[data-star]").forEach(b => { const on = +b.dataset.star <= rating; b.classList.toggle("on", on); b.setAttribute("aria-checked", +b.dataset.star === rating ? "true" : "false"); });
    form.querySelectorAll("[data-star]").forEach(b => b.addEventListener("click", () => { rating = +b.dataset.star === rating ? 0 : +b.dataset.star; paint(); }));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const body = form.querySelector("textarea").value.trim(), btn = form.querySelector("[type=submit]");
      const fv = n => form.querySelector(`[name=${n}]`)?.value;
      const paid = parseFloat(fv("paid")) >= 0 ? parseFloat(fv("paid")) : null;
      if (!rating && !body && paid == null) { form.querySelector("textarea").focus(); return; }
      const extra = pricesV2 && PRICED[s.category] ? { paid, currency: paid != null ? fv("currency") : null,
        people: paid != null ? Math.max(1, parseInt(fv("people")) || 1) : null,
        nights: paid != null && s.category === "hotel" ? Math.max(1, parseInt(fv("nights")) || 1) : null,
        stay_type: s.category === "hotel" ? fv("stay") || null : null } : {};
      btn.disabled = true;
      try {
        await api("/rest/v1/spot_reviews?on_conflict=spot_id,user_id", { method: "POST",
          body: { spot_id: s.id, rating: rating || null, body: body || null, author_name: displayName(), ...extra },
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
        form.hidden = true; toast("Thanks for your review!");
        loadExtras(popup, s);
      } catch (err) { toast(`Could not post: ${err.message}`, true); }
      btn.disabled = false;
    });
    form._setMine = r => {
      rating = r?.rating || 0; form.querySelector("textarea").value = r?.body || ""; paint();
      const set = (n, v) => { const x = form.querySelector(`[name=${n}]`); if (x && v != null) x.value = v; };
      set("paid", r?.paid); set("currency", r?.currency); set("people", r?.people); set("nights", r?.nights); set("stay", r?.stay_type);
    };
    loadExtras(popup, s);
  }

  /* ---------- prezzi pagati dai membri (ristoranti, bar, hotel, B&B…) ---------- */
  const PRICED = { restaurant: true, hotel: true };
  const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "NOK", "SEK", "DKK", "ISK", "JPY", "AUD", "CAD"];
  const STAY_TYPES = ["Hotel", "B&B", "Agriturismo / farm stay", "Apartment", "Hostel", "Mountain hut", "Camping", "Guesthouse", "Other"];
  let pricesV2 = true;
  const fmtMoney = (v, c) => { try { return new Intl.NumberFormat((window.I18N?.locale || "en-GB"), { style: "currency", currency: c || "EUR", maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); } catch { return `${v} ${c || ""}`; } };
  async function fetchReviews(id) {
    const base = "id,user_id,author_name,rating,body,created_at";
    if (pricesV2) {
      try { return await api(`/rest/v1/spot_reviews?select=${base},paid,currency,people,nights,stay_type&spot_id=eq.${id}&order=created_at.desc`); }
      catch (err) { if (err.status !== 400) throw err; pricesV2 = false; }
    }
    return api(`/rest/v1/spot_reviews?select=${base}&spot_id=eq.${id}&order=created_at.desc`);
  }
  function spendSummary(s, reviews) {
    const r = reviews.filter(x => x.paid != null && x.paid > 0);
    if (!r.length) return "";
    const byCur = {};
    r.forEach(x => (byCur[x.currency || "EUR"] ||= []).push(x));
    const [cur, list] = Object.entries(byCur).sort((a, b) => b[1].length - a[1].length)[0];
    const median = a => { const v = [...a].sort((p, q) => p - q), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
    const n = `${list.length} report${list.length > 1 ? "s" : ""}`;
    if (s.category === "hotel") {
      const perNight = median(list.map(x => x.paid / (x.nights || 1)));
      const perPerson = median(list.map(x => x.paid / (x.nights || 1) / (x.people || 1)));
      const types = [...new Set(list.map(x => x.stay_type).filter(Boolean))].slice(0, 2).join(", ");
      return `💶 About <b>${fmtMoney(Math.round(perNight), cur)}</b> a night · ${fmtMoney(Math.round(perPerson), cur)} per person <small>(${n}${types ? ` · ${esc(types)}` : ""})</small>`;
    }
    const pp = median(list.map(x => x.paid / (x.people || 1)));
    return `💶 About <b>${fmtMoney(Math.round(pp), cur)}</b> per person <small>(${n})</small>`;
  }

  /* =========================================================
     PARTE SOCIALE: segnalazioni, Support local, Fragile, codice della community
     ========================================================= */
  function alertsHtml(s) {
    const list = reports.get(s.id) || [];
    const al = list.filter(r => ALERTS[r.kind]), req = admin ? list.filter(r => REQUESTS[r.kind]) : [];
    return al.map(r => `<div class="alert-box" data-rid="${r.id}">
        <b>${ALERTS[r.kind].icon} ${ALERTS[r.kind].label}</b>${r.note ? `<p>${esc(r.note)}</p>` : ""}
        <small>${esc(r.author_name || "Member")} · ${fmtDay(r.created_at.slice(0, 10))}${r.until ? ` · until ${fmtDay(r.until)}` : ""}${r.confirmations ? ` · confirmed ${r.confirmations}×` : ""}</small>
        <div class="alert-act"><button type="button" class="pop-btn" data-confirm="${r.id}">Still valid</button><button type="button" class="pop-btn" data-resolve="${r.id}">Not valid anymore</button></div>
      </div>`).join("")
      + req.map(r => `<div class="alert-box req" data-rid="${r.id}"><b>${REQUESTS[r.kind]}</b>${r.note ? `<p>${esc(r.note)}</p>` : ""}
        <small>${esc(r.author_name || "Member")} · only you see this</small>
        <div class="alert-act"><button type="button" class="pop-btn" data-resolve="${r.id}">Done</button></div></div>`).join("");
  }
  function refreshAlerts(popup, s) {
    const box = popup.getElement()?.querySelector("[data-alerts]");
    if (box) { box.innerHTML = alertsHtml(s); wireAlertButtons(popup, s); popup.update(); }
  }
  function wireAlertButtons(popup, s) {
    const el = popup.getElement();
    el.querySelectorAll("[data-confirm]").forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await api("/rest/v1/rpc/confirm_report", { method: "POST", body: { p_id: +b.dataset.confirm } }); await fetchReports(); refreshAlerts(popup, s); toast("Thanks, confirmed."); }
      catch (err) { toast(`Could not confirm: ${err.message}`, true); b.disabled = false; }
    });
    el.querySelectorAll("[data-resolve]").forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await api("/rest/v1/rpc/resolve_report", { method: "POST", body: { p_id: +b.dataset.resolve } }); await fetchReports(); refreshAlerts(popup, s); drawClusters(); toast("Report closed."); }
      catch (err) { toast(`Could not update: ${err.message}`, true); b.disabled = false; }
    });
  }
  async function wireSocial(popup, s) {
    const el = popup.getElement();
    wireAlertButtons(popup, s);
    const rf = el.querySelector("[data-reportform]");
    el.querySelector("[data-report]")?.addEventListener("click", () => withConduct(() => { rf.hidden = !rf.hidden; popup.update(); }));
    rf?.addEventListener("submit", async e => {
      e.preventDefault();
      const kind = rf.kind.value, note = rf.note.value.trim(), until = rf.until.value || null, btn = rf.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        await api("/rest/v1/spot_reports", { method: "POST", body: { spot_id: s.id, kind, note: note || null, until, author_name: displayName() }, headers: { Prefer: "return=minimal" } });
        rf.hidden = true; rf.reset();
        await fetchReports(); refreshAlerts(popup, s); drawClusters();
        toast(REQUESTS[kind] ? "Thanks! Fabio will review your suggestion." : "Thanks, other members will see your report.");
      } catch (err) { toast(`Could not send: ${err.message}`, true); }
      btn.disabled = false;
    });
    const sf = el.querySelector("[data-socialform]");
    el.querySelector("[data-social]")?.addEventListener("click", () => { sf.hidden = !sf.hidden; popup.update(); });
    sf?.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = sf.querySelector("[type=submit]"); btn.disabled = true;
      try {
        await api("/rest/v1/rpc/set_social", { method: "POST", body: { p_spot: s.id, p_support: sf.support.checked, p_months: sf.months.value } });
        if (admin && sf.pub) { const v = sf.pub.value; try { await api("/rest/v1/rpc/set_public", { method: "POST", body: { p_spot: s.id, p_pick: v === "auto" ? null : v === "yes" } }); } catch {} }
        if (sf.fragile.checked !== !!s.fragile) await api("/rest/v1/rpc/set_fragile", { method: "POST", body: { p_spot: s.id, p_fragile: sf.fragile.checked } });
        spots = await fetchSpots(); map.closePopup(); renderApp();
        const n = spots.find(x => x.id === s.id); if (n) focusSpot(n);
        toast("Saved.");
      } catch (err) { toast(`Could not save: ${err.message}`, true); btn.disabled = false; }
    });
    // posizione esatta dei posti fragili: solo autore, admin e membri di fiducia
    if (s.fragile) {
      try {
        const { data } = await api(`/rest/v1/spot_secrets?select=lat,lon,url&spot_id=eq.${s.id}`);
        const x = data?.[0];
        if (x) {
          const gm = x.url && /^https?:/.test(x.url) ? x.url : `https://www.google.com/maps/search/?api=1&query=${(+x.lat).toFixed(6)},${(+x.lon).toFixed(6)}`;
          el.querySelector("[data-coords]").innerHTML = `<p class="spot-coords">${ICON.pin}<span>${fmtCoord(+x.lat, +x.lon).replace("  |  ", " · ")}</span>
            <button type="button" class="spot-copy" data-copy>Copy</button></p><p class="soc-note">Exact spot visible only to members. Please don't share it or geotag it.</p>
            <a class="text-link" href="${esc(gm)}" target="_blank" rel="noopener">${ICON.ext}Open in Google Maps</a>`;
          el.querySelector("[data-coords] [data-copy]").addEventListener("click", ev => copyText(ev.currentTarget, `${(+x.lat).toFixed(6)}, ${(+x.lon).toFixed(6)}`));
          popup.update();
        }
      } catch {}
    }
    // Support local: dove mangiare e dormire vicino (dalla community)
    const nb = el.querySelector("[data-nearby]");
    if (nb) {
      const near = spots.filter(x => (x.category === "restaurant" || x.category === "hotel") && x.id !== s.id)
        .map(x => ({ x, d: distKm(s, x) })).filter(o => o.d <= 15).sort((a, b) => a.d - b.d).slice(0, 4);
      nb.innerHTML = near.length ? `<p class="soc-sub">Eat & sleep nearby</p>${near.map(({ x, d }) =>
        `<button type="button" class="soc-near" data-goto="${x.id}">${CATS[x.category].icon}<span>${esc(x.name)}</span><small>${fmtKm(d)}</small></button>`).join("")}`
        : `<p class="soc-sub">No places to eat or sleep added nearby yet — add your favourite local ones!</p>`;
      nb.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => { const x = spots.find(y => String(y.id) === b.dataset.goto); if (x) { map.closePopup(); focusSpot(x); } }));
      popup.update();
    }
  }

  /* ---------- richieste di iscrizione (solo admin) ---------- */
  function openRequests() {
    let d = $("#requestsDialog");
    if (!d) { d = document.createElement("dialog"); d.id = "requestsDialog"; d.className = "import-dialog"; document.body.appendChild(d); }
    const row = m => `<li class="req-row" data-uid="${esc(m.user_id)}">
        <div><b>${esc([m.first_name, m.last_name].filter(Boolean).join(" ") || "—")}</b>
          <span>${esc(m.email || "")} · ${fmtDay(String(m.created_at).slice(0, 10))}</span></div>
        <button type="button" class="pop-btn primary" data-decide="approved">Approva</button>
        <button type="button" class="pop-btn" data-decide="rejected">Rifiuta</button>
      </li>`;
    if (commV) return openAdmin();
    d.innerHTML = `<button class="dialog-close" type="button" data-close aria-label="Close">${ICON.close}</button>
      <div class="import-body" data-no-i18n>
        <span class="eyebrow">Spots · solo per te</span>
        <h2>Richieste di iscrizione</h2>
        ${pendingMembers.length ? `<ul class="req-list">${pendingMembers.map(row).join("")}</ul>`
          : `<p class="gate-help left">Nessuna richiesta in attesa.</p>`}
        <p class="gate-help left">Chi approvi vede subito tutta la mappa, compresi i luoghi Fragile. Chi rifiuti continua a vedere solo la mappa pubblica.</p>
      </div>`;
    d.querySelector("[data-close]").onclick = () => d.close();
    d.querySelectorAll("[data-decide]").forEach(b => b.addEventListener("click", async () => {
      const li = b.closest(".req-row"), uid = li.dataset.uid;
      li.querySelectorAll("button").forEach(x => (x.disabled = true));
      try {
        await api("/rest/v1/rpc/decide_member", { method: "POST", body: { p_user: uid, p_status: b.dataset.decide } });
        pendingMembers = pendingMembers.filter(m => m.user_id !== uid);
        li.innerHTML = `<p class="gate-help left">${b.dataset.decide === "approved" ? "✓ Approvato" : "Rifiutato"}</p>`;
        const btn = $("#spotsRequests");
        if (btn) { btn.querySelector("b").textContent = pendingMembers.length; btn.classList.toggle("has", pendingMembers.length > 0); }
      } catch (err) {
        toast(`Non riuscito (${err.message}).`, true);
        li.querySelectorAll("button").forEach(x => (x.disabled = false));
      }
    }));
    if (!d.open) d.showModal();
  }

  /* =================== COMMUNITY: preferiti, ritrovi, fotografi, moderazione =================== */
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const upcomingMeetups = () => meetups.filter(m => m.meet_on > todayISO());          // spariscono il giorno del ritrovo
  async function fetchCommunity() {
    if (!commV || guest) return;
    const uid = myUid();
    try {
      const [mu, jo, fa, pr] = await Promise.all([
        api(`/rest/v1/meetups?select=id,title,note,meet_on,meet_time,lat,lon,spot_id,created_by,author_name&meet_on=gt.${todayISO()}&order=meet_on.asc&limit=500`),
        api("/rest/v1/meetup_joins?select=meetup_id,user_id,name&limit=5000"),
        api(`/rest/v1/spot_favorites?select=spot_id&user_id=eq.${encodeURIComponent(uid)}&limit=10000`),
        api(`/rest/v1/member_profiles?select=user_id,display_name,instagram,website,bio,base_name,lat,lon,visible${nodiV ? ",last_post_url,last_post_at" : ""}${profV ? ",on_map,username,avatar_path" : ""}&limit=2000`)
          .catch(err => { if (profV && err.status === 400) { profV = false; return api(`/rest/v1/member_profiles?select=user_id,display_name,instagram,website,bio,base_name,lat,lon,visible${nodiV ? ",last_post_url,last_post_at" : ""}&limit=2000`); } throw err; })
          .catch(err => { if (nodiV && err.status === 400) { nodiV = false; return api("/rest/v1/member_profiles?select=user_id,display_name,instagram,website,bio,base_name,lat,lon,visible&limit=2000"); } throw err; })
      ]);
      meetups = mu.data || [];
      meetupJoins = new Map();
      (jo.data || []).forEach(j => (meetupJoins.get(j.meetup_id) || meetupJoins.set(j.meetup_id, []).get(j.meetup_id)).push(j));
      favs = new Set((fa.data || []).map(f => f.spot_id));
      profiles = pr.data || [];
      experts = new Map();
      contribs = new Map();
      try { const { data: co } = await api("/rest/v1/contributors?select=user_id,display_name,roles&limit=1000"); (co || []).forEach(c => contribs.set(c.user_id, c)); } catch {}
      if (nodiV) { try { const { data: ex } = await api("/rest/v1/local_experts?select=user_id,display_name,area_name,lat,lon,radius_km&limit=1000"); (ex || []).forEach(e => experts.set(e.user_id, e)); } catch { nodiV = false; } }
      if (admin) { try { const { res } = await api("/rest/v1/content_flags?select=id&resolved=eq.false", { headers: { Prefer: "count=exact", Range: "0-0" } }); openFlags = +(res.headers.get("content-range") || "").split("/")[1] || 0; } catch { openFlags = 0; } }
    } catch (err) { commV = false; }
  }

  /* --- nodi (local experts) --- */
  const kmBetween = (a, b, c, d) => { const R = 6371, r = x => x * Math.PI / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const myExpert = () => experts.get(myUid());
  const canCurate = s => admin || (!!myExpert() && kmBetween(myExpert().lat, myExpert().lon, s.lat, s.lon) <= +myExpert().radius_km);
  // icona dei contributor: un diaframma (6 lamelle), diverso dalla fotocamera dei membri
  const ICON_APERTURE = '<svg class="ap-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3l3.6 6.3M21 12l-7.3 0M16.5 19.8 12.8 13.5M7.5 19.8l3.7-6.3M3 12h7.3M7.5 4.2l3.7 6.3"/></svg>';
  const ICON_DEV = '<svg class="ap-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/></svg>';
  const rolesOf = uid => (contribs.get(uid)?.roles || ["photographer"]);
  const isDev = uid => contribs.has(uid) && rolesOf(uid).includes("developer");
  const isCo = uid => contribs.has(uid) && rolesOf(uid).some(r => r !== "developer");
  const coBadge = uid => (uid && isCo(uid) ? ` <span class="co-badge" title="Fabio Costa Ph contributor">${ICON_APERTURE}Contributor</span>` : "")
    + (uid && isDev(uid) ? ` <span class="co-badge dev-badge" title="Helps build Spots">${ICON_DEV}Developer</span>` : "");
  const xpBadge = uid => { const e = uid && experts.get(uid); return (e ? ` <span class="xp-badge" title="Local expert">🧭 ${esc(e.area_name)}</span>` : "") + coBadge(uid); };
  // il post brilla 24 ore per tutti, 3 giorni per i contributor
  const postFresh = p => p && p.last_post_at && Date.now() - Date.parse(p.last_post_at) < (contribs.has(p.user_id) ? 3 : 1) * 864e5;
  function verifyHtml(s) {
    if (!nodiV) return "";
    if (s.outdated) return `<p class="vf vf-out">⚠️ <b>Marked as outdated by a local</b>${s.verified_name ? ` · ${esc(s.verified_name)}` : ""}${s.verified_at ? ` · ${fmtDay(String(s.verified_at).slice(0, 10))}` : ""}</p>`;
    if (s.verified_at) return `<p class="vf">✓ <b>Verified by a local</b>${s.verified_name ? ` · ${esc(s.verified_name)}` : ""} · ${new Date(s.verified_at).toLocaleDateString(window.I18N?.locale || "en-GB", { month: "short", year: "numeric" })}</p>`;
    return "";
  }
  function curateHtml(s) {
    if (!nodiV || !canCurate(s)) return "";
    return `<div class="pop-actions curate">
        <span class="curate-t">🧭 ${admin && !myExpert() ? "Admin" : "Your area"}</span>
        <button type="button" class="pop-btn${s.verified_at && !s.outdated ? " on" : ""}" data-vf="verified">✓ Verify</button>
        <button type="button" class="pop-btn${s.outdated ? " on" : ""}" data-vf="outdated">⚠️ Outdated</button>
        ${s.verified_at || s.outdated ? `<button type="button" class="text-link" data-vf="clear">Clear</button>` : ""}
        <button type="button" class="pop-btn" data-xedit>✎ Edit info</button>
      </div>
      <form class="pop-review" data-xform hidden>
        <input name="name" maxlength="300" value="${esc(s.name)}" aria-label="Name">
        <select name="cat" aria-label="Category">${CAT_KEYS.map(k => `<option value="${k}"${s.category === k ? " selected" : ""}>${CATS[k].label}</option>`).join("")}</select>
        <textarea name="note" rows="3" maxlength="2000" placeholder="Description, access, tips…">${esc(s.note || "")}</textarea>
        ${s.fragile ? "" : `<input name="coords" value="${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}" aria-label="Coordinates">`}
        <button type="submit" class="pop-btn primary">Save changes</button>
      </form>`;
  }
  function wireCurate(popup, s) {
    const el = popup.getElement();
    if (!el) return;
    el.querySelectorAll("[data-vf]").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await api("/rest/v1/rpc/expert_verify", { method: "POST", body: { p_spot: s.id, p_state: b.dataset.vf } });
        const who = myExpert()?.display_name || displayName();
        if (b.dataset.vf === "verified") Object.assign(s, { verified_at: new Date().toISOString(), verified_name: who, outdated: false });
        else if (b.dataset.vf === "outdated") Object.assign(s, { verified_at: new Date().toISOString(), verified_name: who, outdated: true });
        else Object.assign(s, { verified_at: null, verified_name: null, outdated: false });
        el.querySelector("[data-vfbox]").innerHTML = verifyHtml(s);
        const box = el.querySelector("[data-curate]"); box.innerHTML = curateHtml(s); wireCurate(popup, s);
        markerById.get(s.id)?.setIcon(pinIcon(s)); popup.update();
        toast(b.dataset.vf === "verified" ? "Marked as verified." : b.dataset.vf === "outdated" ? "Marked as outdated." : "Cleared.");
        window.fcTrack?.(`Spots: expert ${b.dataset.vf}`);
      } catch (err) { toast(/not allowed/i.test(err.message) ? "This place is outside your area." : `Could not save: ${err.message}`, true); b.disabled = false; }
    }));
    const xf = el.querySelector("[data-xform]");
    el.querySelector("[data-xedit]")?.addEventListener("click", () => { xf.hidden = !xf.hidden; popup.update(); });
    xf?.addEventListener("submit", async e => {
      e.preventDefault();
      const c = xf.coords ? parseCoordsInput(xf.coords.value) : null;
      if (xf.coords && !c) return toast("Coordinates not recognised. Format: 46.6013, 11.7246", true);
      try {
        await api("/rest/v1/rpc/expert_edit_spot", { method: "POST", body: { p_spot: s.id, p_name: xf.name.value, p_note: xf.note.value, p_category: xf.cat.value, p_lat: c ? c.lat : null, p_lon: c ? c.lon : null } });
        Object.assign(s, { name: xf.name.value.trim() || s.name, note: xf.note.value.trim() || null, category: xf.cat.value }, c ? { lat: c.lat, lon: c.lon } : {});
        map.closePopup(); drawClusters(); toast("Place updated.");
      } catch (err) { toast(/outside/i.test(err.message) ? "The new position is outside your area." : `Could not save: ${err.message}`, true); }
    });
  }
  async function openMyArea() {
    const e = myExpert();
    if (!e) return;
    const inArea = s => kmBetween(e.lat, e.lon, s.lat, s.lon) <= +e.radius_km;
    const toVerify = spots.filter(s => inArea(s) && !s.verified_at && !s.outdated).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 60);
    const d = dlg("myAreaDialog", `<div class="import-body"><span class="eyebrow">Local expert</span><h2>🧭 ${esc(e.area_name)}</h2>
      <p class="gate-help left">Your area: ${(+e.radius_km)} km around ${(+e.lat).toFixed(3)}, ${(+e.lon).toFixed(3)} · ${spots.filter(inArea).length} places · ${spots.filter(s => inArea(s) && s.verified_at && !s.outdated).length} verified.
        In your area you can verify places, mark them outdated, fix their info, set Fragile and Support local, and handle flags.</p>
      <p class="fb-sum-t">Flags in your area</p><div data-flags><p class="gate-help left">Loading…</p></div>
      <p class="fb-sum-t">Not verified yet (${toVerify.length}${toVerify.length === 60 ? "+" : ""})</p>
      <ul class="req-list">${toVerify.map(s => `<li class="req-row"><div><b>${esc(s.name)}</b><span>${esc(CATS[s.category]?.label || "")}${s.author_name ? ` · by ${esc(s.author_name)}` : ""}</span></div>
        <button type="button" class="pop-btn" data-go="${s.id}">${ICON.pin}Show</button></li>`).join("") || `<li class="gate-help left">Everything in your area is checked. 🎉</li>`}</ul>
      <button type="button" class="text-link" data-showarea>Show my area on the map</button></div>`);
    d.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { const s = spots.find(x => x.id === +b.dataset.go); d.close(); if (s) { $("#spotsMap").scrollIntoView({ behavior: "smooth", block: "center" }); focusSpot(s); } }));
    d.querySelector("[data-showarea]").addEventListener("click", () => {
      d.close(); $("#spotsMap").scrollIntoView({ behavior: "smooth", block: "center" });
      const c = L.circle([e.lat, e.lon], { radius: e.radius_km * 1000, color: "#ffc46e", weight: 1.5, dashArray: "6 6", fillOpacity: .04, interactive: false }).addTo(originLayer);
      map.flyToBounds(c.getBounds(), { duration: .8 });
    });
    const fb = d.querySelector("[data-flags]");
    try {
      const { data } = await api("/rest/v1/content_flags?select=id,kind,target_id,label,reason,note,created_at&resolved=eq.false&order=created_at.desc&limit=200");
      fb.innerHTML = (data || []).length ? `<ul class="req-list">${data.map(f => `<li class="req-row" data-flag="${f.id}" data-kind="${f.kind}" data-target="${esc(f.target_id)}">
          <div><b>${esc(f.kind)} · ${esc(FLAG_REASONS[f.reason] || f.reason)}</b><span>${esc(f.label || "")}${f.note ? ` — “${esc(f.note)}”` : ""}</span></div>
          ${f.kind !== "spot" ? `<button type="button" class="pop-btn" data-fx="remove">Remove</button>` : ""}<button type="button" class="pop-btn" data-fx="dismiss">Dismiss</button></li>`).join("")}</ul>`
        : `<p class="gate-help left">No open flags in your area.</p>`;
      fb.querySelectorAll("[data-fx]").forEach(b => b.addEventListener("click", async () => {
        const li = b.closest("[data-flag]");
        if (b.dataset.fx === "remove" && b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm"; return; }
        try {
          if (b.dataset.fx === "remove") await api(`/rest/v1/${li.dataset.kind === "review" ? "spot_reviews" : "spot_photos"}?id=eq.${encodeURIComponent(li.dataset.target)}`, { method: "DELETE" });
          await api(`/rest/v1/content_flags?id=eq.${li.dataset.flag}`, { method: "PATCH", body: { resolved: true }, headers: { Prefer: "return=minimal" } });
          li.innerHTML = `<p class="gate-help left">${b.dataset.fx === "remove" ? "Removed." : "Dismissed."}</p>`;
        } catch (err) { toast(`Could not update: ${err.message}`, true); }
      }));
    } catch { fb.innerHTML = `<p class="gate-help left">Flags not available.</p>`; }
  }
  function openPhotographers(onlyCo) {
    const list = profiles.filter(p => p.visible).sort((a, b) => (contribs.has(b.user_id) - contribs.has(a.user_id)) || a.display_name.localeCompare(b.display_name))
      .filter(p => !onlyCo || contribs.has(p.user_id));
    const d = dlg("phListDialog", `<div class="import-body"><span class="eyebrow">Spots community</span><h2>📷 Photographers</h2>
      <div class="gate-tabs"><button type="button" class="${onlyCo ? "" : "on"}" data-co="0">All</button><button type="button" class="${onlyCo ? "on" : ""}" data-co="1">${ICON_APERTURE} Contributors</button></div>
      <ul class="req-list">${list.map(p => `<li class="req-row${contribs.has(p.user_id) ? " co-row" : ""}"><div><b>${esc(p.display_name)}${coBadge(p.user_id)}${experts.has(p.user_id) ? ` <span class="xp-badge">🧭 ${esc(experts.get(p.user_id).area_name)}</span>` : ""}</b>
        <span>${p.base_name ? esc(p.base_name) : ""}${p.instagram ? ` · <a href="https://www.instagram.com/${encodeURIComponent(p.instagram)}/" target="_blank" rel="noopener">@${esc(p.instagram)}</a>` : ""}${p.website ? ` · <a href="${esc(p.website)}" target="_blank" rel="noopener">website</a>` : ""}${postFresh(p) ? ` · <a href="${esc(p.last_post_url)}" target="_blank" rel="noopener">📣 new post</a>` : ""}</span></div>
        ${p.lat != null ? `<button type="button" class="pop-btn" data-ph="${esc(p.user_id)}">${ICON.pin}Map</button>` : ""}</li>`).join("") || `<li class="gate-help left">Nobody here yet.</li>`}</ul></div>`);
    d.querySelectorAll("[data-co]").forEach(b => b.addEventListener("click", () => openPhotographers(b.dataset.co === "1")));
    d.querySelectorAll("[data-ph]").forEach(b => b.addEventListener("click", () => {
      const p = profiles.find(x => x.user_id === b.dataset.ph); d.close(); if (!p) return;
      showPhotographers = true; drawCommunity(); $("#spotsMap").scrollIntoView({ behavior: "smooth", block: "center" }); map.flyTo([p.lat, p.lon], 10, { duration: .8 });
    }));
  }
  const slugify = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function openExperts() {
    const list = [...experts.values()].sort((a, b) => a.area_name.localeCompare(b.area_name));
    const d = dlg("expertsDialog", `<div class="import-body"><span class="eyebrow">Spots community</span><h2>🧭 Local experts</h2>
      <p class="gate-help left">Trusted members who know their area: they verify places, keep information up to date and look after fragile spots.</p>
      <ul class="req-list">${list.map(e => { const p = profiles.find(x => x.user_id === e.user_id) || {};
        return `<li class="req-row"><div><b>${esc(e.display_name || p.display_name || "Local expert")}</b><span>🧭 ${esc(e.area_name)} · ${(+e.radius_km)} km${p.instagram ? ` · <a href="https://www.instagram.com/${encodeURIComponent(p.instagram)}/" target="_blank" rel="noopener">@${esc(p.instagram)}</a>` : ""}${p.website ? ` · <a href="${esc(p.website)}" target="_blank" rel="noopener">website</a>` : ""}</span></div>
          <button type="button" class="pop-btn" data-area="${esc(e.user_id)}">${ICON.pin}Area</button></li>`; }).join("") || `<li class="gate-help left">No local experts yet.</li>`}</ul></div>`);
    d.querySelectorAll("[data-area]").forEach(b => b.addEventListener("click", () => {
      const e = experts.get(b.dataset.area); d.close(); if (!e) return;
      $("#spotsMap").scrollIntoView({ behavior: "smooth", block: "center" });
      const c = L.circle([e.lat, e.lon], { radius: e.radius_km * 1000, color: "#ffc46e", weight: 1.5, dashArray: "6 6", fillOpacity: .04, interactive: false }).addTo(originLayer);
      map.flyToBounds(c.getBounds(), { duration: .8 });
    }));
  }
  function openPosted() {
    const me = profiles.find(p => p.user_id === myUid());
    if (!me) return openProfile();
    const d = dlg("postedDialog", `<form class="import-body gate-form" novalidate><span class="eyebrow">Photographers' map</span><h2>📣 I just posted</h2>
      <p class="gate-help left">Paste the link of your new Instagram post: your icon on the photographers' map glows for 24 hours and stays visible even when members zoom out.</p>
      <input id="igPost" type="url" placeholder="https://www.instagram.com/p/…" value="${esc(postFresh(me) ? me.last_post_url || "" : "")}" required>
      <button class="outline-link" type="submit">MAKE MY ICON GLOW <span aria-hidden="true">→</span></button><p class="gate-note" id="igMsg" role="status"></p></form>`);
    d.querySelector("form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const url = d.querySelector("#igPost").value.trim().split("?")[0], msg = d.querySelector("#igMsg");
      if (!/^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url)) { msg.className = "gate-note warn"; msg.textContent = "Paste the link of an Instagram post or reel (instagram.com/p/… or /reel/…)."; return; }
      try {
        const at = new Date().toISOString();
        await api(`/rest/v1/member_profiles?user_id=eq.${encodeURIComponent(myUid())}`, { method: "PATCH", body: { last_post_url: url, last_post_at: at }, headers: { Prefer: "return=minimal" } });
        Object.assign(me, { last_post_url: url, last_post_at: at });
        d.close(); drawCommunity(); toast("Your icon glows for the next 24 hours. ✨"); window.fcTrack?.("Spots: Instagram post shared");
      } catch (err) { msg.className = "gate-note warn"; msg.textContent = `Could not save: ${err.message}`; }
    });
  }

  /* --- preferiti --- */
  async function toggleFav(s, btn) {
    const on = !favs.has(s.id);
    btn.disabled = true;
    try {
      if (on) await api("/rest/v1/spot_favorites", { method: "POST", body: { spot_id: s.id }, headers: { Prefer: "return=minimal,resolution=ignore-duplicates" } });
      else await api(`/rest/v1/spot_favorites?spot_id=eq.${s.id}&user_id=eq.${encodeURIComponent(myUid())}`, { method: "DELETE" });
      on ? favs.add(s.id) : favs.delete(s.id);
      btn.classList.toggle("on", on); btn.textContent = on ? "♥ Saved" : "♡ Save";
      markerById.get(s.id)?.setIcon(pinIcon(s));
      const fb = $("#onlyFavs"); if (fb) fb.querySelector("small").textContent = favs.size;
      window.fcTrack?.(on ? "Spots: saved a place" : "Spots: unsaved a place");
    } catch (err) { toast(`Could not save: ${err.message}`, true); }
    btn.disabled = false;
  }

  /* --- disegno: ritrovi e fotografi --- */
  const MEET_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3 19c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2M14 14.4c.8-.4 1.6-.6 2.5-.6 2.3 0 4 1.5 4.5 4.7"/></svg>';
  const PH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20V19H4z"/><circle cx="12" cy="13" r="3.4"/></svg>';
  const shortDay = d => new Date(d + "T12:00:00").toLocaleDateString(window.I18N?.locale || "en-GB", { day: "numeric", month: "short" });
  function drawCommunity() {
    if (!commLayer || !map) return;
    commLayer.clearLayers();
    if (guest || !commV) return;
    upcomingMeetups().forEach(m => {
      const mk = L.marker([m.lat, m.lon], { zIndexOffset: 1200, keyboard: true, title: m.title,
        icon: L.divIcon({ className: "", iconSize: [34, 44], iconAnchor: [17, 17], popupAnchor: [0, -14],
          html: `<div class="meet-pin">${MEET_ICON}<span class="meet-date">${shortDay(m.meet_on)}</span></div>` }) }).addTo(commLayer);
      mk.bindTooltip(`${esc(m.title)} · ${shortDay(m.meet_on)}`, { direction: "top" });
      let node = null;
      mk.bindPopup(() => node || (node = Object.assign(document.createElement("div"), { innerHTML: meetupHtml(m) }).firstElementChild), { maxWidth: 300, minWidth: 240, className: "spot-popup" });
      mk.on("popupopen", e => wireMeetup(e.popup, m, () => { node = null; }));
    });
    const zoomOk = map.getZoom() >= 5;
    profiles.filter(p => p.visible && p.on_map !== false && p.lat != null && (showPhotographers || (postFresh(p) && (zoomOk || isCo(p.user_id))))).forEach(p => {
      const fresh = postFresh(p), xp = experts.has(p.user_id), co = isCo(p.user_id), dev = isDev(p.user_id), big = xp || co || dev;
      const mk = L.marker([p.lat, p.lon], { zIndexOffset: (fresh ? 1300 : 1100) + (co ? 50 : 0), keyboard: true, title: p.display_name,
        icon: L.divIcon({ className: "", iconSize: [big ? 36 : 30, big ? 36 : 30], iconAnchor: [big ? 18 : 15, big ? 18 : 15], popupAnchor: [0, -12],
          html: `<div class="ph-pin${fresh ? " posted" : ""}${xp ? " expert" : ""}${co ? " contrib" : ""}${dev && !co ? " dev" : ""}">${co ? ICON_APERTURE : dev ? ICON_DEV : PH_ICON}${fresh ? `<span class="ph-new">NEW POST</span>` : ""}</div>` }) }).addTo(commLayer);
      mk.bindTooltip(esc(p.display_name), { direction: "top" });
      mk.bindPopup(() => profileHtml(p), { maxWidth: 300, minWidth: 220, className: "spot-popup" });
      mk.on("popupopen", e => e.popup.getElement()?.querySelector("[data-flagprofile]")?.addEventListener("click", () => openFlag("profile", p.user_id, p.display_name)));
    });
  }
  function meetupHtml(m) {
    const who = meetupJoins.get(m.id) || [], mine = who.some(j => j.user_id === myUid());
    const own = m.created_by === myUid();
    return `<div class="spot-pop">
      <span class="spot-cat" style="--c:#ffd166">${MEET_ICON}Meetup</span>
      <strong>${esc(m.title)}</strong>
      <p class="pop-dates">${ICON.cal}<span>${fmtDay(m.meet_on)}${m.meet_time ? ` · ${esc(m.meet_time)}` : ""}</span></p>
      ${m.note ? `<p class="pop-desc">${esc(m.note)}</p>` : ""}
      <p class="pop-author">Organised by ${esc(m.author_name || "a member")}${xpBadge(m.created_by)}</p>
      <p class="meet-who" data-who>${who.length ? `👥 ${who.length} going: ${who.map(j => esc(j.name || "Member")).join(", ")}` : "Nobody has joined yet."}</p>
      <div class="pop-actions">
        ${own ? "" : `<button type="button" class="pop-btn${mine ? "" : " primary"}" data-join>${mine ? "Leave" : "I'm in"}</button>`}
        <a class="pop-btn" href="https://www.google.com/maps/dir/?api=1&destination=${m.lat.toFixed(6)},${m.lon.toFixed(6)}" target="_blank" rel="noopener">${ICON.ext}Directions</a>
        ${own || admin ? `<button type="button" class="pop-btn" data-delmeet>Delete</button>` : `<button type="button" class="text-link pop-flag" data-flagmeet>⚑ Flag</button>`}
      </div>
      <p class="gate-help left">The meetup disappears from the map on the day it takes place.</p>
    </div>`;
  }
  function wireMeetup(popup, m, reset) {
    const el = popup.getElement();
    if (!el || el.dataset.wired === String(m.id) + (meetupJoins.get(m.id) || []).length) return;
    el.querySelector("[data-join]")?.addEventListener("click", async ev => {
      const b = ev.currentTarget, mine = (meetupJoins.get(m.id) || []).some(j => j.user_id === myUid());
      b.disabled = true;
      try {
        if (mine) await api(`/rest/v1/meetup_joins?meetup_id=eq.${m.id}&user_id=eq.${encodeURIComponent(myUid())}`, { method: "DELETE" });
        else await api("/rest/v1/meetup_joins", { method: "POST", body: { meetup_id: m.id, name: displayName() }, headers: { Prefer: "return=minimal" } });
        const list = (meetupJoins.get(m.id) || []).filter(j => j.user_id !== myUid());
        if (!mine) list.push({ meetup_id: m.id, user_id: myUid(), name: displayName() });
        meetupJoins.set(m.id, list);
        reset(); popup.setContent(Object.assign(document.createElement("div"), { innerHTML: meetupHtml(m) }).firstElementChild);
        wireMeetup(popup, m, reset);
        window.fcTrack?.(mine ? "Spots: left a meetup" : "Spots: joined a meetup");
      } catch (err) { toast(`Could not update: ${err.message}`, true); b.disabled = false; }
    });
    el.querySelector("[data-delmeet]")?.addEventListener("click", async ev => {
      const b = ev.currentTarget;
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm delete"; return; }
      try { await api(`/rest/v1/meetups?id=eq.${m.id}`, { method: "DELETE" }); meetups = meetups.filter(x => x.id !== m.id); map.closePopup(); drawCommunity(); toast("Meetup deleted."); }
      catch (err) { toast(`Could not delete: ${err.message}`, true); }
    });
    el.querySelector("[data-flagmeet]")?.addEventListener("click", () => openFlag("meetup", String(m.id), m.title));
  }
  function profileHtml(p) {
    const ig = p.instagram ? `https://www.instagram.com/${encodeURIComponent(p.instagram)}/` : "";
    return `<div class="spot-pop">
      <span class="spot-cat" style="--c:${isCo(p.user_id) ? "#ffc46e" : isDev(p.user_id) ? "#7fd8ff" : "#c9a7ff"}">${isCo(p.user_id) ? ICON_APERTURE : isDev(p.user_id) ? ICON_DEV : PH_ICON}${isCo(p.user_id) ? "Contributor" : isDev(p.user_id) ? "Developer" : "Photographer"}</span>
      ${isDev(p.user_id) ? `<p class="pop-dates co-line dev-line">${ICON_DEV}<span>Helps build Spots${p.website ? ` — <a href="${esc(p.website)}" target="_blank" rel="noopener">see their work</a>` : ""}</span></p>` : ""}
      <strong>${esc(p.display_name)}</strong>
      ${p.base_name ? `<p class="pop-dates">${ICON.pin}<span>${esc(p.base_name)}</span></p>` : ""}
      ${isCo(p.user_id) ? `<p class="pop-dates co-line">${ICON_APERTURE}<span>Contributor of Fabio Costa Ph — <a href="#author-${encodeURIComponent(slugify(p.display_name))}">see their work</a></span></p>` : ""}
      ${experts.has(p.user_id) ? `<p class="pop-dates">🧭 <span>Local expert · ${esc(experts.get(p.user_id).area_name)}</span></p>` : ""}
      ${p.bio ? `<p class="pop-desc">${esc(p.bio)}</p>` : ""}
      ${postFresh(p) && p.last_post_url ? `<a class="pop-btn primary ig-new" href="${esc(p.last_post_url)}" target="_blank" rel="noopener">📣 See the new post</a>` : ""}
      <div class="pop-actions">
        ${ig ? `<a class="pop-btn primary" href="${esc(ig)}" target="_blank" rel="noopener">Instagram @${esc(p.instagram)}</a>` : ""}
        ${p.website ? `<a class="pop-btn" href="${esc(p.website)}" target="_blank" rel="noopener">${ICON.ext}Website</a>` : ""}
        ${p.user_id !== myUid() ? `<button type="button" class="text-link pop-flag" data-flagprofile>⚑ Flag</button>` : ""}
      </div>
    </div>`;
  }

  /* --- finestre --- */
  function dlg(id, html) {
    let d = $(`#${id}`);
    if (!d) { d = document.createElement("dialog"); d.id = id; d.className = "import-dialog"; document.body.appendChild(d); d.addEventListener("click", e => { if (e.target === d) d.close(); }); }
    d.innerHTML = `<button class="dialog-close" type="button" data-close aria-label="Close">${ICON.close}</button>${html}`;
    d.querySelector("[data-close]").onclick = () => d.close();
    if (!d.open) d.showModal();
    return d;
  }
  function openMeetup(pre) {
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const d = dlg("meetDialog", `<form class="import-body gate-form" novalidate>
      <span class="eyebrow">Members only</span><h2>Plan a meetup</h2>
      <label for="mtTitle">What</label>
      <input id="mtTitle" maxlength="120" placeholder="e.g. Sunrise at Seceda, then breakfast" value="${pre?.spot ? esc(`Meetup at ${pre.spot.name}`) : ""}" required>
      <div class="ws-fields">
        <label>Day<input type="date" id="mtDay" min="${tomorrow}" value="${tomorrow}" required></label>
        <label>Time <small>(optional)</small><input type="text" id="mtTime" maxlength="20" placeholder="e.g. 5:30"></label>
      </div>
      <label for="mtCoords">Where (coordinates)</label>
      <input id="mtCoords" value="${pre ? `${pre.lat.toFixed(5)}, ${pre.lon.toFixed(5)}` : ""}" placeholder="46.6013, 11.7246" autocomplete="off" required>
      <label for="mtNote">Details <small>(optional)</small></label>
      <textarea id="mtNote" rows="3" maxlength="1000" placeholder="Where to park, what to bring, how to recognise the group…"></textarea>
      <button class="outline-link" type="submit">CREATE MEETUP <span aria-hidden="true">→</span></button>
      <p class="gate-note" id="mtMsg" role="status"></p>
      <p class="gate-help left">Only members see meetups. It disappears from the map on the day it takes place.</p>
    </form>`);
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = d.querySelector("#mtMsg"), warn = t => { msg.className = "gate-note warn"; msg.textContent = t; };
      const title = d.querySelector("#mtTitle").value.trim(), day = d.querySelector("#mtDay").value, c = parseCoordsInput(d.querySelector("#mtCoords").value);
      if (title.length < 2) return warn("Give the meetup a short title.");
      if (!day || day <= todayISO()) return warn("Pick a day from tomorrow on.");
      if (!c) return warn("Coordinates not recognised. Format: 46.6013, 11.7246");
      const row = { title, meet_on: day, meet_time: d.querySelector("#mtTime").value.trim() || null, lat: c.lat, lon: c.lon,
        note: d.querySelector("#mtNote").value.trim() || null, spot_id: pre?.spot?.id || null, author_name: displayName() };
      try {
        const { data } = await api("/rest/v1/meetups", { method: "POST", body: row, headers: { Prefer: "return=representation" } });
        meetups.push(Array.isArray(data) ? data[0] : data);
        d.close(); renderApp(); map.flyTo([c.lat, c.lon], Math.max(map.getZoom(), 12), { duration: .8 });
        toast("Meetup created: members can now join."); window.fcTrack?.("Spots: created a meetup");
      } catch (err) { warn(`Could not save: ${err.message}`); }
    });
  }
  function openMeetupList() {
    const list = upcomingMeetups();
    const d = dlg("meetListDialog", `<div class="import-body">
      <span class="eyebrow">Members only</span><h2>Upcoming meetups</h2>
      ${list.length ? `<ul class="req-list">${list.map(m => `<li class="req-row"><div><b>${esc(m.title)}</b>
        <span>${fmtDay(m.meet_on)}${m.meet_time ? ` · ${esc(m.meet_time)}` : ""} · ${(meetupJoins.get(m.id) || []).length} going · by ${esc(m.author_name || "a member")}</span></div>
        <button type="button" class="pop-btn" data-goto="${m.id}">${ICON.pin}Show</button></li>`).join("")}</ul>`
        : `<p class="gate-help left">No meetups planned yet. Use «＋ Meetup» or «Meet here» on any place.</p>`}
    </div>`);
    d.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => {
      const m = meetups.find(x => x.id === +b.dataset.goto); d.close();
      if (!m) return;
      $("#spotsMap").scrollIntoView({ behavior: "smooth", block: "center" });
      map.flyTo([m.lat, m.lon], Math.max(map.getZoom(), 13), { duration: .9 });
      map.once("moveend", () => commLayer.eachLayer(l => { const ll = l.getLatLng?.(); if (ll && Math.abs(ll.lat - m.lat) < 1e-9 && Math.abs(ll.lng - m.lon) < 1e-9) l.openPopup(); }));
    }));
  }
  function openProfile() {
    const me = profiles.find(p => p.user_id === myUid()) || {};
    const v = x => (x == null ? "" : esc(String(x)));
    const d = dlg("profileDialog", `<form class="import-body gate-form" novalidate>
      <span class="eyebrow">${profV ? "My Spots" : "Photographers' map"}</span><h2>${me.user_id ? "Your profile" : profV ? "Create your profile" : "Join the map"}</h2>
      ${profV ? `<div class="pf-avatar">${avatarHtml(me.display_name ? me : { display_name: displayName() }, 72)}<label class="pop-btn">📷 ${me.avatar_path ? "Change photo" : "Add a profile photo"}<input type="file" id="pfPhoto" accept="image/*" hidden></label>${me.avatar_path ? `<button type="button" class="text-link" id="pfNoPhoto">Remove</button>` : ""}</div>` : ""}
      <label for="pfName">Name</label><input id="pfName" maxlength="60" value="${v(me.display_name || displayName())}" required>
      ${profV ? `<label for="pfUser">Username <small>(3–30: letters, numbers, dots, underscores)</small></label><input id="pfUser" maxlength="30" value="${v(me.username)}" placeholder="e.g. anna.dolomiti" autocapitalize="none" autocomplete="username">` : ""}
      <div class="ws-fields">
        <label>Instagram<input id="pfIg" maxlength="31" value="${v(me.instagram)}" placeholder="username (no @)"></label>
        <label>Website<input id="pfWeb" type="url" maxlength="300" value="${v(me.website)}" placeholder="https://…"></label>
      </div>
      <label for="pfBio">About you <small>(optional)</small></label>
      <textarea id="pfBio" rows="2" maxlength="300" placeholder="Landscape and night photographer, Dolomites guide…">${v(me.bio)}</textarea>
      <label for="pfBase">Where you're based</label>
      <div class="gkey-row"><input id="pfBase" maxlength="80" value="${v(me.base_name)}" placeholder="Town or area, e.g. Bolzano"><button class="text-link" type="button" id="pfHere">Use my location</button></div>
      <input id="pfCoords" value="${me.lat != null ? `${(+me.lat).toFixed(2)}, ${(+me.lon).toFixed(2)}` : ""}" placeholder="Coordinates of your area, e.g. 46.50, 11.35" autocomplete="off">
      <p class="gate-help left">For privacy your pin is placed only roughly (about 5 km), never at your address.</p>
      <label class="shot-check"><input type="checkbox" id="pfVisible"${me.user_id ? ((profV ? me.on_map !== false : me.visible) ? " checked" : "") : " checked"}> Show me on the photographers' map</label>
      <button class="outline-link" type="submit">SAVE PROFILE <span aria-hidden="true">→</span></button>
      ${me.user_id ? `<button class="text-link" type="button" id="pfDelete">Remove my profile</button>` : ""}
      <p class="gate-note" id="pfMsg" role="status"></p>
    </form>`);
    let newPhoto = null, dropPhoto = false;
    d.querySelector("#pfPhoto")?.addEventListener("change", e => {
      newPhoto = e.target.files[0] || null; dropPhoto = false;
      if (newPhoto) { const u = URL.createObjectURL(newPhoto); d.querySelector(".pf-avatar .me-avatar").innerHTML = `<img src="${u}" alt="">`; }
    });
    d.querySelector("#pfNoPhoto")?.addEventListener("click", ev => { dropPhoto = true; newPhoto = null; d.querySelector(".pf-avatar .me-avatar").innerHTML = `<span>${esc(initials(d.querySelector("#pfName").value))}</span>`; ev.currentTarget.hidden = true; });
    d.querySelector("#pfHere").addEventListener("click", () => {
      if (!navigator.geolocation) return toast("Your browser can't share its location.", true);
      navigator.geolocation.getCurrentPosition(p => { d.querySelector("#pfCoords").value = `${p.coords.latitude.toFixed(2)}, ${p.coords.longitude.toFixed(2)}`; },
        () => toast("Location not available.", true), { timeout: 10000 });
    });
    d.querySelector("#pfDelete")?.addEventListener("click", async ev => {
      const b = ev.currentTarget;
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Click again to remove your profile"; return; }
      try { await api(`/rest/v1/member_profiles?user_id=eq.${encodeURIComponent(myUid())}`, { method: "DELETE" }); profiles = profiles.filter(p => p.user_id !== myUid()); d.close(); renderApp(); toast("Profile removed."); }
      catch (err) { toast(`Could not remove: ${err.message}`, true); }
    });
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = d.querySelector("#pfMsg"), warn = t => { msg.className = "gate-note warn"; msg.textContent = t; };
      const name = d.querySelector("#pfName").value.trim(), ig = d.querySelector("#pfIg").value.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
      const web = d.querySelector("#pfWeb").value.trim(), cTxt = d.querySelector("#pfCoords").value.trim(), c = cTxt ? parseCoordsInput(cTxt) : null;
      if (name.length < 2) return warn("Please enter your name.");
      if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) return warn("Instagram: just the username, e.g. fabiocostaph");
      if (web && !/^https?:\/\//i.test(web)) return warn("The website must start with https://");
      if (cTxt && !c) return warn("Coordinates not recognised. Format: 46.50, 11.35");
      const uname = profV ? (d.querySelector("#pfUser")?.value || "").trim().toLowerCase().replace(/^@/, "") : "";
      if (uname && !/^[a-z0-9._]{3,30}$/.test(uname)) return warn("Username: 3–30 letters, numbers, dots or underscores.");
      const round = x => Math.round(x * 20) / 20;   // ~5 km
      const row = { user_id: myUid(), display_name: name, instagram: ig || null, website: web || null, bio: d.querySelector("#pfBio").value.trim() || null,
        base_name: d.querySelector("#pfBase").value.trim() || null, lat: c ? round(c.lat) : null, lon: c ? round(c.lon) : null,
        ...(profV ? { visible: true, on_map: d.querySelector("#pfVisible").checked, username: uname || null } : { visible: d.querySelector("#pfVisible").checked }), updated_at: new Date().toISOString() };
      try {
        if (profV && newPhoto) { msg.className = "gate-note"; msg.textContent = "Uploading the photo…"; row.avatar_path = await uploadAvatar(newPhoto); }
        else if (profV && dropPhoto) row.avatar_path = null;
        const oldPath = me.avatar_path;
        await api("/rest/v1/member_profiles?on_conflict=user_id", { method: "POST", body: row, headers: { Prefer: "return=minimal,resolution=merge-duplicates" } });
        if (oldPath && "avatar_path" in row && row.avatar_path !== oldPath) { try { await api(`/storage/v1/object/avatars/${oldPath}`, { method: "DELETE" }); } catch {} }
        profiles = profiles.filter(p => p.user_id !== row.user_id).concat({ ...me, ...row });
        d.close(); meCache = null;
        if (meView) { renderMe(); toast("Profile saved."); }
        else { showPhotographers = row.lat != null && row.on_map !== false; renderApp(); toast(row.lat == null ? "Profile saved. Add your area to appear on the photographers' map." : "Profile saved: you're on the photographers' map."); }
        window.fcTrack?.("Spots: saved photographer profile");
      } catch (err) { warn(/duplicate|unique|23505/i.test(err.message) ? "That username is already taken: try another." : `Could not save: ${err.message}`); }
    });
  }
  const FLAG_REASONS = { spam: "Spam or advertising", offensive: "Offensive or abusive", wrong: "Wrong or misleading", not_theirs: "Not their photo / copyright", danger: "Dangerous or illegal", other: "Something else" };
  function openFlag(kind, targetId, label) {
    const d = dlg("flagDialog", `<form class="import-body gate-form" novalidate>
      <span class="eyebrow">Moderation</span><h2>Flag this content</h2>
      <p class="gate-help left">«${esc(label || "")}» — only Fabio sees flags. Thanks for keeping the map clean.</p>
      <label for="flReason">Why?</label>
      <select id="flReason" class="flag-select">${Object.entries(FLAG_REASONS).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select>
      <label for="flNote">Details <small>(optional)</small></label>
      <textarea id="flNote" rows="2" maxlength="600"></textarea>
      <button class="outline-link" type="submit">SEND <span aria-hidden="true">→</span></button>
    </form>`);
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        await api("/rest/v1/content_flags", { method: "POST", headers: { Prefer: "return=minimal" },
          body: { kind, target_id: String(targetId), label: (label || "").slice(0, 200), reason: d.querySelector("#flReason").value, note: d.querySelector("#flNote").value.trim() || null } });
        d.close(); toast("Thanks: Fabio will review it."); window.fcTrack?.(`Spots: flagged ${kind}`);
      } catch (err) { toast(`Could not send: ${err.message}`, true); }
    });
  }

  /* --- pannello admin: richieste, membri, segnalazioni --- */
  async function openAdmin(tab = "requests") {
    const d = dlg("adminDialog", `<div class="import-body" data-no-i18n>
      <span class="eyebrow">Spots · solo per te</span><h2>Amministrazione</h2>
      <div class="gate-tabs adm-tabs" role="tablist">
        <button type="button" data-atab="requests" class="${tab === "requests" ? "on" : ""}">Richieste <b>${pendingMembers.length}</b></button>
        <button type="button" data-atab="members" class="${tab === "members" ? "on" : ""}">Membri</button>
        <button type="button" data-atab="flags" class="${tab === "flags" ? "on" : ""}">Segnalazioni <b>${openFlags}</b></button>
        <button type="button" data-atab="feedback" class="${tab === "feedback" ? "on" : ""}">Feedback</button>
        <button type="button" data-atab="crew" class="${tab === "crew" ? "on" : ""}">Contributor</button>
        <button type="button" data-atab="articles" class="${tab === "articles" ? "on" : ""}">Articoli</button>
      </div>
      <div class="adm-body"><p class="gate-help left">Caricamento…</p></div>
    </div>`);
    d.querySelectorAll("[data-atab]").forEach(b => b.addEventListener("click", () => openAdmin(b.dataset.atab)));
    const body = d.querySelector(".adm-body");
    const refreshBadge = () => { const b = $("#spotsRequests"); if (b) { b.querySelector("b").textContent = pendingMembers.length + openFlags; b.classList.toggle("has", pendingMembers.length + openFlags > 0); } };
    const decide = async (uid, status, li, doneText) => {
      li.querySelectorAll("button").forEach(x => (x.disabled = true));
      try {
        await api("/rest/v1/rpc/decide_member", { method: "POST", body: { p_user: uid, p_status: status } });
        pendingMembers = pendingMembers.filter(m => m.user_id !== uid);
        li.innerHTML = `<p class="gate-help left">${doneText}</p>`; refreshBadge();
      } catch (err) { toast(`Non riuscito (${err.message}).`, true); li.querySelectorAll("button").forEach(x => (x.disabled = false)); }
    };
    try {
      if (tab === "requests") {
        await fetchPending();
        body.innerHTML = pendingMembers.length ? `<ul class="req-list">${pendingMembers.map(m => `<li class="req-row" data-uid="${esc(m.user_id)}">
            <div><b>${esc([m.first_name, m.last_name].filter(Boolean).join(" ") || "—")}</b><span>${esc(m.email || "")} · ${fmtDay(String(m.created_at).slice(0, 10))}</span></div>
            <button type="button" class="pop-btn primary" data-st="approved">Approva</button><button type="button" class="pop-btn" data-st="rejected">Rifiuta</button></li>`).join("")}</ul>`
          : `<p class="gate-help left">Nessuna richiesta in attesa.</p>`;
        body.querySelectorAll("[data-st]").forEach(b => b.addEventListener("click", () => { const li = b.closest(".req-row"); decide(li.dataset.uid, b.dataset.st, li, b.dataset.st === "approved" ? "✓ Approvato" : "Rifiutato"); }));
      } else if (tab === "members") {
        const { data } = await api("/rest/v1/members?select=user_id,email,first_name,last_name,status,created_at&status=in.(approved,suspended,rejected)&order=created_at.desc&limit=2000");
        const label = { approved: "Attivo", suspended: "Sospeso", rejected: "Rifiutato" };
        body.innerHTML = `<input type="search" class="adm-search" placeholder="Cerca per nome o email" aria-label="Cerca membro">
          <ul class="req-list adm-members">${(data || []).map(m => `<li class="req-row" data-uid="${esc(m.user_id)}" data-q="${esc(`${m.first_name || ""} ${m.last_name || ""} ${m.email || ""}`.toLowerCase())}">
            <div><b>${esc([m.first_name, m.last_name].filter(Boolean).join(" ") || "—")}</b><span>${esc(m.email || "")} · ${label[m.status] || m.status}</span></div>
            ${m.status === "approved" ? `<button type="button" class="pop-btn${isCo(m.user_id) ? " on" : ""}" data-contrib="photographer">${isCo(m.user_id) ? "✓ Contributor" : "Contributor"}</button>
              <button type="button" class="pop-btn${isDev(m.user_id) ? " on" : ""}" data-contrib="developer">${isDev(m.user_id) ? "✓ Developer" : "Developer"}</button>` : ""}
            ${m.status === "approved" && nodiV ? `<button type="button" class="pop-btn${experts.has(m.user_id) ? " on" : ""}" data-node>${experts.has(m.user_id) ? `🧭 ${esc(experts.get(m.user_id).area_name)}` : "🧭 Nomina nodo"}</button>` : ""}
            ${m.status === "approved" ? `<button type="button" class="pop-btn" data-st="suspended">Sospendi</button>` : `<button type="button" class="pop-btn primary" data-st="approved">Riattiva</button>`}</li>`).join("")}</ul>
          <p class="gate-help left">Chi sospendi non vede più gli spot e non può scrivere nulla. Puoi riattivarlo quando vuoi.</p>`;
        body.querySelectorAll("[data-contrib]").forEach(b => b.addEventListener("click", async () => {
          const li = b.closest(".req-row"), uid = li.dataset.uid, nm = li.querySelector("b").textContent.trim(), role = b.dataset.contrib;
          const label = role === "developer" ? "Developer" : "Contributor";
          const cur = contribs.has(uid) ? rolesOf(uid) : [];
          const has = role === "developer" ? cur.includes("developer") : cur.some(r => r !== "developer");
          const next = has ? cur.filter(r => (role === "developer" ? r !== "developer" : r === "developer")) : [...new Set([...cur, role])];
          b.disabled = true;
          try {
            if (!next.length) { await api(`/rest/v1/contributors?user_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE" }); contribs.delete(uid); }
            else { await api("/rest/v1/contributors?on_conflict=user_id", { method: "POST", body: { user_id: uid, display_name: nm, roles: next }, headers: { Prefer: "return=minimal,resolution=merge-duplicates" } }); contribs.set(uid, { user_id: uid, display_name: nm, roles: next }); }
            b.classList.toggle("on", !has); b.textContent = !has ? `✓ ${label}` : label;
            toast(!has ? `${nm}: badge ${label} attivo. Per comparire sulla mappa deve creare il profilo su Spots.` : `${nm}: badge ${label} tolto.`);
          } catch (err) { toast(`Non riuscito (${err.message}). Hai eseguito supabase-contributor-ruolo.sql?`, true); }
          b.disabled = false;
        }));
        body.querySelectorAll("[data-node]").forEach(b => b.addEventListener("click", () => {
          const li = b.closest(".req-row"), uid = li.dataset.uid, cur = experts.get(uid), nm = li.querySelector("b").textContent;
          const c = map ? map.getCenter() : { lat: 46.5, lng: 11.8 };
          li.insertAdjacentHTML("beforeend", `<form class="node-form" data-nodeform>
            <input name="area" maxlength="80" placeholder="Area (es. Dolomiti di Gardena)" value="${esc(cur?.area_name || "")}" required>
            <input name="coords" placeholder="Centro: 46.55, 11.75" value="${cur ? `${cur.lat}, ${cur.lon}` : `${c.lat.toFixed(3)}, ${L.Util.wrapNum(c.lng, [-180, 180], true).toFixed(3)}`}">
            <input name="km" type="number" min="1" max="500" step="1" value="${cur?.radius_km || 25}" aria-label="Raggio km"> km
            <button type="submit" class="pop-btn primary">Salva</button>${cur ? `<button type="button" class="pop-btn" data-unnode>Togli nodo</button>` : ""}
            <p class="gate-help left">Il centro di default è il punto al centro della mappa Spots.</p></form>`);
          b.disabled = true;
          const f = li.querySelector("[data-nodeform]");
          f.addEventListener("submit", async ev => {
            ev.preventDefault();
            const pc = parseCoordsInput(f.coords.value);
            if (!pc || !f.area.value.trim()) return toast("Area e centro (coordinate) sono obbligatori.", true);
            const row = { user_id: uid, display_name: nm, area_name: f.area.value.trim(), lat: pc.lat, lon: pc.lon, radius_km: +f.km.value || 25 };
            try { await api("/rest/v1/local_experts?on_conflict=user_id", { method: "POST", body: row, headers: { Prefer: "return=minimal,resolution=merge-duplicates" } });
              experts.set(uid, row); f.remove(); b.disabled = false; b.classList.add("on"); b.textContent = `🧭 ${row.area_name}`; toast(`${nm} è ora nodo di ${row.area_name}.`); }
            catch (err) { toast(`Non riuscito (${err.message}). Hai eseguito supabase-nodi.sql?`, true); }
          });
          f.querySelector("[data-unnode]")?.addEventListener("click", async () => {
            try { await api(`/rest/v1/local_experts?user_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE" }); experts.delete(uid); f.remove(); b.disabled = false; b.classList.remove("on"); b.textContent = "🧭 Nomina nodo"; }
            catch (err) { toast(`Non riuscito (${err.message}).`, true); }
          });
        }));
        body.querySelector(".adm-search").addEventListener("input", e => { const q = e.target.value.toLowerCase(); body.querySelectorAll(".adm-members li").forEach(li => { li.hidden = q && !li.dataset.q.includes(q); }); });
        body.querySelectorAll("[data-st]").forEach(b => b.addEventListener("click", () => {
          if (b.dataset.st === "suspended" && b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Conferma"; return; }
          const li = b.closest(".req-row"); decide(li.dataset.uid, b.dataset.st, li, b.dataset.st === "suspended" ? "Sospeso" : "✓ Riattivato");
        }));
      } else if (tab === "articles") {
        const { data } = await api("/rest/v1/journal_submissions?select=*&status=in.(submitted,published,changes)&order=updated_at.desc&limit=300");
        const order = { submitted: 0, changes: 1, published: 2 };
        const list = (data || []).sort((a, b) => order[a.status] - order[b.status]);
        const LBL = { submitted: "Da approvare", changes: "Rimandato all'autore", published: "Pubblicato" };
        body.innerHTML = list.length ? `<ul class="req-list">${list.map(x => `<li class="req-row" data-jid="${x.id}"><div>
            <b>${esc(x.title)}</b><span>${esc(x.author_name)} · ${x.kind === "reportage" ? "Reportage" : "Field guide"} · ${LBL[x.status]} · ${fmtDay(String(x.updated_at).slice(0, 10))}</span></div>
            <button type="button" class="pop-btn" data-ja="preview">Anteprima</button>
            ${x.status !== "published" ? `<button type="button" class="pop-btn primary" data-ja="publish">Pubblica</button><button type="button" class="pop-btn" data-ja="changes">Rimanda</button>` : `<button type="button" class="pop-btn" data-ja="unpublish">Ritira</button>`}
            </li>`).join("")}</ul><div class="adm-preview" hidden></div>`
          : `<p class="gate-help left">Nessun articolo da approvare. I contributor scrivono da fabiocostaph.com/#write.</p>`;
        body.querySelectorAll("[data-ja]").forEach(b => b.addEventListener("click", async () => {
          const li = b.closest("[data-jid]"), x = list.find(y => String(y.id) === li.dataset.jid), act = b.dataset.ja;
          if (act === "preview") {
            const pv = body.querySelector(".adm-preview"); pv.hidden = false;
            pv.innerHTML = `<div class="mag fn adm-mag"><article class="full-article mag-article">${window.FCJournal.articleHtml(window.FCJournal.fromSubmission(x))}</article></div>`;
            pv.scrollIntoView({ behavior: "smooth", block: "start" }); return;
          }
          let patch;
          if (act === "publish") patch = { status: "published", published_at: x.published_at || new Date().toISOString(), review_note: null };
          if (act === "unpublish") patch = { status: "changes", review_note: "Withdrawn for edits." };
          if (act === "changes") {
            const note = prompt("Nota per l'autore (cosa deve cambiare):", "");
            if (note === null) return;
            patch = { status: "changes", review_note: note.slice(0, 2000) || "Some changes needed." };
          }
          try {
            await api(`/rest/v1/journal_submissions?id=eq.${x.id}`, { method: "PATCH", body: patch, headers: { Prefer: "return=minimal" } });
            toast(act === "publish" ? "Pubblicato nel Journal." : act === "unpublish" ? "Ritirato." : "Rimandato all'autore.");
            window.FCJournal?.reload(); openAdmin("articles");
          } catch (err) { toast(`Non riuscito (${err.message}). Hai eseguito supabase-articoli.sql?`, true); }
        }));
      } else if (tab === "crew") {
        const { data } = await api("/rest/v1/contributor_requests?select=id,roles,name,email,links,message,lang,status,created_at&status=neq.archived&order=created_at.desc&limit=500");
        const RL = { writer: "Writer", photographer: "Fotografo", local: "Esperto locale", spots: "Cura spot", developer: "Sviluppatore", translator: "Traduttore", other: "Altro" };
        body.innerHTML = (data || []).length ? `<ul class="req-list">${data.map(c => `<li class="req-row" data-ct="${c.id}"><div>
            <b>${esc(c.name)} · ${(c.roles || []).map(r => RL[r] || r).join(", ") || "—"}${c.status === "contacted" ? " · ✓ contattato" : ""}</b>
            <span><a href="mailto:${esc(c.email)}?subject=${encodeURIComponent("Fabio Costa Ph — contributor")}">${esc(c.email)}</a> · ${fmtDay(String(c.created_at).slice(0, 10))}${c.links ? ` · ${esc(c.links)}` : ""}</span>
            ${c.message ? `<span class="ct-msg">“${esc(c.message)}”</span>` : ""}</div>
            ${c.status === "new" ? `<button type="button" class="pop-btn" data-cst="contacted">Contattato</button>` : ""}
            <button type="button" class="pop-btn" data-cst="archived">Archivia</button></li>`).join("")}</ul>`
          : `<p class="gate-help left">Nessuna candidatura per ora. La fascia «Join the crew» è in fondo a ogni pagina.</p>`;
        body.querySelectorAll("[data-cst]").forEach(b => b.addEventListener("click", async () => {
          const li = b.closest("[data-ct]");
          try { await api(`/rest/v1/contributor_requests?id=eq.${li.dataset.ct}`, { method: "PATCH", body: { status: b.dataset.cst }, headers: { Prefer: "return=minimal" } });
            if (b.dataset.cst === "archived") li.remove(); else { b.remove(); li.querySelector("b").insertAdjacentText("beforeend", " · ✓ contattato"); } }
          catch (err) { toast(`Non riuscito (${err.message}).`, true); }
        }));
      } else if (tab === "feedback") {
        const { data } = await api("/rest/v1/feedback?select=id,answers,rating,message,email,lang,page,device,created_at&order=created_at.desc&limit=1000");
        const list = data || [];
        const LBL = { came: "Cosa li ha portati qui", interest: "Cosa interessa di più", spots: "Come usano Spots", often: "Quanto spesso tornerebbero", missing: "Cosa vorrebbero" };
        const OPT = { photos: "Le foto", spots: "La mappa Spots", tools: "I Tools", journal: "Articoli e guide", workshops: "Workshop e ritrovi", social: "Instagram o un amico",
          locations: "Spot e luoghi", light: "Pianificare la luce", guides: "Guide pratiche", stories: "Reportage e storie", community: "Workshop e altri fotografi", prints: "Stampe e licenze",
          trip: "Pianificare un viaggio", near: "Spot vicino a me", add: "Aggiungono posti", reviews: "Recensioni e prezzi", meet: "Ritrovi", notyet: "Non l'hanno ancora provato",
          weekly: "Ogni settimana", monthly: "Ogni mese", trips: "Prima di un viaggio", rarely: "Raramente",
          offline: "Mappe offline", conditions: "Meteo e condizioni dal vivo", routes: "Percorsi GPX", app: "App negli store", videos: "Video", newsletter: "Newsletter mensile" };
        const rated = list.filter(f => f.rating), avg = rated.length ? rated.reduce((a, f) => a + f.rating, 0) / rated.length : 0;
        const block = key => {
          const counts = {};
          list.forEach(f => [].concat(f.answers?.[key] || []).forEach(v => { counts[v] = (counts[v] || 0) + 1; }));
          const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
          if (!rows.length) return "";
          const max = rows[0][1];
          return `<div class="fb-sum"><p class="fb-sum-t">${LBL[key]}</p>${rows.map(([k, n]) => `<div class="fb-row"><span>${esc(OPT[k] || k)}</span><i style="--w:${(n / max * 100).toFixed(0)}%"></i><b>${n}</b></div>`).join("")}</div>`;
        };
        body.innerHTML = list.length ? `<p class="gate-help left"><b>${list.length}</b> risposte${rated.length ? ` · voto medio <b>${avg.toFixed(1)}</b> ★ su ${rated.length}` : ""}</p>
            ${Object.keys(LBL).map(block).join("")}
            <p class="fb-sum-t">Commenti</p>
            <ul class="req-list">${list.filter(f => f.message || f.email).map(f => `<li class="req-row" data-fb="${f.id}"><div><b>${f.rating ? "★".repeat(f.rating) + " · " : ""}${esc(f.message || "(nessun commento)")}</b>
              <span>${fmtDay(String(f.created_at).slice(0, 10))} · ${esc(f.lang || "")} · ${esc(f.device || "")}${f.email ? ` · <a href="mailto:${esc(f.email)}">${esc(f.email)}</a>` : ""}</span></div>
              <button type="button" class="pop-btn" data-delfb>Elimina</button></li>`).join("") || `<li class="gate-help left">Nessun commento scritto.</li>`}</ul>`
          : `<p class="gate-help left">Ancora nessun feedback. L'avviso compare ai visitatori dopo 30 secondi sul sito.</p>`;
        body.querySelectorAll("[data-delfb]").forEach(b => b.addEventListener("click", async () => {
          const li = b.closest("[data-fb]");
          try { await api(`/rest/v1/feedback?id=eq.${li.dataset.fb}`, { method: "DELETE" }); li.remove(); } catch (err) { toast(`Non riuscito (${err.message}).`, true); }
        }));
      } else {
        const { data } = await api("/rest/v1/content_flags?select=id,kind,target_id,label,reason,note,created_at&resolved=eq.false&order=created_at.desc&limit=500");
        const KIND = { spot: "Posto", review: "Recensione", photo: "Foto", meetup: "Ritrovo", profile: "Profilo" };
        const REASON = { spam: "Spam", offensive: "Offensivo", wrong: "Sbagliato", not_theirs: "Foto non sua", danger: "Pericoloso", other: "Altro" };
        openFlags = (data || []).length; refreshBadge();
        body.innerHTML = (data || []).length ? `<ul class="req-list">${data.map(f => `<li class="req-row" data-flag="${f.id}" data-kind="${f.kind}" data-target="${esc(f.target_id)}">
            <div><b>${KIND[f.kind] || f.kind} · ${REASON[f.reason] || f.reason}</b><span>${esc(f.label || "")}${f.note ? ` — “${esc(f.note)}”` : ""} · ${fmtDay(String(f.created_at).slice(0, 10))}</span></div>
            ${["spot", "meetup", "profile"].includes(f.kind) || f.kind === "review" || f.kind === "photo" ? `<button type="button" class="pop-btn" data-act="show">Mostra</button>` : ""}
            <button type="button" class="pop-btn" data-act="remove">Elimina contenuto</button>
            <button type="button" class="pop-btn" data-act="dismiss">Ignora</button></li>`).join("")}</ul>`
          : `<p class="gate-help left">Nessuna segnalazione aperta.</p>`;
        const resolve = id => api(`/rest/v1/content_flags?id=eq.${id}`, { method: "PATCH", body: { resolved: true }, headers: { Prefer: "return=minimal" } });
        body.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
          const li = b.closest(".req-row"), kind = li.dataset.kind, target = li.dataset.target, id = li.dataset.flag;
          if (b.dataset.act === "show") {
            d.close();
            if (kind === "spot") { const s = spots.find(x => String(x.id) === target); if (s) focusSpot(s); }
            else if (kind === "meetup") { const m = meetups.find(x => String(x.id) === target); if (m) map.flyTo([m.lat, m.lon], 14); }
            else if (kind === "profile") { const p = profiles.find(x => x.user_id === target); if (p && p.lat != null) { showPhotographers = true; drawCommunity(); map.flyTo([p.lat, p.lon], 10); } }
            else {
              const table = kind === "review" ? "spot_reviews" : "spot_photos";
              try { const { data: r } = await api(`/rest/v1/${table}?select=spot_id&id=eq.${encodeURIComponent(target)}`); const s = spots.find(x => x.id === r?.[0]?.spot_id); if (s) focusSpot(s); else toast("Contenuto già eliminato."); } catch {}
            }
            return;
          }
          if (b.dataset.act === "remove" && b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Conferma eliminazione"; return; }
          li.querySelectorAll("button").forEach(x => (x.disabled = true));
          try {
            if (b.dataset.act === "remove") {
              const path = { spot: `spots?id=eq.${encodeURIComponent(target)}`, review: `spot_reviews?id=eq.${encodeURIComponent(target)}`, photo: `spot_photos?id=eq.${encodeURIComponent(target)}`,
                meetup: `meetups?id=eq.${encodeURIComponent(target)}`, profile: `member_profiles?user_id=eq.${encodeURIComponent(target)}` }[kind];
              await api(`/rest/v1/${path}`, { method: "DELETE" });
              if (kind === "spot") spots = spots.filter(x => String(x.id) !== target);
              if (kind === "meetup") meetups = meetups.filter(x => String(x.id) !== target);
              if (kind === "profile") profiles = profiles.filter(x => x.user_id !== target);
            }
            await resolve(id);
            openFlags = Math.max(0, openFlags - 1); refreshBadge();
            li.innerHTML = `<p class="gate-help left">${b.dataset.act === "remove" ? "Contenuto eliminato." : "Ignorata."}</p>`;
            drawClusters();
          } catch (err) { toast(`Non riuscito (${err.message}).`, true); li.querySelectorAll("button").forEach(x => (x.disabled = false)); }
        }));
      }
    } catch (err) { body.innerHTML = `<p class="gate-note warn">Non disponibile (${esc(err.message)}). Hai eseguito supabase-community2.sql?</p>`; }
  }


  /* =================== WRITE FOR THE JOURNAL (solo contributor, con approvazione) =================== */
  const J_TOPICS = ["Luoghi", "Attualità", "Viaggi", "Persone", "Natura", "Fotografia", "Tecnica", "Guide pratiche", "Ispirazione"];
  const J_TOPIC_EN = { "Luoghi": "Places", "Attualità": "Current affairs", "Viaggi": "Travel", "Persone": "People", "Natura": "Nature", "Fotografia": "Photography", "Tecnica": "Technique", "Guide pratiche": "Field guides", "Ispirazione": "Inspiration" };
  const J_GLANCE = [["periodo", "Best time"], ["arrivare", "Getting there"], ["parcheggio", "Parking"], ["camminata", "The walk"], ["difficolta", "Difficulty"], ["permessi", "Permits & rules"], ["attrezzatura", "Gear"], ["impostazioni", "Settings"]];
  const J_STATUS = { draft: ["Draft", ""], submitted: ["In review", "rev"], changes: ["Changes requested", "chg"], published: ["Published", "pub"], rejected: ["Not accepted", "rej"] };
  const jSlug = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  async function uploadJournalImage(file) {
    if (!(await ensureSession())) throw new Error("please log in again");
    const blob = await resizeImage(file, 1800, 0.8);   // abbastanza nitida per tutto lo schermo, molto più leggera da servire
    const path = `${myUid()}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    const res = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/storage/v1/object/journal/${path}`, { method: "POST",
      headers: { apikey: SPOTS_CONFIG.anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "image/jpeg", "x-upsert": "false" }, body: blob });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `upload failed (${res.status})`);
    return `${SPOTS_CONFIG.url.replace(/\/$/, "")}/storage/v1/object/public/journal/${path}`;
  }
  async function renderWrite(box) {
    const head = `<a class="text-link mag-back" href="#journal">${ICON.prev}All stories</a><p class="mag-kicker">Contributors</p><h2>Write for the Journal</h2>`;
    box.innerHTML = `${head}<p class="mag-deck">Loading…</p>`;
    if (!configured() || !(await ensureSession())) {
      box.innerHTML = `${head}<p class="mag-deck">This section is for Fabio Costa Ph contributors. Log in to Spots first, then come back here.</p>
        <p><a class="outline-link" href="#spots">LOG IN TO SPOTS <span aria-hidden="true">→</span></a></p>`; return;
    }
    if (!loaded) { try { admin = await checkAdmin(); } catch {} }
    if (!contribs.size) { try { const { data } = await api("/rest/v1/contributors?select=user_id,display_name,roles&limit=1000"); (data || []).forEach(c => contribs.set(c.user_id, c)); } catch {} }
    if (!admin && !contribs.has(myUid())) {
      box.innerHTML = `${head}<p class="mag-deck">Writing for the Journal is open to contributors. Would you like to write reportage or practical guides? Tell me about you and your idea.</p>
        <p><button type="button" class="outline-link" data-contribute="writer">BECOME A CONTRIBUTOR <span aria-hidden="true">→</span></button></p>`; return;
    }
    let mine = [];
    try { const { data } = await api(`/rest/v1/journal_submissions?select=id,title,status,review_note,updated_at,slug&author_id=eq.${encodeURIComponent(myUid())}&order=updated_at.desc`); mine = data || []; }
    catch (err) { box.innerHTML = `${head}<p class="mag-deck">Not available yet (${esc(err.message)}).</p>`; return; }
    box.innerHTML = `${head}
      <p class="mag-deck">${admin ? "Scrivi direttamente nel Journal: salva in bozza, guarda l'anteprima e pubblica subito, senza passare da Pages CMS. Gli articoli dei contributor da approvare sono in Spots → Admin → Articoli." : "Write a reportage or a practical guide. Save it as a draft whenever you like; when it's ready, send it for review — I read every piece and publish it with your name, or send it back with a note."}</p>
      <p><button type="button" class="outline-link" data-jnew>✍ NEW ARTICLE <span aria-hidden="true">→</span></button></p>
      <p class="mag-section">Your articles</p>
      ${mine.length ? `<ul class="j-list">${mine.map(m => `<li><div><b>${esc(m.title)}</b><span class="j-st ${J_STATUS[m.status]?.[1] || ""}">${J_STATUS[m.status]?.[0] || m.status}</span>
          <small>Updated ${fmtDay(String(m.updated_at).slice(0, 10))}</small>${m.review_note && (m.status === "changes" || m.status === "rejected") ? `<p class="j-note">Fabio: “${esc(m.review_note)}”</p>` : ""}</div>
          ${["draft", "changes", "submitted"].includes(m.status) || admin ? `<button type="button" class="pop-btn" data-jedit="${m.id}">Edit</button>` : ""}${m.status === "published" ? `<a class="pop-btn" href="#art-c-${esc(m.slug || m.id)}">Read</a>` : ""}</li>`).join("")}</ul>`
        : `<p class="mag-deck j-empty">No articles yet: start your first one.</p>`}
      <p class="j-help">Tips: a reportage is your story, first person, with big photos. A field guide is practical: when to go, where to park, how long the walk is, the mistakes to avoid. Only use your own photos.</p>`;
    box.querySelector("[data-jnew]").addEventListener("click", () => openEditor(box, null));
    box.querySelectorAll("[data-jedit]").forEach(b => b.addEventListener("click", async () => {
      try { const { data } = await api(`/rest/v1/journal_submissions?select=*&id=eq.${b.dataset.jedit}`); openEditor(box, data?.[0] || null); } catch (err) { toast(`Could not open: ${err.message}`, true); }
    }));
  }
  function openEditor(box, art) {
    const me = profiles.find(p => p.user_id === myUid()) || {};
    const a = art || { kind: "guide", topic: "Luoghi", glance: {}, author_name: admin ? OWNER : (me.display_name || displayName()), author_instagram: me.instagram || "", author_site: me.website || "", author_bio: me.bio || "" };
    const v = x => esc(x == null ? "" : String(x));
    box.innerHTML = `<a class="text-link mag-back" href="#write">${ICON.prev}Your articles</a>
      <p class="mag-kicker">${art ? (J_STATUS[art.status]?.[0] || "") : "New article"}</p><h2>${art ? "Edit article" : "New article"}</h2>
      ${art?.review_note && art.status === "changes" ? `<p class="j-note">Fabio asks: “${esc(art.review_note)}”</p>` : ""}
      <form class="j-form" novalidate>
        <div class="j-row">
          <label>Type<select name="kind"><option value="reportage"${a.kind === "reportage" ? " selected" : ""}>Reportage — your story</option><option value="guide"${a.kind !== "reportage" ? " selected" : ""}>Field guide — practical</option></select></label>
          <label>Topic<select name="topic">${J_TOPICS.map(t => `<option value="${t}"${a.topic === t ? " selected" : ""}>${J_TOPIC_EN[t]}</option>`).join("")}</select></label>
        </div>
        <label>Title<input name="title" maxlength="160" value="${v(a.title)}" placeholder="e.g. Seceda at dawn: everything you need to know" required></label>
        <label>Place and time <small>(optional)</small><input name="place" maxlength="120" value="${v(a.place)}" placeholder="e.g. Dolomites, October 2026"></label>
        <label>Subtitle <small>(two lines that make people want to read)</small><textarea name="excerpt" rows="2" maxlength="400">${v(a.excerpt)}</textarea></label>
        <div class="j-cover">${a.cover_url ? `<img src="${v(a.cover_url)}" alt="">` : `<span>No cover photo yet</span>`}
          <label class="pop-btn">📷 ${a.cover_url ? "Change" : "Add"} cover photo<input type="file" accept="image/*" name="coverfile" hidden></label></div>
        <label>Text</label>
        <div class="j-tools">
          <button type="button" data-md="## ">Heading</button><button type="button" data-md="**">Bold</button><button type="button" data-md="> ">Quote</button>
          <button type="button" data-md="- ">List</button><label class="j-photo">📷 Photo<input type="file" accept="image/*" multiple hidden name="bodyfile"></label>
        </div>
        <textarea name="body" rows="18" maxlength="60000" placeholder="Write here. A blank line starts a new paragraph.">${v(a.body)}</textarea>
        <p class="j-help">Photos: after uploading, write the caption between the square brackets: ![Caption](link). Two or three photos one after the other become a double page.</p>
        <details class="j-glance"${Object.keys(a.glance || {}).length ? " open" : ""}><summary>At a glance — practical box (optional)</summary>
          <div class="j-row">${J_GLANCE.map(([k, l]) => `<label>${l}<input name="g_${k}" maxlength="160" value="${v(a.glance?.[k])}"></label>`).join("")}</div></details>
        <details class="j-glance"><summary>About you — shown under the article</summary>
          <div class="j-row"><label>Name<input name="author_name" maxlength="80" value="${v(a.author_name)}" required></label>
            <label>Instagram<input name="author_instagram" maxlength="40" value="${v(a.author_instagram)}" placeholder="username"></label>
            <label>Website<input name="author_site" maxlength="300" value="${v(a.author_site)}" placeholder="https://…"></label></div>
          <label>Short bio<textarea name="author_bio" rows="2" maxlength="400">${v(a.author_bio)}</textarea></label></details>
        <label class="shot-check"><input type="checkbox" name="rights"${art ? " checked" : ""}> The text and the photos are mine (or I have the rights), and I accept the <a href="#terms" target="_blank">terms</a>.</label>
        <div class="j-actions">
          <button type="button" class="pop-btn" data-act="draft">Save draft</button>
          <button type="button" class="pop-btn" data-act="preview">Preview</button>
          ${admin ? `<button type="button" class="outline-link" data-act="publish">${art?.status === "published" ? "UPDATE PUBLISHED ARTICLE" : "PUBBLICA SUBITO"} <span aria-hidden="true">→</span></button>`
            : `<button type="button" class="outline-link" data-act="submit">SEND FOR REVIEW <span aria-hidden="true">→</span></button>`}
          ${art && ["draft", "changes"].includes(art.status) ? `<button type="button" class="text-link j-del" data-act="delete">Delete</button>` : ""}
        </div>
        <p class="gate-note" data-jmsg role="status"></p>
      </form>
      <div class="j-preview" hidden></div>`;
    const f = box.querySelector("form"), msg = box.querySelector("[data-jmsg]"), say = (t, warn) => { msg.className = "gate-note" + (warn ? " warn" : ""); msg.textContent = t; };
    let cover = a.cover_url || "";
    const ta = f.body;
    const insert = (txt, wrap) => {
      const st = ta.selectionStart, en = ta.selectionEnd, sel = ta.value.slice(st, en);
      const out = wrap ? `${txt}${sel || "text"}${txt}` : `${st && ta.value[st - 1] !== "\n" ? "\n" : ""}${txt}${sel}`;
      ta.setRangeText(out, st, en, "end"); ta.focus();
    };
    f.querySelectorAll("[data-md]").forEach(b => b.addEventListener("click", () => insert(b.dataset.md, b.dataset.md === "**")));
    f.coverfile.addEventListener("change", async () => {
      const file = f.coverfile.files[0]; if (!file) return;
      say("Uploading the cover…");
      try { cover = await uploadJournalImage(file); f.querySelector(".j-cover").firstElementChild.outerHTML = `<img src="${esc(cover)}" alt="">`; say("Cover uploaded."); }
      catch (err) { say(`Upload failed: ${err.message}`, true); }
    });
    f.bodyfile.addEventListener("change", async () => {
      const files = [...f.bodyfile.files].slice(0, 6);
      for (let i = 0; i < files.length; i++) {
        say(`Uploading photo ${i + 1} of ${files.length}…`);
        try { const url = await uploadJournalImage(files[i]); insert(`\n![Caption](${url})\n`); } catch (err) { say(`Upload failed: ${err.message}`, true); return; }
      }
      say("Photos added: write their captions between the square brackets.");
    });
    const collect = () => {
      const glance = {}; J_GLANCE.forEach(([k]) => { const x = f[`g_${k}`].value.trim(); if (x) glance[k] = x; });
      const site = f.author_site.value.trim();
      return { title: f.title.value.trim(), kind: f.kind.value, topic: f.topic.value, place: f.place.value.trim() || null, excerpt: f.excerpt.value.trim() || null,
        body: f.body.value, cover_url: cover || null, glance, author_name: f.author_name.value.trim() || displayName(),
        author_instagram: f.author_instagram.value.trim().replace(/^@/, "") || null, author_site: /^https?:\/\//i.test(site) ? site : null, author_bio: f.author_bio.value.trim() || null };
    };
    const save = async status => {
      const row = collect();
      if (row.title.length < 3) { say("Give the article a title.", true); f.title.focus(); return null; }
      if (status === "submitted" || status === "published") {
        if (!cover) { say("Add a cover photo before sending it for review.", true); return null; }
        if (row.body.trim().split(/\s+/).length < 120) { say("The text is a bit short: at least 120 words, please.", true); return null; }
        if (!f.rights.checked) { say("Please confirm that text and photos are yours.", true); return null; }
      }
      row.status = status;
      if (status === "submitted") row.submitted_at = new Date().toISOString();
      if (status === "published") { row.published_at = art?.published_at || new Date().toISOString(); row.review_note = null; }
      try {
        if (art) { await api(`/rest/v1/journal_submissions?id=eq.${art.id}`, { method: "PATCH", body: row, headers: { Prefer: "return=minimal" } }); Object.assign(art, row); }
        else {
          row.slug = `${jSlug(row.title) || "article"}-${Math.random().toString(36).slice(2, 6)}`;
          const { data } = await api("/rest/v1/journal_submissions", { method: "POST", body: row, headers: { Prefer: "return=representation" } });
          art = Array.isArray(data) ? data[0] : data;
        }
        return art;
      } catch (err) { say(`Could not save: ${err.message}`, true); return null; }
    };
    f.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
      const act = b.dataset.act;
      if (act === "preview") {
        const pv = box.querySelector(".j-preview"), row = collect();
        const fake = window.FCJournal?.fromSubmission({ ...row, slug: "preview", published_at: new Date().toISOString() });
        if (!fake) return;
        pv.hidden = false;
        pv.innerHTML = `<p class="mag-section">Preview</p>${window.FCJournal.articleHtml(fake)}<p><button type="button" class="pop-btn" data-closepv>Close preview</button></p>`;
        pv.querySelector("[data-closepv]").onclick = () => { pv.hidden = true; f.scrollIntoView({ behavior: "smooth" }); };
        pv.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (act === "delete") {
        if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Click again to delete"; return; }
        try { await api(`/rest/v1/journal_submissions?id=eq.${art.id}`, { method: "DELETE" }); renderWrite(box); } catch (err) { say(`Could not delete: ${err.message}`, true); }
        return;
      }
      b.disabled = true; say(act === "submit" ? "Sending…" : "Saving…");
      const ok = await save(act === "submit" ? "submitted" : act === "publish" ? "published" : (admin && art?.status === "published" ? "published" : "draft"));
      b.disabled = false;
      if (!ok) return;
      window.fcTrack?.(act === "submit" ? "Journal: article submitted" : "Journal: draft saved");
      if (act === "publish") { toast("Pubblicato nel Journal."); await window.FCJournal?.reload(); location.hash = `art-c-${ok.slug || ok.id}`; return; }
      if (act === "submit") { toast("Sent for review: thank you! I'll get back to you soon."); renderWrite(box); }
      else say(`Draft saved · ${new Date().toLocaleTimeString(window.I18N?.locale || "en-GB", { hour: "2-digit", minute: "2-digit" })}`);
    }));
  }

  /* ---------- codice della community: si accetta una volta prima di contribuire ---------- */
  const CONDUCT_KEY = "fcph-conduct-ok";
  const conductOk = () => { try { return localStorage.getItem(CONDUCT_KEY) === "1"; } catch { return false; } };
  function withConduct(fn) { if (conductOk() || !schemaV2) return fn(); showConduct(fn); }
  function showConduct(after) {
    let d = $("#conductDialog");
    if (!d) { d = document.createElement("dialog"); d.id = "conductDialog"; d.className = "import-dialog conduct-dialog"; document.body.appendChild(d); }
    d.innerHTML = `<button class="dialog-close" type="button" data-close aria-label="Close">${ICON.close}</button>
      <div class="import-body">
        <span class="eyebrow">Spots community</span>
        <h2>Our code</h2>
        <ol class="conduct">
          <li><b>Leave no trace.</b> Take only photos, leave only footprints. Stay on paths and take your rubbish home.</li>
          <li><b>Protect fragile places.</b> No geotags for places marked fragile, small groups, no drones where wildlife lives.</li>
          <li><b>Respect people and property.</b> Ask before entering private land, keep noise down at night, respect local rules.</li>
          <li><b>Support local.</b> Eat, sleep and buy from local businesses when you can.</li>
          <li><b>Share honestly.</b> Only your own photos, real prices and accurate reports. Update or close reports that are no longer true.</li>
          <li><b>Be kind.</b> Reviews describe places, not people. No insults, no spam.</li>
        </ol>
        <p class="gate-help left">Places, photos or reviews that break the code can be removed, and accounts can be closed.</p>
        ${after ? `<button class="outline-link" type="button" data-agree>I AGREE <span aria-hidden="true">→</span></button>` : ""}
      </div>`;
    d.querySelector("[data-close]").onclick = () => d.close();
    d.querySelector("[data-agree]")?.addEventListener("click", () => {
      try { localStorage.setItem(CONDUCT_KEY, "1"); } catch {}
      d.close(); after?.();
    });
    if (!d.open) d.showModal();
  }

  async function loadExtras(popup, s) {
    const el = popup.getElement();
    if (!el) return;
    try {
      const [{ data: photos }, { data: reviews }] = await Promise.all([
        api(`/rest/v1/spot_photos?select=id,path,user_id,author_name&spot_id=eq.${s.id}&order=created_at.desc`),
        fetchReviews(s.id)
      ]);
      const urls = photos.length ? await signPhotos(photos.map(p => p.path)) : {};
      const pbox = el.querySelector("[data-photos]"), uid0 = myUid();
      pbox.innerHTML = photos.map((p, i) => urls[p.path] ? `<figure class="pop-fig">
        <button type="button" class="pop-thumb" data-photo="${i}" aria-label="Open photo ${i + 1} by ${esc(p.author_name || "a member")}">
        <img src="${esc(urls[p.path])}" alt="" loading="lazy"></button><figcaption>© ${esc(p.author_name || "Member")}${xpBadge(p.user_id)}${commV && p.user_id !== uid0 ? ` <button type="button" class="rev-flag" data-flagphoto="${p.id}" title="Flag this photo" aria-label="Flag this photo">⚑</button>` : ""}</figcaption></figure>` : "").join("");
      pbox.querySelectorAll("[data-photo]").forEach(b => b.addEventListener("click", () => openPhotos(photos, urls, +b.dataset.photo, s)));
      const rated = reviews.filter(r => r.rating);
      const rbox = el.querySelector("[data-rating]");
      if (rated.length) {
        const avg = rated.reduce((a, r) => a + r.rating, 0) / rated.length;
        rbox.hidden = false;
        rbox.innerHTML = `<span class="stars-static" style="--v:${(avg / 5 * 100).toFixed(0)}%">★★★★★</span> <strong>${avg.toFixed(1)}</strong> · ${rated.length} review${rated.length > 1 ? "s" : ""}`;
      } else rbox.hidden = true;
      // quanto si spende: media di quanto hanno pagato i membri
      const pbox2 = el.querySelector("[data-spend]");
      if (pbox2) pbox2.innerHTML = spendSummary(s, reviews);
      const uid = myUid();
      reviews.sort((a, b) => (experts.has(b.user_id) ? 1 : 0) - (experts.has(a.user_id) ? 1 : 0));
      el.querySelector("[data-reviews]").innerHTML = reviews.map(r => `<div class="pop-rev${experts.has(r.user_id) ? " by-expert" : ""}">
        <p class="rev-head">${r.rating ? `<span class="rev-stars">${"★".repeat(r.rating)}<i>${"★".repeat(5 - r.rating)}</i></span>` : ""}
          <b>${esc(r.author_name || "Member")}</b>${xpBadge(r.user_id)}<time>${fmtDay(r.created_at.slice(0, 10))}</time>
          ${r.user_id === uid || admin || canCurate(s) ? `<button type="button" class="rev-del" data-delrev="${r.id}" aria-label="Delete review">${ICON.close}</button>` : commV ? `<button type="button" class="rev-flag" data-flagrev="${r.id}" title="Flag this review" aria-label="Flag this review">⚑</button>` : ""}</p>
        ${r.body ? `<p>${esc(r.body)}</p>` : ""}
        ${r.paid != null ? `<p class="rev-paid">💶 Paid ${fmtMoney(r.paid, r.currency)}${r.people ? ` for ${r.people} ${r.people > 1 ? "people" : "person"}` : ""}${r.nights ? `, ${r.nights} night${r.nights > 1 ? "s" : ""}` : ""}${r.stay_type ? ` · ${esc(r.stay_type)}` : ""}</p>` : ""}</div>`).join("");
      el.querySelectorAll("[data-flagrev]").forEach(b => b.addEventListener("click", () => openFlag("review", b.dataset.flagrev, `Review on «${s.name}»`)));
      el.querySelectorAll("[data-flagphoto]").forEach(b => b.addEventListener("click", () => openFlag("photo", b.dataset.flagphoto, `Photo on «${s.name}»`)));
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
  function resizeImage(file, max = 1600, quality = 0.82, hq = false) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
        // riduzione a passi (metà per volta) con ricampionamento di qualità: niente foto impastate o seghettate
        let src = img, sw = img.naturalWidth, sh = img.naturalHeight;
        while (hq && sw / 2 >= W * 1.05) {
          const t = document.createElement("canvas"); t.width = Math.round(sw / 2); t.height = Math.round(sh / 2);
          const tx = t.getContext("2d"); tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = "high";
          tx.drawImage(src, 0, 0, t.width, t.height); src = t; sw = t.width; sh = t.height;
        }
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const cx = c.getContext("2d"); if (hq) { cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high"; }
        cx.drawImage(src, 0, 0, W, H);
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
        <p class="photo-meta"><span>${esc(s.name)} · <strong>© ${esc(p.author_name || "Member")}</strong> — all rights reserved by the author</span>
          ${list.length > 1 ? `<span class="photo-nav"><button type="button" data-prev aria-label="Previous photo">${ICON.prev}</button>${i + 1} / ${list.length}<button type="button" data-next aria-label="Next photo">${ICON.next}</button></span>` : ""}
          ${p.user_id === myUid() || admin ? `<button type="button" class="spot-delete" data-delphoto>Delete photo</button>` : ""}</p>`;
      d.querySelector("[data-close]").onclick = () => d.close();
      d.querySelector("img").addEventListener("contextmenu", e => e.preventDefault());   // scoraggia il «salva immagine»
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
    // gradi, minuti, secondi: 41°54'10.0"N 12°29'46.0"E (anche con spazi o con ′ ″)
    const dms = t.replace(/[′’]/g, "'").replace(/[″”]/g, '"').match(/^(\d{1,2})[°\s]+(\d{1,2})['\s]+(\d{1,2}(?:[.,]\d+)?)"?\s*([NS])[\s,;]+(\d{1,3})[°\s]+(\d{1,2})['\s]+(\d{1,2}(?:[.,]\d+)?)"?\s*([EOW])$/i);
    if (dms) {
      const v = (d, m, x) => +d + +m / 60 + +String(x).replace(",", ".") / 3600;
      let lat = v(dms[1], dms[2], dms[3]), lon = v(dms[5], dms[6], dms[7]);
      if (/s/i.test(dms[4])) lat = -lat;
      if (/w/i.test(dms[8])) lon = -lon;
      return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
    }
    const m = t.replace(/[°]/g, "").match(/^\s*(-?\d{1,2}(?:[.]\d+)?)\s*([NS])?\s*[,;\s]\s*(-?\d{1,3}(?:[.]\d+)?)\s*([EOW])?\s*$/i);
    if (!m) return null;
    let lat = +m[1], lon = +m[3];
    if (/s/i.test(m[2] || "")) lat = -Math.abs(lat);
    if (/w/i.test(m[4] || "")) lon = -Math.abs(lon);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  }

  /* =========================================================
     MY SPOTS — profilo pubblico (per gli altri membri) e dashboard privata
     Profilo · I miei contributi · I miei luoghi · Cronologia · Salvati
     Tutto si legge dalle tabelle che ci sono già (più lo storico): nessun dato copiato.
     ========================================================= */
  let meView = false, meTab = "places", meCache = null, pendingFocus = null, meFilter = "all", savedQuery = "";
  const ME_TABS = [["profile", "Profile"], ["contrib", "Contributions"], ["places", "My places"], ["activity", "Activity"], ["saved", "Saved"]];
  const avatarUrl = p => p ? `${SPOTS_CONFIG.url.replace(/\/$/, "")}/storage/v1/object/public/avatars/${p}` : "";
  const initials = n => String(n || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const avatarHtml = (p, size = 72) => `<span class="me-avatar" style="--s:${size}px">${p.avatar_path ? `<img src="${esc(avatarUrl(p.avatar_path))}" alt="">` : `<span>${esc(initials(p.display_name))}</span>`}</span>`;
  const fmtWhen = iso => { try { return new Date(String(iso).length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString(window.I18N?.locale || "en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; } };
  const FIELD_LABEL = { name: "name", note: "description", category: "category", subcategory: "type", info: "useful info", lat: "position", lon: "position", url: "link",
    fragile: "fragile", support_local: "Support local", best_months: "best months", status: "status", public_pick: "visibility", outdated: "outdated mark",
    verified_at: "verification", verified_by: "verification", verified_name: "verification", starts_on: "dates", ends_on: "dates", author_name: "author name", list: "list" };
  const fieldLabel = f => FIELD_LABEL[f] || (f.startsWith("tk_") ? "trail info" : f.startsWith("ws_") ? "workshop info" : f.replace(/_/g, " "));
  const fieldsText = arr => [...new Set((arr || []).map(fieldLabel))].join(", ");

  /* apre un luogo sulla mappa dalla dashboard */
  function openOnMap(s) { pendingFocus = s.id; meView = false; location.hash = "spots"; }
  function consumeFocus() {
    if (pendingFocus == null || !map) return;
    const s = spots.find(x => x.id === pendingFocus); pendingFocus = null;
    if (s) setTimeout(() => focusSpot(s), 350);
  }

  async function loadMe(force) {
    if (meCache && !force) return meCache;
    const uid = myUid(), out = { profile: null, photos: [], reviews: [], saved: [], activity: null, since: null };
    const q = (u, fb) => api(u).then(r => r.data || fb).catch(() => fb);
    const [prof, photos, reviews, saved, act, mem] = await Promise.all([
      profV ? api("/rest/v1/rpc/public_profile", { method: "POST", body: { p_user: uid } }).then(r => r.data).catch(() => null) : null,
      schemaV2 ? q(`/rest/v1/spot_photos?select=id,spot_id,path,created_at&user_id=eq.${uid}&order=created_at.desc&limit=200`, []) : [],
      schemaV2 ? q(`/rest/v1/spot_reviews?select=id,spot_id,rating,body,created_at&user_id=eq.${uid}&order=created_at.desc&limit=200`, []) : [],
      commV ? q(`/rest/v1/spot_favorites?select=spot_id,created_at${profV ? ",list_name,note" : ""}&user_id=eq.${uid}&order=created_at.desc`, []) : [],
      profV ? api("/rest/v1/rpc/my_activity", { method: "POST", body: { p_limit: 300 } }).then(r => r.data).catch(() => null) : null,
      q(`/rest/v1/members?select=created_at&user_id=eq.${uid}`, [])
    ]);
    Object.assign(out, { profile: prof, photos, reviews, saved, activity: act, since: prof?.since || mem?.[0]?.created_at || null });
    return (meCache = out);
  }

  async function renderMe() {
    if (map) { try { map.remove(); } catch {} map = null; layer = null; }
    onGlobe = false;
    const el = root();
    if (guest) { el.innerHTML = gateHtml(`<p class="gate-note">${esc(pendingText())}</p>`); return; }
    el.innerHTML = `<div class="me"><a class="text-link me-back" href="#spots">${ICON.prev}Back to the map</a><p class="gate-note">Loading your Spots…</p></div>`;
    const data = await loadMe();
    if (!meView) return;
    const uid = myUid(), me = profiles.find(p => p.user_id === uid) || { display_name: displayName() };
    const mine = spots.filter(s => s.created_by === uid);
    const stats = [["Places", data.profile?.places ?? mine.length], ["Reviews", data.profile?.reviews ?? data.reviews.length], ["Photos", data.profile?.photos ?? data.photos.length], ["Saved", data.profile?.saved ?? favs.size]];
    el.innerHTML = `<div class="me">
      <a class="text-link me-back" href="#spots">${ICON.prev}Back to the map</a>
      <header class="me-head">
        ${avatarHtml(me, 84)}
        <div class="me-id">
          <p class="eyebrow">My Spots</p>
          <h2>${esc(me.display_name || displayName())}</h2>
          <p class="me-sub">${me.username ? `<b>@${esc(me.username)}</b>` : `<button type="button" class="text-link" data-meedit>Choose a username</button>`}${me.base_name ? ` · ${esc(me.base_name)}` : ""}${data.since ? ` · Member since ${esc(fmtWhen(data.since))}` : ""}</p>
        </div>
        <div class="me-acts"><button type="button" class="pop-btn" data-meedit>✎ Edit profile</button><button type="button" class="text-link" data-mepublic>See my public profile</button></div>
      </header>
      <dl class="me-stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${fmtN(+v || 0)}</dd></div>`).join("")}</dl>
      <nav class="me-tabs" role="tablist">${ME_TABS.map(([k, l]) => `<button type="button" role="tab" data-metab="${k}" aria-selected="${k === meTab}" class="${k === meTab ? "on" : ""}">${l}</button>`).join("")}</nav>
      <section class="me-body" id="meBody"></section>
    </div>`;
    el.querySelectorAll("[data-metab]").forEach(b => b.addEventListener("click", () => { meTab = b.dataset.metab; el.querySelectorAll("[data-metab]").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); }); drawMeTab(); }));
    el.querySelectorAll("[data-meedit]").forEach(b => b.addEventListener("click", openProfile));
    el.querySelector("[data-mepublic]").addEventListener("click", () => openMemberProfile(uid));
    drawMeTab();
  }

  const spotById = id => spots.find(s => s.id === id);
  const spotRow = (s, extra = "") => {
    const k = CATS[s.category] || CATS.spot, sub = subLabel(s);
    return `<li class="me-row" data-open="${s.id}"><span class="me-ico" style="--c:${k.color}">${k.icon}</span>
      <span class="me-txt"><b>${esc(s.name)}</b><small>${esc(k.label)}${sub ? ` · ${esc(sub)}` : ""}${s.created_at ? ` · ${esc(fmtWhen(s.created_at))}` : ""}</small></span>${extra}</li>`;
  };
  function wireOpen(box) {
    box.querySelectorAll("[data-open]").forEach(li => li.addEventListener("click", e => {
      if (e.target.closest("button, input, select, a, details")) return;
      const s = spotById(+li.dataset.open); if (s) openOnMap(s);
    }));
  }

  async function drawMeTab() {
    const box = $("#meBody"), data = meCache, uid = myUid();
    if (!box || !data) return;
    const mine = spots.filter(s => s.created_by === uid).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const me = profiles.find(p => p.user_id === uid) || {};
    if (meTab === "profile") {
      box.innerHTML = `<div class="me-card">
        <p class="me-bio">${me.bio ? esc(me.bio) : `<span class="muted">No bio yet.</span>`}</p>
        <dl class="me-dl">
          <div><dt>Username</dt><dd>${me.username ? `@${esc(me.username)}` : "—"}</dd></div>
          <div><dt>Location</dt><dd>${esc(me.base_name || "—")}</dd></div>
          <div><dt>Instagram</dt><dd>${me.instagram ? `<a href="https://www.instagram.com/${encodeURIComponent(me.instagram)}/" target="_blank" rel="noopener">@${esc(me.instagram)}</a>` : "—"}</dd></div>
          <div><dt>Website</dt><dd>${me.website ? `<a href="${esc(me.website)}" target="_blank" rel="noopener">${esc(me.website.replace(/^https?:\/\//, ""))}</a>` : "—"}</dd></div>
          <div><dt>Photographers' map</dt><dd>${me.user_id && me.lat != null && me.on_map !== false && me.visible !== false ? "Shown (about 5 km precision)" : "Not shown"}</dd></div>
        </dl>
        <p class="gate-help left">Your public profile is seen only by Spots members${contribs.has(uid) || experts.has(uid) ? ", and your name, username and photo also on The crew page" : ""}. Saved places, meetups you join and your activity history are private: only you see them.</p>
        <button type="button" class="outline-link" data-meedit2>✎ Edit profile</button>
      </div>`;
      box.querySelector("[data-meedit2]").addEventListener("click", openProfile);
      return;
    }
    if (meTab === "contrib") {
      const photoUrls = data.photos.length ? await signPhotos(data.photos.slice(0, 24).map(p => p.path)).catch(() => ({})) : {};
      const meetMine = (meetups || []).filter(m => m.created_by === uid);
      box.innerHTML = `
        <h3 class="me-h">Places <small>${mine.length}</small></h3>
        ${mine.length ? `<ul class="me-list">${mine.slice(0, 30).map(s => spotRow(s)).join("")}</ul>` : `<p class="muted">You haven't added any place yet. <button type="button" class="text-link" data-meadd>Add your first place</button></p>`}
        <h3 class="me-h">Photos <small>${data.photos.length}</small></h3>
        ${data.photos.length ? `<div class="me-photos">${data.photos.slice(0, 24).map(p => `<button type="button" data-open-photo="${p.spot_id}" title="${esc(spotById(p.spot_id)?.name || "")}">${photoUrls[p.path] ? `<img src="${esc(photoUrls[p.path])}" alt="" loading="lazy">` : ""}</button>`).join("")}</div>` : `<p class="muted">No photos yet.</p>`}
        <h3 class="me-h">Reviews <small>${data.reviews.length}</small></h3>
        ${data.reviews.length ? `<ul class="me-list">${data.reviews.slice(0, 30).map(r => { const s = spotById(r.spot_id); return s ? spotRow(s, `<span class="me-meta">${r.rating ? "★".repeat(r.rating) : ""}${r.body ? `<em>${esc(r.body.slice(0, 90))}${r.body.length > 90 ? "…" : ""}</em>` : ""}</span>`) : ""; }).join("")}</ul>` : `<p class="muted">No reviews yet.</p>`}
        <h3 class="me-h">Meetups organised <small>${meetMine.length}</small></h3>
        ${meetMine.length ? `<ul class="me-list">${meetMine.map(m => `<li class="me-row"><span class="me-ico" style="--c:#ffd166">👥</span><span class="me-txt"><b>${esc(m.title)}</b><small>${esc(fmtWhen(m.meet_on))}</small></span></li>`).join("")}</ul>` : `<p class="muted">No meetups organised.</p>`}`;
      wireOpen(box);
      box.querySelectorAll("[data-open-photo]").forEach(b => b.addEventListener("click", () => { const s = spotById(+b.dataset.openPhoto); if (s) openOnMap(s); }));
      box.querySelector("[data-meadd]")?.addEventListener("click", () => withConduct(() => openAdd()));
      return;
    }
    if (meTab === "places") {
      const chips = s => {
        const st = s.status && s.status !== "published" ? (s.status === "review" ? ["In review", "rev"] : ["Hidden", "hid"]) : ["Published", "pub"];
        const al = alertsOf(s).length;
        return `<span class="me-st ${st[1]}">${st[0]}</span>${al ? `<span class="me-st warn">${al} alert${al > 1 ? "s" : ""}</span>` : ""}${s.outdated ? `<span class="me-st warn">To verify</span>` : ""}${s.fragile ? `<span class="me-st">Fragile</span>` : ""}`;
      };
      box.innerHTML = `<div class="me-bar"><button type="button" class="outline-link" data-meadd>＋ Add a place</button><p class="muted">${mine.length} place${mine.length === 1 ? "" : "s"} · changes show on the map straight away</p></div>
        ${mine.length ? `<ul class="me-list me-manage">${mine.map(s => spotRow(s, `<span class="me-chips">${chips(s)}</span>
          <span class="me-ops">
            <button type="button" class="pop-btn" data-medit="${s.id}">✎ Edit</button>
            <button type="button" class="text-link" data-mehist="${s.id}">History</button>
            <button type="button" class="text-link" data-megone="${s.id}">Not there anymore</button>
            <button type="button" class="text-link me-del" data-medel="${s.id}">Delete</button>
          </span><div class="me-hist" id="meHist${s.id}" hidden></div>`)).join("")}</ul>` : `<p class="muted">Your places will appear here, with their status and history.</p>`}`;
      wireOpen(box);
      box.querySelector("[data-meadd]").addEventListener("click", () => withConduct(() => openAdd()));
      box.querySelectorAll("[data-medit]").forEach(b => b.addEventListener("click", () => { const s = spotById(+b.dataset.medit); if (s) openEditPlace(s); }));
      box.querySelectorAll("[data-mehist]").forEach(b => b.addEventListener("click", () => toggleHistory(+b.dataset.mehist)));
      box.querySelectorAll("[data-megone]").forEach(b => b.addEventListener("click", async () => {
        const s = spotById(+b.dataset.megone);
        if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm: it's closed or gone"; return; }
        try {
          await api("/rest/v1/spot_reports", { method: "POST", body: { spot_id: s.id, kind: "closed", note: "The author reports this place no longer exists or has closed.", author_name: displayName() }, headers: { Prefer: "return=minimal" } });
          await fetchReports(); toast("Thanks: members now see the place as closed. You can also delete it."); drawMeTab();
        } catch (err) { toast(`Could not report: ${err.message}`, true); }
      }));
      box.querySelectorAll("[data-medel]").forEach(b => b.addEventListener("click", async () => {
        const s = spotById(+b.dataset.medel);
        if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Delete for good? Photos and reviews go too"; return; }
        b.disabled = true;
        try { await removeSpot(s.id); spots = spots.filter(x => x.id !== s.id); meCache = null; toast("Place deleted."); renderMe(); }
        catch (err) { toast(`Could not delete: ${err.message}`, true); b.disabled = false; }
      }));
      return;
    }
    if (meTab === "activity") {
      const KIND = { place: ["📍", "Added", true], review: ["★", "Reviewed", true], photo: ["📷", "Photo on", true], edit: ["✎", "Edited", false], saved: ["♥", "Saved", false],
        meetup: ["👥", "Organised the meetup", true], meetup_join: ["👥", "Joined the meetup", false], alert: ["⚠", "Alert on", true] };
      let items = data.activity;
      if (!items) {   // database non ancora aggiornato: la cronologia si ricava da ciò che c'è
        items = [...mine.map(s => ({ kind: "place", at: s.created_at, spot_id: s.id, spot_name: s.name, is_public: true })),
          ...data.reviews.map(r => ({ kind: "review", at: r.created_at, spot_id: r.spot_id, spot_name: spotById(r.spot_id)?.name, detail: r.rating, is_public: true })),
          ...data.photos.map(p => ({ kind: "photo", at: p.created_at, spot_id: p.spot_id, spot_name: spotById(p.spot_id)?.name, is_public: true })),
          ...data.saved.map(v => ({ kind: "saved", at: v.created_at, spot_id: v.spot_id, spot_name: spotById(v.spot_id)?.name, is_public: false }))]
          .sort((a, b) => String(b.at).localeCompare(String(a.at)));
      }
      const shown = items.filter(i => meFilter === "all" || (meFilter === "public" ? i.is_public : !i.is_public));
      const month = iso => { try { return new Date(iso).toLocaleDateString(window.I18N?.locale || "en-GB", { month: "long", year: "numeric" }); } catch { return ""; } };
      let last = "";
      box.innerHTML = `<div class="me-filter" role="group">${[["all", "All"], ["public", "Public"], ["private", "Private"]].map(([k, l]) => `<button type="button" data-mef="${k}" class="${meFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
        ${shown.length ? `<ol class="me-tl">${shown.map(i => {
          const k = KIND[i.kind] || ["•", i.kind, true], m = month(i.at), head = m !== last ? `<li class="me-month">${esc(m)}</li>` : "";
          last = m;
          const det = i.kind === "edit" ? `: ${esc(fieldsText(String(i.detail || "").split(", ")))}` : i.kind === "review" && i.detail ? ` · ${"★".repeat(+i.detail)}` : i.kind === "saved" && i.detail ? ` · list «${esc(i.detail)}»` : i.kind === "alert" ? ` · ${esc((ALERTS[i.detail] || {}).label || i.detail || "")}` : (i.kind === "meetup" || i.kind === "meetup_join") && i.detail ? ` · ${esc(fmtWhen(i.detail))}` : "";
          return `${head}<li class="me-ev"${i.spot_id && spotById(i.spot_id) ? ` data-open="${i.spot_id}"` : ""}><span class="me-evi">${k[0]}</span><span class="me-txt"><b>${esc(k[1])} «${esc(i.spot_name || "")}»${det}</b><small>${esc(fmtWhen(i.at))} · ${i.is_public ? "Public" : "🔒 Private"}</small></span></li>`;
        }).join("")}</ol>` : `<p class="muted">Nothing here yet.</p>`}
        <p class="gate-help left">Public = members can already see it (places, photos, reviews, meetups you organise). Private = only you: edits, saved places, meetups you join.</p>`;
      box.querySelectorAll("[data-mef]").forEach(b => b.addEventListener("click", () => { meFilter = b.dataset.mef; drawMeTab(); }));
      wireOpen(box);
      return;
    }
    if (meTab === "saved") {
      const rows = data.saved.map(v => ({ ...v, s: spotById(v.spot_id) })).filter(v => v.s && (!savedQuery || norm(v.s.name).includes(norm(savedQuery)) || norm(v.list_name).includes(norm(savedQuery))));
      const lists = [...new Set(data.saved.map(v => v.list_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const groups = [...new Set(rows.map(v => v.list_name || ""))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
      box.innerHTML = `<div class="me-bar"><label class="me-search">${ICON.pin}<input type="search" id="meSavedQ" value="${esc(savedQuery)}" placeholder="Search your saved places"></label>
          <button type="button" class="outline-link" data-mesavedmap>Show them on the map</button></div>
        <datalist id="meLists">${lists.map(l => `<option value="${esc(l)}">`).join("")}</datalist>
        ${rows.length ? groups.map(g => `<h3 class="me-h">${esc(g || "Saved")} <small>${rows.filter(v => (v.list_name || "") === g).length}</small></h3>
          <ul class="me-list">${rows.filter(v => (v.list_name || "") === g).map(v => spotRow(v.s, `<span class="me-ops">
            ${profV ? `<input class="me-listin" list="meLists" maxlength="60" value="${esc(v.list_name || "")}" placeholder="List, e.g. Dolomites 2027" data-melist="${v.spot_id}" aria-label="List">` : ""}
            <button type="button" class="text-link me-del" data-meunsave="${v.spot_id}">Remove</button></span>`)).join("")}</ul>`).join("")
          : `<p class="muted">${data.saved.length ? "No saved place matches." : "Tap ♡ Save on any place to keep it here. Organise them in lists like «Dolomites 2027»."}</p>`}`;
      const qi = box.querySelector("#meSavedQ");
      qi.addEventListener("input", () => { savedQuery = qi.value; const pos = qi.selectionStart; drawMeTab().then(() => { const n = $("#meSavedQ"); n?.focus(); n?.setSelectionRange(pos, pos); }); });
      box.querySelector("[data-mesavedmap]").addEventListener("click", () => { onlyFavs = true; meView = false; location.hash = "spots"; });
      box.querySelectorAll("[data-melist]").forEach(inp => inp.addEventListener("change", async () => {
        const id = +inp.dataset.melist, name = inp.value.trim() || null;
        try { await api(`/rest/v1/spot_favorites?spot_id=eq.${id}&user_id=eq.${encodeURIComponent(uid)}`, { method: "PATCH", body: { list_name: name }, headers: { Prefer: "return=minimal" } });
          const v = data.saved.find(x => x.spot_id === id); if (v) v.list_name = name; drawMeTab(); }
        catch (err) { toast(`Could not save the list: ${err.message}`, true); }
      }));
      box.querySelectorAll("[data-meunsave]").forEach(b => b.addEventListener("click", async () => {
        const id = +b.dataset.meunsave;
        try { await api(`/rest/v1/spot_favorites?spot_id=eq.${id}&user_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE" }); favs.delete(id); data.saved = data.saved.filter(x => x.spot_id !== id); drawMeTab(); }
        catch (err) { toast(`Could not remove: ${err.message}`, true); }
      }));
      wireOpen(box);
    }
  }

  /* storico di un luogo: modifiche (chi, cosa, quando) e foto aggiunte */
  async function toggleHistory(id) {
    const box = $(`#meHist${id}`);
    if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = `<p class="muted">Loading…</p>`;
    const [ch, ph] = await Promise.all([
      profV ? api(`/rest/v1/spot_changes?select=created_at,user_id,user_name,fields&spot_id=eq.${id}&order=created_at.desc&limit=50`).then(r => r.data || []).catch(() => []) : [],
      schemaV2 ? api(`/rest/v1/spot_photos?select=created_at,author_name,user_id&spot_id=eq.${id}&order=created_at.desc&limit=50`).then(r => r.data || []).catch(() => []) : []
    ]);
    const s = spotById(id), who = (uid, n) => uid === myUid() ? "you" : uid && !admin ? (n || "a member") : (n || "admin");
    const rows = [...ch.map(c => ({ at: c.created_at, t: `${who(c.user_id, c.user_name)}: ${fieldsText(c.fields)}` })),
      ...ph.map(p => ({ at: p.created_at, t: `${who(p.user_id, p.author_name)}: added a photo` })),
      ...(s?.created_at ? [{ at: s.created_at, t: "added to Spots" }] : [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    box.innerHTML = rows.length ? `<ol class="me-histl">${rows.map(r => `<li><time>${esc(fmtWhen(r.at))}</time><span>${esc(r.t)}</span></li>`).join("")}</ol>` : `<p class="muted">No changes yet.</p>`;
    if (!profV) box.insertAdjacentHTML("beforeend", `<p class="gate-help left">The full history of changes starts once the database is updated.</p>`);
  }

  /* profilo pubblico di un membro (lo vedono solo i membri) */
  async function openMemberProfile(uid) {
    const local = profiles.find(p => p.user_id === uid) || {};
    const d = dlg("memberDialog", `<div class="import-body me-pub"><p class="gate-note">Loading…</p></div>`);
    let p = null;
    if (profV) { try { ({ data: p } = await api("/rest/v1/rpc/public_profile", { method: "POST", body: { p_user: uid } })); } catch {} }
    p = { ...local, ...(p || {}) };
    if (!p.display_name) p.display_name = "Member";
    const places = spots.filter(s => s.created_by === uid && shownStatus(s)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const body = d.querySelector(".me-pub");
    body.innerHTML = `<header class="me-head small">${avatarHtml(p, 64)}<div class="me-id"><p class="eyebrow">Member${contribs.has(uid) ? " · Contributor" : ""}${experts.has(uid) ? ` · Local expert, ${esc(experts.get(uid).area_name)}` : ""}</p>
        <h2>${esc(p.display_name)}</h2><p class="me-sub">${p.username ? `@${esc(p.username)}` : ""}${p.base_name ? ` · ${esc(p.base_name)}` : ""}${p.since ? ` · since ${esc(fmtWhen(p.since))}` : ""}</p></div></header>
      ${p.bio ? `<p class="me-bio">${esc(p.bio)}</p>` : ""}
      <dl class="me-stats">${[["Places", p.places ?? places.length], ["Reviews", p.reviews], ["Photos", p.photos], ["Meetups", p.meetups]].filter(([, v]) => v != null).map(([k, v]) => `<div><dt>${k}</dt><dd>${fmtN(+v || 0)}</dd></div>`).join("")}</dl>
      <p class="sx-links">${p.instagram ? `<a class="text-link" href="https://www.instagram.com/${encodeURIComponent(p.instagram)}/" target="_blank" rel="noopener">Instagram @${esc(p.instagram)}</a>` : ""}${p.website ? `<a class="text-link" href="${esc(p.website)}" target="_blank" rel="noopener">${ICON.ext}Website</a>` : ""}</p>
      ${places.length ? `<h3 class="me-h">Places added <small>${places.length}</small></h3><ul class="me-list">${places.slice(0, 20).map(s => spotRow(s)).join("")}</ul>` : ""}`;
    body.querySelectorAll("[data-open]").forEach(li => li.addEventListener("click", () => { const s = spotById(+li.dataset.open); if (!s) return; d.close(); if (meView) openOnMap(s); else focusSpot(s); }));
  }

  /* foto profilo: piccola, quadrata, nella cartella pubblica «avatars» (si vede anche su The crew) */
  async function uploadAvatar(file) {
    if (!(await ensureSession())) throw new Error("please log in again");
    const blob = await resizeImage(file, 400, 0.85);
    const path = `${myUid()}/${crypto.randomUUID()}.jpg`;
    const res = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/storage/v1/object/avatars/${path}`, {
      method: "POST", body: blob, headers: { apikey: SPOTS_CONFIG.anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "image/jpeg", "x-upsert": "false" } });
    if (!res.ok) { let m = `HTTP ${res.status}`; try { const j = await res.json(); m = j.message || j.error || m; } catch {} throw new Error(m); }
    return path;
  }

  /* =========================================================
     AGGIUNGI O MODIFICA UN LUOGO — procedura guidata in tre passaggi
     1 · Trova il luogo (cerca, posizione, mirino sulla mappa, link di Google Maps, foto con GPS)
     2 · Dettagli (categoria e sottocategoria, campi dedicati, foto)
     3 · Controlla e pubblica (anteprima, luoghi simili vicini: mai bloccante)
     Le coordinate non si scrivono mai: restano in «Advanced».
     ========================================================= */
  let profV = true;   // false finché non è stato eseguito supabase-profilo.sql (sottocategoria, info, stato)
  const WZ_SUBS = {
    spot: [["viewpoint", "Viewpoint"], ["nature", "Nature"], ["urban", "Urban"], ["other", "Other"]],
    hotel: [["hotel", "Hotel"], ["bnb", "B&B · guesthouse"], ["camping", "Camping"], ["hut", "Mountain hut"], ["other", "Other"]],
    restaurant: [["restaurant", "Restaurant"], ["bar", "Bar · café"], ["streetfood", "Street food"], ["other", "Other"]],
    experience: [["tour", "Tour"], ["boat", "Boat trip"], ["guided", "Guided visit"], ["other", "Other"]],
    trekking: [], workshop: []
  };
  const WZ_GROUPS = [
    { id: "places", label: "Places", cats: ["spot"] },
    { id: "essentials", label: "Essentials", cats: ["hotel", "restaurant"] },
    { id: "outdoors", label: "Outdoors", cats: ["trekking", "workshop", "experience"] },
    { id: "community", label: "Community", cats: [] }
  ];
  /* informazioni pratiche per categoria (colonna «info» del luogo) */
  const WZ_INFO = {
    spot: [["access", "Access & parking", "text", "e.g. 10 min walk from the free car park"],
      ["accessibility", "Accessibility", "select", ["", "Easy, step-free", "Some steps or a short path", "Hike or difficult access"]],
      ["permits", "Drone, permits, rules", "text", "e.g. drones not allowed, ZTL"]],
    hotel: [["price", "Price per night, from", "price"], ["services", "Services", "text", "e.g. parking, breakfast, pets welcome"],
      ["hours", "Reception hours", "text", "e.g. 8:00–22:00"], ["parking", "Parking", "text", "e.g. free on site"]],
    restaurant: [["price_level", "Price range", "select", ["", "€ · cheap", "€€ · moderate", "€€€ · expensive"]],
      ["hours", "Opening hours", "text", "e.g. 12–15, 19–23"], ["closed", "Closed on", "text", "e.g. Mondays"]],
    experience: [["duration", "Duration", "text", "e.g. 3 hours"], ["price", "Price per person", "price"], ["link", "Booking link", "url", "https://…"]],
    trekking: [], workshop: []
  };
  const INFO_LABEL = { access: "Access & parking", accessibility: "Accessibility", permits: "Drone, permits, rules", price: "Price", services: "Services",
    hours: "Hours", parking: "Parking", price_level: "Price range", closed: "Closed on", duration: "Duration", link: "Booking" };
  const groupOf = cat => WZ_GROUPS.find(g => g.cats.includes(cat))?.id || "places";
  const DRAFT_KEY = "fcph-add-draft";
  let wz = null, wzMap = null, wzMini = null;

  /* posizione GPS di una foto JPEG (EXIF), senza librerie: null se non c'è */
  async function exifGps(file) {
    try {
      const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
      if (v.getUint16(0) !== 0xFFD8) return null;
      let o = 2;
      while (o < v.byteLength - 4) {
        const mk = v.getUint16(o), len = v.getUint16(o + 2);
        if (mk === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) {
          const t = o + 10, le = v.getUint16(t) === 0x4949, u16 = p => v.getUint16(t + p, le), u32 = p => v.getUint32(t + p, le);
          const ifd = p => { const n = u16(p), out = {}; for (let i = 0; i < n; i++) { const e = p + 2 + i * 12; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 }; } return out; };
          const ifd0 = ifd(u32(4)), gp = ifd0[0x8825];
          if (!gp) return null;
          const g = ifd(u32(gp.at));
          const rat = (tag) => { const e = g[tag]; if (!e) return null; const p = u32(e.at); const r = k => u32(p + k * 8) / (u32(p + k * 8 + 4) || 1); return r(0) + r(1) / 60 + r(2) / 3600; };
          const ref = tag => { const e = g[tag]; return e ? String.fromCharCode(v.getUint8(t + e.at)) : ""; };
          let lat = rat(2), lon = rat(4);
          if (lat == null || lon == null || (!lat && !lon)) return null;
          if (ref(1) === "S") lat = -lat; if (ref(3) === "W") lon = -lon;
          return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
        }
        if ((mk & 0xFF00) !== 0xFF00) break;
        o += 2 + len;
      }
    } catch {}
    return null;
  }
  /* nome e località dalle coordinate (Photon, gratuito, già usato in Tools) */
  async function reverseName(lat, lon) {
    try {
      const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&limit=1`);
      const p = (await r.json()).features?.[0]?.properties || {};
      return { name: p.name || "", place: [p.city || p.town || p.village || p.county, p.country].filter(Boolean).join(", ") };
    } catch { return { name: "", place: "" }; }
  }
  /* link brevi di Google Maps: li apre la funzione Supabase «resolve-maps-link» */
  async function resolveShortLink(url) {
    if (!(await ensureSession())) throw new Error("please log in again");
    const r = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/functions/v1/resolve-maps-link`, {
      method: "POST", body: JSON.stringify({ url }),
      headers: { apikey: SPOTS_CONFIG.anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    if (r.status === 404) throw new Error("not-deployed");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  const nameFromLink = t => { const m = String(t).match(/\/place\/([^/@?]+)/); try { return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : ""; } catch { return ""; } };
  const isShortLink = t => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(String(t).trim());
  const metersBetween = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(x)); };
  const similarName = (a, b) => {
    const t = s => norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length >= 4);
    const A = t(a), B = new Set(t(b));
    return !!A.length && (A.some(w => B.has(w)) || norm(a).includes(norm(b)) || norm(b).includes(norm(a)));
  };

  /* apre la procedura: pre = punto già scelto (tocco lungo, risultato della ricerca), edit = luogo da modificare */
  function openAdd(pre, preset = {}, edit = null) {
    let draft = null;
    if (!edit && !pre) { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); if (d && Date.now() - d.at < 3 * 864e5) draft = d; } catch {} }
    const lastCat = preset.category || (() => { try { return localStorage.getItem("fcph-last-cat") || "spot"; } catch { return "spot"; } })();
    const s = edit || {};
    wz = {
      step: 1, edit, lat: pre?.lat ?? s.lat ?? null, lon: pre?.lon ?? s.lon ?? null, placed: !!(pre || edit),
      name: preset.name || s.name || "", cat: edit ? s.category : (CATS[lastCat] ? lastCat : "spot"),
      sub: s.subcategory || (edit && s.category === "spot" ? spotSub(s) : ""), note: s.note || "", info: { ...(s.info || {}) },
      support: !!s.support_local, months: s.best_months || "", fragile: !!s.fragile, author: s.author_name || displayName(),
      from: s.starts_on || "", to: s.ends_on || "", files: [], removePhotos: new Set(), photos: [], place: "", rev: 0, tk: null, ws: null
    };
    if (draft && !edit) Object.assign(wz, draft.wz, { files: [], removePhotos: new Set(), photos: [], step: 1 });
    let d = $("#wzDialog");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "wzDialog"; d.className = "wz-dialog";
      document.body.appendChild(d);
      d.addEventListener("close", () => { try { wzMap?.remove(); wzMini?.remove(); } catch {} wzMap = wzMini = null; });
    }
    d.innerHTML = `
      <header class="wz-head">
        <div><span class="eyebrow">${edit ? "Your place" : "Share with members"}</span><h2>${edit ? "Edit place" : "Add a place"}</h2></div>
        <ol class="wz-steps" aria-label="Steps"><li data-st="1">Find</li><li data-st="2">Details</li><li data-st="3">Review</li></ol>
        <button class="dialog-close" type="button" data-wzclose aria-label="Close">${ICON.close}</button>
      </header>
      ${draft && !edit ? `<p class="wz-draft">Draft restored from your last visit. <button type="button" class="text-link" data-wzdiscard>Start again</button></p>` : ""}
      <div class="wz-body" id="wzBody"></div>
      <footer class="wz-foot">
        <button type="button" class="text-link" id="wzBack">Back</button>
        <p class="gate-note" id="wzStatus" role="status"></p>
        <button type="button" class="outline-link" id="wzNext">Next <span aria-hidden="true">→</span></button>
      </footer>`;
    d.querySelector("[data-wzclose]").addEventListener("click", () => d.close());
    d.querySelector("[data-wzdiscard]")?.addEventListener("click", () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} d.close(); openAdd(); });
    d.querySelector("#wzBack").addEventListener("click", () => { collect(); if (wz.step > 1) go(wz.step - 1); else d.close(); });
    d.querySelector("#wzNext").addEventListener("click", () => { collect(); if (wz.step < 3) { if (check()) go(wz.step + 1); } else publish(); });
    if (!d.open) d.showModal();
    if (edit) loadEditPhotos();
    go(1);
  }

  function saveDraft() {
    if (!wz || wz.edit) return;
    const { files, removePhotos, photos, edit, ...keep } = wz;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), wz: keep })); } catch {}
  }
  function status(t, warn) { const el = $("#wzStatus"); if (el) { el.textContent = t || ""; el.className = "gate-note" + (warn ? " warn" : ""); } }

  function go(step) {
    wz.step = step;
    const d = $("#wzDialog");
    d.querySelectorAll("[data-st]").forEach(li => { const n = +li.dataset.st; li.classList.toggle("on", n === step); li.classList.toggle("done", n < step); });
    d.querySelector("#wzBack").textContent = step === 1 ? "Cancel" : "Back";
    d.querySelector("#wzNext").innerHTML = step < 3 ? `Next <span aria-hidden="true">→</span>` : (wz.edit ? "Save changes" : "Publish");
    status(""); d.querySelector("#wzNext").disabled = step === 2 && wz.group === "community";
    try { wzMap?.remove(); wzMini?.remove(); } catch {} wzMap = wzMini = null;
    const body = d.querySelector("#wzBody");
    body.innerHTML = step === 1 ? stepFind() : step === 2 ? stepDetails() : stepReview();
    body.scrollTop = 0;
    if (step === 1) wireFind(); else if (step === 2) wireDetails(); else wireReview();
    saveDraft();
  }

  /* ---------- 1 · Trova il luogo ---------- */
  function stepFind() {
    const fragileLock = wz.edit && wz.edit.fragile && !admin;
    return `<div class="wz-find">
      <div class="wz-search">
        ${ICON.pin}<input id="wzQ" type="search" autocomplete="off" placeholder="Search a place or address, or paste a Google Maps link" aria-label="Search a place">
        <div class="wz-sug" id="wzSug" hidden></div>
      </div>
      <div class="wz-quick">
        <button type="button" class="pop-btn" id="wzMe">📍 Use my location</button>
        <button type="button" class="pop-btn" id="wzPhotoBtn">📷 From a photo</button>
        <input type="file" id="wzPhoto" accept="image/jpeg,image/*" hidden>
      </div>
      <div class="wz-map${fragileLock ? " is-locked" : ""}">
        <div id="wzMap" aria-label="Move the map to place the pin"></div>
        <span class="wz-pin" aria-hidden="true"></span>
        <p class="wz-where" id="wzWhere">${wz.placed ? "" : "Search, use your location or move the map: the pin marks the place."}</p>
      </div>
      <p class="gate-help left">${fragileLock ? "This place is fragile: its exact position is protected, ask the admin to move it." : "Drag the map to put the pin exactly on the spot. Tap the map to jump there."}</p>
      <details class="wz-adv"><summary>Advanced: coordinates</summary>
        <div class="gkey-row"><input id="wzCoords" type="text" inputmode="text" autocomplete="off" placeholder="41.902782, 12.496366"><button class="text-link" type="button" id="wzCopy">Copy</button></div>
      </details>
    </div>`;
  }
  function wireFind() {
    const fragileLock = wz.edit && wz.edit.fragile && !admin;
    const c0 = wz.lat != null ? [wz.lat, wz.lon] : map ? map.getCenter() : [42.5, 12.5];
    const z0 = wz.lat != null ? 17 : map ? Math.min(map.getZoom(), 12) : 5;
    wzMap = L.map("wzMap", { zoomControl: true, attributionControl: false, minZoom: 2, maxZoom: 19, dragging: !fragileLock, scrollWheelZoom: !fragileLock, doubleClickZoom: !fragileLock, touchZoom: !fragileLock });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 18 }).addTo(wzMap);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 18, opacity: .85 }).addTo(wzMap);
    wzMap.setView(c0, z0);
    setTimeout(() => wzMap?.invalidateSize(), 60);
    const coords = $("#wzCoords"), where = $("#wzWhere");
    let rt = 0;
    const sync = () => {
      const c = wzMap.getCenter();
      wz.lat = +c.lat.toFixed(6); wz.lon = +L.Util.wrapNum(c.lng, [-180, 180], true).toFixed(6);
      coords.value = `${wz.lat.toFixed(6)}, ${wz.lon.toFixed(6)}`;
      clearTimeout(rt);
      if (wzMap.getZoom() >= 12) rt = setTimeout(async () => {
        const r = await reverseName(wz.lat, wz.lon);
        if (!wzMap) return;
        wz.place = r.place;
        if (!wz.name && r.name) wz.suggested = r.name;
        where.innerHTML = `${ICON.pin}<span>${esc([r.name, r.place].filter(Boolean).join(" · ") || "Somewhere on Earth")}</span>`;
      }, 600);
      else where.textContent = "Zoom in to place the pin exactly.";
      saveDraft();
    };
    if (!fragileLock) {
      wzMap.on("moveend", () => { wz.placed = true; sync(); });
      wzMap.on("click", e => wzMap.flyTo(e.latlng, Math.max(wzMap.getZoom(), 16), { duration: .5 }));
    }
    if (wz.lat != null) sync();
    const put = (lat, lon, name, zoom = 17) => { if (fragileLock) return; if (name && !wz.name) wz.name = name; wz.placed = true; wzMap.setView([lat, lon], zoom); };
    coords.addEventListener("change", () => { const c = parseCoordsInput(coords.value); if (c) put(c.lat, c.lon); else status("Coordinates not recognised. Format: 41.902782, 12.496366", true); });
    $("#wzCopy").addEventListener("click", ev => copyText(ev.currentTarget, coords.value));
    $("#wzMe").addEventListener("click", () => {
      if (!navigator.geolocation) return status("Your browser can't share its location.", true);
      status("Finding you…");
      navigator.geolocation.getCurrentPosition(p => { status(p.coords.accuracy > 100 ? `Accuracy about ${Math.round(p.coords.accuracy)} m: check the pin.` : ""); put(p.coords.latitude, p.coords.longitude, "", 17); },
        () => status("Location not available: allow it in the browser, or search the place.", true), { enableHighAccuracy: true, timeout: 12000 });
    });
    $("#wzPhotoBtn").addEventListener("click", () => $("#wzPhoto").click());
    $("#wzPhoto").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      const g = await exifGps(f);
      if (wz.files.length < 4) wz.files.push(f);   // la foto diventa anche la prima foto del luogo
      if (g) { put(g.lat, g.lon); status("📷 Position taken from the photo. The photo is added to the place."); }
      else status("This photo has no position (photos sent through WhatsApp or social apps lose it). It's added to the place anyway: place the pin by hand.", true);
    });
    // ricerca: luoghi, indirizzi, coordinate e link di Google Maps nella stessa casella
    const q = $("#wzQ"), sug = $("#wzSug");
    let st = 0, results = [];
    const show = html => { sug.innerHTML = html; sug.hidden = !html; };
    const pickers = () => {
      sug.querySelectorAll("[data-p]").forEach(b => b.addEventListener("click", () => { const p = results[+b.dataset.p]; show(""); q.value = p.name; put(p.lat, p.lon, p.name); }));
      sug.querySelector("[data-c]")?.addEventListener("click", () => { const c = parseCoordsInput(q.value); show(""); put(c.lat, c.lon, nameFromLink(q.value)); });
      sug.querySelector("[data-short]")?.addEventListener("click", async ev => {
        ev.currentTarget.disabled = true; ev.currentTarget.textContent = "Opening the link…";
        try {
          const r = await resolveShortLink(q.value.trim());
          show("");
          if (r.lat != null) { put(r.lat, r.lon, r.name || ""); status(r.name ? `Found «${r.name}».` : "Found the point of the link."); }
          else if (r.name) { q.value = r.name; q.dispatchEvent(new Event("input")); }
          else status("The link doesn't contain a position: search the place by name.", true);
        } catch (err) {
          show("");
          status(err.message === "not-deployed" ? "Short links aren't active yet: in Google Maps use Share → copy the full link, or search by name." : `Could not open the link (${err.message}).`, true);
        }
      });
    };
    q.addEventListener("input", () => {
      clearTimeout(st);
      const t = q.value.trim();
      if (!t) return show("");
      const c = parseCoordsInput(t);
      if (c) { show(`<button type="button" class="sg-item" data-c>${ICON.pin}<span class="sg-text"><strong>${esc(nameFromLink(t) || fmtCoord(c.lat, c.lon).replace("  |  ", " · "))}</strong><small>${/^https?:/.test(t) ? "From the Google Maps link" : "Coordinates"}</small></span></button>`); return pickers(); }
      if (isShortLink(t)) { show(`<button type="button" class="sg-item" data-short>${ICON.pin}<span class="sg-text"><strong>Open this Google Maps link</strong><small>maps.app.goo.gl</small></span></button>`); return pickers(); }
      if (t.length < 3) return show("");
      show(`<p class="sg-head sg-wait">Searching…</p>`);
      st = setTimeout(async () => {
        results = await searchPlaces(t);
        if (q.value.trim() !== t) return;
        show(results.length ? results.map((p, i) => `<button type="button" class="sg-item" data-p="${i}">${ICON.pin}<span class="sg-text"><strong>${esc(p.name)}</strong><small>${esc(p.context)}</small></span></button>`).join("") : `<p class="sg-head">Nothing found: try another name, or move the map.</p>`);
        pickers();
      }, 350);
    });
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sug.querySelector(".sg-item")?.click(); } });
    if (!wz.placed) setTimeout(() => q.focus(), 80);
  }

  /* ---------- 2 · Dettagli ---------- */
  function stepDetails() {
    const g = wz.group === "community" ? "community" : groupOf(wz.cat), cats = WZ_GROUPS.find(x => x.id === g).cats.filter(k => k !== "experience" || profV);
    const subs = WZ_SUBS[wz.cat] || [];
    const field = ([k, label, type, opt]) => {
      const v = wz.info[k] ?? "";
      if (type === "select") return `<label>${label}<select data-info="${k}">${opt.map(o => `<option value="${esc(o)}"${o === v ? " selected" : ""}>${o ? esc(o) : "—"}</option>`).join("")}</select></label>`;
      if (type === "price") return `<label>${label}<span class="pay-row"><input type="number" min="0" step="1" inputmode="decimal" data-info="${k}" value="${esc(String(v))}" placeholder="e.g. 80">
        <select data-info="currency" aria-label="Currency">${CURRENCIES.map(c => `<option${c === (wz.info.currency || "EUR") ? " selected" : ""}>${c}</option>`).join("")}</select></span></label>`;
      return `<label>${label}<input type="${type === "url" ? "url" : "text"}" maxlength="${type === "url" ? 500 : 200}" data-info="${k}" value="${esc(String(v))}" placeholder="${esc(opt || "")}"></label>`;
    };
    const s = wz.edit || {};
    return `<div class="wz-details">
      <label class="wz-name">Name<input id="wzName" type="text" maxlength="300" value="${esc(wz.name || wz.suggested || "")}" placeholder="e.g. Capo Testa lighthouse" required></label>
      <fieldset class="wz-groups"><legend>What is it?</legend>
        ${WZ_GROUPS.map(x => `<button type="button" class="wz-group${x.id === g ? " on" : ""}" data-wzg="${x.id}">${SX_ICON[x.id]}<span>${x.label}</span></button>`).join("")}
      </fieldset>
      ${g === "community" ? `<div class="wz-community">
          <p>Photographers, local experts and meetups have their own place in Spots:</p>
          <button type="button" class="outline-link" data-wzmeet>👥 Organise a meetup here</button>
          <button type="button" class="outline-link" data-wzph>📷 Join the photographers' map</button>
        </div>` : `
      ${cats.length > 1 ? `<div class="wz-cats" role="group" aria-label="Category">${cats.map(k => `<button type="button" class="wz-cat${k === wz.cat ? " on" : ""}" data-wzcat="${k}" style="--c:${CATS[k].color}">${CATS[k].icon}<span>${CATS[k].label}</span></button>`).join("")}</div>` : ""}
      ${subs.length && profV ? `<div class="wz-subs" role="group" aria-label="Type">${subs.map(([k, l]) => `<button type="button" class="wz-sub${k === wz.sub ? " on" : ""}" data-wzsub="${k}">${esc(l)}</button>`).join("")}</div>` : ""}
      <label>Description <small>(optional)</small><textarea id="wzNote" rows="3" maxlength="2000" placeholder="What makes it worth it? Best time, what to shoot, tips…">${esc(wz.note)}</textarea></label>
      ${wz.cat === "workshop" ? `<div class="add-dates"><div><label for="wzFrom">From</label><input id="wzFrom" type="date" value="${esc(wz.from)}"></div><div><label for="wzTo">To</label><input id="wzTo" type="date" value="${esc(wz.to)}"></div></div>
        ${wsV ? wsFieldsHtml(s, "wzWs") : ""}` : ""}
      ${wz.cat === "trekking" && tkV ? `<fieldset class="soc-add tk-add"><legend>Trail <small>(optional)</small></legend>${tkFieldsHtml(s, "wzTk")}</fieldset>` : ""}
      ${(WZ_INFO[wz.cat] || []).length ? `<fieldset class="wz-info"><legend>Useful info <small>(optional)</small></legend>${WZ_INFO[wz.cat].map(field).join("")}</fieldset>` : ""}
      ${wz.cat === "spot" && socialV ? `<fieldset class="soc-add"><legend>Community <small>(optional)</small></legend>
          <label class="shot-check"><input type="checkbox" id="wzSupport"${wz.support ? " checked" : ""}> 🌱 Support local — this place benefits from visitors</label>
          <input type="text" id="wzMonths" maxlength="60" value="${esc(wz.months)}" placeholder="Best months to visit, e.g. Oct–Apr">
          <label class="shot-check"><input type="checkbox" id="wzFragile"${wz.fragile ? " checked" : ""}> 🛡️ Fragile — hide it from the public map, ask members not to geotag it</label>
        </fieldset>` : ""}
      <div class="wz-photos">
        <p class="wz-label">Photos <small>(optional, up to 4 new)</small></p>
        <div class="wz-thumbs" id="wzThumbs"></div>
        <label class="pop-btn wz-addph">＋ Add photos<input type="file" id="wzFiles" accept="image/*" multiple hidden></label>
        <p class="gate-help left">Only photos you took yourself. You keep all rights: see the photo terms under the map.</p>
      </div>
      <label>Your name <small>(shown to members)</small><input id="wzAuthor" type="text" maxlength="60" value="${esc(wz.author)}" autocomplete="nickname"></label>`}
    </div>`;
  }
  function drawThumbs() {
    const box = $("#wzThumbs");
    if (!box) return;
    const old = wz.photos.filter(p => !wz.removePhotos.has(p.id));
    box.innerHTML = old.map(p => `<span class="wz-th"><img src="${esc(p.url || "")}" alt="">${admin || p.user_id === myUid() ? `<button type="button" data-rmold="${p.id}" aria-label="Remove photo">${ICON.close}</button>` : ""}</span>`).join("")
      + wz.files.map((f, i) => `<span class="wz-th is-new"><img data-newi="${i}" alt=""><button type="button" data-rmnew="${i}" aria-label="Remove photo">${ICON.close}</button></span>`).join("");
    box.querySelectorAll("[data-newi]").forEach(img => { const u = URL.createObjectURL(wz.files[+img.dataset.newi]); img.src = u; img.onload = () => URL.revokeObjectURL(u); });
    box.querySelectorAll("[data-rmold]").forEach(b => b.addEventListener("click", () => { wz.removePhotos.add(+b.dataset.rmold); drawThumbs(); }));
    box.querySelectorAll("[data-rmnew]").forEach(b => b.addEventListener("click", () => { wz.files.splice(+b.dataset.rmnew, 1); drawThumbs(); }));
  }
  function wireDetails() {
    const d = $("#wzDialog");
    d.querySelectorAll("[data-wzg]").forEach(b => b.addEventListener("click", () => {
      collect();
      const g = WZ_GROUPS.find(x => x.id === b.dataset.wzg);
      if (g.cats.length && !g.cats.includes(wz.cat)) { (wz.subBy ||= {})[wz.cat] = wz.sub; wz.cat = g.cats[0]; wz.sub = wz.subBy[wz.cat] || ""; }
      wz.group = g.id;   // Community non è un tipo di luogo: mostra solo i suoi pulsanti
      rerender();
    }));
    d.querySelectorAll("[data-wzcat]").forEach(b => b.addEventListener("click", () => { collect(); (wz.subBy ||= {})[wz.cat] = wz.sub; wz.cat = b.dataset.wzcat; wz.sub = wz.subBy[wz.cat] || ""; rerender(); }));
    d.querySelectorAll("[data-wzsub]").forEach(b => b.addEventListener("click", () => { collect(); wz.sub = wz.sub === b.dataset.wzsub ? "" : b.dataset.wzsub; rerender(); }));
    d.querySelector("[data-wzmeet]")?.addEventListener("click", () => { const p = { lat: wz.lat, lon: wz.lon }; d.close(); withConduct(() => openMeetup(p.lat != null ? p : null)); });
    d.querySelector("[data-wzph]")?.addEventListener("click", () => { d.close(); openProfile(); });
    if (d.querySelector("#wzTk")) wireTkGrade(d, "wzTk");
    d.querySelector("#wzFiles")?.addEventListener("change", e => {
      const room = 4 - wz.files.length;
      [...e.target.files].slice(0, Math.max(0, room)).forEach(f => wz.files.push(f));
      if (e.target.files.length > room) status("Up to 4 new photos at a time.", true);
      e.target.value = ""; drawThumbs();
    });
    drawThumbs();
    if (!wz.name && wz.suggested) wz.name = wz.suggested;
  }
  function rerender() {
    const body = $("#wzBody"), y = body.scrollTop;
    body.innerHTML = stepDetails(); wireDetails(); body.scrollTop = y;
    $("#wzNext").disabled = wz.group === "community";
  }
  /* legge i campi del passaggio corrente nello stato (così non si perde nulla tornando indietro) */
  function collect() {
    const d = $("#wzDialog");
    if (!d || !wz) return;
    const v = id => d.querySelector(`#${id}`);
    if (v("wzName")) wz.name = v("wzName").value.trim();
    if (v("wzNote")) wz.note = v("wzNote").value.trim();
    if (v("wzAuthor")) wz.author = v("wzAuthor").value.trim();
    if (v("wzSupport")) wz.support = v("wzSupport").checked;
    if (v("wzMonths")) wz.months = v("wzMonths").value.trim();
    if (v("wzFragile")) wz.fragile = v("wzFragile").checked;
    if (v("wzFrom")) { wz.from = v("wzFrom").value; wz.to = v("wzTo").value; }
    d.querySelectorAll("[data-info]").forEach(el => { const k = el.dataset.info, x = el.value.trim(); if (x) wz.info[k] = x; else delete wz.info[k]; });
    if (d.querySelector("#wzTkDiff")) wz.tk = readTk(d, "wzTk");
    if (d.querySelector("#wzWsCap")) wz.ws = readWs(d, "wzWs");
    saveDraft();
  }
  function check() {
    if (wz.step === 1) {
      if (wz.lat == null) { status("Find the place first: search it, use your location or move the map.", true); return false; }
      if (wzMap && wzMap.getZoom() < 13 && !(wz.edit && wz.edit.fragile)) { status("Zoom in closer so the pin is exactly on the place.", true); wzMap.flyTo(wzMap.getCenter(), 15, { duration: .6 }); return false; }
      return true;
    }
    if (wz.step === 2) {
      if (wz.group === "community") { status("Choose a category for the place, or use one of the community buttons.", true); return false; }
      if (!wz.name) { status("Give the place a name.", true); $("#wzName")?.focus(); return false; }
      if (wz.cat === "workshop" && wz.from && wz.to && wz.to < wz.from) { status("The end date is before the start date.", true); return false; }
      if (wz.tk && wz.tk._badPark) { status("Parking coordinates not recognised. Format: 46.6156, 11.7322", true); return false; }
      if (wz.ws && wz.ws.link && !/^https?:\/\//i.test(wz.ws.link)) { status("The workshop link must start with https://", true); return false; }
      if (wz.ws && wz.ws.cap != null && wz.ws.enr != null && wz.ws.enr > wz.ws.cap) { status("Booked can't be more than the places in total.", true); return false; }
      if (wz.info.link && !/^https?:\/\//i.test(wz.info.link)) { status("The booking link must start with https://", true); return false; }
      return true;
    }
    return true;
  }

  /* ---------- 3 · Controlla e pubblica ---------- */
  function infoRows(info) {
    return Object.entries(info || {}).filter(([k, v]) => v && k !== "currency" && INFO_LABEL[k])
      .map(([k, v]) => [INFO_LABEL[k], k === "price" ? `${v} ${info.currency || "EUR"}` : v]);
  }
  function stepReview() {
    const k = CATS[wz.cat] || CATS.spot, sub = (WZ_SUBS[wz.cat] || []).find(([x]) => x === wz.sub)?.[1];
    const rows = infoRows(wz.info);
    return `<div class="wz-review">
      <article class="wz-card">
        <p class="wz-kind" style="--c:${k.color}">${k.icon}<span>${k.label}${sub ? ` · ${esc(sub)}` : ""}</span></p>
        <h3>${esc(wz.name)}</h3>
        ${wz.place ? `<p class="wz-place">${ICON.pin}${esc(wz.place)}</p>` : ""}
        ${wz.note ? `<p class="wz-desc">${esc(wz.note)}</p>` : ""}
        ${rows.length ? `<dl class="wz-dl">${rows.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>` : ""}
        ${wz.support || wz.fragile || wz.months ? `<p class="wz-tags">${wz.support ? "<span>🌱 Support local</span>" : ""}${wz.fragile ? "<span>🛡️ Fragile</span>" : ""}${wz.months ? `<span>📅 ${esc(wz.months)}</span>` : ""}</p>` : ""}
        <p class="wz-ph-count">${wz.files.length ? `📷 ${wz.files.length} new photo${wz.files.length > 1 ? "s" : ""}` : ""}${wz.removePhotos.size ? ` · ${wz.removePhotos.size} to remove` : ""}</p>
      </article>
      <div class="wz-mini" id="wzMini" aria-label="Position preview"></div>
      <section class="wz-similar" id="wzSimilar"><p class="gate-note">Looking for similar places nearby…</p></section>
    </div>`;
  }
  async function wireReview() {
    wzMini = L.map("wzMini", { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, keyboard: false });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 18 }).addTo(wzMini);
    wzMini.setView([wz.lat, wz.lon], 16);
    L.marker([wz.lat, wz.lon], { interactive: false, icon: pinIcon({ category: wz.cat, name: wz.name }) }).addTo(wzMini);
    setTimeout(() => wzMini?.invalidateSize(), 60);
    // luoghi simili: entro 150 m qualunque nome, entro 1 km con un nome simile (mai bloccante)
    let near = [];
    try {
      if (profV) { const { data } = await api("/rest/v1/rpc/nearby_spots", { method: "POST", body: { p_lat: wz.lat, p_lon: wz.lon, p_km: 1, p_exclude: wz.edit?.id || null } }); near = (data || []).map(x => ({ ...x, dist: x.dist_m })); }
      else throw new Error("no rpc");
    } catch {
      near = spots.filter(x => x.id !== wz.edit?.id).map(x => ({ ...x, dist: Math.round(metersBetween(wz, x)) })).filter(x => x.dist <= 1000).sort((a, b) => a.dist - b.dist).slice(0, 12);
    }
    const sim = near.filter(x => x.dist <= 150 || similarName(wz.name, x.name)).slice(0, 5);
    const box = $("#wzSimilar");
    if (!box) return;
    box.innerHTML = sim.length ? `<p class="wz-label">Already on Spots nearby — is it the same place?</p>
      <ul class="wz-sim">${sim.map(x => `<li><span><b>${esc(x.name)}</b><small>${esc((CATS[x.category] || CATS.spot).label)} · ${x.dist < 1000 ? `${x.dist} m` : `${(x.dist / 1000).toFixed(1)} km`}</small></span>
        <button type="button" class="text-link" data-simopen="${x.id}">Same place: open it</button></li>`).join("")}</ul>
      <p class="gate-help left">If it's the same, open it and add your photos or a review instead. If it's a different place, just publish.</p>`
      : `<p class="gate-note">✓ No similar places nearby.</p>`;
    box.querySelectorAll("[data-simopen]").forEach(b => b.addEventListener("click", () => {
      const x = spots.find(y => y.id === +b.dataset.simopen);
      $("#wzDialog").close();
      if (x) focusSpot(x); else toast("That place is in a filter you've hidden: show all categories to see it.");
    }));
  }

  async function loadEditPhotos() {
    if (!wz?.edit || !schemaV2) return;
    try {
      const { data } = await api(`/rest/v1/spot_photos?select=id,path,user_id&spot_id=eq.${wz.edit.id}&order=created_at.asc`);
      const urls = data?.length ? await signPhotos(data.map(p => p.path)) : {};
      wz.photos = (data || []).map(p => ({ ...p, url: urls[p.path] || "" }));
      drawThumbs();
    } catch {}
  }

  async function publish() {
    const btn = $("#wzNext");
    const cat = wz.cat, edit = wz.edit;
    const row = { name: wz.name.slice(0, 300), lat: wz.lat, lon: wz.lon, note: wz.note || null };
    if (schemaV2) Object.assign(row, { category: cat, author_name: (wz.author || displayName()).slice(0, 60),
      starts_on: cat === "workshop" ? wz.from || null : null, ends_on: cat === "workshop" ? (wz.to || wz.from || null) : null });
    if (profV) Object.assign(row, { subcategory: wz.sub || null, info: Object.fromEntries(Object.entries(wz.info).filter(([k]) => (WZ_INFO[cat] || []).some(f => f[0] === k) || (k === "currency" && wz.info.price))) });
    else if (infoRows(wz.info).length) row.note = [row.note, infoRows(wz.info).map(([a, b]) => `${a}: ${b}`).join("\n")].filter(Boolean).join("\n\n");
    if (schemaV2 && socialV && cat === "spot") Object.assign(row, { support_local: wz.support, best_months: wz.months || null });
    if (cat === "trekking" && tkV && wz.tk) { const { _badPark, ...tk } = wz.tk; Object.assign(row, tk); }
    if (cat === "workshop" && wsV && wz.ws) Object.assign(row, { ws_capacity: wz.ws.cap || null, ws_enrolled: wz.ws.enr, ws_price: wz.ws.price, ws_currency: wz.ws.price != null ? wz.ws.cur : null, ws_link: wz.ws.link || null, ws_offer: wz.ws.offer || null, ws_offer_until: wz.ws.offerUntil });
    if (wz.author) setDisplayName(wz.author);
    btn.disabled = true; status(edit ? "Saving…" : "Publishing…");
    try {
      if (!(await ensureSession())) throw new Error("please log in again");
      let saved;
      if (edit) {
        const { data } = await api(`/rest/v1/spots?id=eq.${edit.id}`, { method: "PATCH", body: row, headers: { Prefer: "return=representation" } });
        saved = Array.isArray(data) ? data[0] : data;
        if (!saved) throw new Error("you can only edit your own places");
      } else {
        const { data } = await api("/rest/v1/spots", { method: "POST", body: { ...row, source_key: `u:${crypto.randomUUID()}`, list: COMMUNITY }, headers: { Prefer: "return=representation" } });
        saved = Array.isArray(data) ? data[0] : data;
      }
      if (schemaV2 && socialV && cat === "spot" && wz.fragile !== !!edit?.fragile) { try { await api("/rest/v1/rpc/set_fragile", { method: "POST", body: { p_spot: saved.id, p_fragile: wz.fragile } }); } catch {} }
      let photoErr = "";
      for (const id of wz.removePhotos) {
        const p = wz.photos.find(x => x.id === id);
        try { await api(`/rest/v1/spot_photos?id=eq.${id}`, { method: "DELETE" }); if (p) await api(`/storage/v1/object/spot-photos/${p.path}`, { method: "DELETE" }); } catch (err) { photoErr = err.message; }
      }
      for (let i = 0; i < wz.files.length; i++) {
        status(`Uploading photo ${i + 1} of ${wz.files.length}…`);
        try { await uploadPhoto(saved.id, wz.files[i]); } catch (err) { photoErr = err.message; }
      }
      try { localStorage.setItem("fcph-last-cat", cat); if (!edit) localStorage.removeItem(DRAFT_KEY); } catch {}
      spots = await fetchSpots();
      if (activeCats) activeCats.add(cat);
      $("#wzDialog").close();
      meCache = null;
      if (meView) renderMe();
      else { renderApp(); const s = spots.find(x => x.id === saved.id); if (s) focusSpot(s); }
      toast(photoErr ? `Saved, but a photo failed: ${photoErr}` : edit ? `«${row.name}» updated.` : `«${row.name}» is on the map.`, !!photoErr);
    } catch (err) {
      status(/row-level|policy|permission/i.test(err.message) ? "Your account can't save this place." : `Could not save: ${err.message}`, true);
      btn.disabled = false;
    }
  }
  /* modifica di un luogo esistente (autore o admin): la stessa procedura, già compilata */
  const openEditPlace = s => openAdd(null, {}, s);

  /* il vecchio modulo a una pagina (non più usato: resta come riferimento) */
  function openAddLegacy(pre, preset = {}) {
    let d = $("#addDialog");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "addDialog"; d.className = "import-dialog add-dialog";
      document.body.appendChild(d);
      d.addEventListener("click", e => { if (e.target === d) d.close(); });
    }
    const lists = [...new Set(spots.map(s => s.list))].sort((a, b) => a.localeCompare(b));
    const lastList = (() => { try { return localStorage.getItem("fcph-last-list") || ""; } catch { return ""; } })();
    const lastCat = preset.category || (() => { try { return localStorage.getItem("fcph-last-cat") || "spot"; } catch { return "spot"; } })();
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
        <input id="addName" type="text" maxlength="300" placeholder="e.g. Capo Testa lighthouse" value="${esc(preset.name || "")}" required>
        <label for="addCoords" id="addCoordsLabel">Coordinates or Google Maps link</label>
        <p class="tk-hint" id="addTkHint" hidden>🚩 For a trek, use the coordinates of the <b>starting point</b> (trailhead), not the summit or the view.</p>
        <div class="gkey-row">
          <input id="addCoords" type="text" inputmode="text" placeholder="41.902782, 12.496366" value="${esc(c0)}" autocomplete="off" required>
          <button class="text-link" type="button" id="addPaste">Paste</button>
        </div>
        <p class="gate-note" id="addCoordsNote" role="status"></p>
        <p class="gate-help left">In Google Maps, press and hold on the place, then tap the coordinates to copy them. On this map you can also right-click (or press and hold) on the exact point.</p>
        ${schemaV2 ? `<div class="add-dates" id="addDates" hidden>
          <div><label for="addFrom">From</label><input id="addFrom" type="date"></div>
          <div><label for="addTo">To</label><input id="addTo" type="date"></div>
          <p class="gate-help left">The workshop disappears from the map by itself on the day it starts.</p>
          ${wsV ? wsFieldsHtml({}, "add") : ""}
        </div>` : ""}
        ${schemaV2 && tkV ? `<fieldset class="soc-add tk-add" id="addTk" hidden><legend>Trail <small>(optional)</small></legend>${tkFieldsHtml({}, "addTk")}</fieldset>` : ""}
        ${schemaV2 && socialV ? `<fieldset class="soc-add"><legend>Community <small>(optional)</small></legend>
          <label class="shot-check"><input type="checkbox" id="addSupport"> 🌱 Support local — this place benefits from visitors</label>
          <input type="text" id="addMonths" maxlength="60" placeholder="Best months to visit, e.g. Oct–Apr">
          <label class="shot-check"><input type="checkbox" id="addFragile"> 🛡️ Fragile — hide it from the public map, ask members not to geotag it</label>
        </fieldset>` : ""}
        <label for="addNote">Description <small>(optional)</small></label>
        <textarea id="addNote" maxlength="2000" rows="3" placeholder="What makes it worth it? Best time, access, tips…"></textarea>
        ${schemaV2 ? `<label for="addPhotos">Photos <small>(optional, up to 4)</small></label>
          <input id="addPhotos" type="file" accept="image/*" multiple>
          <p class="gate-help left">Only upload photos you took yourself. You keep all rights: see the <a href="#photoRights" data-rights>photo terms</a> under the map.</p>
          <label for="addAuthor">Your name <small>(shown to members)</small></label>
          <input id="addAuthor" type="text" maxlength="60" value="${esc(displayName())}" autocomplete="nickname">` : ""}
        <button class="outline-link" type="submit" id="addSave">SAVE PLACE <span aria-hidden="true">→</span></button>
        <p class="gate-note" id="addStatus" role="status"></p>
      </form>`;
    const f = d.querySelector("form"), ci = d.querySelector("#addCoords"), note = d.querySelector("#addCoordsNote");
    const catVal = () => d.querySelector("[name=addCat]:checked")?.value || "spot";
    const syncCat = () => {
      const c = catVal(), box = d.querySelector("#addDates"), tk = d.querySelector("#addTk");
      if (box) box.hidden = c !== "workshop";
      if (tk) tk.hidden = c !== "trekking";
      d.querySelector("#addTkHint").hidden = c !== "trekking";
      d.querySelector("#addCoordsLabel").textContent = c === "trekking" ? "Trailhead coordinates (where the walk starts)" : "Coordinates or Google Maps link";
    };
    if (d.querySelector("#addTk")) wireTkGrade(d, "addTk");
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
    d.querySelector("[data-rights]")?.addEventListener("click", ev => { ev.preventDefault(); d.close(); $("#photoRights")?.scrollIntoView({ behavior: "smooth", block: "center" }); });
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
      const ws = cat === "workshop" && wsV ? readWs(d, "add") : null;
      const tk = cat === "trekking" && tkV ? readTk(d, "addTk") : null;
      if (tk && tk._badPark) return warn("Parking coordinates not recognised. Format: 46.6156, 11.7322", d.querySelector("#addTkParkC"));
      if (tk) delete tk._badPark;
      if (ws && ws.link && !/^https?:\/\//i.test(ws.link)) return warn("The workshop link must start with https://", d.querySelector("#addLink"));
      if (ws && ws.cap != null && ws.enr != null && ws.enr > ws.cap) return warn("Booked can't be more than the places in total.", d.querySelector("#addEnr"));
      const author = d.querySelector("#addAuthor")?.value.trim() || "";
      if (author) setDisplayName(author);
      const raw = ci.value.trim(), url = /^https?:\/\//.test(raw) ? raw : "";
      const list = cleanList(d.querySelector("#addList")?.value || COMMUNITY);
      const row = { source_key: `u:${crypto.randomUUID()}`, name: name.slice(0, 300), lat: c.lat, lon: c.lon, list,
        note: d.querySelector("#addNote").value.trim() || null, url: url || null };
      if (schemaV2) Object.assign(row, { category: cat, starts_on: cat === "workshop" ? from : null, ends_on: cat === "workshop" ? (to || from) : null, author_name: author || displayName() });
      if (tk) Object.assign(row, tk);
      if (ws) Object.assign(row, { ws_capacity: ws.cap || null, ws_enrolled: ws.enr, ws_price: ws.price, ws_currency: ws.price != null ? ws.cur : null, ws_link: ws.link || null, ws_offer: ws.offer || null, ws_offer_until: ws.offerUntil });
      if (schemaV2 && socialV) Object.assign(row, { support_local: !!d.querySelector("#addSupport")?.checked, best_months: d.querySelector("#addMonths")?.value.trim() || null });
      const makeFragile = !!d.querySelector("#addFragile")?.checked;
      const files = [...(d.querySelector("#addPhotos")?.files || [])].slice(0, 4);
      btn.disabled = true; status.className = "gate-note"; status.textContent = "Saving…";
      try {
        if (!(await ensureSession())) throw new Error("please log in again");
        const { data } = await api("/rest/v1/spots", { method: "POST", body: row, headers: { Prefer: "return=representation" } });
        const saved = Array.isArray(data) ? data[0] : data;
        if (makeFragile) { try { await api("/rest/v1/rpc/set_fragile", { method: "POST", body: { p_spot: saved.id, p_fragile: true } }); } catch {} }
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
    if ([...known].some(k => k.startsWith("fragile:")) && crypto.subtle) {
      const hex = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, "0")).join("");
      for (const f of fresh) if (known.has("fragile:" + await hex(f.source_key))) known.add(f.source_key);
    }
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

  const prefetch = () => { if (ui === "earth" && viewMode === "globe" && !globeFailed) loadMapLibre().catch(() => {}); };
  return { show, prefetch, handleCallback, loadSession, renderWrite, parse: { fromCSV, fromKML, fromGeoJSON, coordsFromText } };
})();

const LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_LOCATE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg>';
const ICON_ALERT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3zm0 6v5m0 3v.5"/></svg>';
const ICON_SCAN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3.5"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
const ICON_UPLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>';

/* subito, prima che app.js legga l'indirizzo */
document.querySelector(".nav-spots")?.setAttribute("hidden", "");   // nascosta finché non si sa chi sta guardando
Spots.loadSession();
Spots.handleCallback();
window.Spots = Spots;
