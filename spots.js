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
  // what the folk write (stories, tips, notes): marked so that app.js can offer «Translate» when it is in another language
  const ugc = t => `<span class="ugc">${esc(t)}</span>`;
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
  /* CLUSTER: come viaggia ogni membro (anche più di uno); con i propri cluster si firmano i luoghi */
  const CLUSTERS = {
    photo: { ico: "📷", label: "Photographer", long: "Travel photography", color: "#c9a7ff" , folk: "Photo folk" },
    hike: { ico: "🥾", label: "Hiker", long: "Hiking & outdoors", color: "#7ee081" , folk: "Hiker folk" },
    slow: { ico: "🎒", label: "Backpacker", long: "Backpacking & slow travel", color: "#ffb347" , folk: "Backpacker folk" },
    road: { ico: "🚐", label: "Road tripper", long: "Road trips & vanlife", color: "#ff8a7a" , folk: "Road trip folk" },
    nomad: { ico: "💻", label: "Digital nomad", long: "Digital nomad / expat", color: "#7fb2ff" , folk: "Nomad folk" },
    food: { ico: "🍝", label: "Foodie", long: "Food & local flavours", color: "#ffd166" , folk: "Foodie folk" }
  };
  const CLUSTER_KEYS = Object.keys(CLUSTERS);
  // la stessa idea, raccontata a ogni cluster (porte d'ingresso: fabiocostaph.com/#spotfolk-hikers ecc.)
  const DOOR_LEAD = {
    photographers: "Thousands of places scouted for the light, signed by photo folk.",
    hikers: "The trail's best viewpoint, and when to be there. Places signed by hiker folk.",
    backpackers: "Trips from people who stopped where the view was. Places signed by backpacker folk.",
    roadtrips: "Where to pull over: the places worth the detour, signed by road trip folk.",
    nomads: "The corners locals love, at the right hour. Places signed by nomad folk.",
    foodies: "Where locals eat, and the view that comes with it. Tables signed by foodie folk."
  };
  const DOORS = { photographers: "photo", hikers: "hike", backpackers: "slow", roadtrips: "road", nomads: "nomad", foodies: "food" };
  const doorNow = () => { try { const d = localStorage.getItem("fcph-door"); return DOORS[d] ? d : ""; } catch { return ""; } };
  let myStyles = [], clusterV = true, signV = true, folkV = true;
  let signMap = new Map();
  let evoV = true, mySignCount = null;
  let subV = true;   // false finché non è stato eseguito supabase-voti-recensioni.sql (i 4 voti delle recensioni)
  let pendingMode = false, foundersLeft = null;   // pendingMode: iscritto in attesa che però vede tutto (ingresso immediato)
  const joinFolk = () => { try { const k = localStorage.getItem("fcph-joinfolk"); return CLUSTERS[k] ? k : ""; } catch { return ""; } };   // evoV: false finché non è stato eseguito supabase-folk-evoluzione.sql
  const LEVELS = [["trusted", "Trusted", 25], ["pathfinder", "Pathfinder", 10], ["wanderer", "Wanderer", 1]];
  // livello in un folk: Wanderer (1 firma) · Pathfinder (10 firme e almeno un consiglio) · Trusted (25 firme in almeno 3 zone)
  const levelOf = st => !st || !st.signs ? null : st.signs >= 25 && (st.areas || 0) >= 3 ? LEVELS[0] : st.signs >= 10 && (st.tips || 0) >= 1 ? LEVELS[1] : LEVELS[2];   // firme per luogo: { total, top (folk più presente), fabio } — per le icone «evolute»
  const signTier = s => { const g = signMap.get(s.id); if (!g) return 0; return g.total >= 15 ? 3 : g.total >= 5 ? 2 : g.total >= 1 ? 1 : 0; };
  const folkOf = k => CLUSTERS[k]?.folk || "";   // «folk»: il nome dei cluster (gente che viaggia allo stesso modo)
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
  let onlyFavs = false, commLayer = null;
  const showFolks = new Set();   // i folk della community mostrati sulla mappa (Photo, Hiker, Backpacker, Road trip, Nomad, Foodie)
  let kindV = true, folksV = true;   // folksV: false finché non è stato eseguito supabase-folk-mappa.sql   // false finché non è stato eseguito supabase-viaggiatori.sql (colonna «kind» dei profili)
  const pKind = p => (p.kind === "traveller" || p.kind === "both" ? p.kind : "photographer");
  // i folk di un profilo (dal profilo stesso); senza folk vale il vecchio tipo fotografo/viaggiatore
  const pFolks = p => (Array.isArray(p.folks) ? p.folks : []).filter(k => k in FOLK_ICON);
  const isPhotoP = p => pFolks(p).length ? pFolks(p).includes("photo") : pKind(p) !== "traveller";
  const isTravP = p => pFolks(p).length ? pFolks(p).some(k => k !== "photo") : pKind(p) !== "photographer";
  // tutti i folk di un profilo; i vecchi profili senza folk: fotografo → Photo, viaggiatore → Backpacker
  const pFolkSet = p => pFolks(p).length ? pFolks(p) : pKind(p) === "traveller" ? ["slow"] : pKind(p) === "both" ? ["photo", "slow"] : ["photo"];
  const showsP = p => pFolkSet(p).some(k => showFolks.has(k));
  const revealP = p => { pFolkSet(p).forEach(k => showFolks.add(k)); };
  // ogni folk ha la sua icona sulla mappa
  const FOLK_ICON = {
    photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20V19H4z"/><circle cx="12" cy="13" r="3.4"/></svg>',
    hike: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 3.5h5v6.5l4.6 2.6c1.6.9 2.4 2.3 2.4 4.1V19h-15v-6.5l3-2.2z"/><path d="M4.5 16h15M9 7h3.5M9 9.6h3.5"/></svg>',
    slow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5.5a4 4 0 0 1 8 0V7"/><rect x="5" y="7" width="14" height="14" rx="4"/><path d="M9 14h6v3.5H9zM5 12.5h14"/></svg>',
    road: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 16.5V8.5a2 2 0 0 1 2-2H14l4 4.5h1.6a1.9 1.9 0 0 1 1.9 1.9v3.6z"/><path d="M2.5 11h19M8 6.5V11"/><circle cx="7" cy="17.3" r="1.9"/><circle cx="17" cy="17.3" r="1.9"/></svg>',
    nomad: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="5" width="15" height="10.5" rx="1.6"/><path d="M2 19h20M10 19l.6-1.5h2.8L14 19"/></svg>',
    food: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3v18M4 3v5.5a2.5 2.5 0 0 0 5 0V3M17.5 21V3c-2.2 1.2-3.5 4-3.5 7.5V13h3.5"/></svg>'
  };
  const folkPinOf = p => { const f = pFolks(p); return f.length ? f[0] : pKind(p) === "traveller" ? "slow" : "photo"; };
  const onMapP = p => p.visible && p.on_map !== false && p.lat != null;
  let passItems = [], passV = true, showPass = true, commDirty = false;
  let trips = null, tripsV = true, tripCount = 0, showTrips = false, tripLayer = null, tripEd = null;   // itinerari (null = non ancora caricati)   // Pass it on (false finché non è stato eseguito supabase-pass-it-on.sql)
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
    setTimeout(sfState, 0);
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
    history.replaceState(null, "", location.pathname + location.search + "#spotfolk");
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
    spareForSpotfolk(email, password);
  }
  /* login unico tra fabiocostaph.com e spotfolk.eu: una seconda sessione, separata, che il primo link verso l'altro sito
     porta con sé (una volta sola). Su spotfolk.eu l'altro sito è fabiocostaph.com, e viceversa. */
  const HANDOFF = "fcph-handoff";
  const SF_MODE = document.documentElement.classList.contains("sf");
  const SF_LOOK = true;   // the SpotFolk look (door, map panel, passport) on both sites; SF_MODE is only spotfolk.eu
  document.documentElement.classList.add("sfskin");
  const OTHER = SF_MODE ? "https://fabiocostaph.com" : "https://spotfolk.eu";
  async function spareForSpotfolk(email, password) {
    try { const { data } = await api("/auth/v1/token?grant_type=password", { method: "POST", auth: false, body: { email, password } }); localStorage.setItem(HANDOFF, data.refresh_token); } catch {}
  }
  function goOther(href, newTab) {
    let rt = null; try { rt = session ? localStorage.getItem(HANDOFF) : null; } catch {}
    const u = new URL(href);
    if (rt) {
      try { localStorage.removeItem(HANDOFF); } catch {}
      const to = u.hash.slice(1).replace(/[^\w-]/g, "");
      u.hash = `sfh=${encodeURIComponent(rt)}${to ? `&to=${to}` : ""}`;
    }
    if (newTab) window.open(u.href, "_blank", "noopener"); else location.href = u.href;
  }
  document.addEventListener("click", e => {
    const a = e.target.closest?.(`a[href^="${OTHER}"]`); if (!a || !session) return;
    let rt = null; try { rt = localStorage.getItem(HANDOFF); } catch {}
    if (!rt) return;
    e.preventDefault();
    goOther(a.href, a.target === "_blank");
  }, true);
  // SpotFolk on its own (spotfolk.eu): the bar on top follows who is looking
  function sfState() {   // the bar on spotfolk.eu and the account button in the fabiocostaph.com header
    const inside = !!session && !guest;
    document.documentElement.classList.toggle("sf-folk", inside);
    let name = memberName; if (!name && session?.access_token) { const m = jwtMeta(session.access_token); name = m.first_name || m.full_name || ""; }
    const ini = ((name || "F").trim()[0] || "F").toUpperCase();
    document.querySelectorAll("#sfMeI,[data-me-i]").forEach(i => { i.textContent = ini; });
    const n = document.querySelector("#sfMe span"); if (n && name) n.textContent = name.trim().split(/\s+/)[0];
  }
  /* Iscrizione dal sito: nome, cognome, email, password. L'account entra «in attesa» finché non lo approvi */
  const PRIVACY_VERSION = "2026-11-12", TERMS_VERSION = "2026-11-12";   // versions of the privacy notice and terms shown at sign-up
  async function signUp(first, last, email, password, styles = []) {
    const { data } = await api("/auth/v1/signup", { method: "POST", auth: false,
      body: { email, password, data: { first_name: first, last_name: last, full_name: `${first} ${last}`.trim(), travel_style: styles, source: doorNow() || null, invited_by: (() => { try { return localStorage.getItem("sf-via") || null; } catch { return null; } })(),
        privacy_notice_read: PRIVACY_VERSION, terms_accepted: TERMS_VERSION, consents_at: new Date().toISOString(), signup_site: location.hostname } } });
    if (data && data.access_token) {
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
      spareForSpotfolk(email, password);
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
      let data;
      try { ({ data } = await api(`/rest/v1/members?select=status,first_name,last_name${clusterV ? ",travel_style" : ""}&user_id=eq.${encodeURIComponent(uid)}`)); }
      catch (err) { if (!clusterV || err.status !== 400) throw err; clusterV = false; signV = false; ({ data } = await api(`/rest/v1/members?select=status,first_name,last_name&user_id=eq.${encodeURIComponent(uid)}`)); }
      const row = (data || [])[0];
      myStyles = (row?.travel_style || []).filter(k => CLUSTERS[k]);
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
    try { localStorage.removeItem(HANDOFF); } catch {}
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
        if (admin) { try { await fetchMemberStatus(); } catch {} }   // anche tu hai i tuoi cluster
        if (memberStatus === "approved" || memberStatus === "pending") maybeAskStyles();
        pendingMode = false;
        if (memberStatus === "pending") {
          // ingresso immediato: chi è in attesa vede già tutta la mappa (se il database lo consente)
          try { const sp = await fetchSpots(); if (sp.length) { spots = sp; pendingMode = true; guest = false; await Promise.all([fetchReports(), fetchCommunity()]); loaded = true; meView ? renderMe() : renderApp(); return; } } catch {}
        }
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
    if (SF_LOOK) return `<div class="spots-gate sf-door">
      <img class="sf-door-logo" src="img/spotfolk-logo.png" alt="SpotFolk" width="640" height="365">
      <h2>${wantJoin ? "Pull up a seat, <em>folk.</em>" : "Welcome back, <em>folk.</em>"}</h2>
      <p>${wantJoin ? "Free, one minute. Sign places, read the tips, get your passport." : "Log in to see the whole map, sign the places you know and share your stories."}</p>
      ${inner}
    </div>`;
    return `<div class="spots-gate">
      <div class="gate-icon" aria-hidden="true">${LOCK_SVG}</div>
      <h2>${wantJoin ? "Become folk" : "Welcome back, folk"}</h2>
      <p>${wantJoin ? "Free, in a minute. Pick your folk and step in: you can explore, sign, review and add places right away." : "Log in to see the whole map, sign the places you know, plan trips and open your passport."}</p>
      ${inner}
    </div>`;
  }
  /* ---------- visitatori: la selezione pubblica (vista «public_spots» del database) ---------- */
  async function loadFounders() {
    try { const { data } = await api("/rest/v1/rpc/members_count", { method: "POST", body: {}, auth: false }); if (Number.isFinite(+data)) foundersLeft = Math.max(0, 100 - +data); } catch {}
  }
  async function loadPublic() {
    if (foundersLeft == null) loadFounders().then(() => { if (foundersLeft > 0) { const w = document.querySelector(".wf-welcome"); if (w && !w.querySelector(".wf-found")) w.querySelector(".wf-cta")?.insertAdjacentHTML("afterend", `<p class="wf-found">🏅 <b>${foundersLeft}</b> of 100 places left as <b>Founding folk</b>: a badge in your passport, forever.</p>`); } });
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
      favs = guestFavs();
      return true;
    } catch { return false; }
  }

  function renderGate() {
    setTimeout(sfState, 0);
    const join = wantJoin;
    root().innerHTML = gateHtml(`
      ${notice ? `<p class="gate-note warn">${esc(notice)}</p>` : ""}
      <div class="gate-tabs" role="tablist">
        <button type="button" role="tab" class="${join ? "" : "on"}" aria-selected="${!join}" data-gtab="login">Log in</button>
        <button type="button" role="tab" class="${join ? "on" : ""}" aria-selected="${join}" data-gtab="join">${SF_LOOK ? "Become folk" : "Find your folk — free"}</button>
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
        <fieldset class="cl-pick" id="joinStyles"><legend>Choose your folk <small>(how you travel: pick all that fit)</small></legend>
          ${CLUSTER_KEYS.map(k => `<label><input type="checkbox" value="${k}"${DOORS[doorNow()] === k || joinFolk() === k ? " checked" : ""}><span>${SF_LOOK ? `<i aria-hidden="true">${CLUSTERS[k].ico}</i>${CLUSTERS[k].label}` : `${CLUSTERS[k].ico} ${CLUSTERS[k].long}`}</span></label>`).join("")}
        </fieldset>
        ${foundersLeft != null && foundersLeft > 0 ? `<p class="wf-found">🏅 Join now and you're one of the first 100 <b>Founding folk</b> <span class="wf-left">${foundersLeft}</span> <span>places left.</span></p>` : ""}
        <label class="gate-check"><input type="checkbox" id="joinPrivacy"> <span><a href="#privacy" target="_blank">I have read the privacy notice</a> (art. 13 GDPR).</span></label>
        <label class="gate-check"><input type="checkbox" id="joinCode"> <span>I accept the <button type="button" class="text-link" id="joinShowCode">community code</button> and agree to the <a href="#terms" target="_blank">terms</a>. I'm 16 or older.</span></label>
        ${SF_LOOK ? `<button class="sf-submit" type="submit" id="joinSend">Become folk — free →</button>` : `<button class="outline-link" type="submit" id="joinSend">JOIN <span aria-hidden="true">→</span></button>`}
        <p class="gate-note" id="gateMsg" role="status"></p>
      </form>` : `<form class="gate-form" id="gateForm" novalidate>
        <label for="gateEmail">Email</label>
        <input id="gateEmail" type="email" autocomplete="username" placeholder="you@example.com" required>
        <label for="gatePassword">Password</label>
        <input id="gatePassword" type="password" autocomplete="current-password" required>
        ${SF_LOOK ? `<button class="sf-submit" type="submit" id="gateSend">Log in →</button>` : `<button class="outline-link" type="submit" id="gateSend">LOG IN <span aria-hidden="true">→</span></button>`}
        <p class="gate-note" id="gateMsg" role="status"></p>
        <p class="gate-help">Forgot your password? <a href="#about">Contact me</a> and I will reset it.</p>
      </form>`}
      ${guestLoaded ? `<button type="button" class="text-link gate-back" id="gateBack">← Back to the public map</button>` : ""}`);
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
      const styles = [...document.querySelectorAll("#joinStyles input:checked")].map(i => i.value);
      if (!styles.length) { msg.textContent = "Choose your folk: pick at least one."; return; }
      if (!$("#joinPrivacy").checked) { msg.textContent = "Please confirm you have read the privacy notice."; return; }
      if (!$("#joinCode").checked) { msg.textContent = "Please accept the community code and the terms."; return; }
      btn.disabled = true; msg.className = "gate-note"; msg.textContent = "Sending your request…";
      try {
        const how = await signUp(first, last, email, password, styles);
        window.fcTrack?.("Spots: signed up");
        try { localStorage.setItem(CONDUCT_KEY, "1"); } catch {}
        wantJoin = false; wantLogin = false; notice = ""; loaded = false; guestLoaded = false;
        if (how === "confirm") {
          msg.className = "gate-note ok";
          msg.textContent = "Almost done: check your inbox and click the link to confirm your email.";
          return;
        }
        await render();
        welcomeFolk(first, styles);
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

  /* right after signing up: a clear "you're in", so nobody wonders whether it worked */
  function welcomeFolk(first, styles) {
    let d = $("#welcomeDialog");
    if (!d) { d = document.createElement("dialog"); d.id = "welcomeDialog"; d.className = "import-dialog welcome-dialog"; document.body.appendChild(d); }
    const f = (styles || []).filter(k => CLUSTERS[k]);
    d.innerHTML = `<div class="import-body">
        <p class="wd-fire" aria-hidden="true">🔥</p>
        <span class="eyebrow">You're in</span>
        <h2>${esc(trS("Welcome, {n}!").replace("{n}", first || "folk"))}</h2>
        <p>Your SpotFolk account is ready: you can sign, review and add places right away, here and on fabiocostaph.com, with the same email and password.</p>
        ${f.length ? `<p class="wd-folks">${f.map(k => `<span style="--c:${CLUSTERS[k].color}">${CLUSTERS[k].ico} ${esc(folkOf(k))}</span>`).join("")}</p>` : ""}
        <p class="gate-help left">Start with three places you've been to: open one on the map and tap “Sign”.</p>
        <button class="sf-submit" type="button" data-close>To the map →</button>
      </div>`;
    d.querySelector("[data-close]").onclick = () => d.close();
    if (!d.open) d.showModal();
  }
  function pendingText() {
    if (memberStatus === "suspended") return "Your account is suspended. If you think this is a mistake, contact me.";
    return memberStatus === "rejected"
      ? "Your request to join was not approved. If you think this is a mistake, contact me."
      : "Thanks for joining! Your account is almost ready: reload the page in a moment. Until then, here is the public map.";
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
    pass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11h15v9.5h-15zM3 7.5h18V11H3zM12 7.5v13M12 7.5C10.8 4 7 3.6 7.2 6c.1 1.2 2.4 1.5 4.8 1.5M12 7.5c1.2-3.5 5-3.9 4.8-1.5-.1 1.2-2.4 1.5-4.8 1.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>'
  };
  const SX_GROUPS = [
    { id: "pass", title: "Pass it on", sub: "Sell or give away to travellers", cats: [], isNew: "2027-01-31" },
    { id: "places", title: "Places", sub: "Photo spots · Points of interest · Trekking", cats: ["spot", "trekking"] },
    { id: "essentials", title: "Essentials", sub: "Stay · Food & drink", cats: ["hotel", "restaurant"] },
    { id: "community", title: "Community", sub: "All the folk · Local experts · Meetups · Trips", cats: [] },
    { id: "outdoors", title: "Outdoors", sub: "Workshops · Experiences", cats: ["workshop", "experience"] }
  ];

  /* --- BENVENUTO per chi non è ancora folk: cos'è, perché entrare, quale folk sei --- */
  function welcomeHtml() {
    return `<section class="wf-welcome" aria-label="Join SpotFolk">
      <h3>Is it worth the trip? <em>Ask the folk who went.</em></h3>
      <p class="wf-lead">Every place here is signed by someone who's been there, with a face, a name and a way of travelling. Read it through people who travel like you.</p>
      <ul class="wf-ben">
        <li><b>Advice you can trace:</b> who signed it, when, and whether they were on the spot.</li>
        <li><b>The right moment:</b> the best hour and season, from those who stood there.</li>
        <li><b>8,000+ places</b> scouted with a photographer's eye, waiting for the folk to confirm them.</li>
      </ul>
      <p class="wf-pick">You don't join as a user. Which folk are you?</p>
      <div class="wf-folks">${CLUSTER_KEYS.map(k => `<button type="button" data-joinfolk="${k}" style="--c:${CLUSTERS[k].color}"><span>${CLUSTERS[k].ico}</span>${esc(CLUSTERS[k].label)}</button>`).join("")}</div>
      <button type="button" class="wf-cta" id="wfJoin">Find your folk — free <span aria-hidden="true">→</span></button>
      ${foundersLeft != null && foundersLeft > 0 ? `<p class="wf-found">🏅 <b>${foundersLeft}</b> of 100 places left as <b>Founding folk</b>: a badge in your passport, forever.</p>` : ""}
      <div class="wf-peek" aria-label="What you find inside"><span>★ Fabio's pick</span><span>✍ Signed by hiker folk</span><span>📍 On the spot</span><span>👍 Useful tips</span><span>🛂 Your passport</span></div>
      <p class="wf-login">Already folk? <button type="button" class="text-link" id="wfLogin">Log in</button> · <a class="text-link" href="#guide-spots">How it works</a></p>
    </section>`;
  }
  // presentazione sotto la mappa, solo per chi non è ancora entrato: cos'è SpotFolk e perché entrare
  function aboutHtml() {
    const inside = !guest || !!session;   // chi è già dentro: stessa spiegazione, senza inviti a iscriversi
    const FOLK = [["photo", "Photo", "photo.jpg", "You chase the light."], ["hike", "Hiker", "hike.jpg", "You go where the road ends."],
      ["slow", "Backpacker", "slow.jpg", "Slow, cheap and curious."], ["road", "Road trip", "road.jpg", "The drive is the destination."],
      ["nomad", "Nomad", "nomad.jpg", "Work from wherever the view is."], ["food", "Foodie", "food.jpg", "Trips planned around a plate."]];
    return `<div class="wfa" aria-label="What SpotFolk is">
      <section class="wfa-blk wfa-folk" id="wfaFolk">
        <p class="wfa-kick">You don't join as a user</p>
        <h2 class="wfa-h2">Which folk <em>are you?</em></h2>
        <p class="wfa-lead">Pick the way you travel. Your folk becomes your voice on the map: the places you sign carry its mark, and people who travel like you find them.</p>
        <div class="wfa-folks">${FOLK.map(([k, n, img, line]) => inside
          ? `<div class="wfa-f is-static"><span class="wfa-ring"><img src="img/wf/${img}" alt="" loading="lazy" width="120" height="120"></span><b>${n}</b><small>${line}</small></div>`
          : `<button type="button" data-joinfolk="${k}" class="wfa-f"><span class="wfa-ring"><img src="img/wf/${img}" alt="" loading="lazy" width="120" height="120"></span><b>${n}</b><small>${line}</small></button>`).join("")}</div>
      </section>
      <section class="wfa-blk wfa-split" id="wfaTips">
        <div>
          <p class="wfa-kick">What the maps don't tell you</p>
          <h2 class="wfa-h2">Every place has a secret. <em>The folk who went know it.</em></h2>
          <p class="wfa-lead">Which hour, which bench, which trattoria the locals actually use. One line each, from people who stood there. Open a place on the map to read who signed it; become folk to add your own.</p>
        </div>
        <article class="wfa-place" aria-label="Example of a place card">
          <div class="wfa-ph"><img src="img/wf/photo.jpg" alt="The Odle peaks above Val di Funes" loading="lazy" width="900" height="600"><span>Fabio's pick</span></div>
          <div class="wfa-in">
            <b class="wfa-pn">Santa Maddalena viewpoint</b>
            <p class="wfa-tip"><small>Photo folk · on the spot</small><q>Come at first light in October, stand by the wooden fence above the church.</q></p>
            <p class="wfa-tip"><small>Hiker folk · useful</small><q>Park lower down and take the trail through the meadows, twenty minutes.</q></p>
            <p class="wfa-tip"><small>Foodie folk · support local</small><q>The farm below sells cheese and speck, ask for the aged one.</q></p>
            ${inside ? `<p class="wfa-note">Tap a place on the map to read its signatures and tips.</p>` : `<button type="button" class="wfa-btn" id="wfaPeek">Become folk to add yours</button>`}
          </div>
        </article>
      </section>
      <section class="wfa-blk" id="wfaInside">
        <h2 class="wfa-h2">One toolkit for the road, <em>kept alive by its folk.</em></h2>
        <div class="wfa-grid">
          <article><h3>Places</h3><p>Photo spots, points of interest and trekking, with best months, live alerts and protection for fragile places.</p></article>
          <article><h3>Essentials</h3><p>Where to sleep and eat, with real prices, reviews by folk and Support local.</p></article>
          <article><h3>Trips</h3><p>Journeys stop by stop, with how you got there, on the map and on the 3D Earth.</p></article>
          <article class="new"><h3>Pass it on <span>NEW</span></h3><p>Leaving? Sell or give away what you won't take home to the folk arriving after you.</p></article>
          <article><h3>Passport</h3><p>Every place you sign is a stamp. Wanderer, Pathfinder, Trusted, and Local expert in your area.</p></article>
          <article><h3>Field Notes</h3><p>Every folk can write. Stories go into <a href="#journal">Field Notes</a> and the monthly magazine.</p></article>
        </div>
      </section>
      <section class="wfa-blk wfa-steps">
        <h2 class="wfa-h2">Three steps to the fire.</h2>
        <ol>
          <li><span>01</span><b>Pick your folk</b><small>One or more. Sign up with your email in a minute.</small></li>
          <li><span>02</span><b>Sign three places you've been</b><small>That's your welcome. Be the first to sign one and your name stays on it.</small></li>
          <li><span>03</span><b>Get your passport</b><small><span>Stamps, levels, Local expert. The first 100 folk get a founding number for good.</span>${foundersLeft != null && foundersLeft > 0 ? ` <b>${foundersLeft}</b> <span>left.</span>` : ""}</small></li>
        </ol>
      </section>
      <section class="wfa-close" id="wfaCode">
        <h2 class="wfa-h2">The fire is lit. <em>Pull up a seat.</em></h2>
        <p class="wfa-lead">Leave no trace, protect fragile places, respect people, support local, share honestly, be kind. That's the whole code.</p>
        ${inside ? `<button type="button" class="wfa-btn big" id="wfaToMap">Back to the map</button>` : `<button type="button" class="wfa-btn big" id="wfaJoin">Become folk — it's free</button>
        <p class="wfa-log">Already folk? <button type="button" class="text-link" id="wfaLogin">Log in</button></p>`}
      </section>
    </div>`;
  }
  function earthHtml({ searchHtml, userHtml, bannerHtml, tailHtml }) {
    const base = baseSpots();
    const n = k => base.filter(s => s.category === k).length;
    const item = (k, label = CATS[k].label) => `<button type="button" class="sx-item${activeCats.has(k) ? " on" : ""}" data-sxcat="${k}" style="--c:${CATS[k].color}" aria-pressed="${activeCats.has(k)}">
        <span class="sx-ico">${CATS[k].icon}</span><span class="sx-name">${label}</span><small data-sxcount="${k}">${fmtN(n(k))}</small><span class="sx-check" aria-hidden="true"></span></button>`;
    const subOn = k => activeCats.has("spot") && activeSubs.has(k);
    const subItems = () => `<div class="sx-subs">${SUB_KEYS.map(k => `<button type="button" class="sx-item sx-sub${subOn(k) ? " on" : ""}" data-sxsub="${k}" style="--c:${CATS.spot.color}" aria-pressed="${subOn(k)}">
        <span class="sx-name">${SUBS[k].label}</span><small data-sxsubcount="${k}">${fmtN(base.filter(s => s.category === "spot" && spotSub(s) === k).length)}</small><span class="sx-check" aria-hidden="true"></span></button>`).join("")}</div>`;
    const lockItem = (label, ico) => `<button type="button" class="sx-item is-locked" data-sxjoin><span class="sx-ico">${ico}</span><span class="sx-name">${label}</span><span class="sx-lock">${SX_ICON.lock}Members</span></button>`;
    // Support local vale per Places ed Essentials: stesso interruttore, conteggio della sezione
    const supportItem = cats => `<button type="button" class="sx-item${onlySupport ? " on" : ""}" data-onlysupport aria-pressed="${onlySupport}" style="--c:#9fe3c8"><span class="sx-ico">🌱</span><span class="sx-name">Support local</span><small>${spots.filter(x => x.support_local && cats.includes(x.category)).length}</small><span class="sx-check" aria-hidden="true"></span></button>`;
    const body = g => {
      if (g.id === "places") return item("spot", "All places") + subItems() + g.cats.filter(k => k !== "spot").map(k => item(k)).join("") + (!guest && schemaV2 && socialV ? `
        ${supportItem(g.cats)}
        <label class="sx-select">Alerts <select id="alertMode">
          <option value="show"${alertMode === "show" ? " selected" : ""}>Show</option>
          <option value="hide"${alertMode === "hide" ? " selected" : ""}>Hide places with alerts</option>
          <option value="only"${alertMode === "only" ? " selected" : ""}>Only places with alerts</option></select></label>` : "")
        + (commV ? `<button type="button" class="sx-item${onlyFavs ? " on" : ""}" id="onlyFavs" aria-pressed="${onlyFavs}" style="--c:#ff8fb1"><span class="sx-ico">♥</span><span class="sx-name">My spots</span><small>${favs.size}</small><span class="sx-check" aria-hidden="true"></span></button>` : "")
        + `<button type="button" class="sx-item${camsOn ? " on" : ""}" id="camsToggle" aria-pressed="${camsOn}" style="--c:#9ec5ff"><span class="sx-ico">📹</span><span class="sx-name">Live webcams</span><span class="sx-check" aria-hidden="true"></span></button>`;
      if (g.id === "pass") {
        const intro = `<p class="sx-pass-intro">Leaving and can't take it home? Sell it or give it away to the travellers arriving after you: chargers, adapters, tents, guidebooks…</p>`;
        if (guest || !commV) return intro + lockItem("Pass it on", "🎁");
        return intro + `<button type="button" class="sx-item${showPass ? " on" : ""}" id="showPass" aria-pressed="${showPass}" style="--c:#8fe0a8"><span class="sx-ico">${SX_ICON.pass}</span><span class="sx-name">Show on the map</span><small>${livePass().length}</small><span class="sx-check" aria-hidden="true"></span></button>
          <button type="button" class="sx-item" id="passList" style="--c:#8fe0a8"><span class="sx-ico">☰</span><span class="sx-name">All the items</span><span class="sx-go" aria-hidden="true">›</span></button>
          <button type="button" class="sx-pass-cta" id="passAdd">🎁 Sell or give away something</button>`;
      }
      if (g.id === "community") {
        if (guest || !commV) return CLUSTER_KEYS.map(k => lockItem(CLUSTERS[k].folk, CLUSTERS[k].ico)).join("") + lockItem("Local experts", "🧭") + lockItem("Meetups", "👥") + lockItem("Trips", "🧭");
        return CLUSTER_KEYS.map(k => `<button type="button" class="sx-item${showFolks.has(k) ? " on" : ""}" data-showfolk="${k}" aria-pressed="${showFolks.has(k)}" style="--c:${CLUSTERS[k].color}"><span class="sx-ico">${CLUSTERS[k].ico}</span><span class="sx-name">${esc(CLUSTERS[k].folk)}</span><small>${profiles.filter(p => onMapP(p) && pFolkSet(p).includes(k)).length}</small><span class="sx-check" aria-hidden="true"></span></button>`).join("") + `
          <p class="sx-links"><button type="button" class="text-link" id="phList">List</button><button type="button" class="text-link" id="myProfile">${profiles.some(p => p.user_id === myUid()) ? "My community profile" : "Join the community map"}</button>${nodiV && profiles.some(p => p.user_id === myUid()) ? `<button type="button" class="text-link" id="iPosted">📣 I just posted</button>` : ""}</p>
          ${nodiV ? `<button type="button" class="sx-item" id="expList" style="--c:#ffd9a0"><span class="sx-ico">🧭</span><span class="sx-name">Local experts</span><small>${experts.size}</small><span class="sx-go" aria-hidden="true">›</span></button>` : ""}
          ${nodiV && myExpert() ? `<button type="button" class="sx-item" id="myArea" style="--c:#ffd9a0"><span class="sx-ico">🧭</span><span class="sx-name">My area</span><span class="sx-go" aria-hidden="true">›</span></button>` : ""}
          <button type="button" class="sx-item" id="meetList" style="--c:#ffd166"><span class="sx-ico">👥</span><span class="sx-name">Meetups</span><small>${upcomingMeetups().length}</small><span class="sx-go" aria-hidden="true">›</span></button>
          <p class="sx-links"><button type="button" class="text-link" id="meetAdd">＋ Organise a meetup</button></p>
          ${signV && clusterV ? `<button type="button" class="sx-item" id="folkCollections" style="--c:#ffd27a"><span class="sx-ico">📚</span><span class="sx-name">Collections by folk</span><span class="sx-go" aria-hidden="true">›</span></button>
          <button type="button" class="sx-item" id="folkLocal" style="--c:#ffd27a"><span class="sx-ico">🏅</span><span class="sx-name">Folk of this area</span><span class="sx-go" aria-hidden="true">›</span></button>` : ""}
          ${tripsV ? `<button type="button" class="sx-item${showTrips ? " on" : ""}" id="showTrips" aria-pressed="${showTrips}" style="--c:#ff9f6e"><span class="sx-ico">${TRIP_ICON}</span><span class="sx-name">Trips</span><small>${fmtN(trips ? trips.length : tripCount)}</small><span class="sx-check" aria-hidden="true"></span></button>
          <p class="sx-links"><button type="button" class="text-link" id="tripList">List</button><button type="button" class="text-link" id="tripAdd">＋ Add a trip</button></p>` : ""}
`;
      }
      if (g.id === "essentials") return g.cats.map(k => item(k)).join("") + (!guest && schemaV2 && socialV ? supportItem(g.cats) : "");
      return g.cats.map(k => item(k)).join("");
    };
    const groups = SX_GROUPS.filter(g => g.id !== "pass" || guest || !commV || passV).map(g => {
      const open = sxOpen.has(g.id), on = g.cats.some(k => activeCats.has(k)) || (g.id === "community" && showFolks.size > 0) || (g.id === "pass" && showPass && !guest && commV);
      const count = g.cats.reduce((a, k) => a + n(k), 0);
      return `<section class="sx-group${open ? " open" : ""}${on ? " on" : ""}" data-g="${g.id}">
        <button type="button" class="sx-ghead" data-sxg="${g.id}" aria-expanded="${open}">
          <span class="sx-gico">${SX_ICON[g.id]}</span>
          <span class="sx-gtext"><b>${g.title}</b><small>${g.sub}</small></span>${g.isNew && todayISO() <= g.isNew ? `<span class="sx-new">New</span>` : ""}
          ${g.cats.length ? `<span class="sx-gcount" data-sxgcount="${g.id}">${fmtN(count)}</span>` : ""}
          <span class="sx-chev" aria-hidden="true"></span>
        </button>
        <div class="sx-gbody">${body(g)}</div>
      </section>`;
    }).join("");
    return `<div class="sx">
      <aside class="sx-side">
        <p class="sx-kick"><img class="sx-logo" src="img/spotfolk-logo.png" alt="SpotFolk" width="640" height="365"></p>
        <a class="sx-home" href="https://spotfolk.eu" target="_blank" rel="noopener">spotfolk.eu ↗</a>
        <h2 class="sx-title">${SF_LOOK ? "The map, <em>signed by the folk.</em>" : "Explore the Earth"}</h2>
        <p class="sx-lead">${esc(DOOR_LEAD[doorNow()] || "Made by its community: travellers like you share, sign and review the places worth the trip, and look after them.")}</p>
        <div class="sx-panel">
          ${guest && !session ? welcomeHtml() : ""}
          ${SF_LOOK ? `<div class="sf-quick${!guest && (schemaV2 || admin) ? " two" : ""}"><button type="button" class="sf-near" id="sfNear">${SX_ICON.near}<span>Places near me</span></button>${!guest && (schemaV2 || admin) ? `<button type="button" class="sf-near sf-addplace" id="sfAddPlace">${ICON_PLUS}<span>Add a place</span></button>` : ""}</div>` : ""}
          <a class="sf-hubdoor" href="#hub"><span aria-hidden="true">👥</span><span><b>The Folk Hub</b><small>what the folk are bringing to the map</small></span><em aria-hidden="true">→</em></a>
          ${searchHtml}
          <div class="onb-folk" id="onbFolk" hidden></div>
          <div class="sx-groups">${groups}</div>
          <div class="sx-foot">
            <span>${ICON.pin}<span id="spotsCount"></span></span>
            <a class="text-link" href="#guide-spots">How it works</a>
          </div>
        </div>
        <div class="sx-user">${userHtml}</div>
        <p class="sx-more">
          ${!guest && schemaV2 && socialV ? `<button type="button" class="text-link" id="openConduct">Community code</button>` : ""}
          <a class="text-link" href="guides/spots-quick-guide.pdf" target="_blank" rel="noopener">📄 SpotFolk in one page</a>
          <button type="button" class="text-link sx-switch" id="sxToClassic">Use the classic map</button>
          ${admin && !guest ? `<button type="button" class="text-link" id="sxExport" title="Admin only: download the spots in the current map view">⬇ Export this area (CSV)</button>` : ""}
        </p>
      </aside>
      <div class="sx-stage spots-stage" data-mode="${viewMode}">
        <div id="spotsMap" class="map map-spots" aria-label="Map of photo spots"></div>
        <div class="sx-globe-slot" id="sxGlobeSlot"></div>
        <div class="sx-ctrl">
          <button type="button" class="sx-btn sx-searchbtn" id="sxSearch" title="Search" aria-label="Search a spot or a place"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></button>
          <button type="button" class="sx-btn is-gold" id="sxNear" title="Spots near me" aria-label="Find spots near me">${SX_ICON.near}</button>
          <div class="sx-zoom"><button type="button" class="sx-btn" id="sxIn" aria-label="Zoom in">+</button><button type="button" class="sx-btn" id="sxOut" aria-label="Zoom out">−</button></div>
          <button type="button" class="sx-btn" id="sxHome" title="The whole Earth" aria-label="Back to the whole Earth">${SX_ICON.target}</button>
          <button type="button" class="sx-btn" id="sxFull" title="Full screen" aria-label="Full screen">${SX_ICON.full}</button>
          <button type="button" class="sx-btn pf-sx" id="sxPf" title="Photo forecast: the next 7 days" aria-label="Photo forecast"><span aria-hidden="true">✨</span><b class="pf-badge" hidden></b></button>
        </div>
        <div class="sx-modes" role="group" aria-label="Map view">
          ${[["globe", "Globe"], ["sat", "Satellite"], ["terrain", "Terrain"]].map(([k, l]) => `<button type="button" data-sxmode="${k}" class="${viewMode === k ? "on" : ""}" aria-pressed="${viewMode === k}">${SX_ICON[k]}<span>${l}</span></button>`).join("")}
        </div>
        ${schemaV2 && OSM_SUGGEST ? `<button type="button" class="osm-scan" id="osmScan">${ICON_SCAN}Scan this area</button>` : ""}
        <p class="sx-hint" id="sxHint" hidden></p>
        <div class="sx-sheet" id="sxSheet"></div>
      </div>
    </div>
    ${aboutHtml()}
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
    // sul globo la mappa piana è nascosta: le sue foto satellitari si scaricano solo quando si scende (il globo parte prima)
    if (ui === "earth" && viewMode === "globe" && !globeFailed && !map._fcFlat) return;
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
    globe.on("load", syncGlobeTrips);
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
      if (tripEd) return;   // mentre si disegna un itinerario il tocco aggiunge tappe
      const r = el.getBoundingClientRect(), ll = m.containerPointToLatLng([start.x - r.left, start.y - r.top]);
      const lat = ll.lat, lon = L.Util.wrapNum(ll.lng, [-180, 180], true);
      try { navigator.vibrate?.(15); } catch {}
      pop?.remove();
      const box = document.createElement("div");
      box.className = "lp-add";
      box.innerHTML = guest
        ? `<button type="button" class="lp-add-btn">Log in to add a spot here</button><small>${lat.toFixed(5)}, ${lon.toFixed(5)}</small>`
        : `<button type="button" class="lp-add-btn">＋ Add a spot here</button>${passV && commV ? `<button type="button" class="lp-add-btn lp-pass" data-lppass>🎁 Pass it on here</button>` : ""}${commV ? `<button type="button" class="lp-add-btn lp-meet" data-lpmeet>👥 Meet up here</button>` : ""}<button type="button" class="lp-add-btn lp-dest" data-lpdest>🧭 My next destination</button><small>${lat.toFixed(5)}, ${lon.toFixed(5)}${m.getZoom() < 12 ? " · zoom in for a precise point" : ""}</small>`;
      pop = L.popup({ closeButton: true, autoPan: true, closeOnClick: false, className: "lp-pop", offset: [0, -6] }).setLatLng([lat, lon]).setContent(box).openOn(m);
      box.querySelector("[data-lppass]")?.addEventListener("click", () => { m.closePopup(pop); withConduct(() => openPassOn({ lat, lon, exact: true })); });
      box.querySelector("[data-lpdest]")?.addEventListener("click", () => { m.closePopup(pop); openDestForm({ lat, lon }); });
      box.querySelector("[data-lpmeet]")?.addEventListener("click", () => { m.closePopup(pop); withConduct(() => openMeetup({ lat, lon })); window.fcTrack?.("Spots: meetup from the map"); });
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
    if (!map._fcFlat) { map._fcFlat = true; applyBase(); }
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
      if (viewMode === "globe" && !onGlobe && !handing && !tripEd && map.getZoom() <= FLAT_TO_GLOBE) { const c = map.getCenter(); toGlobe([c.lat, c.lng], map.getZoom() - 1); }
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
        sec.classList.toggle("on", g.cats.some(c => activeCats.has(c)) || (g.id === "community" && showFolks.size > 0));
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
    $("#sfNear")?.addEventListener("click", locateMe);
    $("#sxIn")?.addEventListener("click", () => onGlobe ? globe.zoomIn() : map.zoomIn());
    $("#sxOut")?.addEventListener("click", () => onGlobe ? globe.zoomOut() : map.zoomOut());
    $("#sxHome")?.addEventListener("click", () => { if (viewMode !== "globe") setViewMode("globe"); else if (onGlobe) globe.flyTo({ zoom: earthZoom(), duration: 1400 }); else { const c = map.getCenter(); toGlobe([c.lat, c.lng], Math.min(map.getZoom() - 1, 5), true); } });
    $("#sxToClassic")?.addEventListener("click", () => { ui = "classic"; lsSet(UI_KEY, ui); onGlobe = false; renderApp(); });
    $("#sxExport")?.addEventListener("click", exportArea);
    $("#sxFull")?.addEventListener("click", () => document.querySelector(".sx-stage .map-full-ctrl a")?.click());
    // full screen: the search comes onto the map (the same search box, moved over the map and back)
    let searchHome = null;
    const searchBack = () => { const box = $("#spotsSearch"); if (box && searchHome && box.classList.contains("in-stage")) { box.classList.remove("in-stage"); searchHome.parent.insertBefore(box, searchHome.next); } searchHome = null; $("#sxSearch")?.classList.remove("on"); };
    $("#sxSearch")?.addEventListener("click", () => {
      const box = $("#spotsSearch"), stg = stageEl(); if (!box || !stg) return;
      if (box.classList.contains("in-stage")) return searchBack();
      searchHome = { parent: box.parentNode, next: box.nextSibling };
      box.classList.add("in-stage"); stg.appendChild(box); $("#sxSearch")?.classList.add("on");
      setTimeout(() => $("#spotsQuery")?.focus(), 50);
      window.fcTrack?.("Spots: search on the full map");
    });
    const st = stageEl();
    let wasFull = st?.classList.contains("map-full");
    if (st) new MutationObserver(() => {
      const full = st.classList.contains("map-full"), b = $("#sxFull");
      if (full === wasFull) return;   // solo quando cambia lo schermo intero
      wasFull = full;
      if (b) { b.innerHTML = full ? SX_ICON.fullExit : SX_ICON.full; b.title = full ? "Exit full screen" : "Full screen"; b.setAttribute("aria-label", b.title); }
      if (!full) searchBack();
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
        el.setAttribute("aria-label", trS("{n} places").replace("{n}", n));
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
    setTimeout(sfState, 0);
    document.documentElement.classList.remove("sf-on-me");
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
          <a class="outline-link spots-add me-link" href="#me">◉ My profile</a>
          ${admin ? `<button class="outline-link spots-add req-btn${pendingMembers.length + openFlags ? " has" : ""}" type="button" id="spotsRequests">Admin <b>${pendingMembers.length + openFlags}</b></button>` : ""}
          ${schemaV2 || admin ? `<button class="outline-link spots-add" type="button" id="spotsAdd">${ICON_PLUS}Add a place</button>` : ""}
          ${admin ? `<button class="text-link" type="button" id="spotsImport">${ICON_UPLOAD}Importa da Google Maps</button>` : ""}
          <span class="spots-email">${esc(email)}</span>
          <button class="text-link" type="button" id="spotsLogout">Log out</button>`}
        </div>
`;
    const bannerHtml = `
      ${guest && session ? `<div class="guest-banner pending-banner">${LOCK_SVG}<p>${esc(pendingText())}</p></div>` : ""}
      ${pendingMode ? `<div class="guest-banner pending-banner in"><p><strong>Welcome, folk!</strong> Explore everything. Signing, reviews and adding places unlock in a moment: reload the page if they don't.</p></div>` : ""}
      ${guest && !session ? `<div class="guest-banner">${LOCK_SVG}<p>${guestLoading || !spots.length ? `<strong>${guestLoading ? "Loading the shared spots…" : "The community map"}</strong>
          Open any place to read who signed it, the stories and the photos. Folk see the whole map, and sign, share and add their own.
          <em>Membership is free:</em> <a href="#join">join in a minute</a>.` : (() => {
          const tr = window.I18N ? I18N.t("GUEST_BANNER2") : "GUEST_BANNER2";
          const tpl = tr !== "GUEST_BANNER2" ? tr : `<strong>You're seeing {n} of {total} places</strong>: open any of them to read who signed it, the stories and the photos.
          Folk see the whole map, and sign, share and add their own.
          <em>Membership is free:</em> <a href="#join">join in a minute</a>.`;
          return tpl.replace("{n}", fmtN(spots.length)).replace("{total}", fmtN(Math.max(publicTotal, spots.length)));
        })()}</p>
          <button type="button" class="outline-link" id="guestJoin">JOIN FREE <span aria-hidden="true">→</span></button>
          <a class="text-link guest-guide" href="#guide-spots">How SpotFolk works</a> <a class="text-link guest-guide" href="guides/spots-quick-guide.pdf" target="_blank" rel="noopener">📄 One-page guide</a></div>` : ""}
`;
    const tailHtml = `
      <section class="spots-around" id="spotsAround" aria-live="polite" hidden>
        <header class="around-head">
          <div><span class="eyebrow" id="aroundEyebrow"></span><h2 id="aroundTitle"></h2></div>
          <label class="near-radius">Within
            <select id="nearKm">${RADII.map(k => `<option value="${k}"${k === nearKm ? " selected" : ""}>${k} km</option>`).join("")}</select></label>
          <button type="button" class="near-close" id="nearClose" aria-label="Close">${ICON.close}</button>
        </header>
        <div class="around-cols">
          <div class="around-col" id="spotsNear"></div>
          ${OSM_SUGGEST ? `<div class="around-col osm-col" id="osmCol"></div>` : ""}
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
      ${pendingMode ? `<div class="guest-banner pending-banner in"><p><strong>Welcome, folk!</strong> Explore everything. Signing, reviews and adding places unlock in a moment: reload the page if they don't.</p></div>` : ""}
      ${guest && !session ? `<div class="guest-banner">${LOCK_SVG}<p>${guestLoading || !spots.length ? `<strong>${guestLoading ? "Loading the shared spots…" : "The community map"}</strong>
          Open any place to read who signed it, the stories and the photos. Folk see the whole map, and sign, share and add their own.
          <em>Membership is free:</em> <a href="#join">join in a minute</a>.` : (() => {
          const tr = window.I18N ? I18N.t("GUEST_BANNER2") : "GUEST_BANNER2";
          const tpl = tr !== "GUEST_BANNER2" ? tr : `<strong>You're seeing {n} of {total} places</strong>: open any of them to read who signed it, the stories and the photos.
          Folk see the whole map, and sign, share and add their own.
          <em>Membership is free:</em> <a href="#join">join in a minute</a>.`;
          return tpl.replace("{n}", fmtN(spots.length)).replace("{total}", fmtN(Math.max(publicTotal, spots.length)));
        })()}</p>
          <button type="button" class="outline-link" id="guestJoin">JOIN FREE <span aria-hidden="true">→</span></button>
          <a class="text-link guest-guide" href="#guide-spots">How SpotFolk works</a> <a class="text-link guest-guide" href="guides/spots-quick-guide.pdf" target="_blank" rel="noopener">📄 One-page guide</a></div>` : ""}
      ${schemaV2 && socialV && !guest ? `<div class="spots-social" role="group" aria-label="Alerts and community">
        <label class="soc-pick">${ICON_ALERT}<span class="sr-only">Alerts</span>
          <select id="alertMode">
            <option value="show"${alertMode === "show" ? " selected" : ""}>Alerts: show</option>
            <option value="hide"${alertMode === "hide" ? " selected" : ""}>Hide places with alerts</option>
            <option value="only"${alertMode === "only" ? " selected" : ""}>Only places with alerts</option>
          </select></label>
        <button type="button" class="filter soc-support${onlySupport ? " active" : ""}" id="onlySupport" aria-pressed="${onlySupport}">🌱 Support local <small>${spots.filter(x => x.support_local).length}</small></button>
        <button type="button" class="text-link" id="openConduct">Community code</button>
        <a class="text-link" href="#guide-spots">How SpotFolk works</a>
        <a class="text-link" href="guides/spots-quick-guide.pdf" target="_blank" rel="noopener">📄 SpotFolk in one page</a>
      </div>` : ""}
      ${commV && !guest ? `<div class="spots-community" role="group" aria-label="Community">
        <button type="button" class="filter comm-btn${onlyFavs ? " active" : ""}" id="onlyFavs" aria-pressed="${onlyFavs}">♥ My spots <small>${favs.size}</small></button>
        <button type="button" class="filter comm-btn" id="meetList">👥 Meetups <small>${upcomingMeetups().length}</small></button>
        <button type="button" class="filter comm-btn" id="meetAdd">＋ Meetup</button>
        ${CLUSTER_KEYS.map(k => `<button type="button" class="filter comm-btn${showFolks.has(k) ? " active" : ""}" data-showfolk="${k}" aria-pressed="${showFolks.has(k)}">${CLUSTERS[k].ico} ${esc(CLUSTERS[k].folk)} <small>${profiles.filter(p => onMapP(p) && pFolkSet(p).includes(k)).length}</small></button>`).join("")}
        <button type="button" class="text-link" id="phList">List</button>
        ${nodiV ? `<button type="button" class="filter comm-btn" id="expList">🧭 Local experts <small>${experts.size}</small></button>` : ""}
        ${nodiV && myExpert() ? `<button type="button" class="filter comm-btn xp-mine" id="myArea">🧭 My area</button>` : ""}
        ${nodiV && profiles.some(p => p.user_id === myUid()) ? `<button type="button" class="filter comm-btn" id="iPosted">📣 I just posted</button>` : ""}
        <button type="button" class="text-link" id="myProfile">${profiles.some(p => p.user_id === myUid()) ? "My community profile" : "Join the community map"}</button>
      </div>` : ""}
      <p class="sx-switch-row"><button type="button" class="text-link sx-switch" id="sxToEarth">🌍 Try the new Earth view</button></p>
      <div class="spots-stage">
        <div id="spotsMap" class="map map-spots" aria-label="Members map of photo spots"></div>
        <span class="hud-frame" aria-hidden="true"></span>
        ${schemaV2 && OSM_SUGGEST ? `<button type="button" class="osm-scan" id="osmScan">${ICON_SCAN}Scan this area</button>` : ""}
      </div>
      ${aboutHtml()}
      <section class="spots-around" id="spotsAround" aria-live="polite" hidden>
        <header class="around-head">
          <div><span class="eyebrow" id="aroundEyebrow"></span><h2 id="aroundTitle"></h2></div>
          <label class="near-radius">Within
            <select id="nearKm">${RADII.map(k => `<option value="${k}"${k === nearKm ? " selected" : ""}>${k} km</option>`).join("")}</select></label>
          <button type="button" class="near-close" id="nearClose" aria-label="Close">${ICON.close}</button>
        </header>
        <div class="around-cols">
          <div class="around-col" id="spotsNear"></div>
          ${OSM_SUGGEST ? `<div class="around-col osm-col" id="osmCol"></div>` : ""}
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
    [$("#spotsJoin"), $("#guestJoin"), $("#wfJoin"), $("#wfaJoin"), $("#wfaPeek")].forEach(b => b?.addEventListener("click", () => { wantJoin = true; render(); root().scrollIntoView({ behavior: "smooth" }); }));
    $$("[data-joinfolk]").forEach(b => b.addEventListener("click", () => {   // scegli il folk e vai all'iscrizione con quel folk già scelto
      try { localStorage.setItem("fcph-joinfolk", b.dataset.joinfolk); } catch {}
      window.fcTrack?.("Spots: log in prompt"); window.fcTrack?.("Wayfolk: folk picked", { folk: b.dataset.joinfolk });
      wantJoin = true; render(); root().scrollIntoView({ behavior: "smooth" });
    }));
    $("#wfaToMap")?.addEventListener("click", () => ($(".sx-stage") || $(".spots-stage") || root()).scrollIntoView({ behavior: "smooth", block: "start" }));
    $("#wfaLogin")?.addEventListener("click", () => { wantLogin = true; wantJoin = false; render(); root().scrollIntoView({ behavior: "smooth" }); });
    $("#wfLogin")?.addEventListener("click", () => { wantLogin = true; wantJoin = false; render(); root().scrollIntoView({ behavior: "smooth" }); });
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
    $("#sfAddPlace")?.addEventListener("click", () => withConduct(() => openAdd()));
    $("#alertMode")?.addEventListener("change", e => { alertMode = e.target.value; drawClusters(); renderNear(); });
    document.querySelectorAll("#onlySupport, [data-onlysupport]").forEach(b => b.addEventListener("click", () => { onlySupport = !onlySupport; renderApp(); }));
    $("#openConduct")?.addEventListener("click", () => showConduct());
    $("#camsToggle")?.addEventListener("click", ev => {
      camsOn = !camsOn; lsSet(CAMS_KEY, camsOn ? "1" : "0");
      ev.currentTarget.classList.toggle("on", camsOn); ev.currentTarget.setAttribute("aria-pressed", camsOn);
      if (camsOn && map && map.getZoom() < CAM_ZOOM) toast("Zoom in to a valley to see the live webcams.");
      window.fcTrack?.(camsOn ? "Spots: webcams layer on" : "Spots: webcams layer off");
      scheduleCams();
    });
    $("#onlyFavs")?.addEventListener("click", () => {
      if (!favs.size && !onlyFavs) return toast("Tap ♡ Save on any place to add it to your spots.");
      onlyFavs = !onlyFavs; renderApp();
    });
    $("#meetList")?.addEventListener("click", openMeetupList);
    $("#passList")?.addEventListener("click", openPassList);
    $("#showTrips")?.addEventListener("click", () => setTrips(!showTrips));
    $("#tripList")?.addEventListener("click", openTripList);
    $("#folkCollections")?.addEventListener("click", () => openCollections());
    $("#folkLocal")?.addEventListener("click", openLocalFolk);
    $("#tripAdd")?.addEventListener("click", () => withConduct(startTrip));
    $("#passAdd")?.addEventListener("click", () => withConduct(() => openPassOn(map ? { lat: map.getCenter().lat, lon: L.Util.wrapNum(map.getCenter().lng, [-180, 180], true), zoom: map.getZoom() } : null)));
    $("#showPass")?.addEventListener("click", () => { showPass = !showPass; const b = $("#showPass"); b.classList.toggle("on", showPass); b.setAttribute("aria-pressed", showPass); drawCommunity(); });
    $("#meetAdd")?.addEventListener("click", () => withConduct(() => openMeetup(map ? { lat: map.getCenter().lat, lon: L.Util.wrapNum(map.getCenter().lng, [-180, 180], true) } : null)));
    // community: ogni folk si accende e si spegne da sé
    $$("[data-showfolk]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.showfolk, on = !showFolks.has(k);
      if (on) showFolks.add(k); else showFolks.delete(k);
      b.classList.toggle("active", on); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
      b.closest(".sx-group")?.classList.toggle("on", showFolks.size > 0 || [...b.closest(".sx-group").querySelectorAll(".sx-item.on")].length > 0);
      drawCommunity();
      if (on) {
        const pts = profiles.filter(p => onMapP(p) && pFolkSet(p).includes(k)).map(p => [p.lat, p.lon]);
        if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 8, duration: .8 });
        else toast(`No ${CLUSTERS[k].folk} on the map yet: be the first!`);
      }
    }));
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
  // «Vicino a me» diviso per tipo di posto, nell'ordine in cui serve in viaggio
  const NEAR_GROUPS = [["Places to eat", ["restaurant"]], ["Places to sleep", ["hotel"]], ["Photo spots & places to see", ["spot"]], ["Trekking", ["trekking"]], ["Experiences", ["experience"]], ["Workshops", ["workshop"]]];
  function renderNear() {
    const el = $("#spotsNear"), box = $("#spotsAround");
    if (!el) return;
    if (!origin) { box.hidden = true; el.innerHTML = ""; aroundDrawer(0); return; }
    box.hidden = false;
    $("#aroundEyebrow").textContent = origin.kind === "me" ? "Near you" : origin.kind === "scan" ? "This area" : "Around";
    $("#aroundTitle").textContent = origin.kind === "me" ? "What's around you" : origin.label;
    const inR = visibleSpots().map(s => ({ s, d: distKm(origin, s) })).filter(o => o.d <= nearKm).sort((a, b) => a.d - b.d);
    const top = inR.length ? inR : nearestSpots(1);
    const where = origin.kind === "me" ? "you" : esc(origin.label);
    const nearItem = ({ s, d }) => `
        <li><button type="button" data-near="${s.id}">
          <span class="sg-cat" style="--c:${(CATS[s.category] || CATS.spot).color}">${(CATS[s.category] || CATS.spot).icon}</span>
          <span class="sg-text"><strong>${esc(s.name)}</strong><small>${(CATS[s.category] || CATS.spot).label}${subLabel(s) ? ` · ${esc(subLabel(s))}` : ""}</small></span>
          <span class="near-d">${fmtKm(d)}</span></button></li>`;
    el.innerHTML = `
      <h3 class="col-title"><span class="col-dot community"></span>From the community</h3>
      <p class="near-sum">${!top.length ? "No spots match the current filters."
        : inR.length ? `<strong>${inR.length}</strong> place${inR.length > 1 ? "s" : ""} within ${nearKm} km`
        : `Nothing within ${nearKm} km of ${where}. The nearest is <strong>${fmtKm(top[0].d)}</strong> away — try a larger radius.`}</p>
      ${inR.length ? NEAR_GROUPS.map(([label, cats]) => { const g = inR.filter(o => cats.includes(o.s.category)); if (!g.length) return "";
        const c = CATS[cats[0]] || CATS.spot;
        return `<details class="near-group" open style="--c:${c.color}"><summary><span class="sg-cat">${c.icon}</span><b>${label}</b><em>${g.length}</em></summary>
          <ol class="near-list">${g.slice(0, 6).map(nearItem).join("")}</ol>
          ${g.length > 6 ? `<details class="near-more"><summary>${esc(trS("Show all {n}").replace("{n}", g.length))}</summary><ol class="near-list">${g.slice(6, 40).map(nearItem).join("")}</ol></details>` : ""}</details>`; }).join("")
        : `<ol class="near-list">${top.map(nearItem).join("")}</ol>`}`;
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
  /* la mappa è solo della community: niente suggerimenti da OpenStreetMap (si riattiva con OSM_SUGGEST = true) */
  const OSM_SUGGEST = false;
  async function scanOsm(o, extent) {
    if (!OSM_SUGGEST) { osmItems = []; drawOsm(); return; }
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
      ${t.description ? `<p class="pop-desc">${ugc(t.description)}</p>` : ""}
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
    photo: { label: "Photo spots", re: /belvedere|panoram|viewpoint|view ?point|lookout|overlook|mirador|aussicht|point de vue|scenic|terrazz|terrace|vista point|sunset point|sunrise point/i },
    poi: { label: "Points of interest", re: /chies|church|[ée]glise|kirche|iglesia|duomo|cattedral|cathedral|basilic|ponte\b|bridge|\bpont\b|br[üu]cke|puente|piazz|square|platz|plaza|\bvia\b|street|\brue\b|stra(ss|ß)e|calle|torre|tower|\btour\b|turm|castell|castle|ch[âa]teau|\bburg\b|palazz|palace|museo|museum|stazione|station|porto\b|harbou?r|\bport\b|\bcity\b|citt[àa]|borgo|village|town|centro|quartier|district|monaster|abbazi|abbey|\bfaro\b|lighthouse|tempi|temple|villa\b|skyline|rooftop|mural|urban|street art/i }
  };
  const SUB_KEYS = Object.keys(SUBS);
  const activeSubs = new Set(SUB_KEYS);
  const subCache = new Map();
  function spotSub(s) {
    if (s.subcategory === "urban" || s.subcategory === "poi") return "poi";
    if (s.subcategory === "viewpoint" || s.subcategory === "nature") return "photo";
    if (subCache.has(s.id)) return subCache.get(s.id);
    const t = `${s.name || ""} ${s.note || ""} ${s.list || ""}`;
    const k = SUBS.photo.re.test(t) ? "photo" : SUBS.poi.re.test(t) ? "poi" : "photo";
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
    camLayer = L.layerGroup().addTo(map); camKey = "";
    addPfControl(); pfKey = ""; if (pfOpen || pfOn) setTimeout(drawPf, 500);
    map.on("moveend", scheduleCams); setTimeout(scheduleCams, 400);
    map.on("popupclose", () => setTimeout(() => { if (commDirty) drawCommunity(); }, 0));
    tripLayer = L.layerGroup().addTo(map); drawTrips();
    if (tripEd) { wireTripMap(); setTimeout(renderTripEd, 0); }
    drawOsm();
    drawOrigin();
    map.on("moveend zoomend", drawClusters);
    if (!guest && (admin || schemaV2)) map.on("contextmenu", e => { if (tripEd || Date.now() - (map._fcLong || 0) < 900) return; withConduct(() => openAdd({ lat: e.latlng.lat, lon: L.Util.wrapNum(e.latlng.lng, [-180, 180], true) })); });
    setupLongPressAdd(map);
    const pts = visibleSpots().map(s => [s.lat, s.lon]);
    if (keep) map.setView(keep.c, keep.z, { animate: false });
    else if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 12, animate: false });
    else map.setView([42.5, 12.5], 5);
    setTimeout(() => { if (map) { map.invalidateSize(); drawClusters(); } }, 30);
    if (ui === "earth") earthAfterBuild();
  }

  /* raggruppa gli spot vicini (griglia in pixel), solo quelli nell'area visibile */
  /* links to one place (spotfolk.eu/?place=123): shared by the folk, they open that place's card.
     ?via=<member> remembers who invited, and goes with the sign-up. */
  let deepPlace = null, deepShare = null;
  try {
    const q = new URLSearchParams(location.search);
    deepPlace = +q.get("place") || null;
    const via = q.get("via");
    if (via && /^[0-9a-f-]{36}$/i.test(via)) localStorage.setItem("sf-via", via);
    for (const k of ["trip", "list", "passport"]) { const v = q.get(k); if (v && /^[0-9a-f-]{36}$/i.test(v)) deepShare = { kind: k, token: v }; }
    if (deepPlace || via || deepShare) { q.delete("place"); q.delete("via"); q.delete("trip"); q.delete("list"); q.delete("passport"); const qs = q.toString(); history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + (location.hash || "#spotfolk")); }
  } catch {}
  function openDeepPlace() {
    if (!deepPlace || !map || !spots.length || (!loaded && !guestLoaded)) return;
    const id = deepPlace, s = spots.find(x => x.id === id);
    if (!s && guestLoading) return;
    deepPlace = null;
    if (s) { $("#spotsMap")?.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => focusSpot(s), 400); window.fcTrack?.("Spots: shared place opened"); }
    else if (guest && !session) { toast("This place is on the folk's map: join free to open it."); window.fcTrack?.("Spots: shared place needs joining"); }
    else toast("That place isn't on the map anymore, or it's in a filter you've hidden.");
  }
  const placeLink = s => `https://spotfolk.eu/?place=${s.id}&utm_source=share${myUid() && !guest ? `&via=${myUid()}` : ""}`;
  async function sharePlace(s, invite = false) {
    const url = placeLink(s);
    const text = invite ? `I signed ${s.name} on SpotFolk. You were there too: sign it with me.` : `${s.name}, signed by the folk on SpotFolk.`;
    window.fcTrack?.(invite ? "Spots: invite sent" : "Spots: place shared");
    try { if (navigator.share) return await navigator.share({ title: s.name, text, url }); } catch (err) { if (err?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast("Link copied: paste it wherever you like."); } catch { prompt("Copy this link:", url); }
  }
  /* ---------- links to a trip or to a list of saved places (supabase-condivisioni.sql) ----------
     The author makes the link and can withdraw it. Visitors see the whole trip; of a list, the places of the public selection
     in full and only the area of the others. */
  const IT_ = () => window.I18N?.lang === "it";
  const shareUrl = (kind, token) => `https://spotfolk.eu/?${kind}=${token}#spotfolk`;
  async function shareDialog(kind, ref, label) {
    const EB = kind === "trip" ? "Share your trip" : kind === "passport" ? "Share your passport" : "Share your list";
    const d = dlg("shareDialog", `<div class="import-body"><span class="eyebrow">${EB}</span><h2>${esc(label)}</h2><p class="gate-note">Making the link…</p></div>`);
    let token;
    try { ({ data: token } = await api("/rest/v1/rpc/share_create", { method: "POST", body: { p_kind: kind, p_trip: kind === "trip" ? ref : null, p_list: kind === "list" ? ref : "" } })); }
    catch (err) { d.querySelector(".gate-note").textContent = /function|schema cache/i.test(err.message) ? "Sharing arrives once the database is updated (supabase-condivisioni.sql)." : `Could not make the link: ${err.message}`; return; }
    const url = shareUrl(kind, token);
    d.querySelector(".import-body").innerHTML = `<span class="eyebrow">${EB}</span><h2>${esc(label)}</h2>
      <p class="gate-help left">${kind === "trip" ? "Anyone with the link sees this trip on the map, stop by stop, with your name." : kind === "passport" ? "Anyone with the link sees your passport: your name, your folk, your signatures and stamps. Places outside the public map show only for members; fragile places stay hidden." : "Anyone with the link sees this list with your name: the places of the public map in full, the others only by area (members see them all). Fragile places stay hidden."}</p>
      <input class="share-url" id="shareUrl" readonly value="${esc(url)}" aria-label="Link">
      <div class="pop-actions"><button type="button" class="pop-btn primary" data-sharego>↗ Share</button><button type="button" class="pop-btn" data-sharecopy>Copy link</button></div>
      <button type="button" class="text-link" data-shareoff>Stop sharing: the link stops working</button>`;
    const inp = d.querySelector("#shareUrl"); inp.addEventListener("focus", () => inp.select());
    d.querySelector("[data-sharego]").addEventListener("click", async () => {
      try { if (navigator.share) { await navigator.share({ title: label, text: kind === "trip" ? `${label}: my trip on SpotFolk` : kind === "passport" ? "My SpotFolk passport: the places I signed" : `${label}: my places on SpotFolk`, url }); return; } } catch (err) { if (err?.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(url); toast("Link copied: paste it wherever you like."); } catch { inp.focus(); }
    });
    d.querySelector("[data-sharecopy]").addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); toast("Link copied: paste it wherever you like."); } catch { inp.focus(); } });
    d.querySelector("[data-shareoff]").addEventListener("click", async ev => {
      const b = ev.currentTarget; if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Tap again to stop sharing"; return; }
      try { await api(`/rest/v1/shared_links?token=eq.${token}`, { method: "DELETE" }); d.close(); toast("Link withdrawn: it doesn't open anything anymore."); window.fcTrack?.(`Share: ${kind} withdrawn`); }
      catch (err) { toast(`Could not withdraw it: ${err.message}`, true); }
    });
    window.fcTrack?.(`Share: ${kind} link made`);
  }
  async function openDeepShare() {
    if (!deepShare || !map || (!loaded && !guestLoaded)) return;
    const ds = deepShare; deepShare = null;
    let r = null; try { ({ data: r } = await api("/rest/v1/rpc/shared_get", { method: "POST", body: { p_token: ds.token } })); } catch {}
    if (!r) { toast("This link isn't shared anymore."); return; }
    window.fcTrack?.(`Share: ${r.kind} opened`);
    if (r.kind === "trip" && r.trip?.stops?.length >= 2) {
      if (session && !guest) await loadTrips();
      const t = { ...r.trip, _shared: true };
      if (!Array.isArray(trips)) trips = [];
      if (!trips.some(x => x.id === t.id)) trips.unshift(t);
      showTrips = true; drawTrips(); focusTrip(t);
      return;
    }
    if (r.kind === "list") openSharedList(r);
    if (r.kind === "passport") openSharedPassport(r);
  }
  function openSharedPassport(r) {
    const it = IT_(), pp = { ...(r.passport || {}) };
    pp.stamps = (pp.stamps || []).filter(t => t.id != null && t.lat != null && t.lon != null);   // places that can't be shown count, but stay off the map
    const face = r.avatar ? `<img src="${esc(avatarUrl(r.avatar))}" alt="">` : `<span>${esc(initials(r.author || "Folk"))}</span>`;
    const d = dlg("sharedPassDialog", `<div class="import-body">
      <div class="sp-head"><span class="me-avatar" style="--s:64px">${face}</span><div><span class="eyebrow">${it ? "Il passaporto di" : "The passport of"}</span><h2>${esc(r.author || "a folk")}</h2></div></div>
      ${passportHtml(pp, null)}
      ${guest || !session ? `<div class="pop-actions"><a class="pop-btn primary" href="#join">${it ? "Fai il tuo passaporto — diventa folk" : "Start your passport — become folk"}</a></div>` : ""}
    </div>`);
    wireStamps(d, () => d.close());
  }
  function openSharedList(r) {
    const items = r.items || [], open = items.filter(i => i.open && i.lat != null), shut = items.length - open.length;
    const title = r.title || (IT_() ? "Posti salvati" : "Saved places");
    const d = dlg("sharedListDialog", `<div class="import-body">
      <span class="eyebrow">📍 ${esc(IT_() ? "Una lista di" : "A list by")} ${esc(r.author || "a folk")}</span><h2>${esc(title)}</h2>
      <p class="gate-help left">${items.length} ${IT_() ? (items.length === 1 ? "posto" : "posti") : items.length === 1 ? "place" : "places"}</p>
      <ul class="req-list">${items.map(i => i.open ? `<li class="req-row"><div><b>${esc(i.name)}</b><span>${esc((CATS[i.category] || CATS.spot).label)}${i.zone ? ` · ${esc(i.zone)}` : ""}</span></div><button type="button" class="pop-btn" data-goto="${i.spot_id}">${ICON.pin}${IT_() ? "Apri" : "Open"}</button></li>`
        : `<li class="req-row"><div><b>🔒 ${esc(IT_() ? "Un posto dei folk" : "A folk place")}</b><span>${esc(i.zone || "")}</span></div></li>`).join("")}</ul>
      ${shut && (guest || !session) ? `<p class="gate-help left">${esc(IT_() ? `${shut} ${shut === 1 ? "posto è" : "posti sono"} sulla mappa dei folk: iscriviti gratis per vederli.` : `${shut} ${shut === 1 ? "place is" : "places are"} on the folk's map: join free to see ${shut === 1 ? "it" : "them"}.`)}</p>` : ""}
      <div class="pop-actions">
        ${open.length > 1 ? `<button type="button" class="pop-btn" data-showall>${ICON.pin}${IT_() ? "Mostra sulla mappa" : "Show on the map"}</button>` : ""}
        ${session && !guest ? `<button type="button" class="pop-btn primary" data-saveall>♡ ${IT_() ? "Salva nei miei posti" : "Save to my places"}</button>` : `<a class="pop-btn primary" href="#join">${IT_() ? "Diventa folk — è gratis" : "Become folk — free"}</a>`}
      </div></div>`);
    d.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => { d.close(); deepPlace = +b.dataset.goto; openDeepPlace(); }));
    d.querySelector("[data-showall]")?.addEventListener("click", () => { d.close(); $("#spotsMap")?.scrollIntoView({ behavior: "smooth", block: "center" }); const go = () => map.flyToBounds(L.latLngBounds(open.map(i => [i.lat, i.lon])).pad(0.2), { maxZoom: 13, duration: .9 }); if (onGlobe) toFlat(null); go(); });
    d.querySelector("[data-saveall]")?.addEventListener("click", async ev => {
      const b = ev.currentTarget; b.disabled = true;
      try { await api("/rest/v1/spot_favorites", { method: "POST", headers: { Prefer: "return=minimal,resolution=ignore-duplicates" }, body: open.map(i => ({ spot_id: i.spot_id, ...(profV ? { list_name: title.slice(0, 60) } : {}) })) });
        open.forEach(i => favs.add(i.spot_id)); b.textContent = `♥ ${IT_() ? "Salvati" : "Saved"}`; window.fcTrack?.("Share: list saved"); }
      catch (err) { b.disabled = false; toast(`Could not save: ${err.message}`, true); }
    });
  }

  /* ---------- «Share to your story»: a 1080×1920 picture of the place for Instagram stories, drawn on the phone (no photos, only the site) ---------- */
  async function storyImage(s, card) {
    const it = IT_(), W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    try { await document.fonts.ready; await Promise.all([document.fonts.load("600 120px 'Cormorant Garamond'"), document.fonts.load("italic 500 60px 'Cormorant Garamond'"), document.fonts.load("500 40px 'DM Sans'"), document.fonts.load("700 30px 'DM Sans'")]); } catch {}
    const SERIF = "'Cormorant Garamond', Georgia, serif", SANS = "'DM Sans', system-ui, sans-serif";
    let bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0b1626"); bg.addColorStop(1, "#050b14"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    let rg = g.createRadialGradient(W * .85, 0, 0, W * .85, 0, 1000); rg.addColorStop(0, "rgba(242,140,30,.30)"); rg.addColorStop(1, "rgba(242,140,30,0)"); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    rg = g.createRadialGradient(0, H, 0, 0, H, 900); rg.addColorStop(0, "rgba(90,140,255,.18)"); rg.addColorStop(1, "rgba(90,140,255,0)"); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    let seed = s.id * 9301 + 49297; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${.15 + rnd() * .45})`; g.beginPath(); g.arc(rnd() * W, rnd() * H * .7, rnd() * 2 + .6, 0, 7); g.fill(); }
    const wrap = (text, x, y, maxW, lh, maxLines = 4) => { const words = String(text).split(/\s+/); let line = "", n = 0; for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines - 1) { line = words.slice(words.indexOf(w)).join(" "); while (g.measureText(line + "…").width > maxW && line.length) line = line.slice(0, -1); if (line !== words.slice(words.indexOf(w)).join(" ")) line += "…"; break; } } else line = t; } if (line) { g.fillText(line, x, y); y += lh; } return y; };
    const logo = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = "img/spotfolk-logo.png"; });
    if (logo) g.drawImage(logo, 90, 120, 200, 200 * logo.height / logo.width);
    const cat = CATS[s.category] || CATS.spot;
    g.fillStyle = "#ffbe7a"; g.font = `700 30px ${SANS}`; g.letterSpacing = "6px"; g.fillText(`${cat.label}${s.list ? ` · ${s.list}` : ""}`.toUpperCase().slice(0, 48), 90, 420); g.letterSpacing = "0px";
    const big = String(s.name).length > 24; g.fillStyle = "#f2f6fb"; g.font = `600 ${big ? 104 : 128}px ${SERIF}`; let y = wrap(s.name, 90, 545, W - 180, big ? 108 : 130, 3);
    // what the folk know, read from the card as it is on screen: conditions, impressions, before you go, stories
    const txt = q => card?.querySelector(q)?.textContent.replace(/\s+/g, " ").trim() || "";
    const cond = card?.querySelector("[data-condtop]:not([hidden])") ? txt("[data-condtop]") : "";
    const score = txt(".pc-ring b").replace("/5", ""), raters = txt(".pc-ring span:last-child");
    const facts = [...(card?.querySelectorAll(".byg-item") || [])].slice(0, 2).map(f => `${f.querySelector(".byg-h b")?.textContent.trim() || ""}: ${f.querySelector(".byg-val")?.textContent.replace(/\s+/g, " ").trim() || f.querySelector(".byg-note")?.textContent.trim() || ""}`.replace(/:\s*$/, ""));
    const stories = [...(card?.querySelectorAll(".pc-text") || [])];
    // a story's words leave SpotFolk only when the place is already public to everyone (the viewer is a visitor) or the story is yours
    const mineStory = stories.find(p => p.closest("[data-mine], .mine"));
    const quoteEl = (guest || !session) ? stories[0] : mineStory;
    const quote = quoteEl ? quoteEl.textContent.replace(/\s+/g, " ").trim() : "";
    const signs = signMap.get(s.id)?.total || 0;
    y += 30;
    const LIMIT = H - 330, room = () => y < LIMIT - 120;
    const linesOf = (text, maxW, max) => { const out = []; let line = ""; for (const w of String(text).split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line);
      if (out.length > max) { out.length = max; let l = out[max - 1]; while (g.measureText(l + "…").width > maxW && l.length) l = l.slice(0, -1); out[max - 1] = l + "…"; } return out; };
    const box = (title, items, color, big, perItem = 2) => {
      const fs = big ? 46 : 38, lh = big ? 58 : 50; g.font = `500 ${fs}px ${SANS}`;
      const L = items.flatMap(t => linesOf(t, W - 280, perItem)).slice(0, 4), h = 100 + L.length * lh;
      if (y + h > LIMIT) return false;
      g.fillStyle = "rgba(255,255,255,.05)"; g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.roundRect(90, y, W - 180, h, 34); g.fill(); g.stroke();
      g.fillStyle = color; g.font = `700 27px ${SANS}`; g.letterSpacing = "4px"; g.fillText(title.toUpperCase(), 136, y + 60); g.letterSpacing = "0px";
      g.fillStyle = "#f2f6fb"; g.font = `500 ${fs}px ${SANS}`; L.forEach((l, k) => g.fillText(l, 136, y + 118 + k * lh)); y += h + 24; return true; };
    if (cond) box(it ? "Com'è adesso" : "How it is now", [cond], "#ff7a45", true);
    if (facts.length && room()) box("Before you go", facts, "#9fe3c8", false, 1);
    if (score && room()) box(it ? "Le impressioni dei folk" : "Folk impressions", [`⛰ ${score}/5 · ${raters}`], "#ffbe7a");
    if (quote && room()) { g.font = `italic 500 50px ${SERIF}`; const L = linesOf(`“${quote}”`, W - 180, 3); if (y + 20 + L.length * 60 <= LIMIT) { g.fillStyle = "#f3e6d6"; L.forEach((l, k) => g.fillText(l, 90, y + 50 + k * 60)); y += 40 + L.length * 60; } }
    else if (stories.length && room()) box("Folk stories", [it ? `${stories.length} ${stories.length === 1 ? "storia" : "storie"} di chi c'è stato` : `${stories.length} ${stories.length === 1 ? "story" : "stories"} from folk who've been`], "#e9a6ff");
    if (!cond && !score && !facts.length && !stories.length) box(it ? "Sei stato qui?" : "Been here?", [it ? "Racconta ai folk com'è adesso: tariffe, neve, mare, folla." : "Tell the folk how it is now: fees, snow, sea, crowds."], "#ffbe7a");
    g.font = `500 38px ${SANS}`; g.fillStyle = "#c9d6e6";
    if (s.best_months && y + 60 <= LIMIT) { g.fillText(`📅 ${it ? "Periodo migliore" : "Best period"}: ${s.best_months}`.slice(0, 60), 90, y + 30); y += 62; }
    if (signs && y + 60 <= LIMIT) { g.fillText(`✍ ${it ? `Firmato da ${signs} folk` : `Signed by ${signs} folk`}`, 90, y + 30); y += 62; }
    if (y + 90 < H - 300) { g.fillStyle = "#f2f6fb"; g.font = `italic 500 64px ${SERIF}`; g.fillText(it ? "La mappa, firmata dai folk." : "The map, signed by the folk.", 90, Math.max(y + 90, H - 400)); }
    g.fillStyle = "#f28c1e"; g.beginPath(); g.roundRect(90, H - 270, 560, 110, 55); g.fill();
    g.fillStyle = "#1a1206"; g.font = `800 46px ${SANS}`; g.fillText("spotfolk.eu", 150, H - 198);
    g.fillStyle = "#8a99ab"; g.font = `500 30px ${SANS}`; g.fillText(it ? "Apri il posto dal link nella storia" : "Open the place from the link in the story", 90, H - 110);
    return new Promise(res => c.toBlob(b => res(b), "image/png"));
  }
  async function shareStory(s, card, btn) {
    btn.disabled = true; const old = btn.innerHTML; btn.textContent = "…";
    try {
      const blob = await storyImage(s, card), name = `spotfolk-${(s.name || "place").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.png`;
      const file = new File([blob], name, { type: "image/png" }), url = placeLink(s);
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: s.name, text: url }); window.fcTrack?.("Spots: story shared"); } catch (err) { if (err?.name !== "AbortError") throw err; }
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        try { await navigator.clipboard.writeText(url); } catch {}
        toast(IT_() ? "Immagine scaricata e link del posto copiato: aggiungilo come sticker link nella storia." : "Picture downloaded and the place's link copied: add it as a link sticker in your story.");
        window.fcTrack?.("Spots: story downloaded");
      }
    } catch (err) { toast(`Could not make the picture: ${err.message}`, true); }
    btn.disabled = false; btn.innerHTML = old;
  }
  let justSigned = null;

  /* Place pulse: live webcams near the place (Windy, through the «webcams» function on Supabase that keeps the key) */
  let camsV = true;
  const camCache = new Map();
  /* Place pulse: weather now and the next 7 days (Open-Meteo, free, CC BY 4.0) */
  const wxCache = new Map();
  const WX = { 0: ["☀️", "Clear"], 1: ["🌤️", "Mostly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"], 45: ["🌫️", "Fog"], 48: ["🌫️", "Freezing fog"],
    51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌧️", "Heavy drizzle"], 56: ["🌧️", "Freezing drizzle"], 57: ["🌧️", "Freezing drizzle"],
    61: ["🌦️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"], 66: ["🌧️", "Freezing rain"], 67: ["🌧️", "Freezing rain"],
    71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"], 77: ["🌨️", "Snow grains"], 80: ["🌦️", "Showers"], 81: ["🌧️", "Showers"], 82: ["⛈️", "Violent showers"],
    85: ["🌨️", "Snow showers"], 86: ["❄️", "Heavy snow showers"], 95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm, hail"], 99: ["⛈️", "Thunderstorm, hail"] };
  const wxOf = c => WX[c] || ["🌡️", ""];
  async function loadWeather(popup, s) {
    const box = popup.getElement()?.querySelector("[data-wx]");
    if (!box || box.dataset.done) return;
    box.dataset.done = "1";
    const k = `${s.lat.toFixed(2)},${s.lon.toFixed(2)}`;
    let w = wxCache.get(k);
    if (!w || Date.now() - w.at > 30 * 60e3) {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat.toFixed(4)}&longitude=${s.lon.toFixed(4)}`
          + "&current=temperature_2m,weather_code,wind_speed_10m,snow_depth,freezing_level_height,cloud_cover"
          + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,sunrise,sunset&timezone=auto&forecast_days=7");
        if (!r.ok) return;
        w = { at: Date.now(), d: await r.json() }; wxCache.set(k, w);
      } catch { return; }
    }
    const c = w.d.current || {}, d = w.d.daily || {};
    if (!d.time?.length) return;
    const loc = window.I18N?.locale || "en-GB";
    const hm = t => t ? t.slice(11, 16) : "";
    const day = (t, i) => i === 0 ? "Today" : new Date(t + "T12:00:00").toLocaleDateString(loc, { weekday: "short" });
    const [ico, label] = wxOf(c.weather_code);
    const snow = c.snow_depth > 0.005 ? `<span>❄️ <b>${Math.round(c.snow_depth * 100)} cm</b> <i>snow on the ground</i></span>` : "";
    const frz = Number.isFinite(c.freezing_level_height) ? `<span>🧊 <i>freezing level</i> <b>${Math.round(c.freezing_level_height / 50) * 50} m</b></span>` : "";
    box.innerHTML = `<p class="pc-cams-h">🌡️ Weather now</p>
      <div class="wx-now"><b>${ico}</b><div><strong>${Math.round(c.temperature_2m)}°</strong> <em>${esc(label)}</em>
        <p>${snow}${frz}<span>💨 ${Math.round(c.wind_speed_10m)} km/h</span><span>🌅 ${hm(d.sunrise?.[0])} · 🌇 ${hm(d.sunset?.[0])}</span></p></div></div>
      <div class="wx-days">${d.time.map((t, i) => `<div title="${esc(wxOf(d.weather_code[i])[1])}"><small>${esc(day(t, i))}</small><b>${wxOf(d.weather_code[i])[0]}</b>
        <span>${Math.round(d.temperature_2m_max[i])}° <i>${Math.round(d.temperature_2m_min[i])}°</i></span>
        ${d.snowfall_sum[i] >= 0.5 ? `<em>❄️ ${Math.round(d.snowfall_sum[i])} cm</em>` : d.precipitation_sum[i] >= 0.5 ? `<em>💧 ${Math.round(d.precipitation_sum[i])} mm</em>` : `<em>&nbsp;</em>`}</div>`).join("")}</div>
      <p class="pc-cams-by">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)</p>`;
    box.hidden = false;
    popup.update();
    window.fcTrack?.("Spots: weather shown");
  }

  /* «How is it now?»: the folk report the conditions in one tap, chosen for the kind of place, with an optional comment.
     Each report expires on its own (hours = how long it stays true). */
  const COND = {
    flow:     ["💧", "In full flow", 72],   low:      ["🌱", "Low water", 168],     frozen:  ["🧊", "Frozen", 168],
    rough:    ["🌊", "Rough sea", 12],      calm:     ["🪞", "Calm water", 12],      jelly:   ["🪼", "Jellyfish", 48],
    beachfull:["🏖️", "Crowded beach", 6],   windy:    ["💨", "Strong wind", 8],
    snow:     ["❄️", "Snow on the trail", 96], ice:   ["🧊", "Ice on the trail", 72], clear_trail: ["🥾", "Trail clear", 96],
    fog:      ["🌫️", "Fog", 6],              cloudsea: ["☁️", "Sea of clouds", 8],    clearsky: ["🌅", "Clear sky", 8],
    foliage:  ["🍂", "Foliage", 168],        bloom:    ["🌸", "In bloom", 240],       stars:   ["🌌", "Dark sky, great stars", 12],
    crowded:  ["👥", "Crowded", 6],          quiet:    ["🍃", "Quiet", 6],            parking: ["🅿️", "Parking full", 6],
    open:     ["✅", "Open", 336],           closed:   ["⛔", "Closed", 336],         wait:    ["⏳", "Long wait", 4], full: ["🛏️", "Fully booked", 24],
    works:    ["🚧", "Works or blocked", 720]
  };
  function condKinds(s) {
    const t = `${s.name || ""} ${s.note || ""} ${s.list || ""}`.toLowerCase();
    if (s.category === "restaurant") return ["open", "closed", "wait", "crowded", "quiet"];
    if (s.category === "hotel") return ["open", "closed", "full", "snow", "works"];
    if (/cascat|waterfall|wasserfall|cascade|salto |chute|gola|forra|gorge/.test(t)) return ["flow", "low", "frozen", "foliage", "fog", "crowded", "works"];
    if (/spiaggi|beach|plage|playa|strand|\bcala\b|baia|bay|scogl|cliff|falesi|coast|costa|mare\b|sea\b|faro|lighthouse|caletta|grotta marina/.test(t)) return ["rough", "calm", "windy", "jelly", "beachfull", "fog", "clearsky"];
    if (/\blago\b|\blake\b|\bsee\b|\blac\b|laghetto|lagh/.test(t)) return ["calm", "windy", "frozen", "low", "foliage", "fog", "crowded"];
    if (s.category === "trekking" || /rifugio|passo|sentiero|trail|cima|monte|\bpiz\b|peak|forcella|malga|alpe|vetta/.test(t)) return ["snow", "ice", "clear_trail", "fog", "cloudsea", "foliage", "parking"];
    return ["fog", "clearsky", "foliage", "bloom", "stars", "crowded", "quiet", "closed"];
  }
  let condV = true;
  const condAgo = t => { const m = Math.round((Date.now() - new Date(t)) / 60e3); return m < 60 ? `${Math.max(m, 1)} min ago` : m < 24 * 60 ? `${Math.round(m / 60)} h ago` : m < 48 * 60 ? "yesterday" : `${Math.round(m / 1440)} days ago`; };
  async function loadConditions(popup, s) {
    const el = popup.getElement(); const box = el?.querySelector("[data-cond]"); if (!box || !condV) return;
    let list = [];
    try {
      list = guest ? ((await pubPlace(s.id))?.conditions || [])
        : await (async () => { const q = cols => api(`/rest/v1/place_conditions?select=${cols}&spot_id=eq.${s.id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&limit=100`).then(r => r.data || []);
            try { return await q("id,kind,note,on_spot,user_id,author_name,created_at,expires_at,photo_path"); } catch (err) { if (err.status === 400) return q("id,kind,note,on_spot,user_id,author_name,created_at,expires_at"); throw err; } })();
    } catch (err) { if ([400, 404].includes(err.status)) { condV = false; box.remove(); } return; }
    list = list.filter(c => COND[c.kind] && new Date(c.expires_at) > new Date());
    // group by condition: how many folk, the latest one
    const by = new Map();
    list.forEach(c => { const g = by.get(c.kind) || by.set(c.kind, { kind: c.kind, n: new Set(), last: c, notes: [], photo: null }).get(c.kind); g.n.add(c.user_id); if (c.note) g.notes.push(c); if (c.photo_path && !g.photo) g.photo = c.photo_path; });
    const groups = [...by.values()].sort((a, b) => b.n.size - a.n.size || String(b.last.created_at).localeCompare(String(a.last.created_at)));
    const top = el.querySelector("[data-condtop]");
    if (top) { if (groups.length) { const g = groups[0], [ic, lb] = COND[g.kind]; top.innerHTML = `<button type="button" data-gopulse>${ic} <b>${esc(lb)}</b> · ${condAgo(g.last.created_at)}${g.n.size > 1 ? ` · ${g.n.size} folk` : ""}</button>`; top.hidden = false; top.querySelector("[data-gopulse]").onclick = () => { const d = el.querySelector('[data-sec="pulse"]'); if (d) { d.open = true; popup.update(); setTimeout(() => d.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60); } }; } else top.hidden = true; }
    const kinds = condKinds(s);
    box.innerHTML = `<p class="pc-cams-h">📣 How is it now? <small>${groups.length ? `last folk update ${condAgo(list[0].created_at)}` : "no recent news from the folk"}</small></p>
      ${groups.length ? `<ul class="cond-list">${groups.map(g => { const [ic, lb] = COND[g.kind]; return `<li><span class="cond-chip">${ic} ${esc(lb)}</span>
          <small>${g.n.size > 1 ? `${g.n.size} folk · ` : `${esc(g.last.author_name || "Folk")} · `}${condAgo(g.last.created_at)}${g.last.on_spot ? " · 📍 on the spot" : ""}</small>
          <button type="button" class="cond-same" data-condsame="${g.kind}" title="Still like this">✓ Still so</button>
          ${g.photo ? `<img class="att-img" data-attph="${esc(g.photo)}" alt="Photo of the condition" hidden>` : ""}
          ${g.notes.slice(0, 2).map(c => `<q>${ugc(c.note)}<cite>— ${esc(c.author_name || "Folk")}</cite></q>`).join("")}</li>`; }).join("")}</ul>` : ""}
      <button type="button" class="pc-share cond-open" data-condreport>${groups.length ? "Update the conditions" : "Been here today? Tell the folk how it is"} <span aria-hidden="true">＋</span></button>
      <form class="cond-form" data-condform hidden>
        <div class="cond-pick">${kinds.map(k => `<button type="button" data-condk="${k}">${COND[k][0]} ${esc(COND[k][1])}</button>`).join("")}</div>
        <textarea maxlength="200" rows="2" placeholder="A comment, if you like (optional)"></textarea>
        ${photoPickHtml(`condPh${s.id}`)}
        <button type="submit" class="pop-btn primary" disabled>Send</button>
      </form>`;
    const form = box.querySelector("[data-condform]"); let pick = null;
    box.querySelector("[data-condreport]")?.addEventListener("click", () => { form.hidden = !form.hidden; popup.update(); });
    form.querySelectorAll("[data-condk]").forEach(b => b.addEventListener("click", () => { pick = b.dataset.condk; form.querySelectorAll("[data-condk]").forEach(x => x.classList.toggle("on", x === b)); form.querySelector("[type=submit]").disabled = false; }));
    wirePhotoPick(form);
    fillAttPhotos(box);
    const send = async (kind, note, btn, withPhoto) => {
      if (btn) { btn.disabled = true; }
      const photo = withPhoto ? await attachedPhoto(form, s) : null;
      let onSpot = false;
      if (navigator.geolocation) onSpot = await new Promise(res => navigator.geolocation.getCurrentPosition(p => res(kmBetween(p.coords.latitude, p.coords.longitude, s.lat, s.lon) <= 0.5), () => res(false), { timeout: 5000, maximumAge: 300000 }));
      try {
        const body = { spot_id: s.id, kind, note: note || null, on_spot: onSpot, author_name: displayName(), expires_at: new Date(Date.now() + COND[kind][2] * 36e5).toISOString(), ...(photo ? { photo_path: photo } : {}) };
        try { await api("/rest/v1/place_conditions", { method: "POST", headers: { Prefer: "return=minimal" }, body }); }
        catch (err) { if (!(photo && err.status === 400)) throw err; delete body.photo_path; await api("/rest/v1/place_conditions", { method: "POST", headers: { Prefer: "return=minimal" }, body }); }   // before the database update the photo still lands among the place's photos
        toast(`${COND[kind][0]} Thanks! The folk will see it${onSpot ? " — 📍 on the spot" : ""}.`);
        window.fcTrack?.("Spots: condition reported", { kind });
        loadConditions(popup, s);
      } catch (err) { toast(/row-level|policy|42501/i.test(err.message) ? "You've sent a lot of updates today: thank you, try again tomorrow." : `Could not send it: ${err.message}`, true); if (btn) btn.disabled = false; }
    };
    form.addEventListener("submit", ev => { ev.preventDefault(); if (pick) send(pick, form.querySelector("textarea").value.trim(), form.querySelector("[type=submit]"), true); });
    box.querySelectorAll("[data-condsame]").forEach(b => b.addEventListener("click", () => send(b.dataset.condsame, "", b)));
    popup.update();
  }

  /* «Before you go» and «Go gently»: what to know about a place, written and checked by the folk.
     Each topic keeps its versions; ✓ Still correct confirms the latest one, ✎ It changed writes a new one.
     Status: Checked (confirmed by another folk, recently) · Unverified (no one else yet) · Needs update (too old) · Disputed (a change no one confirmed yet). */
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // [icon, label, section, type, days it stays fresh, example]
  const TOPIC = {
    fee:          ["💶", "Fee", "know", "fee", 120],
    limited_entry:["🎟️", "Limited entry / booking", "know", "booking", 120],
    booking:      ["📅", "Booking", "know", "booking", 120],
    tickets:      ["🎟️", "Tickets", "know", "fee", 120],
    guide:        ["👣", "Guide only", "know", "text", 180, "Only with a licensed guide, from June to September."],
    rules:        ["🐑", "Landowner's rules", "know", "text", 365, "No dogs. Stay on the marked path, close the gates."],
    season:       ["🕐", "Season", "know", "months", 180, "Closed in May for the lambing season."],
    hours:        ["🕐", "Opening hours", "know", "text", 90, "9–17, closed on Mondays."],
    parking:      ["🅿️", "Parking", "know", "text", 120, "Free car park at the trailhead, full by 10:00 in summer."],
    getting_there:["🚙", "Getting there", "know", "access", 21],
    time:         ["⏱️", "Time & difficulty", "know", "text", 365, "2 h return, steep last part, no shade."],
    signal:       ["📶", "Phone signal", "know", "text", 365, "No signal after the second bridge."],
    drones:       ["🛸", "Drones", "know", "text", 180, "Drones forbidden: nature reserve."],
    tripod:       ["📷", "Tripod & permits", "know", "text", 180, "Tripods fine outside; a permit is needed inside."],
    facilities:   ["🚻", "Facilities", "know", "text", 180, "No toilets or water: bring everything."],
    swimming:     ["🏊", "Swimming", "know", "text", 60, "Strong currents with north wind; no lifeguard."],
    dress:        ["👔", "Dress code", "know", "text", 365, "Shoulders and knees covered."],
    payment:      ["💳", "Payment", "know", "text", 180, "Cash only."],
    closing:      ["🚪", "Closing days", "know", "text", 120, "Closed on Tuesdays and in January."],
    specialities: ["🍽️", "What to order", "know", "text", 365, "The lamb soup, and ask for the aged cheese."],
    checkin:      ["🔑", "Check-in", "know", "text", 180, "Key box, the code arrives the day before."],
    access_road:  ["🛣️", "The road there", "know", "text", 60, "Last 3 km on gravel, fine with a normal car."],
    group:        ["👥", "Group size", "know", "text", 180, "Max 8 people."],
    meeting:      ["📍", "Meeting point", "know", "text", 180, "In front of the harbour café, 15 min early."],
    bring:        ["🎒", "What to bring", "know", "text", 365, "Waterproof shoes and a head torch."],
    other:        ["💡", "Other tip", "know", "text", 120, "Anything the next folk should know."],
    another_season:["🍂", "Another season", "gently", "months", 365, "In October it's empty and the light is golden."],
    quiet_hours:  ["🌅", "Quiet hours", "gently", "text", 180, "Before 9 you're alone; groups arrive around 10–14."],
    alternative:  ["🔁", "A quieter alternative nearby", "gently", "alt", 365],
    respect:      ["🌿", "Respect", "gently", "text", 365, "Stay on the path, take your rubbish home."],
    support_local:["🤝", "Support local", "gently", "text", 180, "The fee goes to the farmers; coffee at the farm café."],
    dont_geotag:  ["🛡️", "Don't geotag", "gently", "text", 365, "Fragile spot: please don't tag the exact place."],
    private:      ["🏡", "Private property", "gently", "text", 365, "The viewpoint is on a family's land: ask, and be quiet."],
    sand:         ["🐚", "Leave sand & shells", "gently", "text", 365, "Taking sand or pebbles is forbidden and fined."],
    anchors:      ["⚓", "No anchors on posidonia", "gently", "text", 365, "Anchor on sand only; use the buoys."],
    residents:    ["🏘️", "Respect the residents", "gently", "text", 365, "People live here: keep voices low after 22."],
    stay_longer:  ["🛏️", "Stay, don't rush", "gently", "text", 365, "Sleep in the village: day-trippers crowd it at noon."],
    saving:       ["💧", "Save water and energy", "gently", "text", 365, "Water comes from a cistern: short showers."],
    small_groups: ["👪", "Small groups", "gently", "text", 365, "Choose groups under 10: the path is narrow."],
    local_operator:["🤝", "Local operators", "gently", "text", 365, "Book with the family-run boat from the village."],
    wildlife:     ["🐦", "Wildlife", "gently", "text", 365, "Puffins nest here: keep 5 m from the burrows."]
  };
  const TOPICS_FOR = {
    trail: ["fee", "booking", "guide", "rules", "season", "parking", "getting_there", "time", "signal", "other", "another_season", "quiet_hours", "alternative", "respect", "support_local", "dont_geotag"],
    photo: ["fee", "parking", "getting_there", "drones", "tripod", "season", "other", "another_season", "quiet_hours", "alternative", "dont_geotag", "private", "respect"],
    sea: ["limited_entry", "getting_there", "facilities", "swimming", "season", "parking", "other", "another_season", "quiet_hours", "alternative", "sand", "anchors", "respect"],
    water: ["fee", "parking", "getting_there", "swimming", "season", "time", "other", "another_season", "quiet_hours", "alternative", "respect"],
    city: ["tickets", "hours", "dress", "getting_there", "parking", "other", "another_season", "quiet_hours", "residents", "stay_longer"],
    food: ["booking", "payment", "closing", "specialities", "other", "support_local", "quiet_hours"],
    stay: ["booking", "checkin", "access_road", "payment", "other", "support_local", "saving", "stay_longer"],
    experience: ["booking", "group", "meeting", "bring", "other", "small_groups", "local_operator", "wildlife"]
  };
  function factKind(s) {
    const t = `${s.name || ""} ${s.note || ""} ${s.list || ""}`.toLowerCase();
    if (s.category === "restaurant") return "food";
    if (s.category === "hotel") return "stay";
    if (s.category === "experience" || s.category === "workshop") return "experience";
    if (/cascat|waterfall|wasserfall|cascade|\bfoss|\blago\b|\blake\b|\bsee\b|\blac\b|laghetto|gola|forra|gorge|canyon/.test(t)) return "water";
    if (/spiaggi|beach|plage|playa|strand|\bcala\b|baia|\bbay\b|scogl|caletta|coast|costa|mare\b|sea\b/.test(t)) return "sea";
    if (s.category === "trekking" || /rifugio|sentiero|trail|hike|trek|cima|\bpiz\b|peak|forcella|malga|vetta|cliff|nípa|nipa/.test(t)) return "trail";
    if (s.category === "spot" && spotSub(s) === "poi") return "city";
    return "photo";
  }
  const FEE_PER = { person: "per person", adult: "per adult", car: "per car", group: "per group" };
  const FEE_HOW = { online: "🌐 Online, before", gate: "🎫 At the gate", cash: "💵 Cash only", app: "📱 App" };
  const VEH = { car: "🚗 Any car", awd: "🚙 4x4", high: "🛻 High 4x4", bus: "🚌 Bus or tour only", foot: "🥾 On foot only" };
  const ROAD = { paved: "Paved", gravel: "Gravel", ftrack: "Mountain track / F-road" };
  const RIVERS = { none: "No river crossings", few: "1–2 river crossings", many: "Several river crossings" };
  const CURRENCIES_B = ["EUR", "DKK", "ISK", "NOK", "SEK", "CHF", "GBP", "USD"];
  let factV = true;
  const monthsBar = (on = []) => `<div class="byg-months">${MONTHS.map((m, i) => `<span class="${on.includes(i + 1) ? "on" : ""}">${m[0]}</span>`).join("")}</div>`;
  const monthsText = on => { const a = [...on].sort((x, y) => x - y); if (!a.length) return ""; const runs = []; let st = a[0], pr = a[0];
    a.slice(1).concat(99).forEach(m => { if (m !== pr + 1) { runs.push(st === pr ? MONTHS[st - 1] : `${MONTHS[st - 1]}–${MONTHS[pr - 1]}`); st = m; } pr = m; }); return runs.join(", "); };
  function factValue(f) {
    const [, , , type] = TOPIC[f.topic] || [];
    const d = f.data || {}, note = f.note ? `<p class="byg-note">${ugc(f.note)}</p>` : "";
    if (type === "fee") return `<p class="byg-val">${d.free ? "Free" : `${esc(d.amount ?? "")} ${esc(d.currency || "")} ${esc(FEE_PER[d.per] || "")}`}${(d.how || []).length ? ` · ${(d.how || []).map(k => esc(FEE_HOW[k] || k)).join(" or ")}` : ""}${d.link ? ` · <a href="${esc(d.link)}" target="_blank" rel="noopener">Pay ↗</a>` : ""}</p>${note}`;
    if (type === "booking") return `<p class="byg-val">${d.required ? "Booking required" : "No booking needed"}${d.advance ? ` · ${esc(d.advance)}` : ""}${d.link ? ` · <a href="${esc(d.link)}" target="_blank" rel="noopener">Book ↗</a>` : ""}</p>${note}`;
    if (type === "months") return `${monthsBar(d.months || [])}${(d.months || []).length ? `<p class="byg-val">${f.topic === "another_season" ? "Folk suggest" : "Open"}: ${esc(monthsText(d.months))}</p>` : ""}${note}`;
    if (type === "access") return `<p class="byg-val">${[VEH[d.vehicle], ROAD[d.road], RIVERS[d.rivers], d.fuel ? `⛽ ${esc(d.fuel)}` : ""].filter(Boolean).map(x => x.startsWith("⛽") ? x : esc(x)).join(" · ")}</p>${note}`;
    if (type === "alt") { const a = spotById(+d.spot); return `${a ? `<button type="button" class="byg-alt" data-gospot="${a.id}"><b>${esc(a.name)}</b><small>${kmBetween(a.lat, a.lon, f._s.lat, f._s.lon).toFixed(1)} km away</small><em>→</em></button>` : d.name ? `<p class="byg-val">${esc(d.name)}</p>` : ""}${note}`; }
    return note || "";
  }
  // the state of a topic from its versions and their confirmations
  function factState(versions, checks) {
    const others = f => checks.filter(k => k.fact_id === f.id && k.user_id !== f.user_id);
    const [v0, v1] = versions, fresh = (TOPIC[v0.topic]?.[4] || 120) * 864e5, now = Date.now();
    let cur = v0, prev = null;
    if (v1) {   // a change: who confirmed what after it was written?
      const after = others(v1).filter(k => new Date(k.created_at) > new Date(v0.created_at));
      if (!others(v0).length && after.length) { cur = v1; prev = v0; } else if (!others(v0).length) { return { cur: v0, prev: v1, state: "disputed", yes: [] }; }
    }
    const yes = others(cur).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    if (yes.length) return { cur, prev, yes, state: now - new Date(yes[0].created_at) <= fresh ? "checked" : "update" };
    return { cur, prev, yes, state: now - new Date(cur.created_at) <= fresh ? "unverified" : "update" };
  }
  const STATE_LABEL = { checked: "✓ Checked", unverified: "Unverified", update: "Needs update", disputed: "Disputed" };
  const ageText = t => condAgo(t);
  async function loadFacts(popup, s) {
    const el = popup.getElement(); const box = el?.querySelector("[data-byg]"); if (!box || !factV) return;
    let facts = [], checks = [];
    try {
      if (guest) { const p = await pubPlace(s.id); facts = p?.facts || []; checks = p?.fact_checks || []; }
      else {
        facts = (await api(`/rest/v1/place_facts?select=*&spot_id=eq.${s.id}&order=created_at.desc&limit=300`)).data || [];
        if (facts.length) checks = (await api(`/rest/v1/fact_checks?select=fact_id,user_id,author_name,on_spot,created_at&fact_id=in.(${facts.map(f => f.id).join(",")})`)).data || [];
      }
    } catch (err) { if ([400, 404].includes(err.status)) { factV = false; el.querySelector('[data-sec="before"]')?.remove(); } return; }
    facts.forEach(f => { f._s = s; });
    const kind = factKind(s), allowed = TOPICS_FOR[kind];
    const byTopic = new Map();
    facts.filter(f => TOPIC[f.topic]).forEach(f => (byTopic.get(f.topic) || byTopic.set(f.topic, []).get(f.topic)).push(f));
    const items = [...byTopic.entries()].map(([t, vs]) => ({ topic: t, ...factState(vs, checks) }));
    const uid = myUid();
    const rank = it => (allowed.indexOf(it.topic) + 1 || 99);
    const card = it => {
      const [ic, lb, sec] = TOPIC[it.topic], f = it.cur, last = it.yes?.[0];
      const who = last ? `Checked by ${new Set(it.yes.map(k => k.user_id)).size} folk · last ${esc(last.author_name || "Folk")}, ${ageText(last.created_at)}${last.on_spot ? " · 📍 on the spot" : ""}`
        : `${it.state === "disputed" ? "Changed by" : "Added by"} ${esc(f.author_name || "Folk")}${f.folk && CLUSTERS[f.folk] ? ` · ${esc(folkOf(f.folk))}` : ""} · ${ageText(f.created_at)}${f.on_spot ? " · 📍 on the spot" : ""}${it.state === "unverified" ? " · not yet checked by other folk" : ""}`;
      const mine = f.user_id === uid;
      return `<div class="byg-item ${sec === "gently" ? "gg" : ""}" data-topic="${it.topic}">
        <div class="byg-h"><b>${ic} ${esc(lb)}</b><span class="byg-st ${it.state}">${STATE_LABEL[it.state]}</span></div>
        ${factValue(f)}
        ${f.photo_path ? `<img class="att-img" data-attph="${esc(f.photo_path)}" alt="Photo" hidden>` : ""}
        <p class="byg-by">${who}</p>
        ${it.state === "update" ? `<p class="byg-prompt">Been here recently? Check it in one tap.</p>` : ""}
        ${it.prev ? `<div class="byg-prev"><small>${it.state === "disputed" ? "Before:" : "Suggested change, not confirmed:"}</small>${factValue(it.prev)}<p class="byg-by">${esc(it.prev.author_name || "Folk")} · ${ageText(it.prev.created_at)}</p></div>` : ""}
        <div class="byg-acts">
          ${mine ? `<button type="button" class="byg-del" data-factdel="${f.id}">Remove mine</button>` : `<button type="button" class="byg-yes" data-factyes="${f.id}">${it.state === "disputed" ? "✓ The newer one is right" : "✓ Still correct"}</button>`}
          ${it.state === "disputed" && it.prev && it.prev.user_id !== uid ? `<button type="button" class="byg-yes" data-factyes="${it.prev.id}">↩ The older one is right</button>` : ""}
          <button type="button" class="byg-chg" data-factchg="${it.topic}">✎ It changed</button>
          ${admin && !mine ? `<button type="button" class="byg-del" data-factdel="${f.id}" title="Admin: remove">✕</button>` : ""}
        </div></div>`;
    };
    const know = items.filter(i => TOPIC[i.topic][2] === "know").sort((a, b) => rank(a) - rank(b));
    const gently = items.filter(i => TOPIC[i.topic][2] === "gently").sort((a, b) => rank(a) - rank(b));
    const missing = allowed.filter(t => !byTopic.has(t));
    box.innerHTML = `
      ${know.length ? `<p class="byg-sub">🧭 Good to know</p>${know.map(card).join("")}` : ""}
      ${gently.length ? `<p class="byg-sub g">🌿 Go gently <small>help keep this place special</small></p>${gently.map(card).join("")}` : ""}
      ${!items.length ? `<p class="pc-empty">Nothing here yet. Fees, booking, the way there, the quiet season: what should the next folk know?</p>` : ""}
      ${missing.length ? `<button type="button" class="byg-add" data-factadd>＋ Add something to know</button>` : ""}
      <div class="byg-form" data-factform hidden></div>
      <p class="byg-disc">Information shared by the folk from their own experience. Always check the official source before you go.</p>`;
    // chips under the name
    const top = el.querySelector("[data-facttop]");
    if (top) {
      const cur = t => items.find(i => i.topic === t && i.state !== "disputed")?.cur;
      const chips = [];
      const fee = cur("fee") || cur("tickets"); if (fee && !fee.data?.free) chips.push(`<span class="byg-chip fee">💶 Paid access${fee.data?.how?.includes("online") ? " · pay online" : ""}</span>`);
      const bk = cur("limited_entry") || cur("booking"); if (bk?.data?.required) chips.push(`<span class="byg-chip fee">📅 Booking required</span>`);
      const gt = cur("getting_there"); if (gt && ["awd", "high", "bus", "foot"].includes(gt.data?.vehicle)) chips.push(`<span class="byg-chip warn">${esc(VEH[gt.data.vehicle])}</span>`);
      const as = cur("another_season"); if (as?.data?.months?.length) chips.push(`<span class="byg-chip gg">🌿 Quieter in ${esc(monthsText(as.data.months))}</span>`);
      top.innerHTML = chips.join(""); top.hidden = !chips.length;
      top.querySelectorAll(".byg-chip").forEach(c => c.addEventListener("click", () => { const d = el.querySelector('[data-sec="before"]'); if (d) { d.open = true; popup.update(); } }));
    }
    fillAttPhotos(box);
    setCnt(el, "before", items.length ? String(items.length) : "");
    // actions
    box.querySelectorAll("[data-gospot]").forEach(b => b.addEventListener("click", () => { const a = spotById(+b.dataset.gospot); if (a) { map.closePopup(); focusSpot(a); } }));
    box.querySelectorAll("[data-factyes]").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true;
      const onSpot = await nearHere(s);
      try { await api("/rest/v1/fact_checks", { method: "POST", headers: { Prefer: "return=minimal,resolution=ignore-duplicates" }, body: { fact_id: +b.dataset.factyes, author_name: displayName(), on_spot: onSpot } });
        toast(`✓ Thanks! You're the freshest eyes on this place${onSpot ? " — 📍 on the spot" : ""}.`); window.fcTrack?.("Spots: fact checked"); loadFacts(popup, s);
      } catch (err) { toast(`Could not save it: ${err.message}`, true); b.disabled = false; }
    }));
    box.querySelectorAll("[data-factdel]").forEach(b => b.addEventListener("click", async () => {
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Remove?"; return; }
      try { await api(`/rest/v1/place_facts?id=eq.${b.dataset.factdel}`, { method: "DELETE" }); loadFacts(popup, s); } catch (err) { toast(`Could not remove it: ${err.message}`, true); }
    }));
    const formBox = box.querySelector("[data-factform]");
    const openForm = (topic, base) => { formBox.innerHTML = factFormHtml(topic, base, s); formBox.hidden = false; wireFactForm(formBox, topic, base, popup, s); popup.update(); formBox.scrollIntoView({ behavior: "smooth", block: "nearest" }); };
    box.querySelectorAll("[data-factchg]").forEach(b => b.addEventListener("click", () => { const it = items.find(i => i.topic === b.dataset.factchg); openForm(b.dataset.factchg, it?.cur); }));
    box.querySelector("[data-factadd]")?.addEventListener("click", () => {
      const pick = sec => missing.filter(t => TOPIC[t][2] === sec).map(t => `<button type="button" data-picktopic="${t}">${TOPIC[t][0]} ${esc(TOPIC[t][1])}</button>`).join("");
      formBox.innerHTML = `<p class="byg-q">What would you like to add?</p>
        ${pick("know") ? `<p class="byg-sub">🧭 Good to know</p><div class="byg-pick">${pick("know")}</div>` : ""}
        ${pick("gently") ? `<p class="byg-sub g">🌿 Go gently</p><div class="byg-pick g">${pick("gently")}</div>` : ""}`;
      formBox.hidden = false;
      formBox.querySelectorAll("[data-picktopic]").forEach(x => x.addEventListener("click", () => openForm(x.dataset.picktopic, null)));
      popup.update();
    });
    popup.update();
  }
  function nearHere(s) {
    if (!navigator.geolocation) return Promise.resolve(false);
    return new Promise(res => navigator.geolocation.getCurrentPosition(p => res(kmBetween(p.coords.latitude, p.coords.longitude, s.lat, s.lon) <= 0.5), () => res(false), { timeout: 5000, maximumAge: 300000 }));
  }
  function factFormHtml(topic, base, s) {
    const [ic, lb, sec, type, , ex] = TOPIC[topic], d = base?.data || {};
    const chips = (name, obj, sel, multi) => `<div class="byg-pick${multi ? " multi" : ""}" data-field="${name}">${Object.entries(obj).map(([k, l]) => `<button type="button" data-v="${k}" class="${(multi ? (sel || []).includes(k) : sel === k) ? "on" : ""}">${esc(l)}</button>`).join("")}</div>`;
    let fields = "";
    if (type === "fee") fields = `<label>How much</label><div class="byg-row"><input name="amount" type="number" min="0" step="any" inputmode="decimal" value="${esc(d.amount ?? "")}" placeholder="200">
        <select name="currency">${CURRENCIES_B.map(c => `<option${(d.currency || "EUR") === c ? " selected" : ""}>${c}</option>`).join("")}</select>
        <select name="per">${Object.entries(FEE_PER).map(([k, l]) => `<option value="${k}"${(d.per || "person") === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
      <label class="byg-chk"><input type="checkbox" name="free"${d.free ? " checked" : ""}> It's free</label>
      <label>How do you pay?</label>${chips("how", FEE_HOW, d.how, true)}
      <label>Link to pay (optional)</label><input name="link" type="url" placeholder="https://…" value="${esc(d.link || "")}">`;
    if (type === "booking") fields = `<label>Booking</label>${chips("required", { yes: "Required", no: "Not needed" }, d.required === false ? "no" : d.required ? "yes" : "")}
      <label>How far ahead (optional)</label><input name="advance" maxlength="60" placeholder="e.g. 2 days ahead in summer" value="${esc(d.advance || "")}">
      <label>Link (optional)</label><input name="link" type="url" placeholder="https://…" value="${esc(d.link || "")}">`;
    if (type === "months") fields = `<label>${topic === "another_season" ? "Better months to come" : "Open or accessible in"}</label>
      <div class="byg-pick multi months" data-field="months">${MONTHS.map((m, i) => `<button type="button" data-v="${i + 1}" class="${(d.months || []).includes(i + 1) ? "on" : ""}">${m}</button>`).join("")}</div>`;
    if (type === "access") fields = `<label>Vehicle</label>${chips("vehicle", VEH, d.vehicle)}<label>Road</label>${chips("road", ROAD, d.road)}
      <label>River crossings</label>${chips("rivers", RIVERS, d.rivers)}<label>Last fuel or signal (optional)</label><input name="fuel" maxlength="60" placeholder="e.g. last fuel in Hella, 70 km before" value="${esc(d.fuel || "")}">`;
    if (type === "alt") { const near = spots.filter(x => x.id !== s.id && kmBetween(x.lat, x.lon, s.lat, s.lon) <= 40).sort((a, b) => kmBetween(a.lat, a.lon, s.lat, s.lon) - kmBetween(b.lat, b.lon, s.lat, s.lon)).slice(0, 40);
      fields = `<label>Which place? (within 40 km)</label><select name="spot"><option value="">Choose a place…</option>${near.map(x => `<option value="${x.id}"${+d.spot === x.id ? " selected" : ""}>${esc(x.name)} · ${kmBetween(x.lat, x.lon, s.lat, s.lon).toFixed(1)} km</option>`).join("")}</select>`; }
    return `<p class="byg-q">${ic} ${esc(lb)}${base ? " · what changed?" : ""}</p>
      ${base ? `<p class="byg-old">${esc(stripTags(factValue(base)))}</p><p class="byg-hint">Your version goes up as <b>Unverified</b> until another folk checks it.</p>` : ""}
      <form data-fform class="${sec === "gently" ? "g" : ""}">${fields}
        <label>${type === "text" ? "What should the next folk know?" : "Anything else? (optional)"}</label>
        <textarea name="note" maxlength="300" rows="2" placeholder="${esc(ex || "")}">${esc(base?.note || "")}</textarea>
        ${photoPickHtml(`factPh${s?.id || 0}${topic}`)}
        <button type="submit" class="pop-btn primary">${base ? "Update" : "Add"}</button>
        <p class="byg-hint">Shown with your name, your folk and today's date. If your phone is here, it says 📍 on the spot.</p>
      </form>`;
  }
  const stripTags = h => { const x = document.createElement("div"); x.innerHTML = h; return [...x.children].map(c => c.textContent.trim()).filter(Boolean).join(" · ") || x.textContent.trim(); };
  function wireFactForm(box, topic, base, popup, s) {
    const form = box.querySelector("[data-fform]"); if (!form) return;
    wirePhotoPick(form);
    form.querySelectorAll(".byg-pick").forEach(g => g.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => {
      if (g.classList.contains("multi")) b.classList.toggle("on"); else g.querySelectorAll("[data-v]").forEach(x => x.classList.toggle("on", x === b));
    })));
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const [, , , type] = TOPIC[topic], v = n => form.querySelector(`[name=${n}]`)?.value?.trim() || "";
      const sel = n => [...form.querySelectorAll(`[data-field="${n}"] .on`)].map(b => b.dataset.v);
      let data = {};
      if (type === "fee") { data = { amount: v("amount") ? +v("amount") : null, currency: v("currency"), per: v("per"), how: sel("how"), link: /^https?:\/\//.test(v("link")) ? v("link") : null, free: form.querySelector("[name=free]")?.checked || false };
        if (!data.free && !data.amount) return toast("Write how much it costs, or tick «It's free».", true); }
      if (type === "booking") { const r = sel("required")[0]; if (!r) return toast("Is booking required or not?", true); data = { required: r === "yes", advance: v("advance") || null, link: /^https?:\/\//.test(v("link")) ? v("link") : null }; }
      if (type === "months") { data = { months: sel("months").map(Number) }; if (!data.months.length) return toast("Tap at least one month.", true); }
      if (type === "access") { data = { vehicle: sel("vehicle")[0] || null, road: sel("road")[0] || null, rivers: sel("rivers")[0] || null, fuel: v("fuel") || null }; if (!data.vehicle && !data.road) return toast("Tell the folk at least the vehicle or the road.", true); }
      if (type === "alt") { data = { spot: +v("spot") || null }; if (!data.spot) return toast("Choose the quieter place nearby.", true); }
      const note = v("note");
      if (type === "text" && !note) return toast("Write a line for the next folk.", true);
      const btn = form.querySelector("[type=submit]"); btn.disabled = true;
      const onSpot = await nearHere(s), photo = await attachedPhoto(form, s);
      try {
        const body = { spot_id: s.id, topic, data, note: note || null, replaces: base?.id || null, author_name: displayName(), folk: myStyles[0] || null, on_spot: onSpot, ...(photo ? { photo_path: photo } : {}) };
        try { await api("/rest/v1/place_facts", { method: "POST", headers: { Prefer: "return=minimal" }, body }); }
        catch (err) { if (!(photo && err.status === 400)) throw err; delete body.photo_path; await api("/rest/v1/place_facts", { method: "POST", headers: { Prefer: "return=minimal" }, body }); }
        toast(base ? "Updated: the folk will check it. Thanks!" : `Added${onSpot ? " — 📍 on the spot" : ""}. Thanks, the next folk will travel better!`);
        window.fcTrack?.(base ? "Spots: fact changed" : "Spots: fact added", { topic });
        loadFacts(popup, s);
      } catch (err) { toast(/row-level|policy|42501/i.test(err.message) ? "You've added a lot today: thank you, try again tomorrow." : `Could not save it: ${err.message}`, true); btn.disabled = false; }
    });
  }

  /* ✨ Photo forecast: the next 7 days for photographers, on the visible map.
     Weather from Open-Meteo (one request for a 5×5 grid), sun, moon and Milky Way calculated here (Astro, tools.js),
     aurora from NOAA SWPC. Nothing is stored: only the browser asks and calculates. */
  const PF = {
    clear_rise: ["🌅", "Clear sunrise", "#ffd27a"], clear_set: ["🌇", "Clear sunset", "#ffbe7a"], fiery: ["🔥", "Fiery sky possible", "#ff7a45"],
    cloudsea: ["☁️", "Sea of clouds likely", "#cfe2ff"], fog: ["🌫️", "Fog in the valleys", "#b8c4d2"], snow: ["❄️", "Fresh snow", "#e8f4ff"],
    drama: ["⛈️", "Dramatic light possible", "#c9a7ff"], stars: ["✨", "Dark sky for stars", "#9ec5ff"], milky: ["🌌", "Milky Way core visible", "#b39dff"],
    moonrise: ["🌕", "Full moon rising at sunset", "#fff3c4"], aurora: ["🟢", "Aurora possible", "#7ee0a1"]
  };
  let pfLayer = null, pfOpen = false, pfAlerts = [], pfOn = null, pfKey = "", pfBusy = false, pfKp = null;
  const pfCache = new Map(), elevCache = new Map();
  const PF_ZOOM = 7;
  const confOf = d => d <= 1 ? ["●", "high", "reliable"] : d <= 3 ? ["◐", "med", "indicative"] : ["○", "low", "just a trend"];
  function addPfControl() {
    pfLayer = L.layerGroup().addTo(map);
    map.on("moveend", () => { if (pfOpen || pfOn) { clearTimeout(pfLayer._t); pfLayer._t = setTimeout(drawPf, 500); } });
    const sx = $("#sxPf");
    if (sx) {   // the Earth view: the button lives in the column of map buttons, top right
      if (!sx.dataset.wired) { sx.dataset.wired = "1"; sx.addEventListener("click", () => { pfOpen = !pfOpen; window.fcTrack?.(pfOpen ? "Spots: photo forecast opened" : "Spots: photo forecast closed"); drawPf(); }); }
      return;
    }
    const Ctl = L.Control.extend({ options: { position: "topright" }, onAdd() {
      const b = L.DomUtil.create("button", "pf-btn"); b.type = "button"; b.title = "Photo forecast: the next 7 days"; b.setAttribute("aria-label", "Photo forecast");
      b.innerHTML = `<span aria-hidden="true">✨</span><b class="pf-badge" hidden></b>`;
      L.DomEvent.disableClickPropagation(b);
      b.addEventListener("click", () => { pfOpen = !pfOpen; window.fcTrack?.(pfOpen ? "Spots: photo forecast opened" : "Spots: photo forecast closed"); drawPf(); });
      return b; } });
    new Ctl().addTo(map);
  }
  const pfHost = () => map.getContainer().closest(".sx-stage") || map.getContainer();
  function pfPanel() {
    const host = pfHost();
    let p = host.querySelector(".pf-panel");
    if (!p) { p = L.DomUtil.create("div", "pf-panel", host); L.DomEvent.disableClickPropagation(p); L.DomEvent.disableScrollPropagation(p); }
    return p;
  }
  async function drawPf() {
    if (!map) return;
    const panel = pfPanel(); panel.hidden = !pfOpen;
    const btn = $("#sxPf") || map.getContainer().querySelector(".pf-btn"); btn?.classList.toggle("on", pfOpen);
    if (map.getZoom() < PF_ZOOM || (ui === "earth" && onGlobe)) { pfLayer.clearLayers(); pfOn = null; if (pfOpen) panel.innerHTML = `${pfHead()}<p class="pf-empty">Zoom in to a region (a few valleys wide) to see the photo forecast of its places.</p>${pfFoot()}`; setBadge(0); return; }
    const b = map.getBounds(), key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(x => x.toFixed(1)).join(",");
    if (key !== pfKey && !pfBusy) {
      pfBusy = true; if (pfOpen) panel.innerHTML = `${pfHead()}<p class="pf-empty">Reading the sky…</p>`;
      try { pfAlerts = await computePf(b); pfKey = key; } catch { pfAlerts = []; }
      pfBusy = false;
      if (pfOn && !pfAlerts.some(a => a.id === pfOn)) pfOn = null;
    }
    setBadge(pfAlerts.filter(a => a.day <= 1).length);
    paintPfGlow();
    if (!pfOpen) return;
    const days = [...new Set(pfAlerts.map(a => a.day))].sort((x, y) => x - y);
    const dayName = (d, date) => d === 0 ? "Today" : d === 1 ? "Tomorrow" : new Date(date + "T12:00:00").toLocaleDateString(window.I18N?.locale || "en-GB", { weekday: "long", day: "numeric", month: "short" });
    panel.innerHTML = `${pfHead()}
      ${pfAlerts.length ? days.map(d => { const list = pfAlerts.filter(a => a.day === d); return `<p class="pf-day">${esc(dayName(d, list[0].date))}</p>
        <ul class="pf-list">${list.map(a => { const [ic, lb, col] = PF[a.type], c = confOf(a.conf ?? d);
          return `<li><button type="button" data-pf="${a.id}" class="${pfOn === a.id ? "on" : ""}" style="--c:${col}"><i>${ic}</i><span><b>${esc(lb)}</b><small>${esc(a.when)} · ${a.places.length} place${a.places.length > 1 ? "s" : ""}</small></span><em class="pf-conf ${c[1]}" title="${c[2]}">${c[0]}</em></button></li>`; }).join("")}</ul>`; }).join("")
        : `<p class="pf-empty">Nothing special in the next 7 days for the places in view. Try another area.</p>`}
      ${pfFoot()}`;
    panel.querySelector("[data-pfclose]")?.addEventListener("click", () => { pfOpen = false; drawPf(); });
    panel.querySelectorAll("[data-pf]").forEach(x => x.addEventListener("click", () => { pfOn = pfOn === x.dataset.pf ? null : x.dataset.pf; window.fcTrack?.("Spots: photo alert shown", { type: x.dataset.pf.split(":")[0] }); drawPf(); }));
  }
  const pfHead = () => `<div class="pf-h"><b>✨ Photo forecast</b><small>next 7 days · places in view</small><button type="button" data-pfclose aria-label="Close">×</button></div>`;
  const pfFoot = () => `<p class="pf-foot"><span>● reliable ◐ indicative ○ just a trend</span>Estimates from weather models, calculated for the area: always check the forecast before you go.
    <br>Weather <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · aurora <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener">NOAA SWPC</a> · sun, moon and Milky Way calculated here</p>`;
  function setBadge(n) { const bd = ($("#sxPf") || map?.getContainer())?.querySelector(".pf-badge"); if (bd) { bd.textContent = n; bd.hidden = !n; } }
  function paintPfGlow() {
    pfLayer.clearLayers();
    const a = pfAlerts.find(x => x.id === pfOn); if (!a) return;
    const col = PF[a.type][2];
    a.places.slice(0, 200).forEach(id => { const s = spotById(id); if (!s) return;
      L.marker([s.lat, s.lon], { interactive: false, keyboard: false, zIndexOffset: -1000,
        icon: L.divIcon({ className: "", iconSize: [54, 54], iconAnchor: [27, 27], html: `<div class="pf-glow" style="--c:${col}"><i>${PF[a.type][0]}</i></div>` }) }).addTo(pfLayer); });
  }
  async function pfElev(list) {
    const need = list.filter(s => !elevCache.has(s.id)).slice(0, 300);
    for (let i = 0; i < need.length; i += 100) {
      const ch = need.slice(i, i + 100);
      try { const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${ch.map(s => s.lat.toFixed(4)).join(",")}&longitude=${ch.map(s => s.lon.toFixed(4)).join(",")}`);
        const j = await r.json(); (j.elevation || []).forEach((e, k) => elevCache.set(ch[k].id, e)); } catch {}
    }
  }
  async function pfKpForecast() {
    if (pfKp && Date.now() - pfKp.at < 3 * 36e5) return pfKp.rows;
    try { const r = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"); const j = await r.json();
      const rows = (Array.isArray(j) ? j.slice(1) : []).map(x => Array.isArray(x) ? { t: Date.parse(String(x[0]).replace(" ", "T") + "Z"), kp: +x[1] } : { t: Date.parse(x.time_tag + "Z"), kp: +x.kp }).filter(x => Number.isFinite(x.kp));
      pfKp = { at: Date.now(), rows }; return rows; } catch { return []; }
  }
  async function computePf(b) {
    const N = 5, S = b.getSouth(), W = b.getWest(), dLat = (b.getNorth() - S) / N, dLon = (b.getEast() - W) / N;
    const grid = []; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) grid.push({ lat: S + dLat * (i + .5), lon: W + dLon * (j + .5), places: [] });
    const inView = spots.filter(s => b.contains([s.lat, s.lon]) && !s.fragile).slice(0, 2500);
    inView.forEach(s => { const i = Math.min(N - 1, Math.max(0, Math.floor((s.lat - S) / dLat))), j = Math.min(N - 1, Math.max(0, Math.floor((s.lon - W) / dLon))); grid[i * N + j].places.push(s); });
    const cells = grid.filter(g => g.places.length);
    if (!cells.length) return [];
    const ck = cells.map(g => `${g.lat.toFixed(2)},${g.lon.toFixed(2)}`).join("|");
    let data = pfCache.get(ck);
    if (!data || Date.now() - data.at > 36e5) {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${cells.map(g => g.lat.toFixed(3)).join(",")}&longitude=${cells.map(g => g.lon.toFixed(3)).join(",")}`
        + "&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation,weather_code&daily=sunrise,sunset,snowfall_sum&timezone=auto&forecast_days=7");
      if (!r.ok) throw new Error("weather"); let j = await r.json(); if (!Array.isArray(j)) j = [j];
      data = { at: Date.now(), list: j }; pfCache.set(ck, data);
    }
    const kp = cells.some(g => Math.abs(g.lat) > 44) ? await pfKpForecast() : [];
    const out = new Map();
    const add = (type, day, date, when, places, conf) => { if (!places.length) return; const id = `${type}:${day}`; const a = out.get(id) || out.set(id, { id, type, day, date, when, conf, places: [] }).get(id); places.forEach(s => a.places.includes(s.id) || a.places.push(s.id)); if (!a.when.includes(when) && a.when.split(" · ").length < 2) a.when += ` · ${when}`; };
    const highPlaces = async g => { await pfElev(g.places); return g.places.filter(s => (elevCache.get(s.id) ?? 0) >= 1400); };
    for (let c = 0; c < cells.length; c++) {
      const g = cells[c], w = data.list[c]; if (!w?.hourly) continue;
      const H = w.hourly, D = w.daily, off = (w.utc_offset_seconds || 0) * 1000;
      const hi = t => H.time.indexOf(String(t).slice(0, 13) + ":00");
      const at = (k, i) => i >= 0 && i < H[k].length ? H[k][i] : null;
      for (let d = 0; d < D.time.length; d++) {
        const date = D.time[d], sr = hi(D.sunrise[d]), ss = hi(D.sunset[d]), riseT = String(D.sunrise[d]).slice(11, 16), setT = String(D.sunset[d]).slice(11, 16);
        const clearAt = i => at("cloud_cover_low", i) < 20 && at("cloud_cover_mid", i) < 25 && at("cloud_cover_high", i) < 30 && !(at("precipitation", i) > 0);
        const fieryAt = i => at("cloud_cover_low", i) < 30 && Math.max(at("cloud_cover_mid", i), at("cloud_cover_high", i)) >= 30 && Math.max(at("cloud_cover_mid", i), at("cloud_cover_high", i)) <= 80 && !(at("precipitation", i) > 0.2);
        if (sr >= 0 && clearAt(sr)) add("clear_rise", d, date, `sunrise ${riseT}`, g.places, d);
        if (ss >= 0 && clearAt(ss)) add("clear_set", d, date, `sunset ${setT}`, g.places, d);
        if (ss >= 0 && fieryAt(ss)) add("fiery", d, date, `sunset ${setT}`, g.places, d); else if (sr >= 0 && fieryAt(sr)) add("fiery", d, date, `sunrise ${riseT}`, g.places, d);
        if (sr >= 0 && [sr, sr + 1, sr + 2].some(i => at("cloud_cover_low", i) >= 75 && at("cloud_cover_mid", i) < 35 && at("cloud_cover_high", i) < 60)) { const hp = await highPlaces(g); add("cloudsea", d, date, `morning, above 1,400 m`, hp, d); }
        if (sr >= 0 && [sr, sr + 1, sr + 2].some(i => at("visibility", i) != null && at("visibility", i) < 1000)) add("fog", d, date, "early morning", g.places, d);
        if (d > 0 && D.snowfall_sum[d - 1] >= 3) add("snow", d, date, `${Math.round(D.snowfall_sum[d - 1])} cm the day before`, g.places, d - 1);
        if (ss >= 0 && [ss - 1, ss, ss + 1].some(i => [80, 81, 82, 95, 96, 99].includes(at("weather_code", i)) && at("cloud_cover_low", i) < 70)) add("drama", d, date, `around sunset ${setT}`, g.places, d);
        // the night after this day: dark sky, Milky Way, moon, aurora
        if (typeof Astro === "undefined") continue;
        const noon = Date.parse(date + "T12:00:00Z") - off, st = Astro.sunTimes(noon, g.lat, g.lon, [-18, -0.833]);
        const dusk = st[-18]?.set, dawn = Astro.sunTimes(noon + 864e5, g.lat, g.lon, [-18])[-18]?.rise;
        if (dusk && dawn && dawn > dusk) {
          let dark = 0, core = 0, from = null, to = null, cloudsN = [];
          for (let t = dusk; t < dawn; t += 18e5) {
            const li = hi(new Date(t + off).toISOString()), cl = at("cloud_cover", li);
            if (cl != null) cloudsN.push(cl);
            const moonUp = Astro.moonAlt(t, g.lat, g.lon) > 0 && Astro.moonIllum(t).fraction > 0.25;
            if (!moonUp && cl != null && cl < 20) { dark += 30; if (Astro.coreAlt(t, g.lat, g.lon) > 10) { core += 30; from ??= t; to = t + 18e5; } }
          }
          const hm = t => new Date(t + off).toISOString().slice(11, 16);
          if (core >= 60) add("milky", d, date, `${hm(from)}–${hm(to)}`, g.places, d);
          else if (dark >= 120) add("stars", d, date, `${Math.round(dark / 60)} h of dark sky`, g.places, d);
          // aurora: NOAA Kp in the dark hours, against what this latitude needs, with a clear-ish sky
          if (kp.length && Math.abs(g.lat) > 44) {
            const need = Math.max(1, Math.min(9, (67 - Math.abs(g.lat)) / 2.5));
            const maxKp = Math.max(0, ...kp.filter(x => x.t >= dusk - 3 * 36e5 && x.t <= dawn).map(x => x.kp));
            const cloudy = cloudsN.length ? cloudsN.reduce((a, x) => a + x, 0) / cloudsN.length : 100;
            if (maxKp >= need && cloudy < 50) add("aurora", d, date, `Kp ${maxKp.toFixed(0)} · needs ${need.toFixed(0)} here`, g.places, d === 0 ? 2 : 4);
          }
        }
        // full moon rising within an hour of sunset
        const sunset = st[-0.833]?.set;
        if (sunset && Astro.moonIllum(sunset).fraction > 0.93) {
          for (let t = sunset - 45 * 6e4; t < sunset + 75 * 6e4; t += 5 * 6e4) {
            if (Astro.moonAlt(t, g.lat, g.lon) <= 0 && Astro.moonAlt(t + 5 * 6e4, g.lat, g.lon) > 0) {
              const li = hi(new Date(t + off).toISOString());
              if (!(at("cloud_cover_low", li) > 60)) add("moonrise", d, date, `moonrise ${new Date(t + 5 * 6e4 + off).toISOString().slice(11, 16)} · sunset ${setT}`, g.places, d);
              break;
            }
          }
        }
      }
    }
    const order = Object.keys(PF);
    return [...out.values()].sort((a, b2) => a.day - b2.day || order.indexOf(a.type) - order.indexOf(b2.type));
  }

  let hubAlert = null;
  /* ======== The Folk Hub (hub.js + hub.css, loaded only when the Hub opens; data from supabase-folk-hub-2.sql) ======== */
  let hubJs = null;
  function hubKit() {
    const fitTo = (pts, n = 0) => {
      if (!pts.length) return;
      if (!map || (!loaded && !guestLoaded)) { if (n < 25) setTimeout(() => fitTo(pts, n + 1), 400); return; }
      const go = () => map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])).pad(0.2), { maxZoom: 12 });
      if (ui === "earth" && onGlobe) cinematic(pts[0].lat, pts[0].lon, go); else go();
    };
    return {
      api, ensureSession, esc, avatarUrl, initials, signPhotos, condAgo, factValue: f => factValue(f), displayName, toast,
      CLUSTERS, COND, TOPIC, BASIS, CATS,
      who: () => { const member = !!session && !guest && (admin || memberStatus === "approved"); return { session: !!session, member, guest: !member, uid: myUid(), admin }; },
      track: ev => window.fcTrack?.(ev),
      goPlace: id => { deepPlace = +id; hubToMap(() => openDeepPlace()); },
      toMap: pts => { location.hash = "spotfolk"; setTimeout(() => fitTo((pts || []).filter(p => p.lat != null)), 700); },
      guestFavs: () => [...(guest ? favs : guestFavs())],
      setFav: async (id, on) => {
        id = +id;
        if (!session || guest) {
          const set = guest ? favs : guestFavs(); on ? set.add(id) : set.delete(id);
          try { localStorage.setItem(GUEST_FAVS, JSON.stringify([...set])); } catch {}
        } else {
          if (on) await api("/rest/v1/spot_favorites", { method: "POST", body: { spot_id: id }, headers: { Prefer: "return=minimal,resolution=ignore-duplicates" } });
          else await api(`/rest/v1/spot_favorites?spot_id=eq.${id}&user_id=eq.${encodeURIComponent(myUid())}`, { method: "DELETE" });
          on ? favs.add(id) : favs.delete(id);
        }
        const s = spotById(id); if (s) markerById.get(id)?.setIcon(pinIcon(s));
      },
      openProfile: uid => openMemberProfile(uid),
      placeLink: s => placeLink(s)
    };
  }
  function showHub() {
    const box = document.getElementById("folkHub"); if (!box) return;
    if (!hubJs) hubJs = new Promise((res, rej) => {
      const v = (document.querySelector('script[src*="spots.js"]')?.getAttribute("src") || "").split("?v=")[1] || "";
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = `hub.css${v ? `?v=${v}` : ""}`; document.head.append(css);
      const js = document.createElement("script"); js.src = `hub.js${v ? `?v=${v}` : ""}`; js.onload = res; js.onerror = rej; document.head.append(js);
    });
    if (!box.firstElementChild) box.innerHTML = `<p class="gate-note" style="text-align:center;padding:80px 16px">The Folk Hub is loading…</p>`;
    hubJs.then(() => window.FolkHub.mount(box, hubKit()))
      .catch(() => { hubJs = null; box.innerHTML = `<p class="gate-note" style="text-align:center;padding:80px 16px">The Folk Hub could not load. Check your connection and try again.</p>`; });
  }
  // the first Folk Hub (photo forecast, From Fabio, the folk room, the founding folk): kept, not shown
  async function showHubV1() {
    const box = document.getElementById("folkHub"); if (!box) return;
    if (!hubData) box.innerHTML = `<div class="fh-hero"><div class="fh-hero-in"><span class="fh-live">THE FOLK HUB</span><h2>Gathering <em>the folk…</em></h2></div></div>`;
    loadHub();
    if (!spots.length) {
      try {
        if (await ensureSession()) { const sp = await fetchSpots(); if (sp?.length && !spots.length) spots = sp; }
        else if (!guestLoaded) { guest = true; await loadPublic(); }
      } catch {}
      if (hubData) hubForecast(box);
    }
  }
  // from the Hub to the map: open a place, or light up the places of an alert
  function hubToMap(fn) { location.hash = "spotfolk"; setTimeout(fn, 700); }
  function applyHubAlert() {
    if (!hubAlert || !map || !spots.length) return;
    const a = hubAlert, pts = a.places.map(spotById).filter(Boolean); if (!pts.length) return;
    hubAlert = null;
    const go = () => { map.fitBounds(L.latLngBounds(pts.map(s => [s.lat, s.lon])).pad(0.3), { maxZoom: 11 }); pfOn = a.id; pfOpen = true; pfKey = ""; setTimeout(drawPf, 900); };
    if (ui === "earth" && onGlobe) cinematic(pts[0].lat, pts[0].lon, go); else go();
  }

  /* ======== The Folk Hub: right now on the map (photo forecast), from Fabio, the folk room, the founding folk ======== */
  let hubV = true, hubData = null, hubAt = 0, hubBusy = false, hubPf = null, hubPfAt = 0;
  const HUB_IMG = { snow: "photo", cloudsea: "photo", fog: "photo", fiery: "hike", clear_set: "hike", clear_rise: "hike", drama: "road", stars: "night", milky: "night", aurora: "night", moonrise: "night" };
  const CAT_IMG = { spot: "photo", trekking: "hike", restaurant: "food", hotel: "slow", experience: "road", workshop: "photo" };
  const wfImg = k => `img/wf/${k || "photo"}.jpg`;
  const DEFAULT_AREA = { s: 46.25, w: 11.3, n: 46.85, e: 12.35, name: "the Dolomites" };
  const weekStart = t => { const d = new Date(t); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return d.getTime(); };
  async function loadHub(force) {
    const box = document.getElementById("folkHub"); if (!box || !hubV) return;
    if (!force && hubData && Date.now() - hubAt < 5 * 60e3) { paintHub(box); return; }
    if (hubBusy) return; hubBusy = true;
    try { const { data } = await api("/rest/v1/rpc/folk_hub", { method: "POST", body: {} }); hubData = data || {}; hubAt = Date.now(); }
    catch (err) { hubData = { items: [], stats: {}, founders: [], opportunities: [], to_check: [] }; hubAt = Date.now(); }   // the folk room needs supabase-folk-hub.sql: the rest of the Hub works anyway
    hubBusy = false;
    // photos of the places in the feed (thumbnails; visitors only get the public ones)
    const paths = [...new Set([...(hubData.items || []).map(i => i.photo || i.extra?.path), ...(hubData.opportunities || []).map(o => o.photo)].filter(Boolean))].slice(0, 60);
    hubData._urls = paths.length ? await signPhotos(paths, true).catch(() => ({})) : {};
    paintHub(box);
    hubForecast(box);
  }
  const hubPhoto = (path, fallback) => (path && (hubData._urls?.[path.replace(/\.jpg$/i, "-t.jpg")] || hubData._urls?.[path])) || wfImg(fallback);
  const hubWho = i => i.name || `A ${i.folk && CLUSTERS[i.folk] ? folkOf(i.folk).toLowerCase() : "folk"}`;
  function hubFace(i, size = 52) {
    const c = CLUSTERS[i.folk];
    return `<span class="fh-av" style="--c:${c?.color || "#ffd27a"};--s:${size}px">${i.avatar ? `<img src="${esc(avatarUrl(i.avatar))}" alt="">` : `<span>${esc(i.name ? initials(i.name) : "?")}</span>`}${i.folk === "fabio" ? "<i>★</i>" : c ? `<i>${c.ico}</i>` : ""}</span>`;
  }
  function hubItem(i) {
    const c = CLUSTERS[i.folk], when = condAgo(i.at), place = i.open ? `<b>${esc(i.spot)}</b>` : `a place in <b>${esc(i.zone)}</b>`;
    const head = `<div class="fh-who">${hubFace(i)}<span><b>${esc(hubWho(i))}</b>${c ? `<span class="fh-chip" style="--c:${c.color}">${c.ico} ${esc(folkOf(i.folk))}</span>` : i.folk === "fabio" ? `<span class="fh-chip" style="--c:#ffd27a">★ Fabio's pick</span>` : ""}<small>${when}${i.extra?.on_spot ? " · 📍 on the spot" : ""}</small></span></div>`;
    const lock = !i.open ? (guest && !session ? `<div class="fh-lock"><span>🔒 This place is on the folk's map.</span><button type="button" data-hubjoin>Become folk to see where →</button></div>` : `<p class="fh-what" style="color:var(--fh-mute)">🛡️ A fragile place: its name stays among the folk who know it.</p>`) : "";
    const open = i.open && i.spot_id ? `<button type="button" data-hubgo="${i.spot_id}">Open the place →</button>` : "";
    let what = "", extra = "", big = false, acts = open;
    if (i.kind === "sign") { what = `${i.folk === "fabio" ? "picked" : "signed"} ${place}`; big = i.open && !!i.txt;
      extra = `${i.extra?.first ? `<span class="fh-tag gold">👑 First to sign it</span>` : ""}${i.txt ? `<p class="fh-q">“${esc(i.txt)}”</p>` : ""}`; }
    if (i.kind === "cond") { const k = COND[i.extra?.cond] || ["📣", "An update"]; what = `says how it is now at ${place}`; extra = `<span class="fh-cond">${k[0]} ${esc(k[1])}</span>${i.txt ? `<p class="fh-what">“${esc(i.txt)}”</p>` : ""}`;
      if (i.open) acts = `<button type="button" class="y" data-hubsame="${i.spot_id}:${esc(i.extra?.cond || "")}">✓ Still so</button>${open}`; }
    if (i.kind === "fact" || i.kind === "check") { const t = TOPIC[i.extra?.topic] || ["🧭", "Before you go"]; what = `${i.kind === "check" ? "checked" : i.extra?.changed ? "updated" : "added"} <b>${t[0]} ${esc(t[1])}</b> at ${place}`;
      extra = i.txt ? `<p class="fh-what">“${esc(i.txt)}”</p>` : ""; if (i.open && i.extra?.fact_id) acts = `<button type="button" class="y" data-hubcheck="${i.extra.fact_id}">✓ Still correct</button>${open}`; }
    if (i.kind === "story") { what = `told a story about ${place}`; big = i.open; extra = `${i.extra?.title ? `<p class="fh-title">${esc(i.extra.title)}</p>` : ""}${i.txt ? `<p class="fh-what">${esc(i.txt)}${i.txt.length >= 240 ? "…" : ""}</p>` : ""}`; }
    if (i.kind === "impression") { const b = BASIS[i.extra?.on_spot ? "onspot" : i.extra?.basis]; what = `gave impressions of ${place}`; extra = `<span class="fh-cond">⛰ ${i.extra?.score ?? ""}/5${b ? ` · ${b[0]} ${b[1]}` : ""}</span>`; }
    if (i.kind === "photo") { what = `added a photo of ${place}`; big = i.open && !!i.extra?.path; }
    if (i.kind === "place") { what = `added ${place} to the map`; extra = `<span class="fh-tag">No folk yet: be the first to sign it</span>`; }
    const img = big ? `<div class="fh-ph"><img src="${esc(hubPhoto(i.kind === "photo" ? i.extra?.path : i.photo, CAT_IMG[i.category]))}" alt="" loading="lazy"><span class="fh-ty">${i.kind === "sign" ? (i.folk === "fabio" ? "★ Fabio's pick" : i.extra?.first ? "✍ Signed · 👑 First folk" : "✍ Signed") : i.kind === "story" ? "💬 Story" : "📷 Photo"}</span><div class="fh-pl"><b>${esc(i.spot)}</b><small>${esc(i.zone)}</small></div></div>` : "";
    return `<article class="fh-it${big ? " big" : ""}">${img}<div class="fh-in">${head}<p class="fh-what">${what}</p>${extra}${lock}${acts ? `<div class="fh-acts">${acts}</div>` : ""}</div></article>`;
  }
  function paintHub(box) {
    const d = hubData || {}, items = (d.items || []).filter(i => i.kind !== "place" || i.open), st = d.stats || {};
    const tot = (st.signs || 0) + (st.checks || 0) + (st.stories || 0);
    const faces = [...new Map(items.filter(i => i.name).map(i => [i.user_id, i])).values()].slice(0, 6);
    // weeks
    const weeks = new Map(); items.forEach(i => { const w = weekStart(i.at); (weeks.get(w) || weeks.set(w, []).get(w)).push(i); });
    const thisW = weekStart(Date.now()), loc = window.I18N?.locale || "en-GB";
    const wLabel = w => w === thisW ? "This week" : w === thisW - 7 * 864e5 ? "Last week" : `${new Date(w).toLocaleDateString(loc, { day: "numeric", month: "short" })} – ${new Date(w + 6 * 864e5).toLocaleDateString(loc, { day: "numeric", month: "short" })}`;
    const fab = items.find(i => i.folk === "fabio" && i.open && i.txt);
    const left = st.members != null ? Math.max(0, 100 - st.members) : null;
    box.innerHTML = `
      <div class="fh-hero" data-hubhero style="--img:url(${wfImg("photo")})"><div class="fh-hero-in"><span class="fh-live">THE FOLK HUB</span><h2>The map, <em>signed by the folk.</em></h2><p>What's happening on the map right now, and what the folk are bringing to it.</p></div></div>
      <div class="fh-wrap">
        <div data-hubnow hidden><div class="fh-sh"><div><p class="fh-kick">Right now</p><h2>What's happening <em>on the map</em></h2></div><p>Light, snow, stars and sea for the next 7 days, from the weather models. Always check before you go.</p></div>
        <div class="fh-mosaic" data-hubmosaic></div></div>
        ${fab ? `<div class="fh-sh"><div><p class="fh-kick">From Fabio</p><h2>Where it <em>all started</em></h2></div><p>The photographer behind the map, and his places.</p></div>
          <article class="fh-fabio"><div class="fh-fph"><img src="${esc(hubPhoto(fab.photo, CAT_IMG[fab.category]))}" alt="" loading="lazy"></div>
            <div class="fh-ftx"><p class="fh-kick">★ Fabio's pick · ${esc(fab.spot)}</p><q>${esc(fab.txt)}</q>
              <div class="fh-who">${hubFace(fab, 58)}<span><b>Fabio</b><small>📷 Photo folk · founding folk #1</small></span></div>
              <div class="fh-acts"><button type="button" data-hubgo="${fab.spot_id}">Open the place →</button></div></div></article>` : ""}
        <div class="fh-sh" id="folkRoom"><div><p class="fh-kick">The folk room</p><h2>What the folk <em>are bringing</em></h2></div><p>Signatures, conditions, checks and stories from people who were there. Every line has a name and a date.</p></div>
        ${tot >= 10 ? `<div class="fh-sum"><div class="fh-faces">${faces.map(f => hubFace(f, 44)).join("")}</div><p><b>This month: ${st.signs} signatures · ${st.checks} checks · ${st.stories} stories</b> from ${st.folk} folk</p></div>` : ""}
        <div class="fh-tabs">${[["all", "All"], ["sign", "✍ Signatures"], ["cond", "📣 Conditions"], ["fact", "🧭 Before you go"], ["story", "💬 Stories"]].map(([k, l]) => `<button type="button" data-hubtab="${k}" class="${(box._tab || "all") === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="fh-feed">${items.length ? [...weeks.entries()].sort((a, b) => b[0] - a[0]).map(([w, list]) => {
            const shown = list.filter(i => !box._tab || box._tab === "all" || i.kind === box._tab || (box._tab === "fact" && i.kind === "check") || (box._tab === "story" && i.kind === "impression"));
            return shown.length ? `<p class="fh-wk"><b>${esc(wLabel(w))}</b></p>${shown.map(hubItem).join("")}` : ""; }).join("") || `<p class="fh-empty">Nothing of this kind yet: be the first.</p>`
          : `<div class="fh-room"><h3>The folk room <em>is waiting for its first voices.</em></h3><p>Sign a place you've been, tell the folk how it is now, or check what they wrote: your name will be among the first.</p></div>`}</div>
        ${(d.opportunities || []).length || (d.to_check || []).length ? `<div class="fh-sh"><div><p class="fh-kick">👑 Your turn</p><h2>Waiting for their <em>First folk</em></h2></div><p>Sign one of these first, and your name stays on it. Forever.</p></div>
          <div class="fh-crowns">${(d.opportunities || []).map(o => `<button type="button" class="fh-cr" data-hubgo="${o.spot_id}"><img src="${esc(hubPhoto(o.photo, CAT_IMG[o.category]))}" alt="" loading="lazy"><span class="fh-crown">👑</span><span class="fh-ct"><b>${esc(o.spot)}</b><small>${esc((CATS[o.category] || CATS.spot).label)}${o.zone ? ` · ${esc(o.zone)}` : ""}</small><span>Sign it first</span></span></button>`).join("")}</div>
          ${(d.to_check || []).length ? `<ul class="fh-old">${d.to_check.map(o => `<li>🧭 <b>${esc(o.spot)}</b> · ${esc((TOPIC[o.topic] || ["", "info"])[1])} from ${condAgo(o.at)} <button type="button" data-hubgo="${o.spot_id}">Check it →</button></li>`).join("")}</ul>` : ""}` : ""}
        ${(d.founders || []).length ? `<div class="fh-sh"><div><p class="fh-kick">The first 100</p><h2>The <em>founding folk</em></h2></div><p>A number in the passport that will never come back.</p></div>
          <div class="fh-founders">${d.founders.map(f => `<div class="fh-fd">${hubFace({ name: f.name, avatar: f.avatar, folk: null }, 96)}<b>${esc(f.name)}</b><small>#${f.rank}</small></div>`).join("")}
            ${guest && !session && left > 0 ? `<button type="button" class="fh-fd you" data-hubjoin><span class="fh-av" style="--s:96px"><span>#${(st.members || 0) + 1}</span></span><b>You?</b><small>${left} left</small></button>` : ""}</div>` : ""}
      </div>
      ${guest && !session ? `<div class="fh-end"><h2>Your signature <em>could be next.</em></h2><p>Pick your folk, sign a place you love, and you're part of the map.</p><button type="button" class="fh-btn" data-hubjoin>Become folk — free</button></div>` : ""}`;
    wireHub(box);
    if (hubPf) paintHubForecast(box);
  }
  function wireHub(box) {
    const goSpot = id => { deepPlace = +id; hubToMap(() => openDeepPlace()); };
    box.querySelectorAll("[data-hubgo]").forEach(b => b.addEventListener("click", () => { window.fcTrack?.("Hub: place opened from feed"); goSpot(b.dataset.hubgo); }));
    box.querySelectorAll("[data-hubjoin]").forEach(b => b.addEventListener("click", () => { window.fcTrack?.("Hub: join"); location.hash = "join"; }));
    box.querySelectorAll("[data-hubtab]").forEach(b => b.addEventListener("click", () => { box._tab = b.dataset.hubtab; paintHub(box); }));
    const member = () => { if (guest || !session) { location.hash = "join"; return false; } return true; };
    box.querySelectorAll("[data-hubcheck]").forEach(b => b.addEventListener("click", async () => {
      if (!member()) return; b.disabled = true;
      try { await api("/rest/v1/fact_checks", { method: "POST", headers: { Prefer: "return=minimal,resolution=ignore-duplicates" }, body: { fact_id: +b.dataset.hubcheck, author_name: displayName() } });
        b.textContent = "✓ Thanks!"; window.fcTrack?.("Hub: fact checked"); } catch (err) { toast(/row-level|policy/i.test(err.message) ? "You can't confirm your own information." : `Could not save it: ${err.message}`, true); b.disabled = false; }
    }));
    box.querySelectorAll("[data-hubsame]").forEach(b => b.addEventListener("click", async () => {
      if (!member()) return; const [id, kind] = b.dataset.hubsame.split(":"); if (!COND[kind]) return; b.disabled = true;
      try { await api("/rest/v1/place_conditions", { method: "POST", headers: { Prefer: "return=minimal" }, body: { spot_id: +id, kind, author_name: displayName(), expires_at: new Date(Date.now() + COND[kind][2] * 36e5).toISOString() } });
        b.textContent = "✓ Thanks!"; window.fcTrack?.("Hub: condition confirmed"); } catch (err) { toast(`Could not save it: ${err.message}`, true); b.disabled = false; }
    }));
  }
  // «Right now on the map»: the photo forecast of the area in view (or the Dolomites), as a hero and a mosaic
  async function hubForecast(box) {
    if (typeof Astro === "undefined" || !spots.length) return;
    if (hubPf && Date.now() - hubPfAt < 30 * 60e3) return paintHubForecast(box);
    let area = DEFAULT_AREA, b;
    if (map && map.getZoom?.() >= PF_ZOOM && !(ui === "earth" && onGlobe) && document.body.dataset.page === "spots") { const mb = map.getBounds(); area = { s: mb.getSouth(), w: mb.getWest(), n: mb.getNorth(), e: mb.getEast(), name: "the area on the map" }; }
    b = { getSouth: () => area.s, getWest: () => area.w, getNorth: () => area.n, getEast: () => area.e, contains: ([la, lo]) => la >= area.s && la <= area.n && lo >= area.w && lo <= area.e };
    try { hubPf = { area, alerts: await computePf(b) }; hubPfAt = Date.now(); } catch { return; }
    paintHubForecast(document.getElementById("folkHub") || box);
  }
  function paintHubForecast(box) {
    const hero = box.querySelector("[data-hubhero]"), mos = box.querySelector("[data-hubmosaic]"); if (!hero || !hubPf) return;
    const prio = ["snow", "aurora", "milky", "cloudsea", "moonrise", "fiery", "drama", "fog", "stars", "clear_set", "clear_rise"];
    const al = hubPf.alerts.slice().sort((a, b) => a.day - b.day || prio.indexOf(a.type) - prio.indexOf(b.type));
    const top = al.filter(a => a.day <= 2).sort((a, b) => prio.indexOf(a.type) - prio.indexOf(b.type) || a.day - b.day)[0] || al[0];
    const dayW = d => d === 0 ? "today" : d === 1 ? "tomorrow" : "in " + d + " days";
    const HERO_T = { snow: ["The first snow", "is here."], aurora: ["Aurora", "possible."], milky: ["The Milky Way", "is up."], cloudsea: ["A sea of clouds", "is coming."], moonrise: ["A full moon", "at sunset."],
      fiery: ["The sky could", "catch fire."], drama: ["Dramatic light", "is coming."], fog: ["Fog in the valleys,", "light above."], stars: ["Dark skies", "for the stars."], clear_set: ["A clear sunset", "is coming."], clear_rise: ["A clear sunrise", "is coming."] };
    if (top) {
      const [ic, lb] = PF[top.type], [t1, t2] = HERO_T[top.type];
      hero.style.setProperty("--img", `url(${wfImg(HUB_IMG[top.type])})`);
      hero.innerHTML = `<div class="fh-hero-in"><span class="fh-live">LIVE ON THE MAP · ${esc(hubPf.area.name)}</span><h2>${esc(t1)} <em>${esc(t2)}</em></h2>
        <p>${ic} ${esc(lb)} ${dayW(top.day)} · ${esc(top.when)} · ${top.places.length} place${top.places.length > 1 ? "s" : ""}. ${confOf(top.conf ?? top.day)[2] === "reliable" ? "" : "An estimate: check the forecast before you go."}</p>
        <div class="fh-ctas"><button type="button" class="fh-btn" data-hubalert="${top.id}">See the places on the map →</button></div></div>`;
    } else hero.innerHTML = `<div class="fh-hero-in"><span class="fh-live">ON THE MAP</span><h2>Quiet skies <em>this week.</em></h2><p>Nothing special in the forecast for ${esc(hubPf.area.name)}: a good week to plan, or to try another area.</p></div>`;
    const tiles = al.filter(a => a !== top).slice(0, 3);
    const now = box.querySelector("[data-hubnow]"); if (now) now.hidden = !tiles.length;
    if (mos) mos.innerHTML = tiles.length ? tiles.map((a, n) => { const [ic, lb] = PF[a.type]; return `<button type="button" class="fh-tile${n === 0 ? " big" : ""}" data-hubalert="${a.id}" style="--img:url(${wfImg(HUB_IMG[a.type])})">
        <span class="fh-src">${a.type === "aurora" ? "NOAA SWPC" : ["moonrise"].includes(a.type) ? "astronomy" : "Open-Meteo"} · ${confOf(a.conf ?? a.day)[0]}</span>
        <span class="fh-tt"><small>${ic} ${esc(dayW(a.day))}</small><b>${esc(lb)}</b><span>${esc(a.when)} · ${a.places.length} place${a.places.length > 1 ? "s" : ""}</span></span></button>`; }).join("") : "";
    box.querySelectorAll("[data-hubalert]").forEach(b => b.addEventListener("click", () => {
      const a = hubPf.alerts.find(x => x.id === b.dataset.hubalert); if (!a || !map) return;
      window.fcTrack?.("Hub: photo alert opened", { type: a.type });
      hubAlert = a; hubToMap(applyHubAlert);
    }));
  }

  /* Place pulse: the sea, only for places on the coast (Open-Meteo Marine: waves, swell, water temperature, tides) */
  const seaCache = new Map();
  const SEA_STATE = h => h < 0.1 ? ["Calm", "glassy water, perfect reflections"] : h < 0.5 ? ["Calm", "reflections and silky long exposures"]
    : h < 1.25 ? ["Slight", "gentle movement on the rocks"] : h < 2.5 ? ["Rough", "foam and breaking waves"] : ["Very rough", "dramatic swell: keep well away from the rocks"];
  const compass = d => Number.isFinite(d) ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((d % 360) + 360) % 360 / 45) % 8] : "";
  async function loadSea(popup, s) {
    const box = popup.getElement()?.querySelector("[data-sea]");
    if (!box || box.dataset.done) return;
    box.dataset.done = "1";
    const k = `${s.lat.toFixed(2)},${s.lon.toFixed(2)}`;
    let w = seaCache.get(k);
    if (!w || Date.now() - w.at > 30 * 60e3) {
      try {
        const r = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${s.lat.toFixed(4)}&longitude=${s.lon.toFixed(4)}`
          + "&current=wave_height,wave_direction,wave_period,swell_wave_height,sea_surface_temperature"
          + "&daily=wave_height_max,wave_direction_dominant&hourly=sea_level_height_msl&timezone=auto&forecast_days=7");
        if (!r.ok) { seaCache.set(k, { at: Date.now(), d: null }); return; }
        w = { at: Date.now(), d: await r.json() }; seaCache.set(k, w);
      } catch { return; }
    }
    const c = w.d?.current || {}, d = w.d?.daily || {};
    if (!Number.isFinite(c.wave_height)) return;   // inland: no sea here
    const loc = window.I18N?.locale || "en-GB";
    const [state, hint] = SEA_STATE(c.wave_height);
    const m = x => x.toFixed(1).replace(/\.0$/, "");
    // tides today: highs and lows of the sea level, shown only where the tide is worth it (≥ 0.5 m)
    let tides = "";
    const hh = w.d.hourly || {}, lv = (hh.sea_level_height_msl || []).slice(0, 25), tt = (hh.time || []).slice(0, 25);
    if (lv.filter(Number.isFinite).length > 12 && Math.max(...lv.filter(Number.isFinite)) - Math.min(...lv.filter(Number.isFinite)) >= 0.5) {
      const ev = [];
      for (let i = 1; i < lv.length - 1; i++) {
        if (![lv[i - 1], lv[i], lv[i + 1]].every(Number.isFinite)) continue;
        if (lv[i] >= lv[i - 1] && lv[i] > lv[i + 1]) ev.push(["🌕", "High tide", tt[i].slice(11, 16)]);
        if (lv[i] <= lv[i - 1] && lv[i] < lv[i + 1]) ev.push(["🌑", "Low tide", tt[i].slice(11, 16)]);
      }
      if (ev.length) tides = `<p class="sea-tides">${ev.slice(0, 4).map(([ic, l, h]) => `<span>${ic} <i>${l}</i> <b>${h}</b></span>`).join("")}</p>`;
    }
    const day = (t, i) => i === 0 ? "Today" : new Date(t + "T12:00:00").toLocaleDateString(loc, { weekday: "short" });
    box.innerHTML = `<p class="pc-cams-h">🌊 Sea now</p>
      <div class="wx-now sea-now sea-${state.toLowerCase().replace(/\s+/g, "-")}"><b>🌊</b><div><strong>${esc(state)}</strong> <em>${esc(hint)}</em>
        <p><span><i>waves</i> <b>${m(c.wave_height)} m</b>${Number.isFinite(c.wave_period) ? ` · ${Math.round(c.wave_period)} s` : ""}${compass(c.wave_direction) ? ` · ${compass(c.wave_direction)}` : ""}</span>
          ${Number.isFinite(c.swell_wave_height) ? `<span><i>swell</i> <b>${m(c.swell_wave_height)} m</b></span>` : ""}
          ${Number.isFinite(c.sea_surface_temperature) ? `<span><i>water</i> <b>${Math.round(c.sea_surface_temperature)}°</b></span>` : ""}</p></div></div>
      ${tides}
      ${d.time?.length ? `<div class="wx-days">${d.time.map((t, i) => { const h = d.wave_height_max[i]; const st = Number.isFinite(h) ? SEA_STATE(h)[0] : "";
        return `<div class="sea-d sea-${st.toLowerCase().replace(/\s+/g, "-")}"><small>${esc(day(t, i))}</small><b>${Number.isFinite(h) ? `${m(h)} m` : "–"}</b><em>${esc(st)}</em></div>`; }).join("")}</div>` : ""}
      <p class="pc-cams-by">Marine data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0) · Indicative, not for navigation</p>`;
    box.hidden = false;
    popup.update();
    window.fcTrack?.("Spots: sea shown");
  }

  /* webcams on the map: a layer to switch on, from valley zoom, one request per stop of the map */
  const CAMS_KEY = "sf-cams", CAM_ZOOM = 9;
  let camsOn = lsGet(CAMS_KEY, "0") === "1", camLayer = null, camKey = "", camTimer = null;
  const camArea = new Map();
  const CAM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3z"/></svg>';
  function scheduleCams() {
    clearTimeout(camTimer);
    if (!camLayer) return;
    if (!camsOn || !camsV) { camLayer.clearLayers(); camKey = ""; return; }
    camTimer = setTimeout(drawCams, 450);
  }
  async function drawCams() {
    if (!map || !camLayer || !camsOn) return;
    if (map.getZoom() < CAM_ZOOM) { camLayer.clearLayers(); camKey = ""; return; }
    const b = map.getBounds(), r = x => Math.round(x * 10) / 10;
    const n = Math.min(r(b.getNorth()) + .1, 90), so = Math.max(r(b.getSouth()) - .1, -90), e = r(b.getEast()) + .1, w = r(b.getWest()) - .1;
    const key = [n, e, so, w].join(",");
    if (key === camKey) return;
    camKey = key;
    let hit = camArea.get(key);
    if (!hit || Date.now() - hit.at > 8 * 60e3) {
      try {
        const res = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/functions/v1/webcam?n=${n}&e=${e}&s=${so}&w=${w}`, { headers: { apikey: SPOTS_CONFIG.anonKey } });
        if (res.status === 404) { camsV = false; return; }
        if (!res.ok) return;
        hit = { at: Date.now(), list: (await res.json()).cams || [] }; camArea.set(key, hit);
      } catch { return; }
    }
    if (camKey !== key || !camsOn) return;
    camLayer.clearLayers();
    hit.list.filter(c => c.lat != null).forEach(c => {
      L.marker([c.lat, c.lon], { zIndexOffset: -500, title: camName(c.title), icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="cam-pin">${CAM_SVG}</div>` }) })
        .on("click", () => openCamPlayer(c)).addTo(camLayer);
    });
  }
  function openCamPlayer(c) {
    let d = $("#camDialog");
    if (!d) { d = document.createElement("dialog"); d.id = "camDialog"; d.className = "cam-dialog"; document.body.appendChild(d); d.addEventListener("click", e => { if (e.target === d) d.close(); }); d.addEventListener("close", () => { d.innerHTML = ""; }); }
    d.innerHTML = `<button class="dialog-close" type="button" data-close aria-label="Close">${ICON.close}</button>
      <p class="cam-h"><b>${esc(camName(c.title))}</b><small>${esc(c.city || "")}</small></p>
      ${c.player ? `<div class="cam-frame"><iframe src="${esc(c.player)}" title="Webcam ${esc(camName(c.title))}" loading="lazy" allowfullscreen></iframe></div>` : `<img src="${esc(c.image)}" alt="">`}
      <p class="cam-by">Live webcam and timelapse provided by <a href="https://www.windy.com/" target="_blank" rel="noopener">Windy.com</a> · <a href="${esc(c.url)}" target="_blank" rel="noopener">Open on Windy ↗</a></p>`;
    d.querySelector("[data-close]").onclick = () => d.close();
    if (!d.open) d.showModal();
    window.fcTrack?.("Spots: webcam player opened");
  }

  // Windy titles read «Town - Ort - Paese: Valley - View»: keep what the camera looks at
  const camName = t => { const x = String(t || "").split(/:\s|›/).pop().trim(); return x.split(" - ").slice(-2).join(" · ") || t; };
  async function loadCams(popup, s) {
    const box = popup.getElement()?.querySelector("[data-cams]");
    if (!box || !camsV || box.dataset.done) return;
    box.dataset.done = "1";
    const k = `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
    let cams = camCache.get(k);
    if (!cams || Date.now() - cams.at > 8 * 60e3) {
      try {
        const r = await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/functions/v1/webcam?lat=${s.lat.toFixed(4)}&lon=${s.lon.toFixed(4)}`, { headers: { apikey: SPOTS_CONFIG.anonKey } });
        if (r.status === 404) { camsV = false; return; }
        if (!r.ok) return;
        cams = { at: Date.now(), list: (await r.json()).cams || [] }; camCache.set(k, cams);
      } catch { return; }
    }
    if (!cams.list.length) return;
    const ago = t => { const m = Math.round((Date.now() - new Date(t)) / 60e3); return !t || !Number.isFinite(m) ? "" : m < 60 ? `${Math.max(m, 1)} min ago` : m < 24 * 60 ? `${Math.round(m / 60)} h ago` : m < 48 * 60 ? "yesterday" : `${Math.round(m / 1440)} days ago`; };
    box.innerHTML = `<p class="pc-cams-h">📹 Live webcams nearby</p>
      <div class="pc-cams-grid">${cams.list.map(c => `<a href="${esc(c.url)}" target="_blank" rel="noopener" class="pc-cam">
        <img src="${esc(c.image)}" alt="Webcam: ${esc(camName(c.title))}" loading="lazy">
        <span><b title="${esc(c.title)}">${esc(camName(c.title))}</b><small>${c.lat != null ? `${kmBetween(s.lat, s.lon, c.lat, c.lon).toFixed(1)} km · ` : ""}${ago(c.updated)}</small></span></a>`).join("")}</div>
      <p class="pc-cams-by">Webcams provided by <a href="https://www.windy.com/" target="_blank" rel="noopener">Windy.com</a></p>`;
    box.hidden = false;
    box.querySelectorAll("img").forEach(i => i.addEventListener("error", () => i.closest(".pc-cam")?.remove()));
    box.querySelectorAll(".pc-cam").forEach((a, n) => a.addEventListener("click", ev => { const c = cams.list[n]; if (c?.player) { ev.preventDefault(); openCamPlayer(c); } }));
    popup.update();
    window.fcTrack?.("Spots: webcams shown");
  }

  function drawClusters() {
    setTimeout(openDeepPlace, 0);
    if (deepShare) setTimeout(openDeepShare, 0);
    if (hubAlert) setTimeout(applyHubAlert, 300);
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
      L.marker([lat, lon], { keyboard: true, title: trS("{n} places").replace("{n}", group.length),
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
    m.bindPopup(() => (guest && m._full) || node || (node = keepOpen(Object.assign(document.createElement("div"), { innerHTML: guest ? guestPopup(s) : popupHtml(s) }).firstElementChild)),
      { maxWidth: 320, minWidth: 260, className: "spot-popup" });
    m.on("popupopen", e => {
      openId = s.id;
      if (!guest && signV && commV) setTimeout(() => loadSigns(e.popup, s), 0);
      if (guest) {
        if (m._full) { loadExtras(e.popup, s); if (signV && commV) loadSigns(e.popup, s); return; }
        node.querySelector("[data-login]")?.addEventListener("click", () => { map.closePopup(); wantLogin = true; wantJoin = false; render(); });
        node.querySelector("[data-join]")?.addEventListener("click", () => { map.closePopup(); wantJoin = true; render(); });
        if (cardV) openPublicCard(e.popup, s, m);
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
    const sg = signMap.get(s.id), tier = signTier(s);
    const cls = ["spot-pin", tier ? `signed t${tier}` : "", sg?.fabio ? "pick" : "", s.outdated ? "outdated" : "", s.support_local ? "local" : "", s.fragile ? "fragile" : "", plane ? "plane" : "", offer ? "offer" : "", shineWs ? "shine" : "", shineLocal ? "shine-local" : ""].filter(Boolean).join(" ");
    const icon = plane ? ICON_PLANE : shineLocal ? ICON_LOCAL : cat.icon;
    const color = plane ? "#ffc46e" : shineLocal ? "#7ed69b" : cat.color;
    const alert = alertsOf(s).length ? `<span class="alert-dot" title="${esc(ALERTS[alertsOf(s)[0].kind].label)}"></span>` : "";
    return L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14], tooltipAnchor: [0, -14], popupAnchor: [0, -12],
      html: `<div class="${cls}" style="--c:${color}${sg?.top ? `;--fc:${CLUSTERS[sg.top].color}` : ""}"${tier || sg?.fabio ? ` title="${sg.fabio ? "Fabio's pick" : ""}${sg.fabio && tier ? " · " : ""}${tier ? trS("Signed by {n} folk").replace("{n}", sg.total) : ""}"` : ""}>${icon}${sg?.fabio ? `<span class="pick-star" aria-hidden="true">★</span>` : tier ? `<span class="folk-badge" aria-hidden="true">${CLUSTERS[sg.top].ico}</span>` : ""}${offer ? `<span class="offer-tag" aria-hidden="true">%</span>` : ""}${favs.has(s.id) ? `<span class="fav-dot" aria-hidden="true">♥</span>` : ""}${s.verified_at && !s.outdated ? `<span class="vf-dot" aria-hidden="true">✓</span>` : ""}${alert}</div>` });
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

  /* visitors: every place of the public selection opens with its full card (exact position, folk, stories, photos).
     The data come from public_place() in the database, only for those places; anything that writes asks to join. */
  let cardV = true;   // false until supabase-schede-pubbliche.sql has run
  const pubCache = new Map();
  function pubPlace(id) {
    if (!pubCache.has(id)) pubCache.set(id, api("/rest/v1/rpc/public_place", { method: "POST", body: { p_spot: id }, auth: false })
      .then(r => r.data || null).catch(err => { if ([400, 404].includes(err.status)) cardV = false; pubCache.delete(id); return null; }));
    return pubCache.get(id);
  }
  const GUEST_ACTS = "[data-factadd],[data-factyes],[data-factchg],[data-factdel],[data-condreport],[data-condsame],[data-meethere],[data-flagspot],[data-addphoto],[data-review],[data-flagphoto],[data-flagrev],[data-flagsign],[data-sign],[data-signas],[data-unsign],[data-useful],[data-ruseful],[data-pickstyles],[data-member],[data-authorp],[data-report],[data-curate],[data-alerts],[data-delrev],[data-editspot],[data-delete],[data-tkedit],[data-wsedit]";
  async function openPublicCard(popup, s, m) {
    const d = await pubPlace(s.id);
    if (!d?.spot || !guest || !popup.isOpen()) return;
    const x = d.spot;
    Object.assign(s, x, { lat: +x.lat, lon: +x.lon, category: CATS[x.category] ? x.category : "spot", list: s.list || "Public" });
    (d.profiles || []).forEach(p => { if (!profiles.some(q => q.user_id === p.user_id)) profiles.push(p); });
    const card = keepOpen(Object.assign(document.createElement("div"), { innerHTML: popupHtml(s) }).firstElementChild);
    card.addEventListener("click", ev => {   // signing, saving, writing: that's for the folk
      if (!ev.target.closest?.(GUEST_ACTS)) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      map.closePopup(); wantJoin = true; wantLogin = false; render(); setTimeout(() => root()?.scrollIntoView({ behavior: "smooth" }), 60);
    }, true);
    m._full = card;
    m.setLatLng([s.lat, s.lon]);
    popup.setContent(card);
    wirePopup(popup, s);
    if (signV && commV) loadSigns(popup, s);
    window.fcTrack?.("Spots: public card opened");
  }

  // a tap inside a card never reaches the map: when a button redraws part of the card, Leaflet would take it for a tap on the map and close the card
  function keepOpen(n) { n?.addEventListener("click", e => e.stopPropagation()); return n; }

  function guestPopup(s) {
    const cat = CATS[s.category] || CATS.spot;
    return `<div class="spot-pop">
      <span class="spot-cat" style="--c:${cat.color}">${cat.icon}${cat.label}${subLabel(s) ? ` · ${esc(subLabel(s))}` : ""}</span>
      <strong>${esc(s.name)}</strong>
      ${s.status && s.status !== "published" ? `<span class="ws-chip st-chip">${s.status === "review" ? "In review" : "Hidden"}</span>` : ""}
      ${s.avg_rating ? `<p class="pop-rating"><span class="stars-static" style="--v:${(s.avg_rating / 5 * 100).toFixed(0)}%">★★★★★</span> <b>${(+s.avg_rating).toFixed(1)}</b> · ${s.reviews} review${s.reviews > 1 ? "s" : ""}</p>` : ""}
      ${s.support_local ? `<p class="soc-note">🌱 Support local — your visit helps this place</p>` : ""}
      ${cardV && !session ? `<p class="spot-coords">${ICON.pin}<span>Opening the full card…</span></p>` : `<p class="spot-coords">${ICON.pin}<span>Approximate area (about 1 km)</span></p>`}
      ${cardV && !session ? "" : session ? `<div class="guest-cta">${LOCK_SVG}<p><b>Members see more.</b> You'll see the exact location, photos, reviews and alerts as soon as your account is approved.</p></div>`
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

  /* ---------- la scheda del luogo, a tendine: prima le persone (chi l'ha firmato, chi l'ha raccontato), poi il resto ----------
     The folk who know this place · Folk consensus · Folk stories · Folk pulse · Travel better · Place details */
  const PC_ICON = {
    before: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
    folk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4c-6 0-11 4.5-12.5 11L6 20M8.5 13.5l4 1M10 10l5 .5M12.5 7l4 .2"/><path d="M6 20c3-.5 6-2 8-4.5C17.5 11 19 7 20 4"/></svg>',
    cons: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20c-2-1.5-3.5-4-3.5-7.5M17 20c2-1.5 3.5-4 3.5-7.5M4.5 9c0 1.5 1 2.5 2 3M19.5 9c0 1.5-1 2.5-2 3M6 5.5c0 1.6.8 2.6 2 3.2M18 5.5c0 1.6-.8 2.6-2 3.2"/><path d="m12 7 1.4 2.8 3.1.5-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.2-2.2 3.1-.5z"/></svg>',
    stories: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01"/></svg>',
    pulse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12h4l2-5 3.5 11 3-8 1.5 2h5"/></svg>',
    travel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14z"/><path d="M5 19 13 11"/></svg>',
    details: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5h.01"/></svg>'
  };
  const pcSec = (k, title, sub, body, open) => `<details class="pc-sec pc-${k}"${open ? " open" : ""} data-sec="${k}">
      <summary><i class="pc-ico">${PC_ICON[k]}</i><span class="pc-st"><b>${title}</b><small>${sub}</small></span><em class="pc-cnt" data-cnt="${k}"></em><span class="pc-chev" aria-hidden="true"></span></summary>
      <div class="pc-body">${body}</div></details>`;
  /* consigli per viaggiare meglio: dal luogo (fragile, Support local, mesi migliori) e dalla categoria */
  function travelBetter(s) {
    const t = [];
    if (s.best_months) t.push(["🗓️", `Best time to go: <b>${esc(s.best_months)}</b>`]);
    t.push(["📅", "Visit early in the morning or outside peak season."]);
    if (s.category === "trekking") t.push(["🥾", "Check the weather and start early; tell someone your route."]);
    else if (s.category === "restaurant") t.push(["🍝", "Order what the locals order, and book ahead in high season."]);
    else if (s.category === "hotel") t.push(["🛏️", "Book directly with the owners when you can: more of what you pay stays here."]);
    else t.push(["🥾", "Respect the trails and private land, and stay on marked paths."]);
    t.push(["♻️", "Leave no trace — take your waste with you."]);
    return `<ul class="pc-tips">${t.map(([i, x]) => `<li><span aria-hidden="true">${i}</span><p>${x}</p></li>`).join("")}</ul>`;
  }
  // «Fabio's photos of this place»: the nearest place of Fabio's trips (app.js photosNear, from viaggi.json), opens the Gallery filtered on it
  function fabioPhotosHtml(s) {
    const m = window.photosNear?.(+s.lat, +s.lon); if (!m) return "";
    const href = `${SF_MODE ? "https://fabiocostaph.com/" : ""}#${m.hash}`;
    return `<a class="pc-fabio" href="${esc(href)}"${SF_MODE ? ' target="_blank" rel="noopener"' : ""} data-fabiophotos><span aria-hidden="true">📷</span><span><b>Fabio's photos of this place</b><small>${esc(m.name)} · ${m.n} ${window.I18N?.lang === "it" ? "foto" : m.n === 1 ? "photo" : "photos"}</small></span><em aria-hidden="true">→</em></a>`;
  }
  // «Meet here»: meet other folk at this place. Shows the meetups planned here (or within 1 km), or invites to plan one
  function meetHereHtml(s) {
    const near = upcomingMeetups().filter(m => m.spot_id === s.id || kmBetween(m.lat, m.lon, s.lat, s.lon) <= 1).sort((a, b) => String(a.meet_on).localeCompare(String(b.meet_on)));
    const next = near[0], going = next ? (meetupJoins.get(next.id) || []).length : 0;
    return `<div class="pc-meet${next ? " on" : ""}">
      <span class="pc-meet-ic" aria-hidden="true">👥</span>
      <span class="pc-meet-tx">${next ? `<b>${esc(next.title)}</b><small>${fmtDay(next.meet_on)}${next.meet_time ? ` · ${esc(next.meet_time)}` : ""} · ${going} ${window.I18N?.lang === "it" ? "partecipanti" : "going"}${near.length > 1 ? ` · +${near.length - 1}` : ""}</small>`
        : `<b>Meet the folk here</b><small>Pick a day: the folk nearby can join you.</small>`}</span>
      ${next ? `<button type="button" class="pc-meet-btn" data-meetgo="${next.id}">See it</button>` : ""}
      <button type="button" class="pc-meet-btn${next ? " line" : ""}" data-meethere>${next ? "＋ Another day" : "＋ Meet here"}</button>
    </div>`;
  }
  function popupHtml(s) {
    const cat = CATS[s.category] || CATS.spot;
    const gm = s.url && /^https?:\/\//.test(s.url) ? s.url : `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lon.toFixed(6)}`;
    const dates = datesText(s), crit = critFor(s);
    const folkBody = `<div data-folkbox><p class="pc-empty">No folk has signed it yet: be the first.</p></div>
      ${signV && commV ? `<div class="pop-signs" data-signs></div>` : ""}`;
    const consBody = `<div data-rating><p class="pc-empty">No impressions yet: be the first folk to give them.</p></div>
      ${schemaV2 ? `<button type="button" class="pc-share imp-open" data-impress>Give your impressions <span aria-hidden="true">＋</span></button>
        <form class="pop-review pc-form imp-form" data-impform hidden>
          <div class="rev-subs" data-revsubs><p class="rev-subs-h">Your impressions <small>all four, from 1 to 5</small></p>${crit.map(([k, l, d]) => `<div class="rev-sub" data-sub="${k}"><span>${l}<small>${d}</small></span><span class="rev-dots" role="radiogroup" aria-label="${l}">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="false" aria-label="${n}/5" data-subv="${n}"></button>`).join("")}</span></div>`).join("")}</div>
          <p class="rev-subs-h">How do you know this place?</p>
          <div class="imp-basis" data-basis>
            <button type="button" data-b="here">📍 I'm here now</button><button type="button" data-b="visited">🧳 I've been here</button><button type="button" data-b="local">🏡 I know the area</button>
          </div>
          <label class="imp-when" data-impwhen hidden>When? <input type="month" name="visited"></label>
          <label class="rev-folk" data-impfolk hidden>As <select name="ifolk"></select></label>
          <button type="submit" class="pop-btn primary">Save my impressions</button>
          <p class="byg-hint">Shown with your name, your folk and how you know the place: «I'm here now» is checked with your phone's position.</p>
        </form>` : ""}`;
    const storiesBody = `${schemaV2 ? `<button type="button" class="pc-share" data-review>Share your story <span aria-hidden="true">＋</span></button>
        <form class="pop-review pc-form" data-reviewform hidden>
          <label class="rev-folk" data-revfolk hidden>Telling it as <select name="folk"></select></label>
          <textarea rows="4" maxlength="2000" placeholder="Your story: what it was like, when to go, what to know…" aria-label="Your story"></textarea>
          <label class="att-photo" for="storyPh${s.id}">📸 <span data-attname>Add photos</span><input type="file" id="storyPh${s.id}" accept="image/*" multiple hidden data-attfile></label>
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
          <button type="submit" class="pop-btn primary">Publish your story</button>
        </form>` : ""}
        <div class="pop-reviews" data-reviews><p class="pc-empty">No stories yet.</p></div>`;
    const pulseBody = `<div class="pc-cond" data-cond></div><div class="pc-wx" data-wx hidden></div><div class="pc-wx pc-sea" data-sea hidden></div><div class="pc-cams" data-cams hidden></div><div data-pulse><p class="pc-empty">Quiet for now: the first signatures will make it move.</p></div>`;
    const travelBody = `
      ${s.fragile ? `<div class="pc-badge fragile"><p class="pc-bh"><span aria-hidden="true">🛡️</span><b>Fragile place</b></p>
        <ul><li>Stay on the paths and keep groups small.</li><li>No drones, no fires, nothing left behind.</li><li>No geotags on social media: the exact spot stays among the folk.</li></ul></div>` : ""}
      ${s.support_local ? `<div class="pc-badge local"><p class="pc-bh"><span aria-hidden="true">🌱</span><b>Support local</b></p>
        <p>This place lives on visitors like you: eat, sleep and buy from the people who live here.</p><div data-nearby></div></div>` : ""}
      ${travelBetter(s)}`;
    const detailsBody = `
      ${s.note ? `<p class="pop-desc">${ugc(s.note)}</p>` : ""}
      <dl class="pc-dl">
        <div><dt>${ICON.pin}Coordinates</dt><dd data-coords>${s.fragile ? `Approximate area (about 1 km)` : `${fmtCoord(s.lat, s.lon).replace("  |  ", " · ")} <button type="button" class="spot-copy" data-copy>Copy</button>`}</dd></div>
        ${s.best_months ? `<div><dt>📅 Best period</dt><dd>${esc(s.best_months)}</dd></div>` : ""}
        <div><dt>${cat.icon}Category</dt><dd>${esc(cat.label)}${subLabel(s) ? ` · ${esc(subLabel(s))}` : ""}</dd></div>
        ${infoRows(s.info).map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${/^https?:\/\//.test(b) ? `<a href="${esc(b)}" target="_blank" rel="noopener">${ICON.ext}Open</a>` : esc(b)}</dd></div>`).join("")}
      </dl>
      ${PRICED[s.category] ? `<p class="pop-spend" data-spend></p>` : ""}
      ${isTk(s) ? `<div data-tkbox>${tkBoxHtml(s)}</div>` : ""}
      ${isTk(s) && tkV && canEdit(s) ? `<button type="button" class="pop-btn ws-edit" data-tkedit>⛰️ Edit trail info</button>
        <form class="pop-review ws-form" data-tkform hidden>${tkFieldsHtml(s, "tk")}<button type="submit" class="pop-btn primary">Save</button></form>` : ""}
      <div data-wsbox>${wsBoxHtml(s)}</div>
      ${isWs(s) && wsV && canEdit(s) ? `<button type="button" class="pop-btn ws-edit" data-wsedit>👥 Update places, price and link</button>
        <form class="pop-review ws-form" data-wsform hidden>${wsFieldsHtml(s, "ws")}<button type="submit" class="pop-btn primary">Save</button></form>` : ""}
      <div data-vfbox>${verifyHtml(s)}</div>
      ${s.fragile ? "" : `<a class="pc-all" href="${esc(gm)}" target="_blank" rel="noopener">Open in Google Maps <span aria-hidden="true">→</span></a>`}
      <p class="pop-author">Added by ${s.created_by && !guest ? `<button type="button" class="text-link pop-authorp" data-authorp>${esc(s.author_name || OWNER)}</button>` : esc(s.author_name || OWNER)}${xpBadge(s.created_by)}</p>
      <div data-curate>${curateHtml(s)}</div>`;
    return `<div class="spot-pop pc">
      <header class="pc-top">
        <span class="spot-cat" style="--c:${cat.color}">${cat.icon}${cat.label}</span>
        <strong>${esc(s.name)}</strong>
        ${localNew(s) ? `<span class="ws-chip new local-chip">🌱 New in Support local</span>` : freshPlace(s) ? `<span class="ws-chip new local-chip">✨ New on the map</span>` : ""}
        ${dates ? `<p class="pop-dates">${ICON.cal}<span>${dates}</span></p>` : ""}
        ${s.support_local || s.fragile ? `<p class="pc-flags">${s.fragile ? `<button type="button" class="pc-flag fragile" data-gotravel>🛡️ Fragile place</button>` : ""}${s.support_local ? `<button type="button" class="pc-flag local" data-gotravel>🌱 Support local</button>` : ""}</p>` : ""}
        ${schemaV2 ? `<div class="pop-photos pc-photos" data-photos></div>` : ""}
        <p class="pc-condtop" data-condtop hidden></p>
        <p class="byg-top" data-facttop hidden></p>
        <div class="pop-alerts" data-alerts>${alertsHtml(s)}</div>
        ${fabioPhotosHtml(s)}
        ${commV ? meetHereHtml(s) : ""}
        <div class="pc-sharebar"><button type="button" class="pc-sh main" data-share>↗ Share this place</button>${s.fragile ? "" : `<button type="button" class="pc-sh" data-story>📲 Story</button>`}</div>
        ${admin && !guest && pubV ? `<div data-pubpick>${pubPickHtml(s)}</div>` : ""}
      </header>
      ${pcSec("folk", "The folk who know this place", "Real people, real experiences.", folkBody, true)}
      ${pcSec("before", "Before you go", "What to know, checked by the folk.", `<div class="pc-byg" data-byg><p class="pc-empty">Loading…</p></div>`)}
      ${pcSec("cons", "Folk consensus", "The collective impression of the folk.", consBody)}
      ${pcSec("stories", "Folk stories", "Experiences, tips and real advice.", storiesBody)}
      ${pcSec("pulse", "Place pulse", "Conditions now: weather, live webcams and the folk.", pulseBody)}
      ${pcSec("travel", "Travel better", "Help keep this place special.", travelBody)}
      ${pcSec("details", "Place details", "Where, when, how.", detailsBody)}
      ${schemaV2 ? `<div class="pop-actions pc-acts">
          ${commV ? `<button type="button" class="pop-btn fav-btn${favs.has(s.id) ? " on" : ""}" data-fav>${favs.has(s.id) ? "♥ Saved" : "♡ Save"}</button>` : ""}
          <button type="button" class="pop-btn pc-addph" data-addphoto>📸 Add a photo of this place</button>
          <input type="file" accept="image/*" multiple hidden data-photofile>
        </div>
        <p class="pop-rights">By adding a photo you confirm it's yours and accept the <a href="#photoRights" data-rights>photo terms</a>.</p>` : ""}
      ${schemaV2 && socialV ? `<div class="pop-actions">
          <button type="button" class="pop-btn" data-report>${ICON_ALERT}Report</button>
          ${canEdit(s) || canCurate(s) ? `<button type="button" class="pop-btn" data-social>Community settings</button>` : ""}
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
      ${canEdit(s) ? `<p class="pop-own"><button type="button" class="pop-btn" data-editspot>✎ Edit place</button><button type="button" class="spot-delete" data-delete>Delete</button></p>` : ""}
    </div>`;
  }

  async function wirePopup(popup, s) {
    const el = popup.getElement();
    el.querySelector("[data-copy]")?.addEventListener("click", ev => copyText(ev.currentTarget, `${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}`));
    el.querySelectorAll("[data-gotravel]").forEach(b => b.addEventListener("click", () => { const d = el.querySelector('[data-sec="travel"]'); if (d) { d.open = true; popup.update(); setTimeout(() => d.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60); } }));
    el.querySelectorAll(".pc-sec").forEach(d => d.addEventListener("toggle", () => popup.update()));
    el.querySelector('[data-sec="pulse"]')?.addEventListener("toggle", ev => { if (ev.currentTarget.open) { loadWeather(popup, s); loadSea(popup, s); loadCams(popup, s); } });
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
    el.querySelector("[data-share]")?.addEventListener("click", () => sharePlace(s));
    el.querySelector("[data-story]")?.addEventListener("click", ev => shareStory(s, el, ev.currentTarget));
    wireCurate(popup, s);
    el.querySelector("[data-meethere]")?.addEventListener("click", () => { map.closePopup(); withConduct(() => openMeetup({ lat: s.lat, lon: s.lon, spot: s })); });
    el.querySelector("[data-meetgo]")?.addEventListener("click", () => {
      const m = meetups.find(x => x.id === +el.querySelector("[data-meetgo]").dataset.meetgo); if (!m || !map) return;
      map.closePopup(); map.flyTo([m.lat, m.lon], Math.max(map.getZoom(), 14), { duration: .9 });
      map.once("moveend", () => commLayer?.eachLayer(l => { const ll = l.getLatLng?.(); if (ll && Math.abs(ll.lat - m.lat) < 1e-9 && Math.abs(ll.lng - m.lon) < 1e-9) l.openPopup(); }));
      window.fcTrack?.("Spots: meetup opened from a place");
    });
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
    wirePhotoPick(form);
    el.querySelector("[data-review]").addEventListener("click", () => withConduct(() => { form.hidden = !form.hidden; popup.update(); if (!form.hidden) (form.querySelector("[name=title]") || form.querySelector("textarea")).focus(); }));
    let rating = 0;
    const paint = () => form.querySelectorAll("[data-star]").forEach(b => { const on = +b.dataset.star <= rating; b.classList.toggle("on", on); b.setAttribute("aria-checked", +b.dataset.star === rating ? "true" : "false"); });
    form.querySelectorAll("[data-star]").forEach(b => b.addEventListener("click", () => { rating = +b.dataset.star === rating ? 0 : +b.dataset.star; paint(); }));
    const subs = {};
    const imp = el.querySelector("[data-impform]");
    const paintSubs = () => imp?.querySelectorAll("[data-sub]").forEach(row => { const v = subs[row.dataset.sub] || 0;
      row.querySelectorAll("[data-subv]").forEach(b => { b.classList.toggle("on", +b.dataset.subv <= v); b.setAttribute("aria-checked", +b.dataset.subv === v ? "true" : "false"); }); });
    imp?.querySelectorAll("[data-sub]").forEach(row => row.querySelectorAll("[data-subv]").forEach(b => b.addEventListener("click", () => {
      const k = row.dataset.sub, n = +b.dataset.subv; subs[k] = subs[k] === n ? 0 : n; paintSubs(); })));
    let basis = "";
    el.querySelector("[data-impress]")?.addEventListener("click", () => withConduct(() => { imp.hidden = !imp.hidden; popup.update(); }));
    imp?.querySelectorAll("[data-b]").forEach(b => b.addEventListener("click", () => {
      basis = b.dataset.b; imp.querySelectorAll("[data-b]").forEach(x => x.classList.toggle("on", x === b));
      imp.querySelector("[data-impwhen]").hidden = basis !== "visited"; popup.update();
    }));
    imp?.addEventListener("submit", async e => {
      e.preventDefault();
      const given = SUBR.map(([k]) => subs[k]).filter(Boolean);
      if (given.length < SUBR.length) { imp.querySelector("[data-revsubs]")?.classList.add("need"); return toast("Give your impression on all four levels.", true); }
      if (!basis) return toast("Tell the folk how you know this place.", true);
      const btn = imp.querySelector("[type=submit]"); btn.disabled = true;
      let onSpot = false, b = basis;
      if (b === "here") { onSpot = await nearHere(s); if (!onSpot) { b = "visited"; toast("Your phone isn't at the place right now: saved as «I've been here».", true); } }
      const ym = imp.querySelector("[name=visited]")?.value;
      const body = { spot_id: s.id, author_name: displayName(), rating: Math.round(given.reduce((a, x) => a + x, 0) / given.length),
        ...Object.fromEntries(SUBR.map(([k]) => [k, subs[k]])), ...(folkV && clusterV ? { folk: imp.querySelector("[name=ifolk]")?.value || myStyles[0] || null } : {}),
        ...(basisV ? { basis: b === "here" ? "onspot" : b, on_spot: onSpot, visited_on: b === "visited" && ym ? `${ym}-01` : onSpot ? new Date().toISOString().slice(0, 10) : null } : {}) };
      try {
        await api("/rest/v1/spot_reviews?on_conflict=spot_id,user_id", { method: "POST", body, headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
        imp.hidden = true; toast(onSpot ? "📍 Impressions saved, on the spot. Thanks!" : "Impressions saved. Thanks!");
        window.fcTrack?.("Spots: impressions given", { basis: b });
        loadExtras(popup, s);
      } catch (err) {
        if (basisV && /basis|on_spot|visited_on/.test(err.message)) { basisV = false; btn.disabled = false; imp.requestSubmit(); return; }
        toast(`Could not save: ${err.message}`, true);
      }
      btn.disabled = false;
    });
    imp && (imp._setMine = r => {
      SUBR.forEach(([k]) => { subs[k] = r?.[k] || 0; }); paintSubs();
      basis = r?.basis === "onspot" ? "" : r?.basis || "";
      imp.querySelectorAll("[data-b]").forEach(x => x.classList.toggle("on", x.dataset.b === basis));
      imp.querySelector("[data-impwhen]").hidden = basis !== "visited";
      if (r?.visited_on) imp.querySelector("[name=visited]").value = String(r.visited_on).slice(0, 7);
    });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const body = form.querySelector("textarea").value.trim(), btn = form.querySelector("[type=submit]");
      const fv = n => form.querySelector(`[name=${n}]`)?.value;
      const paid = parseFloat(fv("paid")) >= 0 ? parseFloat(fv("paid")) : null;
      // the story is only the story: the impressions are given apart, in «Folk consensus»
      const subBody = {};
      if (subV && titleV) subBody.r_title = (form.querySelector("[name=title]")?.value || "").trim() || null;
      if (!body && paid == null && !subBody.r_title) { form.querySelector("textarea").focus(); return; }
      const extra = pricesV2 && PRICED[s.category] ? { paid, currency: paid != null ? fv("currency") : null,
        people: paid != null ? Math.max(1, parseInt(fv("people")) || 1) : null,
        nights: paid != null && s.category === "hotel" ? Math.max(1, parseInt(fv("nights")) || 1) : null,
        stay_type: s.category === "hotel" ? fv("stay") || null : null } : {};
      btn.disabled = true;
      try {
        await api("/rest/v1/spot_reviews?on_conflict=spot_id,user_id", { method: "POST",
          body: { spot_id: s.id, body: body || null, author_name: displayName(), ...extra, ...subBody, ...(folkV && clusterV ? { folk: fv("folk") || null } : {}) },
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
        const files = [...(form.querySelector("[data-attfile]")?.files || [])].filter(f => /^image\//.test(f.type)).slice(0, 3);
        if (files.length) { toast(`Uploading ${files.length} photo${files.length > 1 ? "s" : ""}…`); try { for (const f of files) await uploadPhoto(s.id, f); } catch (err) { toast(`A photo could not be uploaded: ${err.message}`, true); } const fi = form.querySelector("[data-attfile]"); if (fi) { fi.value = ""; fi.dispatchEvent(new Event("change")); } }
        form.hidden = true; toast("Thanks for your story!");
        loadExtras(popup, s);
      } catch (err) { toast(`Could not post: ${err.message}`, true); }
      btn.disabled = false;
    });
    form._setMine = r => {
      rating = r?.rating || 0; form.querySelector("textarea").value = r?.body || r?.r_title || ""; paint();   // stories have no title now: an old title-only story comes back as its text
      const ti = form.querySelector("[name=title]"); if (ti) ti.value = r?.r_title || "";
      const set = (n, v) => { const x = form.querySelector(`[name=${n}]`); if (x && v != null) x.value = v; };
      set("paid", r?.paid); set("currency", r?.currency); set("people", r?.people); set("nights", r?.nights); set("stay", r?.stay_type);
    };
    wirePubPick(popup, s);
    loadExtras(popup, s);
  }

  /* ---------- prezzi pagati dai membri (ristoranti, bar, hotel, B&B…) ---------- */
  const PRICED = { restaurant: true, hotel: true };
  const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "NOK", "SEK", "DKK", "ISK", "JPY", "AUD", "CAD", "VND", "THB", "IDR", "INR", "CNY", "KRW", "MXN", "BRL"];
  const STAY_TYPES = ["Hotel", "B&B", "Agriturismo / farm stay", "Apartment", "Hostel", "Mountain hut", "Camping", "Guesthouse", "Other"];
  let pricesV2 = true;
  const fmtMoney = (v, c) => { try { return new Intl.NumberFormat((window.I18N?.locale || "en-GB"), { style: "currency", currency: c || "EUR", maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); } catch { return `${v} ${c || ""}`; } };
  /* i quattro voti di una recensione, oltre alle stelle */
  const SUBR = [["r_experience", "Experience", "The overall experience"], ["r_authentic", "Authenticity", "The true character of the place"],
    ["r_access", "Accessibility", "How easy it is to reach and visit"], ["r_worth", "Worth the trip", "Does it really deserve a visit?"]];
  // i 4 livelli di valutazione cambiano con la categoria del luogo (stesse 4 colonne nel database)
  const CRIT = {
    spot: [["Experience", "The overall experience"], ["Authenticity", "The true character of the place"], ["Accessibility", "How easy it is to reach and visit"], ["Worth the trip", "Does it really deserve a visit?"]],
    restaurant: [["Food", "Taste and quality of the dishes"], ["Authenticity", "Local and real, not touristy"], ["Value for money", "What you get for what you pay"], ["Welcome", "How they treat you"]],
    hotel: [["Comfort", "Room, bed and quiet"], ["Location", "Where it is and what's around"], ["Value for money", "What you get for what you pay"], ["Welcome", "Hosts and service"]],
    trekking: [["Views", "What you see along the way"], ["Trail", "Condition of the path and signs"], ["Effort as described", "Is the difficulty as expected?"], ["Worth the effort", "Does it really deserve the walk?"]],
    workshop: [["Teaching", "What you learn"], ["Organisation", "Places, timing and logistics"], ["Value for money", "What you get for what you pay"], ["Worth it", "Would you do it again?"]],
    experience: [["Experience", "The overall experience"], ["Authenticity", "The true character of it"], ["Value for money", "What you get for what you pay"], ["Worth the trip", "Does it really deserve it?"]]
  };
  const critFor = s => SUBR.map(([k], i) => [k, ...(CRIT[s.category] || CRIT.spot)[i]]);
  // il punteggio di un racconto: la media dei suoi 4 livelli (le vecchie recensioni: le stelle)
  const revScore = r => { const v = SUBR.map(([k]) => r[k]).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : r.rating || null; };
  let basisV = true;   // false until supabase-impressioni.sql has run (how the folk knows the place)
  let rvV = true;   // false finché non c'è la tabella review_votes («Useful» sui racconti)
  let titleV = true;
  /* le recensioni con le colonne opzionali: se il database ne rifiuta una (file SQL non ancora eseguito),
     si toglie solo quella, guardando il messaggio d'errore, e si riprova — le altre restano */
  async function fetchReviews(id, tries = 0) {
    const cols = ["id", "user_id", "author_name", "rating", "body", "created_at"];
    if (folkV) cols.push("folk");
    if (subV) cols.push(...SUBR.map(x => x[0]));
    if (subV && titleV) cols.push("r_title");
    if (subV && basisV) cols.push("basis", "on_spot", "visited_on");
    if (pricesV2) cols.push("paid", "currency", "people", "nights", "stay_type");
    try { return await api(`/rest/v1/spot_reviews?select=${cols.join(",")}&spot_id=eq.${id}&order=created_at.desc`); }
    catch (err) {
      if (err.status !== 400 || tries > 4) throw err;
      const m = String(err.message || "");
      if (/r_title/.test(m)) titleV = false;
      else if (/basis|on_spot|visited_on/.test(m)) basisV = false;
      else if (/r_experience|r_authentic|r_access|r_worth/.test(m)) subV = false;
      else if (/paid|currency|people|nights|stay_type/.test(m)) pricesV2 = false;
      else if (/folk/.test(m)) folkV = false;
      else if (subV) subV = false; else if (pricesV2) pricesV2 = false; else if (folkV) folkV = false; else throw err;
      console.warn("[SpotFolk] reviews: column not available yet →", m);
      return fetchReviews(id, tries + 1);
    }
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
        <b>${ALERTS[r.kind].icon} ${ALERTS[r.kind].label}</b>${r.note ? `<p>${ugc(r.note)}</p>` : ""}
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
        <span class="eyebrow">SpotFolk · solo per te</span>
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
        api(`/rest/v1/member_profiles?select=user_id,display_name,instagram,website,bio,base_name,lat,lon,visible${nodiV ? ",last_post_url,last_post_at" : ""}${profV ? ",on_map,username,avatar_path" : ""}${kindV ? ",kind" : ""}${folksV ? ",folks" : ""}&limit=2000`)
          .catch(err => { if (folksV && err.status === 400) { folksV = false; return api(`/rest/v1/member_profiles?select=user_id,display_name,instagram,website,bio,base_name,lat,lon,visible${nodiV ? ",last_post_url,last_post_at" : ""}${profV ? ",on_map,username,avatar_path" : ""}${kindV ? ",kind" : ""}&limit=2000`); } throw err; })
          .catch(err => { if (kindV && err.status === 400) { kindV = false; return api(`/rest/v1/member_profiles?select=user_id,display_name,instagram,website,bio,base_name,lat,lon,visible${nodiV ? ",last_post_url,last_post_at" : ""}${profV ? ",on_map,username,avatar_path" : ""}&limit=2000`); } throw err; })
          .catch(err => { if (profV && err.status === 400) { profV = false; return api(`/rest/v1/member_profiles?select=user_id,display_name,instagram,website,bio,base_name,lat,lon,visible${nodiV ? ",last_post_url,last_post_at" : ""}&limit=2000`); } throw err; })
          .catch(err => { if (nodiV && err.status === 400) { nodiV = false; return api("/rest/v1/member_profiles?select=user_id,display_name,instagram,website,bio,base_name,lat,lon,visible&limit=2000"); } throw err; })
      ]);
      meetups = mu.data || [];
      if (passV) setTimeout(() => {   // la prima volta: far sapere che c'è
        if (!passV) return;
        try { if (localStorage.getItem("fcph-pass-seen")) return; localStorage.setItem("fcph-pass-seen", "1"); } catch { return; }
        toast("New in SpotFolk: 🎁 Pass it on — sell or give away what you don't take home. Find it on the left.");
      }, 2500);
      if (passV) {
        try { passItems = (await api(`/rest/v1/pass_on?select=id,kind,item,note,price,currency,place,contact,lat,lon,created_by,author_name,created_at,expires_on&expires_on=gte.${todayISO()}&order=created_at.desc&limit=500`)).data || []; }
        catch (err) { if ([400, 401, 403, 404].includes(err.status)) passV = false; passItems = []; }
      }
      if (tripsV) {
        try { const { res } = await api("/rest/v1/trips?select=id&limit=1", { headers: { Prefer: "count=exact" } }); tripCount = +((res.headers.get("content-range") || "").split("/")[1]) || 0; }
        catch (err) { if ([400, 401, 403, 404].includes(err.status)) tripsV = false; }
      }
      if (signV && clusterV) { loadSignCounts(); loadMySignCount(); }
      meetupJoins = new Map();
      (jo.data || []).forEach(j => (meetupJoins.get(j.meetup_id) || meetupJoins.set(j.meetup_id, []).get(j.meetup_id)).push(j));
      favs = new Set((fa.data || []).map(f => f.spot_id));
      mergeGuestFavs();
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
    + (uid && isDev(uid) ? ` <span class="co-badge dev-badge" title="Helps build SpotFolk">${ICON_DEV}Developer</span>` : "");
  const xpBadge = uid => { const e = uid && experts.get(uid); return (e ? ` <span class="xp-badge" title="Local expert">🧭 ${esc(e.area_name)}</span>` : "") + coBadge(uid); };
  // il post brilla 24 ore per tutti, 3 giorni per i contributor
  const postFresh = p => p && p.last_post_at && Date.now() - Date.parse(p.last_post_at) < (contribs.has(p.user_id) ? 3 : 1) * 864e5;
  function verifyHtml(s) {
    if (!nodiV) return "";
    if (s.outdated) return `<p class="vf vf-out">⚠️ <b>Marked as outdated by a local</b>${s.verified_name ? ` · ${esc(s.verified_name)}` : ""}${s.verified_at ? ` · ${fmtDay(String(s.verified_at).slice(0, 10))}` : ""}</p>`;
    if (s.verified_at) return `<p class="vf">✓ <b>Verified by a local</b>${s.verified_name ? ` · ${esc(s.verified_name)}` : ""} · ${new Date(s.verified_at).toLocaleDateString(window.I18N?.locale || "en-GB", { month: "short", year: "numeric" })}</p>`;
    return "";
  }
  // admin: one tap to decide whether visitors see this place (and its full card) on the public map
  function pubPickHtml(s) {
    if (s.fragile) return `<p class="pc-pub"><span>👁 Visitors</span><em>Fragile: never shown to visitors</em></p>`;
    const v = s.public_pick === true ? "yes" : s.public_pick === false ? "no" : "auto";
    const b = (k, l, t) => `<button type="button" data-pub="${k}" class="${v === k ? "on" : ""}" aria-pressed="${v === k}" title="${t}">${l}</button>`;
    return `<p class="pc-pub"><span>👁 Visitors</span>${b("yes", "Public", "Always on the public map, with its full card")}${b("auto", "Auto", "Public if it's the pick of its ~15 km area")}${b("no", "Hidden", "Never shown to visitors")}</p>`;
  }
  function wirePubPick(popup, s) {
    const box = popup.getElement()?.querySelector("[data-pubpick]"); if (!box) return;
    box.querySelectorAll("[data-pub]").forEach(btn => btn.addEventListener("click", async () => {
      const k = btn.dataset.pub, pick = k === "auto" ? null : k === "yes";
      try {
        await api("/rest/v1/rpc/set_public", { method: "POST", body: { p_spot: s.id, p_pick: pick } });
        s.public_pick = pick; box.innerHTML = pubPickHtml(s); wirePubPick(popup, s);
        try { idb.set("public", null); } catch {}
        toast(k === "yes" ? "Public: visitors see this place with its full card." : k === "no" ? "Hidden from visitors." : "Automatic: public if it's the pick of its area.");
      } catch (err) { toast(`Could not change it: ${err.message}`, true); }
    }));
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
  function openPhotographers(tab) {
    tab = tab === true ? "co" : tab || "all";
    const list = profiles.filter(p => p.visible).sort((a, b) => (contribs.has(b.user_id) - contribs.has(a.user_id)) || a.display_name.localeCompare(b.display_name))
      .filter(p => tab === "all" || (tab === "co" ? contribs.has(p.user_id) : tab === "ph" ? isPhotoP(p) : isTravP(p)));
    const T = (k, l) => `<button type="button" class="${tab === k ? "on" : ""}" data-co="${k}">${l}</button>`;
    const d = dlg("phListDialog", `<div class="import-body"><span class="eyebrow">SpotFolk community</span><h2>Photographers &amp; travellers</h2>
      <div class="gate-tabs">${T("all", "All")}${T("ph", "📷 Photographers")}${kindV ? T("tr", "🎒 Travellers") : ""}${T("co", `${ICON_APERTURE} Contributors`)}</div>
      <ul class="req-list">${list.map(p => `<li class="req-row${contribs.has(p.user_id) ? " co-row" : ""}"><div><b>${esc(p.display_name)}${coBadge(p.user_id)}${experts.has(p.user_id) ? ` <span class="xp-badge">🧭 ${esc(experts.get(p.user_id).area_name)}</span>` : ""}</b>
        <span>${p.base_name ? esc(p.base_name) : ""}${p.instagram ? ` · <a href="https://www.instagram.com/${encodeURIComponent(p.instagram)}/" target="_blank" rel="noopener">@${esc(p.instagram)}</a>` : ""}${p.website ? ` · <a href="${esc(p.website)}" target="_blank" rel="noopener">website</a>` : ""}${postFresh(p) ? ` · <a href="${esc(p.last_post_url)}" target="_blank" rel="noopener">📣 new post</a>` : ""}</span></div>
        ${p.lat != null ? `<button type="button" class="pop-btn" data-ph="${esc(p.user_id)}">${ICON.pin}Map</button>` : ""}</li>`).join("") || `<li class="gate-help left">Nobody here yet.</li>`}</ul></div>`);
    d.querySelectorAll("[data-co]").forEach(b => b.addEventListener("click", () => openPhotographers(b.dataset.co)));
    d.querySelectorAll("[data-ph]").forEach(b => b.addEventListener("click", () => {
      const p = profiles.find(x => x.user_id === b.dataset.ph); d.close(); if (!p) return;
      revealP(p);
      drawCommunity(); $("#spotsMap").scrollIntoView({ behavior: "smooth", block: "center" }); map.flyTo([p.lat, p.lon], 10, { duration: .8 });
    }));
  }
  const slugify = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function openExperts() {
    const list = [...experts.values()].sort((a, b) => a.area_name.localeCompare(b.area_name));
    const d = dlg("expertsDialog", `<div class="import-body"><span class="eyebrow">SpotFolk community</span><h2>🧭 Local experts</h2>
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
    const d = dlg("postedDialog", `<form class="import-body gate-form" novalidate><span class="eyebrow">Community map</span><h2>📣 I just posted</h2>
      <p class="gate-help left">Paste the link of your new Instagram post: your icon on the community map glows for 24 hours and stays visible even when members zoom out.</p>
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
  // visitors can save places too: kept on this device, and moved into the passport when they become folk
  const GUEST_FAVS = "spotfolk-saved";
  function guestFavs() { try { return new Set(JSON.parse(localStorage.getItem(GUEST_FAVS) || "[]").map(Number).filter(Number.isFinite)); } catch { return new Set(); } }
  function mergeGuestFavs() {
    const local = guestFavs(); if (!local.size || !session) return;
    const add = [...local].filter(id => !favs.has(id));
    add.forEach(id => favs.add(id));
    try { localStorage.removeItem(GUEST_FAVS); } catch {}
    if (add.length) api("/rest/v1/spot_favorites", { method: "POST", body: add.map(id => ({ spot_id: id })), headers: { Prefer: "return=minimal,resolution=ignore-duplicates" } })
      .then(() => window.fcTrack?.("Spots: saved places moved into the passport")).catch(() => {});
  }
  async function toggleFav(s, btn) {
    const on = !favs.has(s.id);
    if (guest) {
      on ? favs.add(s.id) : favs.delete(s.id);
      try { localStorage.setItem(GUEST_FAVS, JSON.stringify([...favs])); } catch {}
      btn.classList.toggle("on", on); btn.textContent = on ? "♥ Saved" : "♡ Save";
      markerById.get(s.id)?.setIcon(pinIcon(s));
      const fb = $("#onlyFavs"); if (fb) fb.querySelector("small").textContent = favs.size;
      if (on) toast("Saved. Find it under ♥ My spots in the map menu.");
      window.fcTrack?.(on ? "Spots: visitor saved a place" : "Spots: visitor unsaved a place");
      return;
    }
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
  const TR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5.5a4 4 0 0 1 8 0V7"/><rect x="5" y="7" width="14" height="14" rx="4"/><path d="M9 14h6v3.5H9zM5 12.5h14"/></svg>';   // viaggiatori: uno zaino
  const shortDay = d => new Date(d + "T12:00:00").toLocaleDateString(window.I18N?.locale || "en-GB", { day: "numeric", month: "short" });
  function drawCommunity() {
    if (!commLayer || !map) return;
    // con una scheda aperta (ritrovo, Pass it on, fotografo) non si ridisegna: lo spostamento della mappa la chiuderebbe
    if (commLayer.getLayers().some(l => l.isPopupOpen?.())) { commDirty = true; return; }
    commDirty = false;
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
    if (passV && showPass) livePass().forEach(it => {
      const mk = L.marker([it.lat, it.lon], { zIndexOffset: 1150, keyboard: true, title: it.item,
        icon: L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -12],
          html: `<div class="pass-pin ${it.kind}">${PASS_ICON}<span>${it.kind === "give" ? "FREE" : it.price != null ? esc(fmtPrice(it)) : "SALE"}</span></div>` }) }).addTo(commLayer);
      mk.bindTooltip(`${it.kind === "give" ? "Free" : "For sale"} · ${esc(it.item)}`, { direction: "top" });
      mk.bindPopup(() => Object.assign(document.createElement("div"), { innerHTML: passHtml(it) }).firstElementChild, { maxWidth: 300, minWidth: 240, className: "spot-popup" });
      mk.on("popupopen", e => wirePass(e.popup, it));
    });
    const zoomOk = map.getZoom() >= 5;
    profiles.filter(p => onMapP(p) && (showsP(p) || (postFresh(p) && (zoomOk || isCo(p.user_id))))).forEach(p => {
      const fresh = postFresh(p), xp = experts.has(p.user_id), co = isCo(p.user_id), dev = isDev(p.user_id), big = xp || co || dev;
      const mk = L.marker([p.lat, p.lon], { zIndexOffset: (fresh ? 1300 : 1100) + (co ? 50 : 0), keyboard: true, title: p.display_name,
        icon: L.divIcon({ className: "", iconSize: [big ? 36 : 30, big ? 36 : 30], iconAnchor: [big ? 18 : 15, big ? 18 : 15], popupAnchor: [0, -12],
          html: `<div class="ph-pin folk-${folkPinOf(p)}${pFolks(p).length > 1 ? " multi" : ""}${fresh ? " posted" : ""}${xp ? " expert" : ""}${co ? " contrib" : ""}${dev && !co ? " dev" : ""}" style="--fc:${CLUSTERS[folkPinOf(p)].color}">${co ? ICON_APERTURE : dev ? ICON_DEV : FOLK_ICON[folkPinOf(p)]}${fresh ? `<span class="ph-new">NEW POST</span>` : ""}</div>` }) }).addTo(commLayer);
      mk.bindTooltip(esc(p.display_name), { direction: "top" });
      mk.bindPopup(() => profileHtml(p), { maxWidth: 300, minWidth: 220, className: "spot-popup" });
      mk.on("popupopen", e => { const el = e.popup.getElement(); el?.querySelector("[data-flagprofile]")?.addEventListener("click", () => openFlag("profile", p.user_id, p.display_name));
        el?.querySelector("[data-passport]")?.addEventListener("click", () => openMemberProfile(p.user_id)); });
    });
  }
  function meetupHtml(m) {
    const who = meetupJoins.get(m.id) || [], mine = who.some(j => j.user_id === myUid());
    const own = m.created_by === myUid();
    return `<div class="spot-pop">
      <span class="spot-cat" style="--c:#ffd166">${MEET_ICON}Meetup</span>
      <strong>${esc(m.title)}</strong>
      <p class="pop-dates">${ICON.cal}<span>${fmtDay(m.meet_on)}${m.meet_time ? ` · ${esc(m.meet_time)}` : ""}</span></p>
      ${m.note ? `<p class="pop-desc">${ugc(m.note)}</p>` : ""}
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
  /* --- ITINERARI (Trips): viaggi dei membri disegnati sulla mappa, tappa per tappa, con il mezzo di ogni tratto --- */
  const TRIP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="5.5" r="2"/><path d="M7.5 18.5h7a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7h7"/></svg>';
  const MODES = { walk: ["🚶", "On foot", "#7ee081"], bike: ["🚲", "Bike", "#4fd1c5"], moto: ["🛵", "Scooter · motorbike", "#ffb347"], car: ["🚗", "Car", "#ff7a7a"],
    bus: ["🚌", "Bus", "#c9a7ff"], train: ["🚆", "Train", "#7fb2ff"], boat: ["⛴️", "Boat", "#5ad1ff"], plane: ["✈️", "Plane", "#e0e0e0"] };
  const MODE_KEYS = Object.keys(MODES);
  const modeOf = (t, i) => (t.stops[i] && MODES[t.stops[i].m] ? t.stops[i].m : MODES[t.mode] ? t.mode : "car");   // mezzo con cui si arriva alla tappa i
  const legKm = (a, b) => kmBetween(+a.lat, +a.lon, +b.lat, +b.lon);
  const tripKm = st => st.slice(1).reduce((a, p, i) => a + legKm(st[i], p), 0);
  const tripModes = t => [...new Set(t.stops.slice(1).map((_, i) => modeOf(t, i + 1)))];
  async function loadTrips() {
    if (trips || !tripsV) return trips || [];
    try { trips = ((await api("/rest/v1/trips?select=id,title,note,mode,started_on,ended_on,stops,km,created_by,author_name,created_at&order=created_at.desc&limit=400")).data || [])
      .filter(t => Array.isArray(t.stops) && t.stops.length >= 2); }
    catch (err) { if ([400, 401, 403, 404].includes(err.status)) tripsV = false; trips = []; }
    tripCount = trips.length;
    return trips;
  }
  async function setTrips(on) {
    showTrips = on;
    const b = $("#showTrips"); if (b) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }
    if (on) { await loadTrips(); if (b) b.querySelector("small").textContent = fmtN(trips.length); window.fcTrack?.("Spots: trips shown"); }
    drawTrips();
  }
  function drawTrips() {
    syncGlobeTrips();
    if (!tripLayer || !map) return;
    tripLayer.clearLayers();
    if (!showTrips || !trips) return;
    trips.forEach(t => {
      const st = t.stops, open = () => openTripPopup(t);
      for (let i = 1; i < st.length; i++) {
        const md = modeOf(t, i), ll = [[st[i - 1].lat, st[i - 1].lon], [st[i].lat, st[i].lon]];
        L.polyline(ll, { color: "#0b1020", weight: 7, opacity: .45, interactive: false }).addTo(tripLayer);
        L.polyline(ll, { color: MODES[md][2], weight: 3.5, opacity: .95, dashArray: md === "plane" ? "6 8" : md === "boat" ? "2 6" : null, lineCap: "round" })
          .on("click", open).bindTooltip(esc(t.title), { sticky: true }).addTo(tripLayer);
      }
      st.slice(1, -1).forEach(p => L.circleMarker([p.lat, p.lon], { radius: 3.5, color: "#0b1020", weight: 1.5, fillColor: "#fff", fillOpacity: 1 }).on("click", open).addTo(tripLayer));
      const end = (p, cls, label) => L.marker([p.lat, p.lon], { zIndexOffset: 900, keyboard: true, title: `${label}: ${t.title}`,
        icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="trip-end ${cls}">${cls === "start" ? "▶" : "⚑"}</div>` }) }).on("click", open).addTo(tripLayer);
      end(st[0], "start", "Start"); end(st[st.length - 1], "finish", "Arrival");
    });
  }
  // sul globo: le stesse linee, come dati della mappa 3D (toccandone una si scende sulla mappa e si apre la scheda)
  function syncGlobeTrips() {
    if (!globe || !globe.isStyleLoaded?.()) return;
    const feats = [];
    if (showTrips && trips) trips.forEach(t => {
      for (let i = 1; i < t.stops.length; i++) { const md = modeOf(t, i); feats.push({ type: "Feature", properties: { id: t.id, c: MODES[md][2], air: md === "plane" ? 1 : 0 }, geometry: { type: "LineString", coordinates: [[t.stops[i - 1].lon, t.stops[i - 1].lat], [t.stops[i].lon, t.stops[i].lat]] } }); }
      [[t.stops[0], "#7ee081"], [t.stops[t.stops.length - 1], "#ff6a5a"]].forEach(([p, c]) => feats.push({ type: "Feature", properties: { id: t.id, c }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }));
    });
    const data = { type: "FeatureCollection", features: feats };
    try {
      if (globe.getSource("trips")) { globe.getSource("trips").setData(data); return; }
      globe.addSource("trips", { type: "geojson", data });
      globe.addLayer({ id: "trips-line", type: "line", source: "trips", filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "air"], 0]], paint: { "line-color": ["get", "c"], "line-width": 2.6 }, layout: { "line-cap": "round" } });
      globe.addLayer({ id: "trips-air", type: "line", source: "trips", filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "air"], 1]], paint: { "line-color": ["get", "c"], "line-width": 1.8, "line-dasharray": [2, 3] } });
      globe.addLayer({ id: "trips-end", type: "circle", source: "trips", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": ["get", "c"], "circle-radius": 4.5, "circle-stroke-color": "#0b1020", "circle-stroke-width": 1.5 } });
      ["trips-line", "trips-air", "trips-end"].forEach(id => {
        globe.on("click", id, e => { const t = trips?.find(x => x.id === e.features?.[0]?.properties?.id); if (t) focusTrip(t); });
        globe.on("mouseenter", id, () => { globe.getCanvas().style.cursor = "pointer"; });
        globe.on("mouseleave", id, () => { globe.getCanvas().style.cursor = ""; });
      });
    } catch {}
  }
  function tripHtml(t) {
    const st = t.stops, own = t.created_by === myUid(), km = t.km || tripKm(st);
    const dates = [t.started_on, t.ended_on].filter(Boolean).map(fmtDay).join(" → ");
    const pick = st.length <= 11 ? st : [st[0], ...Array.from({ length: 9 }, (_, i) => st[Math.round((i + 1) * (st.length - 1) / 10)]), st[st.length - 1]];
    const c = p => `${(+p.lat).toFixed(5)},${(+p.lon).toFixed(5)}`;
    const gm = `https://www.google.com/maps/dir/?api=1&origin=${c(pick[0])}&destination=${c(pick[pick.length - 1])}${pick.length > 2 ? `&waypoints=${pick.slice(1, -1).map(c).join("%7C")}` : ""}`;
    return `<div class="spot-pop trip-pop">
      <span class="spot-cat" style="--c:#ff9f6e">${TRIP_ICON}Trip</span>
      <strong>${esc(t.title)}</strong>
      <p class="trip-meta">${tripModes(t).map(m => `<span title="${MODES[m][1]}">${MODES[m][0]}</span>`).join("")}<b>${fmtKm(km)}</b> · ${st.length} stops${dates ? ` · ${dates}` : ""}</p>
      <p class="trip-ends"><span class="trip-end start">▶</span>${esc(st[0].n || "Start")} <span class="trip-arrow">→</span> <span class="trip-end finish">⚑</span>${esc(st[st.length - 1].n || "Arrival")}</p>
      ${t.note ? `<p class="pop-desc">${ugc(t.note)}</p>` : ""}
      <details class="trip-stops"><summary>All stops</summary><ol>${st.map((p, i) => `<li>${i ? `<span title="${MODES[modeOf(t, i)][1]}">${MODES[modeOf(t, i)][0]}</span>` : "▶"} ${esc(p.n || `Stop ${i + 1}`)}</li>`).join("")}</ol></details>
      <p class="pop-author">By ${esc(t.author_name || "a member")}${xpBadge(t.created_by)}</p>
      <div class="pop-actions">
        <a class="pop-btn primary" href="${gm}" target="_blank" rel="noopener">${ICON.ext}Open in Google Maps</a>
        ${own ? `<button type="button" class="pop-btn" data-sharetrip>🔗 Share link</button>` : ""}
        ${own || admin ? `<button type="button" class="pop-btn" data-deltrip>Delete</button>` : t._shared && (guest || !session) ? `<a class="pop-btn" href="#join">Make yours: become folk</a>` : `<button type="button" class="text-link pop-flag" data-flagtrip>⚑ Flag</button>`}
      </div>
    </div>`;
  }
  let tripPop = null;
  function openTripPopup(t, at) {
    if (!map) return;
    const st = t.stops, mid = at || st[Math.floor(st.length / 2)];
    tripPop = L.popup({ maxWidth: 310, minWidth: 250, className: "spot-popup", autoPan: true }).setLatLng([mid.lat, mid.lon])
      .setContent(Object.assign(document.createElement("div"), { innerHTML: tripHtml(t) }).firstElementChild).openOn(map);
    const el = tripPop.getElement();
    el?.querySelector("[data-deltrip]")?.addEventListener("click", async ev => {
      const b = ev.currentTarget;
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm delete"; return; }
      try { await api(`/rest/v1/trips?id=eq.${t.id}`, { method: "DELETE" }); trips = trips.filter(x => x.id !== t.id); tripCount = trips.length; map.closePopup(); drawTrips(); toast("Trip deleted."); }
      catch (err) { toast(`Could not delete: ${err.message}`, true); }
    });
    el?.querySelector("[data-flagtrip]")?.addEventListener("click", () => openFlag("trip", String(t.id), t.title));
    el?.querySelector("[data-sharetrip]")?.addEventListener("click", () => shareDialog("trip", t.id, t.title));
  }
  function focusTrip(t) {
    if (!showTrips) { showTrips = true; drawTrips(); }
    const b = L.latLngBounds(t.stops.map(p => [p.lat, p.lon]));
    if (onGlobe) toFlat(null);
    $("#spotsMap")?.scrollIntoView({ behavior: "smooth", block: "center" });
    map.flyToBounds(b, { padding: [50, 50], maxZoom: 13, duration: .9 });
    map.once("moveend", () => setTimeout(() => openTripPopup(t), 80));
  }
  async function openTripList() {
    await loadTrips();
    const d = dlg("tripListDialog", `<div class="import-body">
      <span class="eyebrow">Members only · Community</span><h2>Trips</h2>
      <p class="gate-help left">Journeys of the members, stop by stop. Tap one to see it on the map.</p>
      ${trips.length ? `<ul class="req-list">${trips.map(t => `<li class="req-row"><div><b>${esc(t.title)}</b>
        <span>${tripModes(t).map(m => MODES[m][0]).join(" ")} ${fmtKm(t.km || tripKm(t.stops))} · ${t.stops.length} stops · by ${esc(t.author_name || "a member")}</span></div>
        <button type="button" class="pop-btn" data-goto="${t.id}">${ICON.pin}Show</button></li>`).join("")}</ul>`
        : `<p class="gate-help left">No trips yet. Be the first: «＋ Add a trip».</p>`}
      <button type="button" class="outline-link" data-new>＋ ADD A TRIP</button>
    </div>`);
    d.querySelector("[data-new]").addEventListener("click", () => { d.close(); withConduct(startTrip); });
    d.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => { const t = trips.find(x => x.id === +b.dataset.goto); d.close(); if (t) { setTrips(true); focusTrip(t); } }));
  }

  /* --- disegnare un itinerario: si tocca la mappa (o tasto destro sul computer) per ogni tappa --- */
  function startTrip() {
    if (!map) return;
    if (onGlobe) { const c = globe.getCenter(); toFlat([c.lat, c.lng], Math.max(5, globe.getZoom() + 1), { quiet: true }); }
    tripEd = { stops: [], mode: "car" };
    setTrips(true);
    $("#spotsMap")?.scrollIntoView({ behavior: "smooth", block: "center" });
    wireTripMap(); renderTripEd();
    window.fcTrack?.("Spots: trip editor opened");
  }
  let tripEdLayer = null;
  function wireTripMap() {
    if (!map || map._fcTripWired) return;
    map._fcTripWired = true;
    const add = e => { if (!tripEd) return; L.DomEvent.preventDefault(e.originalEvent || e); addTripStop(e.latlng.lat, L.Util.wrapNum(e.latlng.lng, [-180, 180], true)); };
    map.on("click", add);
    map.on("contextmenu", add);
    tripEdLayer = L.layerGroup().addTo(map);
  }
  function addTripStop(lat, lon, name = "") {
    if (tripEd.stops.length >= 150) return toast("A trip can have up to 150 stops.", true);
    const prev = tripEd.stops[tripEd.stops.length - 1];
    const p = { lat: +lat.toFixed(5), lon: +lon.toFixed(5), n: name, m: prev ? (prev.m || tripEd.mode) : undefined };
    tripEd.stops.push(p);
    renderTripEd();
    if (!name) reverseName(lat, lon).then(r => { if (!p.n) { p.n = r.name && r.place ? `${r.name}, ${r.place.split(",")[0]}` : r.name || r.place || ""; renderTripEd(); } });
  }
  function drawTripEd() {
    if (!tripEdLayer) return;
    tripEdLayer.clearLayers();
    if (!tripEd) return;
    const st = tripEd.stops;
    for (let i = 1; i < st.length; i++) {
      const md = st[i].m || tripEd.mode;
      L.polyline([[st[i - 1].lat, st[i - 1].lon], [st[i].lat, st[i].lon]], { color: MODES[md][2], weight: 4, dashArray: md === "plane" ? "6 8" : null, interactive: false }).addTo(tripEdLayer);
    }
    st.forEach((p, i) => L.marker([p.lat, p.lon], { interactive: false, icon: L.divIcon({ className: "", iconSize: [24, 24], iconAnchor: [12, 12],
      html: `<div class="trip-end ${i === 0 ? "start" : i === st.length - 1 && i > 0 ? "finish" : "mid"}">${i === 0 ? "▶" : i + 1}</div>` }) }).addTo(tripEdLayer));
  }
  function renderTripEd() {
    const stage = stageEl() || $("#spotsMap")?.parentElement;
    let box = $("#tripEd");
    if (!tripEd) { box?.remove(); drawTripEd(); return; }
    if (!box && stage) { box = document.createElement("div"); box.id = "tripEd"; box.className = "trip-ed"; stage.appendChild(box); }
    if (!box) return;
    const st = tripEd.stops, last = st[st.length - 1], n = st.length;
    const chips = (cur, attr) => MODE_KEYS.map(k => `<button type="button" class="trip-chip${k === cur ? " on" : ""}" ${attr}="${k}" title="${MODES[k][1]}" aria-pressed="${k === cur}">${MODES[k][0]}</button>`).join("");
    box.innerHTML = `
      <div class="trip-ed-head"><b>${TRIP_ICON} New trip</b><span>${n ? `${n} stop${n > 1 ? "s" : ""}${n > 1 ? ` · ${fmtKm(tripKm(st))}` : ""}` : ""}</span></div>
      <p class="trip-ed-help">${n === 0 ? "Tap the map where you started" : "Tap the map to add the next stop"}<span class="trip-desk"> (or right-click)</span>.</p>
      ${n === 0 ? `<div class="trip-ed-modes"><small>Mostly by</small>${chips(tripEd.mode, "data-tmode")}</div>` : ""}
      ${n >= 2 ? `<div class="trip-ed-modes"><small>To «${esc(last.n || `stop ${n}`)}» by</small>${chips(last.m || tripEd.mode, "data-lmode")}</div>` : n === 1 ? `<p class="trip-ed-help">▶ ${esc(st[0].n || "Start")}</p>` : ""}
      ${n >= 2 ? `<details class="trip-stops"><summary>All stops</summary><ol>${st.map((p, i) => `<li>${i ? `<select data-smode="${i}" aria-label="How you got there">${MODE_KEYS.map(k => `<option value="${k}"${(p.m || tripEd.mode) === k ? " selected" : ""}>${MODES[k][0]}</option>`).join("")}</select>` : "▶"} <span>${esc(p.n || `Stop ${i + 1}`)}</span><button type="button" class="text-link" data-sdel="${i}" aria-label="Remove stop">✕</button></li>`).join("")}</ol></details>` : ""}
      <div class="trip-ed-actions">
        <button type="button" class="pop-btn" data-tundo${n ? "" : " disabled"}>↶ Undo</button>
        <button type="button" class="pop-btn" data-tcancel>Cancel</button>
        <button type="button" class="pop-btn primary" data-tnext${n >= 2 ? "" : " disabled"}>Done →</button>
      </div>`;
    L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box);
    box.querySelectorAll("[data-tmode]").forEach(b => b.addEventListener("click", () => { tripEd.mode = b.dataset.tmode; renderTripEd(); }));
    box.querySelectorAll("[data-lmode]").forEach(b => b.addEventListener("click", () => { last.m = b.dataset.lmode; renderTripEd(); }));
    box.querySelectorAll("[data-smode]").forEach(sel => sel.addEventListener("change", () => { st[+sel.dataset.smode].m = sel.value; renderTripEd(); }));
    box.querySelectorAll("[data-sdel]").forEach(b => b.addEventListener("click", () => { st.splice(+b.dataset.sdel, 1); renderTripEd(); }));
    box.querySelector("[data-tundo]").addEventListener("click", () => { st.pop(); renderTripEd(); });
    box.querySelector("[data-tcancel]").addEventListener("click", () => { if (st.length > 1 && box.dataset.sure !== "1") { box.dataset.sure = "1"; box.querySelector("[data-tcancel]").textContent = "Discard?"; return; } tripEd = null; renderTripEd(); });
    box.querySelector("[data-tnext]").addEventListener("click", saveTripDialog);
    drawTripEd();
  }
  function saveTripDialog() {
    const st = tripEd.stops, count = {};
    st.slice(1).forEach(p => { const k = p.m || tripEd.mode; count[k] = (count[k] || 0) + 1; });
    const main = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || tripEd.mode;
    const d = dlg("tripDialog", `<form class="import-body gate-form" novalidate>
      <span class="eyebrow">Members only · Trips</span><h2>Your trip</h2>
      <p class="gate-help left">${st.length} stops · ${fmtKm(tripKm(st))} · ${esc(st[0].n || "Start")} → ${esc(st[st.length - 1].n || "Arrival")}</p>
      <label for="trTitle">Title</label>
      <input id="trTitle" maxlength="100" placeholder="e.g. Hanoi → Ho Chi Minh by scooter" value="${esc(st[0].n && st[st.length - 1].n ? `${st[0].n.split(",")[0]} → ${st[st.length - 1].n.split(",")[0]}` : "")}" required>
      <div class="ws-fields">
        <label>From <small>(optional)</small><input type="date" id="trFrom"></label>
        <label>To <small>(optional)</small><input type="date" id="trTo"></label>
      </div>
      <label for="trNote">The story <small>(optional)</small></label>
      <textarea id="trNote" rows="4" maxlength="1500" placeholder="How it went, best stretch, where to sleep, what to avoid…"></textarea>
      <button class="outline-link" type="submit">PUBLISH THE TRIP <span aria-hidden="true">→</span></button>
      <p class="gate-note" id="trMsg" role="status"></p>
      <p class="gate-help left">Only members see trips. You can delete it whenever you want. By publishing you accept the <a href="#terms" target="_blank">terms</a>: trips are your own account, not route advice.</p>
    </form>`);
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = d.querySelector("#trMsg"), warn = t => { msg.className = "gate-note warn"; msg.textContent = t; };
      const title = d.querySelector("#trTitle").value.trim(), from = d.querySelector("#trFrom").value || null, to = d.querySelector("#trTo").value || null;
      if (title.length < 2) return warn("Give your trip a title.");
      if (from && to && to < from) return warn("The end date is before the start.");
      const stops = st.map((p, i) => { const o = { lat: p.lat, lon: p.lon }; if (p.n) o.n = p.n.slice(0, 80); if (i) o.m = p.m || tripEd.mode; return o; });
      const row = { title, note: d.querySelector("#trNote").value.trim() || null, mode: main, started_on: from, ended_on: to, stops, km: Math.round(tripKm(st) * 10) / 10, author_name: displayName() };
      try {
        const { data } = await api("/rest/v1/trips", { method: "POST", body: row, headers: { Prefer: "return=representation" } });
        const saved = (Array.isArray(data) ? data[0] : data) || { ...row, id: Date.now(), created_by: myUid(), created_at: new Date().toISOString() };
        (trips ||= []).unshift(saved); tripCount = trips.length;
        tripEd = null; d.close(); renderTripEd(); showTrips = true; renderApp();
        setTimeout(() => focusTrip(saved), 400);
        toast("Trip published: members can now follow it."); window.fcTrack?.("Spots: trip published");
      } catch (err) { warn(`Could not save: ${err.message}`); }
    });
  }

  /* --- PASS IT ON: chi parte vende o regala ciò che non porta a casa (solo testo: niente foto, niente pagamenti sul sito) --- */
  const PASS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11h15v9.5h-15zM3 7.5h18V11H3zM12 7.5v13M12 7.5C10.8 4 7 3.6 7.2 6c.1 1.2 2.4 1.5 4.8 1.5M12 7.5c1.2-3.5 5-3.9 4.8-1.5-.1 1.2-2.4 1.5-4.8 1.5"/></svg>';
  const livePass = () => passItems.filter(it => it.expires_on >= todayISO());
  const fmtPrice = it => it.price == null ? "" : `${(+it.price).toLocaleString(window.I18N?.locale || "en-GB", { maximumFractionDigits: 2 })} ${it.currency || "EUR"}`;
  const linkify = t => esc(t).replace(/\bhttps?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, m => `<a href="mailto:${m}">${m}</a>`);
  function passHtml(it) {
    const own = it.created_by === myUid();
    return `<div class="spot-pop">
      <span class="spot-cat" style="--c:#8fe0a8">${PASS_ICON}Pass it on · ${it.kind === "give" ? "Free" : "For sale"}</span>
      <strong>${esc(it.item)}</strong>
      ${it.kind === "sell" && it.price != null ? `<p class="pass-price">${esc(fmtPrice(it))}</p>` : it.kind === "give" ? `<p class="pass-price free">Free</p>` : ""}
      ${it.place ? `<p class="pop-dates">${ICON.pin}<span>${esc(it.place)}</span></p>` : ""}
      ${it.note ? `<p class="pop-desc">${ugc(it.note)}</p>` : ""}
      <p class="pass-contact"><b>Contact</b> ${linkify(it.contact || "")}</p>
      <p class="pop-author">Posted by ${esc(it.author_name || "a member")}${xpBadge(it.created_by)} · ${fmtDay(String(it.created_at).slice(0, 10))}</p>
      <div class="pop-actions">
        ${own || admin ? `<button type="button" class="pop-btn" data-delpass>${own ? "Gone: remove it" : "Delete"}</button>` : `<button type="button" class="text-link pop-flag" data-flagpass>⚑ Flag</button>`}
      </div>
      <p class="gate-help left">Only members see it. It disappears on ${fmtDay(it.expires_on)}. The deal is only between you: SpotFolk takes no payments and is not responsible. Meet in public, never pay in advance.</p>
    </div>`;
  }
  function wirePass(popup, it) {
    const el = popup.getElement(); if (!el || el.dataset.wired === "p" + it.id) return; el.dataset.wired = "p" + it.id;
    el.querySelector("[data-delpass]")?.addEventListener("click", async ev => {
      const b = ev.currentTarget;
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm"; return; }
      try { await api(`/rest/v1/pass_on?id=eq.${it.id}`, { method: "DELETE" }); passItems = passItems.filter(x => x.id !== it.id); map.closePopup(); renderApp(); toast("Removed. Thanks for passing it on!"); }
      catch (err) { toast(`Could not remove: ${err.message}`, true); }
    });
    el.querySelector("[data-flagpass]")?.addEventListener("click", () => openFlag("pass_on", String(it.id), it.item));
  }
  function openPassOn(pre) {
    const d = dlg("passDialog", `<form class="import-body gate-form" novalidate>
      <span class="eyebrow">Members only · Pass it on</span><h2>Sell or give away</h2>
      <p class="gate-help left">Leaving and can't take it home? A charger, an adapter, a tent, a guidebook: someone arriving will need it.</p>
      <div class="pass-kind" role="radiogroup" aria-label="Sell or give">
        <label><input type="radio" name="pkind" value="give" checked><span>🎁 I give it away</span></label>
        <label><input type="radio" name="pkind" value="sell"><span>🏷️ I sell it</span></label>
      </div>
      <label for="paItem">What</label>
      <input id="paItem" maxlength="80" placeholder="e.g. Universal travel adapter" required>
      <div class="ws-fields pass-price-row" hidden>
        <label>Price<input type="number" id="paPrice" min="0" step="0.5" inputmode="decimal" placeholder="e.g. 10"></label>
        <label>Currency<select id="paCur">${CURRENCIES.map(c => `<option${c === "EUR" ? " selected" : ""}>${c}</option>`).join("")}</select></label>
      </div>
      <label for="paNote">Details <small>(optional)</small></label>
      <textarea id="paNote" rows="2" maxlength="600" placeholder="Condition, size, until when you're there…"></textarea>
      <label for="paPlace">Where</label>
      <input id="paPlace" maxlength="120" placeholder="e.g. Hanoi, Old Quarter — near Hoan Kiem lake" required>
      <p class="pass-where"><span id="paWhere">${pre && pre.zoom >= 10 ? "📍 On the map where you are looking" : pre?.exact ? "📍 Where you pressed on the map" : "📍 Zoom the map on the place, or use your position"}</span>
        <button type="button" class="text-link" id="paGps">Use my position</button></p>
      <label for="paContact">How to reach you</label>
      <input id="paContact" maxlength="120" placeholder="e.g. WhatsApp +39…, Instagram @…, email" required>
      <label for="paDays">Visible for</label>
      <select id="paDays"><option value="3">3 days</option><option value="7">7 days</option><option value="14" selected>14 days</option><option value="30">30 days</option></select>
      <button class="outline-link" type="submit">POST IT <span aria-hidden="true">→</span></button>
      <p class="gate-note" id="paMsg" role="status"></p>
      <p class="gate-help left">Only members see it, contact included. No food, medicines, weapons or anything illegal. SpotFolk takes no payments and is not a party: the deal is only between you. By posting you accept the <a href="#terms" target="_blank">terms</a>.</p>
    </form>`);
    let pos = pre && (pre.exact || pre.zoom >= 10) ? { lat: pre.lat, lon: pre.lon } : null;
    const priceRow = d.querySelector(".pass-price-row");
    d.querySelectorAll("[name=pkind]").forEach(r => r.addEventListener("change", () => { priceRow.hidden = d.querySelector("[name=pkind]:checked").value !== "sell"; }));
    d.querySelector("#paGps").addEventListener("click", () => {
      const w = d.querySelector("#paWhere"); w.textContent = "📍 Finding you…";
      navigator.geolocation?.getCurrentPosition(p => { pos = { lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5) }; w.textContent = "📍 Your position"; },
        () => { w.textContent = "📍 Position not available: zoom the map on the place instead"; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = d.querySelector("#paMsg"), warn = t => { msg.className = "gate-note warn"; msg.textContent = t; };
      const kind = d.querySelector("[name=pkind]:checked").value, item = d.querySelector("#paItem").value.trim(), place = d.querySelector("#paPlace").value.trim(), contact = d.querySelector("#paContact").value.trim();
      const price = d.querySelector("#paPrice").value === "" ? null : +d.querySelector("#paPrice").value;
      if (item.length < 2) return warn("Write what you are passing on.");
      if (place.length < 2) return warn("Write where it is (city, area).");
      if (contact.length < 3) return warn("Add how people can reach you.");
      if (kind === "sell" && (price == null || !(price >= 0))) return warn("Add a price, or choose «I give it away».");
      if (!pos) return warn("Zoom the map on the place (or use your position), then post again.");
      const days = +d.querySelector("#paDays").value, exp = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
      const row = { kind, item, place, contact, note: d.querySelector("#paNote").value.trim() || null, price: kind === "sell" ? price : null,
        currency: kind === "sell" ? d.querySelector("#paCur").value : null, lat: pos.lat, lon: pos.lon, expires_on: exp, author_name: displayName() };
      try {
        const { data } = await api("/rest/v1/pass_on", { method: "POST", body: row, headers: { Prefer: "return=representation" } });
        passItems.unshift((Array.isArray(data) ? data[0] : data) || { ...row, id: Date.now(), created_by: myUid(), created_at: new Date().toISOString() }); showPass = true;
        d.close(); renderApp(); map?.flyTo([pos.lat, pos.lon], Math.max(map.getZoom(), 13), { duration: .8 });
        toast("Posted: members around can now see it."); window.fcTrack?.("Spots: Pass it on posted");
      } catch (err) { warn(`Could not save: ${err.message}`); }
    });
  }
  function openPassList() {
    const list = livePass();
    const d = dlg("passListDialog", `<div class="import-body">
      <span class="eyebrow">Members only</span><h2>Pass it on</h2>
      <p class="gate-help left">Things travellers sell or give away before leaving. Newest first.</p>
      ${list.length ? `<ul class="req-list">${list.map(it => `<li class="req-row"><div><b>${it.kind === "give" ? "🎁 Free" : `🏷️ ${esc(fmtPrice(it) || "For sale")}`} · ${esc(it.item)}</b>
        <span>${esc(it.place || "")} · by ${esc(it.author_name || "a member")} · until ${fmtDay(it.expires_on)}</span></div>
        <button type="button" class="pop-btn" data-goto="${it.id}">${ICON.pin}Show</button></li>`).join("")}</ul>`
        : `<p class="gate-help left">Nothing yet. Leaving soon? Post what you can't take home.</p>`}
      <button type="button" class="outline-link" data-new>＋ SELL OR GIVE AWAY</button>
    </div>`);
    d.querySelector("[data-new]").addEventListener("click", () => { d.close(); withConduct(() => openPassOn(map ? { lat: map.getCenter().lat, lon: L.Util.wrapNum(map.getCenter().lng, [-180, 180], true), zoom: map.getZoom() } : null)); });
    d.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => {
      const it = passItems.find(x => x.id === +b.dataset.goto); d.close();
      if (!it) return;
      showPass = true; drawCommunity();
      $("#spotsMap").scrollIntoView({ behavior: "smooth", block: "center" });
      map.flyTo([it.lat, it.lon], Math.max(map.getZoom(), 14), { duration: .9 });
      map.once("moveend", () => commLayer.eachLayer(l => { const ll = l.getLatLng?.(); if (ll && Math.abs(ll.lat - it.lat) < 1e-9 && Math.abs(ll.lng - it.lon) < 1e-9) l.openPopup(); }));
    }));
  }
  function profileHtml(p) {
    const ig = p.instagram ? `https://www.instagram.com/${encodeURIComponent(p.instagram)}/` : "";
    return `<div class="spot-pop">
      <span class="spot-cat" style="--c:${isCo(p.user_id) ? "#ffc46e" : isDev(p.user_id) ? "#7fd8ff" : "#c9a7ff"}">${isCo(p.user_id) ? ICON_APERTURE : isDev(p.user_id) ? ICON_DEV : FOLK_ICON[folkPinOf(p)]}${isCo(p.user_id) ? "Contributor" : isDev(p.user_id) ? "Developer" : pFolks(p).length ? pFolks(p).map(k => folkOf(k)).join(" · ") : { photographer: "Photographer", traveller: "Traveller", both: "Photographer & traveller" }[pKind(p)]}</span>
      ${isDev(p.user_id) ? `<p class="pop-dates co-line dev-line">${ICON_DEV}<span>Helps build SpotFolk${p.website ? ` — <a href="${esc(p.website)}" target="_blank" rel="noopener">see their work</a>` : ""}</span></p>` : ""}
      <strong>${esc(p.display_name)}</strong>
      ${p.base_name ? `<p class="pop-dates">${ICON.pin}<span>${esc(p.base_name)}</span></p>` : ""}
      ${isCo(p.user_id) ? `<p class="pop-dates co-line">${ICON_APERTURE}<span>Contributor of Fabio Costa Ph — <a href="#author-${encodeURIComponent(slugify(p.display_name))}">see their work</a></span></p>` : ""}
      ${experts.has(p.user_id) ? `<p class="pop-dates">🧭 <span>Local expert · ${esc(experts.get(p.user_id).area_name)}</span></p>` : ""}
      ${p.bio ? `<p class="pop-desc">${ugc(p.bio)}</p>` : ""}
      ${postFresh(p) && p.last_post_url ? `<a class="pop-btn primary ig-new" href="${esc(p.last_post_url)}" target="_blank" rel="noopener">📣 See the new post</a>` : ""}
      <div class="pop-actions">
        ${ig ? `<a class="pop-btn primary" href="${esc(ig)}" target="_blank" rel="noopener">Instagram @${esc(p.instagram)}</a>` : ""}
        ${p.website ? `<a class="pop-btn" href="${esc(p.website)}" target="_blank" rel="noopener">${ICON.ext}Website</a>` : ""}
        <button type="button" class="pop-btn" data-passport>🛂 Passport</button>
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
  /* «My next destination»: mark where you're going and when; the folk who know the area leave you tips (supabase-prossime-mete.sql) */
  function openDestForm(pre) {
    const near = spots.filter(x => x.list && Math.abs(x.lat - pre.lat) < 0.4 && Math.abs(x.lon - pre.lon) < 0.6).sort((a, b) => kmBetween(a.lat, a.lon, pre.lat, pre.lon) - kmBetween(b.lat, b.lon, pre.lat, pre.lon))[0];
    const today = new Date().toISOString().slice(0, 10);
    const d = dlg("destDialog", `<form class="import-body gate-form" novalidate>
      <span class="eyebrow">Folk only</span><h2>🧭 My next destination</h2>
      <p class="gate-help left">The folk who know the area see it in the Folk Hub and can leave you tips. Only members see it.</p>
      <label for="dsName">Where</label><input id="dsName" maxlength="80" required value="${esc(near?.list || "")}" placeholder="e.g. Faroe Islands, Val Gardena">
      <div class="pf-row"><label>From<input type="date" id="dsFrom" min="${today}"></label><label>To<input type="date" id="dsTo" min="${today}"></label></div>
      <label for="dsNote">What are you looking for? <small>(optional)</small></label>
      <textarea id="dsNote" maxlength="300" rows="3" placeholder="e.g. Quiet sunrises, a hike that isn't crowded, where locals eat"></textarea>
      ${myStyles.length > 1 ? `<label for="dsFolk">Travelling as</label><select id="dsFolk">${myStyles.map(k => `<option value="${k}">${CLUSTERS[k].ico} ${esc(folkOf(k))}</option>`).join("")}</select>` : ""}
      <p class="gate-note" data-dsmsg hidden></p>
      <button type="submit" class="outline-link">Ask the folk</button>
    </form>`);
    d.querySelector("form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const name = d.querySelector("#dsName").value.trim(), from = d.querySelector("#dsFrom").value || null, to = d.querySelector("#dsTo").value || null, msg = d.querySelector("[data-dsmsg]");
      if (name.length < 2) return d.querySelector("#dsName").focus();
      if (from && to && to < from) { msg.hidden = false; msg.textContent = "The end comes before the start."; return; }
      const btn = d.querySelector("[type=submit]"); btn.disabled = true;
      try {
        await api("/rest/v1/next_destinations", { method: "POST", headers: { Prefer: "return=minimal" }, body: { place_name: name, lat: +pre.lat.toFixed(4), lon: +pre.lon.toFixed(4), starts_on: from, ends_on: to,
          note: d.querySelector("#dsNote").value.trim() || null, folk: d.querySelector("#dsFolk")?.value || myStyles[0] || null, author_name: displayName() } });
        d.close(); toast("Done: the folk who know the area will see it in the Folk Hub."); window.fcTrack?.("Spots: next destination");
        try { sessionStorage.setItem("hub-view", "dests"); } catch {}
        setTimeout(() => { location.hash = "hub"; }, 900);
      } catch (err) {
        btn.disabled = false; msg.hidden = false;
        msg.textContent = /function|relation|schema cache/i.test(err.message) ? "This arrives once the database is updated (supabase-prossime-mete.sql)." : /row-level|policy/i.test(err.message) ? "You can have up to 5 destinations at a time: remove one in the Folk Hub." : `Could not save it: ${err.message}`;
      }
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
      <span class="eyebrow">${profV ? "My profile" : "Community map"}</span><h2>${me.user_id ? "Your profile" : profV ? "Create your profile" : "Join the map"}</h2>
      ${profV ? `<div class="pf-avatar">${avatarHtml(me.display_name ? me : { display_name: displayName() }, 72)}<label class="pop-btn">📷 ${me.avatar_path ? "Change photo" : "Add a profile photo"}<input type="file" id="pfPhoto" accept="image/*" hidden></label>${me.avatar_path ? `<button type="button" class="text-link" id="pfNoPhoto">Remove</button>` : ""}</div>` : ""}
      ${kindV ? `<fieldset class="pf-kind"><legend>On the map as</legend>
        ${[["photographer", "📷 Photographer"], ["traveller", "🎒 Traveller"], ["both", "📷🎒 Both"]].map(([k, l]) => `<label><input type="radio" name="pfKind" value="${k}"${pKind(me) === k ? " checked" : ""}><span>${l}</span></label>`).join("")}
      </fieldset>` : ""}
      <label for="pfName">Name</label><input id="pfName" maxlength="60" value="${v(me.display_name || displayName())}" required>
      ${profV ? `<label for="pfUser">Username <small>(3–30: letters, numbers, dots, underscores)</small></label><input id="pfUser" maxlength="30" value="${v(me.username)}" placeholder="e.g. anna.dolomiti" autocapitalize="none" autocomplete="username">` : ""}
      <div class="ws-fields">
        <label>Instagram<input id="pfIg" maxlength="31" value="${v(me.instagram)}" placeholder="username (no @)"></label>
        <label>Website<input id="pfWeb" type="url" maxlength="300" value="${v(me.website)}" placeholder="https://…"></label>
      </div>
      <label for="pfBio">About you <small>(optional)</small></label>
      <textarea id="pfBio" rows="2" maxlength="300" placeholder="Slow traveller and photographer, Dolomites guide…">${v(me.bio)}</textarea>
      <label for="pfBase">Where you're based</label>
      <div class="gkey-row"><input id="pfBase" maxlength="80" value="${v(me.base_name)}" placeholder="Town or area, e.g. Bolzano"><button class="text-link" type="button" id="pfHere">Use my location</button></div>
      <input id="pfCoords" value="${me.lat != null ? `${(+me.lat).toFixed(2)}, ${(+me.lon).toFixed(2)}` : ""}" placeholder="Coordinates of your area, e.g. 46.50, 11.35" autocomplete="off">
      <p class="gate-help left">For privacy your pin is placed only roughly (about 5 km), never at your address.</p>
      <label class="shot-check"><input type="checkbox" id="pfVisible"${me.user_id ? ((profV ? me.on_map !== false : me.visible) ? " checked" : "") : " checked"}> Show me on the community map</label>
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
        ...(profV ? { visible: true, on_map: d.querySelector("#pfVisible").checked, username: uname || null } : { visible: d.querySelector("#pfVisible").checked }),
        ...(kindV ? { kind: d.querySelector("[name=pfKind]:checked")?.value || "photographer" } : {}),
        ...(folksV && myStyles.length ? { folks: myStyles } : {}), updated_at: new Date().toISOString() };
      try {
        if (profV && newPhoto) { msg.className = "gate-note"; msg.textContent = "Uploading the photo…"; row.avatar_path = await uploadAvatar(newPhoto); }
        else if (profV && dropPhoto) row.avatar_path = null;
        const oldPath = me.avatar_path;
        await api("/rest/v1/member_profiles?on_conflict=user_id", { method: "POST", body: row, headers: { Prefer: "return=minimal,resolution=merge-duplicates" } });
        if (oldPath && "avatar_path" in row && row.avatar_path !== oldPath) { try { await api(`/storage/v1/object/avatars/${oldPath}`, { method: "DELETE" }); } catch {} }
        profiles = profiles.filter(p => p.user_id !== row.user_id).concat({ ...me, ...row });
        d.close(); meCache = null;
        if (meView) { renderMe(); toast("Profile saved."); }
        else { if (row.lat != null && row.on_map !== false) { revealP(row); } renderApp(); toast(row.lat == null ? "Profile saved. Add your area to appear on the community map." : "Profile saved: you're on the community map."); }
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
      <span class="eyebrow">SpotFolk · solo per te</span><h2>Amministrazione</h2>
      <div class="gate-tabs adm-tabs" role="tablist">
        <button type="button" data-atab="requests" class="${tab === "requests" ? "on" : ""}">Richieste <b>${pendingMembers.length}</b></button>
        <button type="button" data-atab="members" class="${tab === "members" ? "on" : ""}">Membri</button>
        <button type="button" data-atab="flags" class="${tab === "flags" ? "on" : ""}">Segnalazioni <b>${openFlags}</b></button>
        <button type="button" data-atab="feedback" class="${tab === "feedback" ? "on" : ""}">Feedback</button>
        <button type="button" data-atab="crew" class="${tab === "crew" ? "on" : ""}">Contributor</button>
        <button type="button" data-atab="articles" class="${tab === "articles" ? "on" : ""}">Articoli</button>
        <button type="button" data-atab="clusters" class="${tab === "clusters" ? "on" : ""}">Folk</button>
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
      if (tab === "clusters") {
        const [{ data: st }, cand] = await Promise.all([api("/rest/v1/rpc/cluster_stats", { method: "POST", body: {} }),
          api("/rest/v1/rpc/expert_candidates", { method: "POST", body: {} }).then(r => r.data || []).catch(() => [])]);
        const rows = d => (st || []).filter(r => r.dim === d);
        const tot = rows("total")[0] || { signups: 0, approved: 0, active: 0 };
        const nm = v => CLUSTERS[v] ? `${CLUSTERS[v].ico} ${CLUSTERS[v].long}` : v === "fabio" ? "★ Fabio's pick" : DOORS[v] ? `#spotfolk-${v}` : v;
        const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : "—";
        const table = (head, list, cols) => list.length ? `<table class="adm-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${list.map(r => `<tr>${cols(r).map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<p class="gate-help left">Ancora nessun dato.</p>`;
        body.innerHTML = `
          <p class="gate-help left">Totale: <b>${tot.signups}</b> iscritti · ${tot.approved} approvati · <b>${tot.active}</b> attivi nei primi 14 giorni (${pct(tot.active, tot.signups)}). «Attivo» = ha aggiunto, recensito o firmato qualcosa.</p>
          <h3 class="adm-h">Folk (come viaggiano)</h3>
          ${table(["Folk", "Iscritti", "Approvati", "Attivi 14 gg", "% attivi"], rows("style"), r => [esc(nm(r.val)), r.signups, r.approved, r.active, pct(r.active, r.signups)])}
          <h3 class="adm-h">Da quale porta arrivano</h3>
          ${table(["Porta", "Iscritti", "Approvati", "Attivi 14 gg", "% attivi"], rows("source"), r => [esc(r.val === "(direct)" ? "Diretto (nessuna porta)" : nm(r.val)), r.signups, r.approved, r.active, pct(r.active, r.signups)])}
          <h3 class="adm-h">Firme</h3>
          ${table(["Folk", "Chi firma", "Firme", "Luoghi firmati"], rows("signs"), r => [esc(nm(r.val)), r.signups, r.approved, r.active])}
          <h3 class="adm-h">⭐ Suggerimenti per il Folk of the month</h3>
          <div data-fotm><p class="gate-help left">Caricamento…</p></div>
          <p class="gate-help left">I più attivi degli ultimi 30 giorni in tutto il mondo. Scegli tu chi mettere nella rivista: Pages CMS → Rivista del mese → «Folk of the month».</p>
          <h3 class="adm-h">🧭 Candidati Local expert</h3>
          <p class="gate-help left">Hanno almeno 50 luoghi (aggiunti o firmati) entro 50 km. Nominali con un tocco: potranno verificare e modificare i luoghi della loro zona.</p>
          ${cand.length ? `<ul class="req-list">${cand.map(c => `<li class="req-row" data-cand="${esc(c.user_id)}"><div><b>${esc(c.name || "—")}</b><span>${c.total_signs} luoghi entro 50 km (${c.signs} firmati, ${c.places} aggiunti) · ${(+c.lat).toFixed(1)}, ${(+c.lon).toFixed(1)}</span></div>
            <form class="cand-form"><input name="area" maxlength="80" placeholder="Nome della zona" required><button type="submit" class="pop-btn primary">🧭 Nomina</button></form></li>`).join("")}</ul>` : `<p class="gate-help left">Nessun candidato per ora.</p>`}
          <p class="gate-help left">Porte d'ingresso da usare nei post: ${Object.keys(DOORS).map(k => `<code>fabiocostaph.com/#spotfolk-${k}</code>`).join(" · ")}</p>`;
        api("/rest/v1/rpc/local_folk", { method: "POST", body: { p_days: 30 } }).then(r => {
          const box = body.querySelector("[data-fotm]"); if (!box) return;
          const L2 = r.data || [];
          box.innerHTML = L2.length ? `<ol class="coll-list">${L2.map(x => `<li><button type="button" data-member="${esc(x.user_id)}"><b>${esc(x.name || "—")}</b><small>${CLUSTERS[x.folk]?.ico || ""} ${esc(folkOf(x.folk))} · ${x.signs} firme · ${x.tips} consigli · 👍 ${x.useful}</small></button></li>`).join("")}</ol>` : `<p class="gate-help left">Nessuna firma negli ultimi 30 giorni.</p>`;
          box.querySelectorAll("[data-member]").forEach(b => b.addEventListener("click", () => openMemberProfile(b.dataset.member)));
        }).catch(() => { const box = body.querySelector("[data-fotm]"); if (box) box.innerHTML = `<p class="gate-help left">Disponibile dopo supabase-folk-evoluzione.sql.</p>`; });
        body.querySelectorAll("[data-cand]").forEach(li => {
          const c = cand.find(x => x.user_id === li.dataset.cand), f = li.querySelector("form");
          reverseName(+c.lat, +c.lon).then(r => { if (!f.area.value) f.area.value = r.place.split(",")[0] || r.name || ""; });
          f.addEventListener("submit", async ev => {
            ev.preventDefault();
            const row = { user_id: c.user_id, display_name: c.name, area_name: f.area.value.trim(), lat: +c.lat, lon: +c.lon, radius_km: 30 };
            if (!row.area_name) return toast("Scrivi il nome della zona.", true);
            try { await api("/rest/v1/local_experts?on_conflict=user_id", { method: "POST", body: row, headers: { Prefer: "return=minimal,resolution=merge-duplicates" } });
              experts.set(c.user_id, row); li.innerHTML = `<p class="gate-help left">✓ ${esc(c.name)} è ora Local expert di ${esc(row.area_name)}.</p>`; }
            catch (err) { toast(`Non riuscito (${err.message}).`, true); }
          });
        });
        return;
      }
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
            toast(!has ? `${nm}: badge ${label} attivo. Per comparire sulla mappa deve creare il profilo su SpotFolk.` : `${nm}: badge ${label} tolto.`);
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
            <p class="gate-help left">Il centro di default è il punto al centro della mappa SpotFolk.</p></form>`);
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
        const LBL = { came: "Cosa li ha portati qui", interest: "Cosa interessa di più", spots: "Come usano SpotFolk", often: "Quanto spesso tornerebbero", missing: "Cosa vorrebbero" };
        const OPT = { photos: "Le foto", spots: "La mappa SpotFolk", tools: "I Tools", journal: "Articoli e guide", workshops: "Workshop e ritrovi", social: "Instagram o un amico",
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
        const KIND = { spot: "Posto", review: "Recensione", photo: "Foto", meetup: "Ritrovo", profile: "Profilo", pass_on: "Pass it on", trip: "Itinerario", sign: "Firma / consiglio" };
        const REASON = { spam: "Spam", offensive: "Offensivo", wrong: "Sbagliato", not_theirs: "Foto non sua", danger: "Pericoloso", other: "Altro" };
        openFlags = (data || []).length; refreshBadge();
        body.innerHTML = (data || []).length ? `<ul class="req-list">${data.map(f => `<li class="req-row" data-flag="${f.id}" data-kind="${f.kind}" data-target="${esc(f.target_id)}">
            <div><b>${KIND[f.kind] || f.kind} · ${REASON[f.reason] || f.reason}</b><span>${esc(f.label || "")}${f.note ? ` — “${esc(f.note)}”` : ""} · ${fmtDay(String(f.created_at).slice(0, 10))}</span></div>
            ${["spot", "meetup", "profile", "pass_on", "trip"].includes(f.kind) || f.kind === "review" || f.kind === "photo" ? `<button type="button" class="pop-btn" data-act="show">Mostra</button>` : ""}
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
            else if (kind === "trip") { await loadTrips(); const t = trips.find(x => String(x.id) === target); if (t) focusTrip(t); else toast("Itinerario già eliminato."); }
            else if (kind === "pass_on") { const it = passItems.find(x => String(x.id) === target); if (it) { showPass = true; drawCommunity(); map.flyTo([it.lat, it.lon], 15); } else toast("Annuncio già scaduto o eliminato."); }
            else if (kind === "profile") { const p = profiles.find(x => x.user_id === target); if (p && p.lat != null) { revealP(p); drawCommunity(); map.flyTo([p.lat, p.lon], 10); } }
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
                meetup: `meetups?id=eq.${encodeURIComponent(target)}`, pass_on: `pass_on?id=eq.${encodeURIComponent(target)}`, trip: `trips?id=eq.${encodeURIComponent(target)}`, sign: `place_signs?id=eq.${encodeURIComponent(target)}`, profile: `member_profiles?user_id=eq.${encodeURIComponent(target)}` }[kind];
              await api(`/rest/v1/${path}`, { method: "DELETE" });
              if (kind === "spot") spots = spots.filter(x => String(x.id) !== target);
              if (kind === "meetup") meetups = meetups.filter(x => String(x.id) !== target);
              if (kind === "pass_on") passItems = passItems.filter(x => String(x.id) !== target);
              if (kind === "trip" && trips) trips = trips.filter(x => String(x.id) !== target);
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
    const head = `<a class="text-link mag-back" href="#journal">${ICON.prev}All stories</a><p class="mag-kicker">Field Notes</p><h2>Write for Field Notes</h2>`;
    box.innerHTML = `${head}<p class="mag-deck">Loading…</p>`;
    if (!configured() || !(await ensureSession())) {
      box.innerHTML = `${head}<p class="mag-deck">Every folk can write for Field Notes and for the monthly magazine. Log in to SpotFolk first, then come back here.</p>
        <p><a class="outline-link" href="#spotfolk">LOG IN TO SPOTFOLK <span aria-hidden="true">→</span></a></p>`; return;
    }
    if (!loaded) { try { admin = await checkAdmin(); } catch {} }
    if (!contribs.size) { try { const { data } = await api("/rest/v1/contributors?select=user_id,display_name,roles&limit=1000"); (data || []).forEach(c => contribs.set(c.user_id, c)); } catch {} }
    // scrivono tutti i folk (membri approvati), oltre ai contributor
    const okWriter = admin || contribs.has(myUid()) || (await fetchMemberStatus().catch(() => "")) === "approved";
    if (!okWriter) {
      box.innerHTML = `${head}<p class="mag-deck">Writing for Field Notes opens in a moment: reload the page if it doesn't. Would you like to write reportage or practical guides? Tell me about you and your idea.</p>
        <p><button type="button" class="outline-link" data-contribute="writer">BECOME A CONTRIBUTOR <span aria-hidden="true">→</span></button></p>`; return;
    }
    let mine = [];
    try { const { data } = await api(`/rest/v1/journal_submissions?select=id,title,status,review_note,updated_at,slug&author_id=eq.${encodeURIComponent(myUid())}&order=updated_at.desc`); mine = data || []; }
    catch (err) { box.innerHTML = `${head}<p class="mag-deck">Not available yet (${esc(err.message)}).</p>`; return; }
    box.innerHTML = `${head}
      <p class="mag-deck">${admin ? "Scrivi direttamente nel Journal: salva in bozza, guarda l'anteprima e pubblica subito, senza passare da Pages CMS. Gli articoli dei contributor da approvare sono in SpotFolk → Admin → Articoli." : "Write a reportage or a practical guide. Save it as a draft whenever you like; when it's ready, send it for review — I read every piece and publish it with your name, or send it back with a note."}</p>
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
          <div class="j-row"><label>Name and surname<input name="author_name" maxlength="80" value="${v(a.author_name)}" required></label>
            ${myStyles.length && evoV ? `<label>Your folk<select name="author_folk">${myStyles.map(k => `<option value="${k}"${a.author_folk === k ? " selected" : ""}>${CLUSTERS[k].ico} ${folkOf(k)}</option>`).join("")}</select></label>` : ""}
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
        ...(f.author_folk ? { author_folk: f.author_folk.value || null } : {}),
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
  function withConduct(fn) { if (pendingMode) return pendingNote(); if (conductOk() || !schemaV2) return fn(); showConduct(fn); }
  const pendingNote = () => toast("You're in! Signing, reviewing and adding unlock in a moment: reload the page if they don't.");
  // in attesa: si guarda tutto, ma i pulsanti per scrivere spiegano che manca l'approvazione
  document.addEventListener("click", e => {
    if (!pendingMode) return;
    const b = e.target.closest?.("[data-sign], [data-pickstyles], [data-review], [data-addphoto], [data-report], [data-fav], [data-meethere], [data-join], [data-useful], [data-lppass], .lp-add-btn, #spotsAdd, #tripAdd, #passAdd, #meetAdd, #myProfile, [data-social]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation(); pendingNote();
  }, true);
  function showConduct(after) {
    let d = $("#conductDialog");
    if (!d) { d = document.createElement("dialog"); d.id = "conductDialog"; d.className = "import-dialog conduct-dialog"; document.body.appendChild(d); }
    d.innerHTML = `<button class="dialog-close" type="button" data-close aria-label="Close">${ICON.close}</button>
      <div class="import-body">
        <span class="eyebrow">SpotFolk community</span>
        <h2>Our code</h2>
        <ol class="conduct">
          <li><b>Leave no trace.</b> Take only photos, leave only footprints. Stay on paths and take your rubbish home.</li>
          <li><b>Protect fragile places.</b> No geotags for places marked fragile, small groups, no drones where wildlife lives.</li>
          <li><b>Respect people and property.</b> Ask before entering private land, keep noise down at night, respect local rules.</li>
          <li><b>Support local.</b> Eat, sleep and buy from local businesses when you can.</li>
          <li><b>Share honestly.</b> Only your own photos, real prices and accurate reports. Update or close reports that are no longer true.</li>
          <li><b>Be kind.</b> Reviews describe places, not people. No insults, no spam.</li>
          <li><b>Pass it on fairly.</b> Only your own things, described honestly, nothing forbidden (see the terms). Meet in public places, never pay in advance: deals are between you, SpotFolk is not a party.</li>
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

  /* --- FIRME DEI CLUSTER sui luoghi --- */
  // le prime 3 firme: «Sign 3 places you've been to and become folk»
  async function loadMySignCount() {
    if (guest || !signV || !clusterV || !session) return;
    try { const { res } = await api(`/rest/v1/place_signs?select=id&user_id=eq.${encodeURIComponent(myUid())}&cluster=neq.fabio&limit=1`, { headers: { Prefer: "count=exact" } });
      mySignCount = +((res.headers.get("content-range") || "").split("/")[1]) || 0; } catch { mySignCount = null; }
    paintOnboarding();
  }
  function paintOnboarding() {
    const el = $("#onbFolk"); if (!el) return;
    if (mySignCount != null && mySignCount >= 3 && myStyles.length) {   // dopo le prime 3 firme: la sfida del momento
      challengesHtml(true).then(h => { if (!h) { el.hidden = true; return; } el.hidden = false; el.innerHTML = h; });
      return;
    }
    if (mySignCount == null || !myStyles.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<p><b>Become folk:</b> sign 3 places you've been to.</p>
      <div class="onb-dots">${[0, 1, 2].map(i => `<span class="${i < mySignCount ? "on" : ""}"></span>`).join("")}<small>${mySignCount}/3</small></div>
      <p class="onb-help">Open any place you know on the map and tap “✍ Sign as ${esc(folkOf(myStyles[0]).toLowerCase())}”.</p>`;
  }
  /* --- RACCOLTE PER FOLK: i luoghi più firmati da un folk, nella zona che guardi --- */
  function openCollections(folk) {
    folk = folk || myStyles[0] || "photo";
    const b = map ? map.getBounds().pad(0.2) : null;
    const rows = spots.filter(sp => (signMap.get(sp.id)?.by || {})[folk] && (!b || b.contains([sp.lat, sp.lon])))
      .sort((a, z) => signMap.get(z.id).by[folk] - signMap.get(a.id).by[folk]).slice(0, 25);
    const d = dlg("collDialog", `<div class="import-body">
      <span class="eyebrow">SpotFolk · collections</span><h2>${CLUSTERS[folk].ico} Most signed by ${esc(folkOf(folk).toLowerCase())}</h2>
      <div class="gate-tabs coll-tabs">${CLUSTER_KEYS.map(k => `<button type="button" class="${k === folk ? "on" : ""}" data-cf="${k}">${CLUSTERS[k].ico}</button>`).join("")}</div>
      <p class="gate-help left">In the area you're looking at on the map. Move the map to explore another area.</p>
      ${rows.length ? `<ol class="coll-list">${rows.map((sp, i) => `<li><button type="button" data-cgo="${sp.id}"><span class="coll-n">${i + 1}</span><b>${esc(sp.name)}</b><small>${CLUSTERS[folk].ico} ${signMap.get(sp.id).by[folk]} · ${esc((CATS[sp.category] || CATS.spot).label)}${signMap.get(sp.id).fabio ? " · ★ Fabio's pick" : ""}</small></button></li>`).join("")}</ol>`
        : `<p class="gate-help left">No ${esc(folkOf(folk).toLowerCase())} signatures here yet. Be the first to sign a place!</p>`}
    </div>`);
    d.querySelectorAll("[data-cf]").forEach(x => x.addEventListener("click", () => openCollections(x.dataset.cf)));
    d.querySelectorAll("[data-cgo]").forEach(x => x.addEventListener("click", () => { const sp = spotById(+x.dataset.cgo); d.close(); if (sp) focusSpot(sp); }));
  }
  /* --- FOLK DI QUESTA ZONA: i più attivi entro 50 km, negli ultimi 30 giorni (niente classifiche globali) --- */
  async function openLocalFolk() {
    const c = map ? map.getCenter() : null;
    const d = dlg("localFolkDialog", `<div class="import-body"><span class="eyebrow">SpotFolk · this month</span><h2>🏅 Folk of this area</h2><p class="gate-help left">Loading…</p></div>`);
    let rows = [];
    try { rows = (await api("/rest/v1/rpc/local_folk", { method: "POST", body: c ? { p_lat: c.lat, p_lon: L.Util.wrapNum(c.lng, [-180, 180], true), p_km: 50, p_days: 30 } : {} })).data || []; }
    catch { d.querySelector(".gate-help").textContent = "Not available yet."; return; }
    d.querySelector(".import-body").innerHTML = `<span class="eyebrow">SpotFolk · last 30 days · within 50 km</span><h2>🏅 Folk of this area</h2>
      ${rows.length ? `<ol class="coll-list">${rows.map((r, i) => `<li><button type="button" data-member="${esc(r.user_id)}"><span class="coll-n">${i + 1}</span><b>${esc(r.name || "Member")}</b><small>${CLUSTERS[r.folk]?.ico || ""} ${esc(folkOf(r.folk))} · ${r.signs} signature${r.signs > 1 ? "s" : ""}${r.tips ? ` · ${r.tips} tip${r.tips > 1 ? "s" : ""}` : ""}${r.useful ? ` · 👍 ${r.useful}` : ""}</small></button></li>`).join("")}</ol>`
        : `<p class="gate-help left">Nobody has signed places around here this month. Sign one and you're on top!</p>`}
      <p class="gate-help left">Only the area you're looking at, only this month: move the map to see another area.</p>`;
    d.querySelectorAll("[data-member]").forEach(x => x.addEventListener("click", () => openMemberProfile(x.dataset.member)));
  }
  /* --- SFIDE STAGIONALI (da Pages CMS → content/sfide.json): firma N luoghi nel periodo e ottieni il timbro --- */
  let challenges = null;
  async function loadChallenges() {
    if (challenges) return challenges;
    try { const r = await (await fetch("content/sfide.json", { cache: "no-cache" })).json(); challenges = (r.sfide || []).filter(c => c.titolo && c.dal && c.al && +c.obiettivo > 0); }
    catch { challenges = []; }
    return challenges;
  }
  async function challengeProgress(c) {
    try { const { res } = await api(`/rest/v1/place_signs?select=id&user_id=eq.${encodeURIComponent(myUid())}&cluster=${c.folk ? `eq.${c.folk}` : "neq.fabio"}&created_at=gte.${c.dal}&created_at=lte.${c.al}T23:59:59`, { headers: { Prefer: "count=exact" } });
      return +((res.headers.get("content-range") || "").split("/")[1]) || 0; } catch { return 0; }
  }
  async function challengesHtml(onlyActive) {
    const today = todayISO(), list = (await loadChallenges()).filter(c => !c.folk || myStyles.includes(c.folk) || !myStyles.length);
    const act = list.filter(c => c.dal <= today && c.al >= today), past = list.filter(c => c.al < today);
    const show = onlyActive ? act : act.concat(past);
    if (!show.length) return "";
    const rows = await Promise.all(show.map(async c => ({ c, n: await challengeProgress(c) })));
    return `<section class="pp ch"><p class="pp-kick">Challenges</p>${rows.map(({ c, n }) => { const goal = +c.obiettivo, done = n >= goal, live = c.dal <= today && c.al >= today;
      return `<div class="ch-row${done ? " done" : ""}"><p><b>${done ? "🏆 " : ""}${esc(c.titolo)}</b>${c.folk && CLUSTERS[c.folk] ? ` · ${CLUSTERS[c.folk].ico} ${esc(folkOf(c.folk))}` : ""}<small>${live ? `until ${esc(fmtDay(c.al))}` : "ended"}</small></p>
        ${c.descrizione ? `<p class="ch-d">${esc(c.descrizione)}</p>` : ""}<div class="ch-bar"><span style="width:${Math.min(100, n / goal * 100).toFixed(0)}%"></span></div><p class="ch-n">${Math.min(n, goal)}/${goal}${done ? " · stamp earned" : ""}</p></div>`; }).join("")}</section>`;
  }
  async function loadSignCounts() {
    try {
      const { data } = await api("/rest/v1/place_sign_counts?select=spot_id,cluster,n&limit=100000");
      const m = new Map();
      (data || []).forEach(r => {
        const g = m.get(r.spot_id) || { total: 0, top: null, topN: 0, fabio: false, by: {} };
        if (r.cluster === "fabio") g.fabio = true;
        else if (CLUSTERS[r.cluster]) { g.total += r.n; g.by[r.cluster] = r.n; if (r.n > g.topN) { g.top = r.cluster; g.topN = r.n; } }
        m.set(r.spot_id, g);
      });
      signMap = m;
      markerById.forEach((mk, id) => { const sp = spots.find(x => x.id === id); if (sp) mk.setIcon(pinIcon(sp)); });
    } catch {}
  }
  const PREFERRED = { trekking: ["hike"], spot: ["photo"], hotel: ["slow", "road"], restaurant: ["food", "slow"], experience: ["slow"], workshop: ["photo"] };
  async function loadSigns(popup, s) {
    const el = popup.getElement()?.querySelector("[data-signs]");
    if (!el) return;
    let signs = [];
    try { signs = guest ? ((await pubPlace(s.id))?.signs || []) : (await api(`/rest/v1/place_signs?select=id,cluster,tip,user_id,author_name,created_at${evoV ? ",on_spot" : ""}&spot_id=eq.${s.id}&order=created_at.desc&limit=500`)).data || []; }
    catch (err) { if (evoV && err.status === 400) { evoV = false; return loadSigns(popup, s); } if ([400, 404].includes(err.status)) { signV = false; el.remove(); } return; }
    const uid = myUid(), by = {};
    signs.forEach(g => { by[g.cluster] = (by[g.cluster] || 0) + 1; });
    const card = popup.getElement(); if (card) { card._signs = signs; paintFolk(popup, s); }
    { const tot = CLUSTER_KEYS.reduce((a, k) => a + (by[k] || 0), 0), top = CLUSTER_KEYS.filter(k => by[k]).sort((a, b) => by[b] - by[a])[0] || null;
      if (tot || by.fabio) signMap.set(s.id, { total: tot, top, topN: top ? by[top] : 0, fabio: !!by.fabio, by: Object.fromEntries(CLUSTER_KEYS.filter(k => by[k]).map(k => [k, by[k]])) }); else signMap.delete(s.id);
      markerById.get(s.id)?.setIcon(pinIcon(s)); }
    const mineOf = k => signs.find(g => g.user_id === uid && g.cluster === k);
    const pref = PREFERRED[s.category] || [];
    const order = [...myStyles].sort((a, b) => (pref.includes(b) ? 1 : 0) - (pref.includes(a) ? 1 : 0));
    // il primo a firmare (Fabio's pick escluso) resta scritto sulla scheda
    // «Useful» sui consigli: i più utili salgono in cima
    let votes = [];
    const tipIds = signs.filter(g => g.tip).map(g => g.id);
    if (guest) votes = ((await pubPlace(s.id))?.sign_votes || []).filter(v => tipIds.includes(v.sign_id));
    else if (evoV && tipIds.length) { try { votes = (await api(`/rest/v1/sign_votes?select=sign_id,user_id&sign_id=in.(${tipIds.join(",")})`)).data || []; } catch (err) { if ([400, 404].includes(err.status)) evoV = false; } }
    const vCount = id => votes.filter(v => v.sign_id === id).length, vMine = id => votes.some(v => v.sign_id === id && v.user_id === uid);
    const tips = signs.filter(g => g.tip).sort((a, b) => vCount(b.id) - vCount(a.id) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 6);
    const who = g => `<button type="button" class="sg-who" data-member="${esc(g.user_id)}">${esc(g.author_name || "Member")}</button> · ${g.cluster === "fabio" ? "★ Fabio's pick" : `${CLUSTERS[g.cluster]?.ico || ""} ${esc(folkOf(g.cluster))}`}${g.on_spot ? ` <span class="sg-spot" title="Signed on the spot">📍 on the spot</span>` : ""}`;
    el.innerHTML = `
      ${justSigned === s.id ? `<div class="sg-after"><b>Signed ✍</b><span>Tell the folk you travel with:</span>
        <button type="button" class="pop-btn" data-sgshare>↗ Share it</button><button type="button" class="pop-btn" data-sginvite>👥 Invite who was with you</button></div>` : ""}
      ${by.fabio ? `<p class="sg-pick">★ Fabio's pick</p>` : ""}
      ${CLUSTER_KEYS.some(k => by[k]) ? "" : `<p class="sg-none">No folk has signed it yet: be the first.</p>`}
      <div class="sg-acts">
        ${order.map(k => mineOf(k) ? `<button type="button" class="pop-btn sg-on" data-unsign="${mineOf(k).id}" style="--c:${CLUSTERS[k].color}">✓ Signed as ${folkOf(k).toLowerCase()}</button>`
          : `<button type="button" class="pop-btn sg-btn" data-sign="${k}" style="--c:${CLUSTERS[k].color}">✍ Sign as ${CLUSTERS[k].ico} ${folkOf(k).toLowerCase()}</button>`).join("")}
        ${!myStyles.length && clusterV ? `<button type="button" class="pop-btn sg-btn" data-pickstyles>✍ Sign this place</button>` : ""}
        ${admin ? (mineOf("fabio") ? `<button type="button" class="pop-btn sg-on gold" data-unsign="${mineOf("fabio").id}">★ Remove Fabio's pick</button>` : `<button type="button" class="pop-btn sg-btn gold" data-sign="fabio">★ Fabio's pick</button>`) : ""}
      </div>
      <form class="sg-form" data-signform hidden>
        <p class="gate-help left">Sign only places you've been to. Your signature says: “I've been here, and I recommend it as <b data-signas></b>”.</p>
        <input type="text" maxlength="140" placeholder="A tip in one line (optional), e.g. Go before 8, the car park fills up" aria-label="Your tip">
        <button type="submit" class="pop-btn primary">Sign</button>
      </form>
      ${tips.length ? `<ul class="sg-tips">${tips.map(g => `<li><span style="--c:${(CLUSTERS[g.cluster] || { color: "#ffd27a" }).color}">${g.cluster === "fabio" ? "★" : CLUSTERS[g.cluster]?.ico || ""}</span><p>${ugc(g.tip)}<small>${who(g)}${evoV ? ` <button type="button" class="sg-useful${vMine(g.id) ? " on" : ""}" data-useful="${g.id}"${g.user_id === uid ? " disabled" : ""} aria-pressed="${vMine(g.id)}">👍 Useful${vCount(g.id) ? ` ${vCount(g.id)}` : ""}</button>` : ""}${g.user_id !== uid ? ` <button type="button" class="rev-flag" data-flagsign="${g.id}" title="Flag this tip" aria-label="Flag this tip">⚑</button>` : ""}</small></p></li>`).join("")}</ul>` : ""}`;
    el.querySelector("[data-sgshare]")?.addEventListener("click", () => sharePlace(s));
    el.querySelector("[data-sginvite]")?.addEventListener("click", () => sharePlace(s, true));
    let pending = null;
    const form = el.querySelector("[data-signform]");
    el.querySelectorAll("[data-sign]").forEach(b => b.addEventListener("click", () => {
      pending = b.dataset.sign; form.hidden = false;
      form.querySelector("[data-signas]").textContent = pending === "fabio" ? "Fabio's pick" : folkOf(pending).toLowerCase();
      form.querySelector("input").focus();
    }));
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); if (!pending) return;
      const btn = form.querySelector("button"); btn.disabled = true; btn.textContent = "Signing…";
      // «Signed on the spot»: se il telefono è a meno di ~300 m dal luogo
      let onSpot = false;
      if (evoV && navigator.geolocation) onSpot = await new Promise(res => navigator.geolocation.getCurrentPosition(
        p => res(kmBetween(p.coords.latitude, p.coords.longitude, s.lat, s.lon) <= 0.3), () => res(false), { timeout: 6000, maximumAge: 120000 }));
      const body = { spot_id: s.id, cluster: pending, tip: form.querySelector("input").value.trim() || null, author_name: displayName(), ...(evoV ? { on_spot: onSpot } : {}) };
      try {
        await api("/rest/v1/place_signs", { method: "POST", body, headers: { Prefer: "return=minimal" } });
        if (pending !== "fabio" && mySignCount != null) { mySignCount++; paintOnboarding(); if (mySignCount === 3) setTimeout(() => toast("🎉 Welcome, you're folk now! Your passport is in My profile."), 600); }
        if (onSpot) toast("📍 Signed on the spot!");
        toast(pending === "fabio" ? "Marked as Fabio's pick." : `Signed as ${folkOf(pending).toLowerCase()}. Thanks!`); window.fcTrack?.("Spots: place signed", { cluster: pending });
        if (pending !== "fabio") justSigned = s.id;
        loadSigns(popup, s);
      } catch (err) { toast(/daily limit/i.test(err.message) ? "You've signed 30 places today: come back tomorrow." : /row-level|policy|42501/i.test(err.message) ? "You can sign only with your own folk: choose them in My profile." : `Could not sign: ${err.message}`, true); btn.disabled = false; btn.textContent = "Sign"; }
    });
    el.querySelectorAll("[data-unsign]").forEach(b => b.addEventListener("click", async () => {
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Remove signature?"; return; }
      try { await api(`/rest/v1/place_signs?id=eq.${b.dataset.unsign}`, { method: "DELETE" }); loadSigns(popup, s); } catch (err) { toast(`Could not remove: ${err.message}`, true); }
    }));
    el.querySelector("[data-pickstyles]")?.addEventListener("click", () => openStyles(() => loadSigns(popup, s)));
    el.querySelectorAll("[data-flagsign]").forEach(b => b.addEventListener("click", () => openFlag("sign", b.dataset.flagsign, `Tip on «${s.name}»`)));
    el.querySelectorAll("[data-member]").forEach(b => b.addEventListener("click", () => openMemberProfile(b.dataset.member)));
    el.querySelectorAll("[data-useful]").forEach(b => b.addEventListener("click", async () => {
      const id = +b.dataset.useful, on = b.classList.contains("on"); b.disabled = true;
      try {
        if (on) await api(`/rest/v1/sign_votes?sign_id=eq.${id}&user_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE" });
        else await api("/rest/v1/sign_votes", { method: "POST", body: { sign_id: id }, headers: { Prefer: "return=minimal" } });
        loadSigns(popup, s);
      } catch (err) { toast(`Could not vote: ${err.message}`, true); b.disabled = false; }
    }));
  }
  // scegliere (o cambiare) i propri cluster: chi è già iscritto, chi entra con Google, dal profilo
  function openStyles(after) {
    const d = dlg("stylesDialog", `<form class="import-body gate-form" novalidate>
      <span class="eyebrow">SpotFolk community</span><h2>Choose your folk</h2>
      <p class="gate-help left">Travellers who travel like you. Pick all that fit: with each folk you can sign and review the places you recommend, so people like you find them.</p>
      <fieldset class="cl-pick">${CLUSTER_KEYS.map(k => `<label><input type="checkbox" value="${k}"${myStyles.includes(k) ? " checked" : ""}><span>${CLUSTERS[k].ico} ${CLUSTERS[k].long}</span></label>`).join("")}</fieldset>
      <button class="outline-link" type="submit">SAVE <span aria-hidden="true">→</span></button>
      <p class="gate-note" id="stMsg" role="status"></p>
    </form>`);
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const picked = [...d.querySelectorAll(".cl-pick input:checked")].map(i => i.value), msg = d.querySelector("#stMsg");
      if (!picked.length) { msg.className = "gate-note warn"; msg.textContent = "Pick at least one."; return; }
      try {
        await api("/rest/v1/rpc/set_my_travel", { method: "POST", body: { p_styles: picked, p_source: doorNow() || null } });
        myStyles = picked; d.close(); toast("Saved: you can now sign places with your folk.");
        const meP = profiles.find(p => p.user_id === myUid()); if (meP) { meP.folks = picked; drawCommunity(); } window.fcTrack?.("Spots: folk chosen", { folk: picked.join(",") });
        after?.();
      } catch (err) { msg.className = "gate-note warn"; msg.textContent = `Could not save: ${err.message}`; }
    });
  }
  function maybeAskStyles() {
    if (!clusterV || guest || myStyles.length || !session) return;
    try { const t = +localStorage.getItem("fcph-styles-asked") || 0; if (Date.now() - t < 7 * 864e5) return; localStorage.setItem("fcph-styles-asked", String(Date.now())); } catch { return; }
    setTimeout(() => { if (!myStyles.length && !document.querySelector("dialog[open]")) openStyles(); }, 3000);
  }
  async function loadExtras(popup, s) {
    const el = popup.getElement();
    if (!el) return;
    loadConditions(popup, s);
    loadFacts(popup, s);
    try {
      const pub = guest ? await pubPlace(s.id) : null;
      const [{ data: photos }, { data: reviews }] = pub ? [{ data: pub.photos || [] }, { data: pub.reviews || [] }] : await Promise.all([
        api(`/rest/v1/spot_photos?select=id,path,user_id,author_name,created_at&spot_id=eq.${s.id}&order=created_at.desc`),
        fetchReviews(s.id)
      ]);
      const urls = photos.length ? await signPhotos(photos.map(p => p.path), true) : {};
      const pbox = el.querySelector("[data-photos]"), uid0 = myUid();
      pbox.innerHTML = photos.map((p, i) => urls[p.path] ? `<figure class="pop-fig">
        <button type="button" class="pop-thumb" data-photo="${i}" aria-label="Open photo ${i + 1} by ${esc(p.author_name || "a member")}">
        <img src="${esc(thumbUrl(urls, p))}" alt="" loading="lazy"></button><figcaption>© ${esc(p.author_name || "Member")}${xpBadge(p.user_id)}${commV && p.user_id !== uid0 ? ` <button type="button" class="rev-flag" data-flagphoto="${p.id}" title="Flag this photo" aria-label="Flag this photo">⚑</button>` : ""}</figcaption></figure>` : "").join("");
      pbox.querySelectorAll("[data-photo]").forEach(b => b.addEventListener("click", () => openPhotos(photos, urls, +b.dataset.photo, s)));
      el._reviews = reviews; el._photos = photos; el._urls = urls;
      if (!subV) { const rs = el.querySelector("[data-revsubs]"); if (rs && admin) rs.outerHTML = `<p class="gate-help left">Admin: the four impressions are off because the database doesn't have their columns yet. Run supabase-voti-recensioni.sql in Supabase, then reload.</p>`; else rs?.remove(); }
      if (!subV || !titleV) el.querySelector("[data-reviewform] [name=title]")?.remove();
      // «Useful» sui racconti
      let rvotes = [];
      if (pub) rvotes = pub.review_votes || [];
      else if (rvV && reviews.length) { try { rvotes = (await api(`/rest/v1/review_votes?select=review_id,user_id&review_id=in.(${reviews.map(r => r.id).join(",")})`)).data || []; } catch (err) { if ([400, 404].includes(err.status)) rvV = false; } }
      el._rvotes = rvotes;
      const rbox = el.querySelector("[data-rating]");
      const cons = consensusHtml(reviews, s);
      rbox.innerHTML = cons || `<p class="pc-empty">No impressions yet: be the first folk to give them.</p>`;
      rbox.querySelectorAll("[data-member]").forEach(b => b.addEventListener("click", () => b.dataset.member && openMemberProfile(b.dataset.member)));
      const sc = reviews.map(revScore).filter(Boolean);
      setCnt(el, "cons", sc.length ? (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1) : "");
      setCnt(el, "stories", reviews.filter(r => r.body || r.r_title).length || "");
      paintFolk(popup, s);
      // quanto si spende: media di quanto hanno pagato i membri
      const pbox2 = el.querySelector("[data-spend]");
      if (pbox2) pbox2.innerHTML = spendSummary(s, reviews);
      const uid = myUid();
      const vCount = id => rvotes.filter(v => v.review_id === id).length, vMine = id => rvotes.some(v => v.review_id === id && v.user_id === uid);
      // i racconti più utili salgono in cima; a parità, quelli dei Local expert
      reviews.sort((a, b) => vCount(b.id) - vCount(a.id) || (experts.has(b.user_id) ? 1 : 0) - (experts.has(a.user_id) ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at)));
      const faceOf = r => profiles.find(p => p.user_id === r.user_id) || { display_name: r.author_name || "Member" };
      const onSpotOf = r => (el._signs || []).some(g => g.user_id === r.user_id && g.on_spot);
      const photosOf = r => photos.filter(p => p.user_id === r.user_id && urls[p.path]).slice(0, 3);
      // il folk di chi racconta: quello scelto nel racconto, altrimenti quello con cui ha firmato il luogo, altrimenti il primo del suo profilo
      const folkOfR = r => CLUSTERS[r.folk] ? r.folk : ((el._signs || []).find(g => g.user_id === r.user_id && CLUSTERS[g.cluster]) || {}).cluster || pFolks(faceOf(r))[0] || null;
      const stories = reviews.filter(r => r.body || r.r_title);
      el.querySelector("[data-reviews]").innerHTML = stories.length ? stories.map(r => { const sc = revScore(r), ph = photosOf(r), c = CLUSTERS[folkOfR(r)], mineR = r.user_id === uid, canDel = mineR || admin || canCurate(s);
        return `<article class="pop-rev pc-story${experts.has(r.user_id) ? " by-expert" : ""}${ph.length ? " has-photo" : ""}"${r.user_id && r.user_id === myUid() ? " data-mine" : ""} style="--c:${c?.color || "#ffbe7a"}">
        ${ph.length ? `<button type="button" class="pc-cover" data-sphoto="${photos.indexOf(ph[0])}" aria-label="Photo by ${esc(r.author_name || "")}"><img src="${esc(urls[ph[0].path])}" alt="" loading="lazy"></button>` : ""}
        <div class="pc-sbody">
          <header class="pc-shead">
            <button type="button" class="pc-face" data-member="${esc(r.user_id || "")}" aria-label="${esc(r.author_name || "Member")}">${avatarHtml(faceOf(r), 30)}</button>
            <span class="pc-swho"><span class="pc-sline">${c ? `<span class="pc-sfolk">${c.ico} ${esc(c.folk)}</span>` : ""}<b class="pc-sname">${esc(shortName(r.author_name || "Member"))}</b>${xpBadge(r.user_id)}</span>
              <small><time>${fmtDay(r.created_at.slice(0, 10))}</time></small></span>
            ${onSpotOf(r) ? `<span class="pc-onspot">📍 On the spot</span>` : ""}
          </header>
          ${r.body || r.r_title ? `<p class="pc-text">${ugc(r.body || r.r_title)}</p>` : ""}
          ${ph.length > 1 ? `<div class="pc-sphotos">${ph.slice(1).map(p => `<button type="button" data-sphoto="${photos.indexOf(p)}" aria-label="Photo by ${esc(p.author_name || "")}"><img src="${esc(thumbUrl(urls, p))}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
          ${r.paid != null ? `<p class="rev-paid">💶 Paid ${fmtMoney(r.paid, r.currency)}${r.people ? ` for ${r.people} ${r.people > 1 ? "people" : "person"}` : ""}${r.nights ? `, ${r.nights} night${r.nights > 1 ? "s" : ""}` : ""}${r.stay_type ? ` · ${esc(r.stay_type)}` : ""}</p>` : ""}
          <footer class="pc-sfoot">${sc ? `<span class="pc-score" title="Their impression">${sc.toFixed(1)}<small>/5</small></span>` : ""}
            ${rvV && !mineR ? `<button type="button" class="pc-useful${vMine(r.id) ? " on" : ""}" data-ruseful="${r.id}" aria-pressed="${vMine(r.id)}">👍 ${vCount(r.id) ? `${vCount(r.id)} ` : ""}Useful</button>` : rvV && vCount(r.id) ? `<span class="pc-useful">👍 ${vCount(r.id)} Useful</span>` : ""}
            ${commV ? `<button type="button" class="pc-mark${favs.has(s.id) ? " on" : ""}" data-favstory title="Save this place" aria-label="Save this place">${favs.has(s.id) ? "♥" : "♡"}</button>` : ""}
            ${canDel || commV ? `<span class="pc-more-menu"><button type="button" class="pc-dots3" data-smore aria-label="More" aria-expanded="false">•••</button>
              <span class="pc-menu" hidden>${canDel ? `<button type="button" data-delrev="${r.id}">Delete story</button>` : `<button type="button" data-flagrev="${r.id}">⚑ Flag this story</button>`}</span></span>` : ""}
          </footer>
        </div></article>`; }).join("") : `<p class="pc-empty">No stories yet: be the first to tell this place.</p>`;
      el.querySelectorAll("[data-sphoto]").forEach(b => b.addEventListener("click", () => openPhotos(photos, urls, +b.dataset.sphoto, s)));
      el.querySelectorAll("[data-smore]").forEach(b => b.addEventListener("click", () => { const m = b.nextElementSibling, open = m.hidden; el.querySelectorAll(".pc-menu").forEach(x => { x.hidden = true; }); m.hidden = !open; b.setAttribute("aria-expanded", open); }));
      el.querySelectorAll("[data-favstory]").forEach(b => b.addEventListener("click", () => { const f = el.querySelector("[data-fav]"); if (f) f.click(); setTimeout(() => el.querySelectorAll("[data-favstory]").forEach(x => { const on = favs.has(s.id); x.classList.toggle("on", on); x.textContent = on ? "♥" : "♡"; }), 400); }));
      el.querySelectorAll("[data-ruseful]").forEach(b => b.addEventListener("click", async () => {
        const id = +b.dataset.ruseful, on = b.classList.contains("on"); b.disabled = true;
        try {
          if (on) await api(`/rest/v1/review_votes?review_id=eq.${id}&user_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE" });
          else await api("/rest/v1/review_votes", { method: "POST", body: { review_id: id }, headers: { Prefer: "return=minimal" } });
          loadExtras(popup, s);
        } catch (err) { toast(`Could not vote: ${err.message}`, true); b.disabled = false; }
      }));
      el.querySelectorAll("[data-flagrev]").forEach(b => b.addEventListener("click", () => openFlag("review", b.dataset.flagrev, `Review on «${s.name}»`)));
      el.querySelectorAll("[data-reviews] [data-member]").forEach(b => b.addEventListener("click", () => b.dataset.member && openMemberProfile(b.dataset.member)));
      el.querySelectorAll("[data-flagphoto]").forEach(b => b.addEventListener("click", () => openFlag("photo", b.dataset.flagphoto, `Photo on «${s.name}»`)));
      el.querySelectorAll("[data-delrev]").forEach(b => b.addEventListener("click", async () => {
        try { await api(`/rest/v1/spot_reviews?id=eq.${b.dataset.delrev}`, { method: "DELETE" }); loadExtras(popup, s); }
        catch (err) { toast(`Could not delete: ${err.message}`, true); }
      }));
      const mine = reviews.find(r => r.user_id === uid);
      const form = el.querySelector("[data-reviewform]");
      form?._setMine?.(mine);
      el.querySelector("[data-impform]")?._setMine?.(mine);
      const ib = el.querySelector("[data-impress]"); if (ib) ib.firstChild.textContent = mine && revScore(mine) ? "Update your impressions " : "Give your impressions ";
      const rf = el.querySelector("[data-revfolk]");   // con quale folk recensisci (le medie si vedono per folk)
      if (rf && folkV && clusterV && myStyles.length) {
        const pref = PREFERRED[s.category] || [], opts = [...myStyles].sort((a, b) => (pref.includes(b) ? 1 : 0) - (pref.includes(a) ? 1 : 0));
        const cur = mine?.folk && opts.includes(mine.folk) ? mine.folk : opts[0];
        rf.querySelector("select").innerHTML = opts.map(k => `<option value="${k}"${k === cur ? " selected" : ""}>${CLUSTERS[k].ico} ${folkOf(k)}</option>`).join("");
        rf.hidden = false;
        const fi = el.querySelector("[data-impfolk]");
        if (fi) { fi.querySelector("select").innerHTML = rf.querySelector("select").innerHTML; fi.hidden = false; }
      }
      const rb = el.querySelector("[data-review]");
      if (rb) rb.firstChild.textContent = mine ? "Edit your story " : "Share your story ";
      popup.update();
    } catch { /* foto e recensioni non disponibili: la scheda resta comunque utile */ }
  }

  /* ---------- la scheda del luogo: prima le persone, poi le parole ----------
     «The folk who know this place»: chi l'ha firmato o raccontato, dal primo (First folk) in poi; poi il consenso e il polso */
  const shortName = n => { const w = String(n || "Folk").trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : w[0]; };
  const setCnt = (el, k, v) => { const c = el.querySelector(`[data-cnt="${k}"]`); if (c) { c.textContent = v; c.hidden = v === "" || v == null; } };
  // not every impression weighs the same: on the spot counts more, then who knows the area and who has been there
  const BASIS = { onspot: ["📍", "on the spot", 1.5], local: ["🏡", "knows the area", 1.25], visited: ["🧳", "has been here", 1] };
  const impWeight = r => (BASIS[r.on_spot ? "onspot" : r.basis] || [, , 1])[2] * (experts.has(r.user_id) ? 1.2 : 1);
  function consensusHtml(reviews, s) {
    const scored = reviews.map(r => [r, revScore(r)]).filter(x => x[1]);
    if (!scored.length) return "";
    const wsum = scored.reduce((a, [r]) => a + impWeight(r), 0);
    const avg = scored.reduce((a, [r, v]) => a + v * impWeight(r), 0) / wsum;
    const subs = critFor(s).map(([k, l, d]) => { const v = reviews.filter(r => r[k]); const w = v.reduce((a, r) => a + impWeight(r), 0); return v.length ? [l, d, v.reduce((a, r) => a + r[k] * impWeight(r), 0) / w] : null; }).filter(Boolean);
    const cnt = k => scored.filter(([r]) => (r.on_spot ? "onspot" : r.basis) === k).length;
    const who = scored.slice().sort((a, b) => impWeight(b[0]) - impWeight(a[0]) || String(b[0].created_at).localeCompare(String(a[0].created_at)));
    const peopleHtml = `<p class="imp-basis-sum">${Object.keys(BASIS).filter(k => cnt(k)).map(k => `<span>${BASIS[k][0]} ${cnt(k)} ${BASIS[k][1]}</span>`).join("")}</p>
      <ul class="imp-who">${who.slice(0, 6).map(([r, v]) => { const b = BASIS[r.on_spot ? "onspot" : r.basis], c = CLUSTERS[r.folk];
        return `<li><button type="button" class="pc-face" data-member="${esc(r.user_id || "")}">${avatarHtml(profiles.find(p => p.user_id === r.user_id) || { display_name: r.author_name || "Folk" }, 26)}</button>
          <span><b>${esc(r.author_name || "Folk")}</b>${c ? ` <i style="--c:${c.color}">${c.ico} ${esc(folkOf(r.folk))}</i>` : ""}<small>${b ? `${b[0]} ${b[1]}` : "earlier impression"}${r.visited_on && !r.on_spot ? ` · ${new Date(r.visited_on).toLocaleDateString(window.I18N?.locale || "en-GB", { month: "short", year: "numeric" })}` : ""}</small></span>
          <em>${v.toFixed(1)}</em></li>`; }).join("")}${who.length > 6 ? `<li class="more">+${who.length - 6} folk</li>` : ""}</ul>`;
    const byF = {};
    scored.filter(([r]) => CLUSTERS[r.folk]).forEach(([r, v]) => { (byF[r.folk] ||= []).push(v); });
    const dots = v => `<span class="pc-dots" aria-hidden="true">${[1, 2, 3, 4, 5].map(n => `<i style="--f:${Math.max(0, Math.min(1, v - n + 1)) * 100}%"></i>`).join("")}</span>`;
    return `<div class="pc-cbox${subs.length ? "" : " solo"}">
        <div class="pc-ring" style="--p:${(avg / 5 * 100).toFixed(1)}%"><span class="pc-ring-ico" aria-hidden="true">⛰</span><b>${avg.toFixed(1)}<small>/5</small></b><em>Overall</em><span>👥 ${scored.length} folk</span></div>
        ${subs.length ? `<ul class="pc-subs">${subs.map(([l, d, v]) => `<li><span>${l}<small>${d}</small></span><b>${v.toFixed(1)}</b>${dots(v)}</li>`).join("")}</ul>` : ""}
      </div>
      ${Object.keys(byF).length > 1 ? `<p class="rev-byfolk">${CLUSTER_KEYS.filter(k => byF[k]).map(k => `<span style="--c:${CLUSTERS[k].color}" title="${folkOf(k)}">${CLUSTERS[k].ico} ${(byF[k].reduce((a, b) => a + b, 0) / byF[k].length).toFixed(1)}</span>`).join("")}</p>` : ""}
      ${peopleHtml}`;
  }
  function paintFolk(popup, s) {
    const el = popup.getElement(); if (!el) return;
    const box = el.querySelector("[data-folkbox]"), pbox = el.querySelector("[data-pulse]");
    if (!box) return;
    const signs = (el._signs || []).filter(g => g.user_id), reviews = (el._reviews || []).filter(r => r.user_id), photos = el._photos || [];
    const folkSigns = signs.filter(g => g.cluster !== "fabio");
    const people = new Map();
    const add = (uid, name, folk, at, onSpot) => {
      const p = people.get(uid);
      if (!p) return people.set(uid, { uid, name, folk, at, onSpot });
      if (String(at) < String(p.at)) { p.at = at; if (folk) p.folk = folk; }
      if (!p.folk && folk) p.folk = folk; p.onSpot = p.onSpot || onSpot;
    };
    folkSigns.forEach(g => add(g.user_id, g.author_name, g.cluster, g.created_at, !!g.on_spot));
    reviews.forEach(r => add(r.user_id, r.author_name, CLUSTERS[r.folk] ? r.folk : null, r.created_at, false));
    const list = [...people.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const first = folkSigns.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]?.user_id;
    const by = {}; folkSigns.forEach(g => { by[g.cluster] = (by[g.cluster] || 0) + 1; });
    const tot = folkSigns.length;
    if (list.length) {
      const show = list.slice(0, 12), more = list.length - show.length;   // tutti in fila (si scorre), oltre 12 «+N»
      box.innerHTML = `<div class="pc-people">${show.map(p => { const prof = profiles.find(x => x.user_id === p.uid) || { display_name: p.name }, c = CLUSTERS[p.folk];
          return `<button type="button" class="pc-p${p.uid === first ? " first" : ""}" data-member="${esc(p.uid)}" style="--c:${c ? c.color : "#ffbe7a"}">
            ${p.uid === first ? `<i class="pc-crown" aria-hidden="true">👑</i>` : ""}<span class="pc-av">${avatarHtml(prof, 56)}</span>
            ${p.uid === first ? `<em class="pc-first">First folk</em>` : ""}
            <b>${esc(shortName(prof.display_name || p.name))}</b><small>${c ? `${c.ico} ${esc(folkOf(p.folk))}` : "Folk"}</small><time title="Signed on">${p.onSpot ? "📍 " : "✍ "}${esc(fmtWhen(p.at))}</time></button>`; }).join("")}
          ${more > 0 ? `<span class="pc-more"><b>+${more}</b><small>other folk</small></span>` : ""}</div>
        ${tot ? `<div class="pc-bar" role="img" aria-label="Signed by ${tot} folk">${CLUSTER_KEYS.filter(k => by[k]).map(k => `<i style="--c:${CLUSTERS[k].color};flex:${by[k]}"></i>`).join("")}</div>
          <p class="pc-legend">${CLUSTER_KEYS.filter(k => by[k]).map(k => `<span style="--c:${CLUSTERS[k].color}">${CLUSTERS[k].ico} ${by[k]}</span>`).join("")}<em>${trS("Signed by {n} folk").replace("{n}", tot)}</em></p>` : ""}`;
      box.querySelectorAll("[data-member]").forEach(b => b.addEventListener("click", () => openMemberProfile(b.dataset.member)));
    } else box.innerHTML = `<p class="pc-empty">No folk has signed it yet: be the first.</p>`;
    setCnt(el, "folk", list.length || "");
    // il polso: cosa è successo qui negli ultimi 30 giorni
    if (pbox) {
      const since = new Date(Date.now() - 30 * 864e5).toISOString(), recent = x => String(x.created_at || "") >= since;
      const rows = [["👥", "New signatures (30 days)", folkSigns.filter(recent).length], ["📷", "New photos", photos.filter(recent).length],
        ["💬", "New stories", reviews.filter(r => r.body && recent(r)).length], ["🌿", "Tips from the folk", signs.filter(g => g.tip && recent(g)).length]].filter(r => r[2] > 0);
      pbox.innerHTML = rows.length ? `<p class="pc-alive">This place is alive in the community.</p><ul class="pc-pl">${rows.map(([i, l, n]) => `<li><span aria-hidden="true">${i}</span>${l}<b>+${n}</b></li>`).join("")}</ul>`
        : `<p class="pc-empty">Quiet for now: the first signatures will make it move.</p>`;
      setCnt(el, "pulse", rows.length ? `+${rows.reduce((a, r) => a + r[2], 0)}` : "");
    }
    popup.update();
  }

  async function purgeMyFiles() {
    const uid = myUid(); if (!uid) return;
    for (const bucket of ["spot-photos", "avatars", "journal"]) {
      try {
        for (let round = 0; round < 20; round++) {
          const list = await api(`/storage/v1/object/list/${bucket}`, { method: "POST", body: { prefix: `${uid}/`, limit: 1000, offset: 0 } });
          const names = (list || []).filter(o => o.name && o.id).map(o => `${uid}/${o.name}`);
          if (!names.length) break;
          await api(`/storage/v1/object/${bucket}`, { method: "DELETE", body: { prefixes: names } });
          if (names.length < 1000) break;
        }
      } catch {}
    }
  }

  /* ---------- foto ---------- */
  // every photo is stored twice: the full one (opened on tap, story covers) and a small one (-t.jpg) for thumbnails and strips.
  // older photos have no small copy: thumbUrl falls back to the full one
  const thumbPath = path => path.replace(/\.jpg$/i, "-t.jpg");
  const thumbUrl = (urls, p) => urls[thumbPath(p.path)] || urls[p.path];
  async function signPhotos(paths, thumbs = false) {
    if (thumbs) paths = [...paths, ...paths.map(thumbPath)];
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
    try {   // the small copy for thumbnails: about 10x lighter to serve; if it fails, the full photo is used instead
      const small = await resizeImage(file, 480, 0.8, true);
      await fetch(`${SPOTS_CONFIG.url.replace(/\/$/, "")}/storage/v1/object/spot-photos/${thumbPath(path)}`, { method: "POST", body: small,
        headers: { apikey: SPOTS_CONFIG.anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "image/jpeg", "x-upsert": "false" } });
    } catch {}
    await api("/rest/v1/spot_photos", { method: "POST", body: { spot_id: spotId, path, author_name: displayName() }, headers: { Prefer: "return=minimal" } });
    return path;
  }
  /* a photo with a condition or a piece of «Before you go»: it goes into the place's photos too, and is linked to what it shows */
  const photoPickHtml = id => `<label class="att-photo" for="${id}">📸 <span data-attname>Add a photo</span><input type="file" id="${id}" accept="image/*" capture="environment" hidden data-attfile></label>`;
  function wirePhotoPick(form) {
    const inp = form.querySelector("[data-attfile]"); if (!inp) return;
    const empty = form.querySelector("[data-attname]")?.textContent || "Add a photo";
    inp.addEventListener("change", () => { const k = inp.files?.length || 0, n = form.querySelector("[data-attname]");
      if (n) n.textContent = k > 1 ? `✓ ${k} ${IT_() ? "foto" : "photos"}` : k ? `✓ ${inp.files[0].name.slice(0, 28)}` : empty; form.querySelector(".att-photo")?.classList.toggle("on", !!k); });
  }
  async function attachedPhoto(form, s) {
    const f = form.querySelector("[data-attfile]")?.files?.[0]; if (!f) return null;
    if (!/^image\//.test(f.type)) { toast("That file isn't a photo.", true); return null; }
    try { return await uploadPhoto(s.id, f); } catch (err) { toast(`The photo could not be uploaded: ${err.message}`, true); return null; }
  }
  // photos linked to conditions and facts: signed links, then put in their place
  async function fillAttPhotos(box) {
    const els = [...box.querySelectorAll("[data-attph]")]; if (!els.length) return;
    let urls = {}; try { urls = await signPhotos([...new Set(els.map(x => x.dataset.attph))], true); } catch { return; }
    els.forEach(img => { const p = img.dataset.attph, u = urls[thumbPath(p)] || urls[p]; if (!u) { img.remove(); return; } img.src = u; img.hidden = false;
      img.addEventListener("click", ev => { ev.stopPropagation(); window.open(urls[p] || u, "_blank", "noopener"); }); });
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
          try { await api("/storage/v1/object/spot-photos", { method: "DELETE", body: { prefixes: [p.path, thumbPath(p.path)] } }); } catch {}
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
  const ME_TABS = [["profile", "Profile"], ["passport", "Passport"], ["contrib", "Contributions"], ["places", "My places"], ["activity", "Activity"], ["saved", "Saved"]];
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
  function openOnMap(s) { pendingFocus = s.id; meView = false; location.hash = "spotfolk"; }
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
    el.innerHTML = `<div class="me"><p class="me-backs"><a class="text-link me-back" href="#spotfolk">${ICON.prev}Back to the map</a><a class="text-link me-back" href="#hub">👥 The Folk Hub</a></p><p class="gate-note">Loading your profile…</p></div>`;
    const data = await loadMe();
    if (!meView) return;
    const uid = myUid(), me = profiles.find(p => p.user_id === uid) || { display_name: displayName() };
    const mine = spots.filter(s => s.created_by === uid);
    const stats = [["Places", data.profile?.places ?? mine.length], ["Reviews", data.profile?.reviews ?? data.reviews.length], ["Photos", data.profile?.photos ?? data.photos.length], ["Saved", data.profile?.saved ?? favs.size]];
    if (SF_LOOK) { sfState(); document.documentElement.classList.add("sf-on-me"); return renderMeSF(el, data, uid, me, stats); }
    el.innerHTML = `<div class="me">
      <p class="me-backs"><a class="text-link me-back" href="#spotfolk">${ICON.prev}Back to the map</a><a class="text-link me-back" href="#hub">👥 The Folk Hub</a></p>
      <header class="me-head">
        ${avatarHtml(me, 84)}
        <div class="me-id">
          <p class="eyebrow">My profile</p>
          <h2>${esc(me.display_name || displayName())}</h2>
          <p class="me-sub">${me.username ? `<b>@${esc(me.username)}</b>` : `<button type="button" class="text-link" data-meedit>Choose a username</button>`}${me.base_name ? ` · ${esc(me.base_name)}` : ""}${data.since ? ` · Member since ${esc(fmtWhen(data.since))}` : ""}</p>
        </div>
        ${clusterV ? `<p class="me-styles">${myStyles.length ? myStyles.map(k => `<span style="--c:${CLUSTERS[k].color}">${CLUSTERS[k].ico} ${folkOf(k)}</span>`).join("") : "<em>Choose your folk</em>"} <button type="button" class="text-link" data-mestyles>${myStyles.length ? "Change" : "Choose"}</button></p>` : ""}
        <div class="me-acts"><button type="button" class="pop-btn" data-meedit>✎ Edit profile</button><button type="button" class="text-link" data-mepublic>See my public profile</button></div>
      </header>
      <dl class="me-stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${fmtN(+v || 0)}</dd></div>`).join("")}</dl>
      <nav class="me-tabs" role="tablist">${ME_TABS.map(([k, l]) => `<button type="button" role="tab" data-metab="${k}" aria-selected="${k === meTab}" class="${k === meTab ? "on" : ""}">${l}</button>`).join("")}</nav>
      <section class="me-body" id="meBody"></section>
    </div>`;
    el.querySelectorAll("[data-metab]").forEach(b => b.addEventListener("click", () => { meTab = b.dataset.metab; el.querySelectorAll("[data-metab]").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); }); drawMeTab(); }));
    el.querySelectorAll("[data-meedit]").forEach(b => b.addEventListener("click", openProfile));
    el.querySelectorAll("[data-mestyles]").forEach(b => b.addEventListener("click", () => openStyles(() => { meCache = null; renderMe(); })));
    el.querySelector("[data-mepublic]").addEventListener("click", () => openMemberProfile(uid));
    drawMeTab();
  }

  /* spotfolk.eu: the folk's own page — a cover, the passport up front, live counters, tabs with icons */
  const SF_TABS = [["passport", "Passport", "🛂"], ["places", "My places", "📍"], ["contrib", "Contributions", "✍️"], ["activity", "Activity", "🕑"], ["saved", "Saved", "♥"], ["profile", "Profile", "👤"]];
  let sfMeFirst = true;
  function renderMeSF(el, data, uid, me, stats) {
    if (sfMeFirst) { sfMeFirst = false; if (meTab === "places") meTab = "passport"; }
    const ring = myStyles.length ? myStyles.map(k => CLUSTERS[k].color) : ["#ffbe7a", "#f28c1e"];
    const conic = `conic-gradient(${ring.concat(ring[0]).map((c, i, a) => `${c} ${Math.round(i / (a.length - 1) * 100)}%`).join(",")})`;
    const goTab = { Places: "places", Reviews: "contrib", Photos: "contrib", Saved: "saved" };
    const sIco = { Places: "📍", Reviews: "★", Photos: "📷", Saved: "♥" };
    el.innerHTML = `<div class="me sfme">
      <p class="me-backs"><a class="text-link me-back" href="#spotfolk">${ICON.prev}Back to the map</a><a class="text-link me-back" href="#hub">👥 The Folk Hub</a></p>
      <header class="sfme-hero">
        <div class="sfme-cover" aria-hidden="true"></div>
        <div class="sfme-main">
          <span class="sfme-ring" style="--ring:${conic}">${avatarHtml(me, 104)}</span>
          <div class="sfme-id">
            <p class="sfme-kick">Your SpotFolk passport</p>
            <h2>${esc(me.display_name || displayName())}</h2>
            <p class="sfme-sub">${me.username ? `<b>@${esc(me.username)}</b>` : `<button type="button" class="text-link" data-meedit>Choose a username</button>`}${me.base_name ? `<span>📍 ${esc(me.base_name)}</span>` : ""}${data.since ? `<span>${esc(trS("Folk since {d}").replace("{d}", fmtWhen(data.since)))}</span>` : ""}</p>
            ${clusterV ? `<div class="sfme-folks">${myStyles.map(k => `<span style="--c:${CLUSTERS[k].color}">${CLUSTERS[k].ico} ${esc(folkOf(k))}</span>`).join("")}<span class="sfme-founder" id="sfmeFounder" hidden></span><button type="button" class="sfme-add" data-mestyles>${myStyles.length ? "＋ Folk" : "Choose your folk"}</button></div>` : ""}
          </div>
          <div class="sfme-acts">
            <button type="button" class="sf-btn sf-fire" data-meedit>✎ Edit profile</button>
            <button type="button" class="sf-btn sf-line" data-mepublic>See it as others do</button>
          </div>
        </div>
        <div class="sfme-stats">${stats.map(([k, v]) => `<button type="button" class="sfme-stat" data-sfgo="${goTab[k]}"><i aria-hidden="true">${sIco[k]}</i><b data-count="${+v || 0}">0</b><small>${k}</small></button>`).join("")}</div>
      </header>
      <nav class="sfme-tabs" role="tablist">${SF_TABS.map(([k, l, i]) => `<button type="button" role="tab" data-metab="${k}" aria-selected="${k === meTab}" class="${k === meTab ? "on" : ""}"><i aria-hidden="true">${i}</i>${l}</button>`).join("")}</nav>
      <section class="me-body sfme-body" id="meBody"></section>
    </div>`;
    const pick = k => { meTab = k; el.querySelectorAll("[data-metab]").forEach(x => { const on = x.dataset.metab === k; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); if (on) x.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }); drawMeTab(); };
    el.querySelectorAll("[data-metab]").forEach(b => b.addEventListener("click", () => pick(b.dataset.metab)));
    el.querySelectorAll("[data-sfgo]").forEach(b => b.addEventListener("click", () => { pick(b.dataset.sfgo); $(".sfme-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
    el.querySelectorAll("[data-meedit]").forEach(b => b.addEventListener("click", openProfile));
    el.querySelectorAll("[data-mestyles]").forEach(b => b.addEventListener("click", () => openStyles(() => { meCache = null; renderMe(); })));
    el.querySelector("[data-mepublic]").addEventListener("click", () => openMemberProfile(uid));
    // counters that roll up to their number
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.querySelectorAll("[data-count]").forEach(b => {
      const n = +b.dataset.count; if (still || n === 0) { b.textContent = fmtN(n); return; }
      const t0 = performance.now(), d = 900, step = t => { const k = Math.min(1, (t - t0) / d); b.textContent = fmtN(Math.round(n * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    // founding number, if any
    loadPassport(uid).then(pp => { const f = $("#sfmeFounder"); if (f && pp && pp.rank && pp.rank <= 100) { f.textContent = `🏅 Founding folk #${pp.rank}`; f.hidden = false; } }).catch(() => {});
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
    if (meTab === "passport") {
      box.innerHTML = `<p class="muted">Loading your passport…</p>`;
      const [pp, sec] = await Promise.all([loadPassport(uid), evoV ? api("/rest/v1/rpc/my_seconded", { method: "POST", body: {} }).then(r => r.data || []).catch(() => []) : []]);
      if (!pp) { box.innerHTML = `<p class="gate-help left">The passport arrives once the database is updated.</p>`; return; }
      const chH = await challengesHtml(false);
      box.innerHTML = `<div class="pp-sharebar"><button type="button" class="pc-sh main" data-sharepass>↗ Share your passport</button></div>` + passportHtml(pp, uid) + chH + (sec.length ? `<section class="pp"><p class="pp-kick">Seconded</p><p class="gate-help left">Places you signed that other folk signed after you: your signature is guiding travellers.</p>
        <ul class="me-list">${sec.map(x => `<li class="me-row" data-open="${x.spot_id}"><span class="me-ico" style="--c:#ffd27a">✍</span><span class="me-txt"><b>${esc(x.name)}</b><small>${x.n} folk signed after you · ${esc(fmtWhen(x.last_at))}</small></span></li>`).join("")}</ul></section>` : "");
      wireStamps(box);
      box.querySelector("[data-sharepass]")?.addEventListener("click", () => shareDialog("passport", null, me.display_name || displayName()));
      box.querySelectorAll("[data-open]").forEach(li => li.addEventListener("click", () => { const sp = spotById(+li.dataset.open); if (sp) openOnMap(sp); }));
      return;
    }
    if (meTab === "profile") {
      box.innerHTML = `<div class="me-card">
        <p class="me-bio">${me.bio ? esc(me.bio) : `<span class="muted">No bio yet.</span>`}</p>
        <dl class="me-dl">
          <div><dt>Username</dt><dd>${me.username ? `@${esc(me.username)}` : "—"}</dd></div>
          <div><dt>Location</dt><dd>${esc(me.base_name || "—")}</dd></div>
          <div><dt>Instagram</dt><dd>${me.instagram ? `<a href="https://www.instagram.com/${encodeURIComponent(me.instagram)}/" target="_blank" rel="noopener">@${esc(me.instagram)}</a>` : "—"}</dd></div>
          <div><dt>Website</dt><dd>${me.website ? `<a href="${esc(me.website)}" target="_blank" rel="noopener">${esc(me.website.replace(/^https?:\/\//, ""))}</a>` : "—"}</dd></div>
          <div><dt>Community map</dt><dd>${me.user_id && me.lat != null && me.on_map !== false && me.visible !== false ? "Shown (about 5 km precision)" : "Not shown"}</dd></div>
        </dl>
        <p class="gate-help left">Your public profile is seen only by SpotFolk members${contribs.has(uid) || experts.has(uid) ? ", and your name, username and photo also on The crew page" : ""}. Saved places, meetups you join and your activity history are private: only you see them.</p>
        <button type="button" class="outline-link" data-meedit2>✎ Edit profile</button>
      </div>
      <details class="me-card me-danger">
        <summary>Delete my account</summary>
        <p>Your account, profile, passport, reviews, photos, saved places, trips and Field Notes stories are deleted for good. The places you added stay on the map for the other folk, without your name. This can't be undone.</p>
        <label class="me-confirm"><span>Type <b>DELETE</b> to confirm</span><input type="text" id="meDelTxt" autocomplete="off" autocapitalize="characters"></label>
        <button type="button" class="pop-btn me-delbtn" id="meDelGo" disabled>Delete my account for good</button>
        <p class="gate-note" id="meDelMsg" role="status"></p>
      </details>`;
      box.querySelector("[data-meedit2]").addEventListener("click", openProfile);
      const dt = box.querySelector("#meDelTxt"), dg = box.querySelector("#meDelGo"), dm = box.querySelector("#meDelMsg");
      dt.addEventListener("input", () => { dg.disabled = dt.value.trim().toUpperCase() !== "DELETE"; });
      dg.addEventListener("click", async () => {
        dg.disabled = true; dm.className = "gate-note"; dm.textContent = "Deleting your account…";
        try {
          if (!(await ensureSession())) throw new Error("please log in again");
          await purgeMyFiles();   // photos, profile picture and story images: the files go too, not only the rows
          await api("/rest/v1/rpc/delete_my_account", { method: "POST", body: {} });
          window.fcTrack?.("Spots: account deleted");
          try { localStorage.removeItem(HANDOFF); localStorage.removeItem(CONDUCT_KEY); } catch {}
          saveSession(null); meView = false; meCache = null; guest = true; loaded = false; guestLoaded = false;
          toast("Your account has been deleted. Thank you for having been folk.");
          location.hash = "spotfolk"; render();
        } catch (err) {
          dm.className = "gate-note warn";
          dm.textContent = err.status === 404 ? "Deleting from here isn't active yet: write to fabio.costantini25491@gmail.com and I'll delete your account."
            : `It didn't work (${err.message}). Write to fabio.costantini25491@gmail.com and I'll delete it.`;
          dg.disabled = false;
        }
      });
      return;
    }
    if (meTab === "contrib") {
      const photoUrls = data.photos.length ? await signPhotos(data.photos.slice(0, 24).map(p => p.path), true).catch(() => ({})) : {};
      const meetMine = (meetups || []).filter(m => m.created_by === uid);
      box.innerHTML = `
        <h3 class="me-h">Places <small>${mine.length}</small></h3>
        ${mine.length ? `<ul class="me-list">${mine.slice(0, 30).map(s => spotRow(s)).join("")}</ul>` : `<p class="muted">You haven't added any place yet. <button type="button" class="text-link" data-meadd>Add your first place</button></p>`}
        <h3 class="me-h">Photos <small>${data.photos.length}</small></h3>
        ${data.photos.length ? `<div class="me-photos">${data.photos.slice(0, 24).map(p => `<button type="button" data-open-photo="${p.spot_id}" title="${esc(spotById(p.spot_id)?.name || "")}">${photoUrls[p.path] ? `<img src="${esc(thumbUrl(photoUrls, p))}" alt="" loading="lazy">` : ""}</button>`).join("")}</div>` : `<p class="muted">No photos yet.</p>`}
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
        ${rows.length ? groups.map(g => `<h3 class="me-h">${esc(g || "Saved")} <small>${rows.filter(v => (v.list_name || "") === g).length}</small> <button type="button" class="text-link me-sharelist" data-sharelist="${esc(g)}">🔗 Share</button></h3>
          <ul class="me-list">${rows.filter(v => (v.list_name || "") === g).map(v => spotRow(v.s, `<span class="me-ops">
            ${profV ? `<input class="me-listin" list="meLists" maxlength="60" value="${esc(v.list_name || "")}" placeholder="List, e.g. Dolomites 2027" data-melist="${v.spot_id}" aria-label="List">` : ""}
            <button type="button" class="text-link me-del" data-meunsave="${v.spot_id}">Remove</button></span>`)).join("")}</ul>`).join("")
          : `<p class="muted">${data.saved.length ? "No saved place matches." : "Tap ♡ Save on any place to keep it here. Organise them in lists like «Dolomites 2027»."}</p>`}`;
      const qi = box.querySelector("#meSavedQ");
      qi.addEventListener("input", () => { savedQuery = qi.value; const pos = qi.selectionStart; drawMeTab().then(() => { const n = $("#meSavedQ"); n?.focus(); n?.setSelectionRange(pos, pos); }); });
      box.querySelector("[data-mesavedmap]").addEventListener("click", () => { onlyFavs = true; meView = false; location.hash = "spotfolk"; });
      box.querySelectorAll("[data-sharelist]").forEach(b => b.addEventListener("click", () => shareDialog("list", b.dataset.sharelist, b.dataset.sharelist || "Saved")));
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
      ...(s?.created_at ? [{ at: s.created_at, t: "added to SpotFolk" }] : [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    box.innerHTML = rows.length ? `<ol class="me-histl">${rows.map(r => `<li><time>${esc(fmtWhen(r.at))}</time><span>${esc(r.t)}</span></li>`).join("")}</ol>` : `<p class="muted">No changes yet.</p>`;
    if (!profV) box.insertAdjacentHTML("beforeend", `<p class="gate-help left">The full history of changes starts once the database is updated.</p>`);
  }

  /* --- PASSAPORTO SPOTFOLK: folk e livelli, numeri, mappa dei timbri, ultimi timbri --- */
  async function loadPassport(uid) {
    if (!evoV) return null;
    try { return (await api("/rest/v1/rpc/passport", { method: "POST", body: { p_user: uid } })).data; }
    catch (err) { if ([400, 404].includes(err.status)) evoV = false; return null; }
  }
  function passportHtml(pp, uid) {
    if (!pp) return "";
    const bf = pp.by_folk || {}, folks = (pp.folks || []).filter(k => CLUSTERS[k]);
    const tot = Object.values(bf).reduce((a, x) => a + (x.signs || 0), 0), onSpot = Object.values(bf).reduce((a, x) => a + (x.on_spot || 0), 0);
    const stamps = (pp.stamps || []).filter(t => Number.isFinite(+t.lat));
    // mappa dei timbri: proiezione semplice sui confini dei punti
    let mapSvg = "";
    if (stamps.length) {
      const la = stamps.map(t => +t.lat), lo = stamps.map(t => +t.lon);
      let [y0, y1, x0, x1] = [Math.min(...la), Math.max(...la), Math.min(...lo), Math.max(...lo)];
      const pad = Math.max(0.05, (x1 - x0) * 0.12, (y1 - y0) * 0.12); x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
      const W = 600, H = 260, k = Math.min(W / (x1 - x0), H / ((y1 - y0) * 1.3)), ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * 1.3 * k) / 2;
      const P = t => [ox + (+t.lon - x0) * k, H - oy - (+t.lat - y0) * 1.3 * k];
      mapSvg = `<svg class="pp-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of signed places">${stamps.slice().reverse().map(t => { const [x, y] = P(t);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${t.on_spot ? 5 : 3.6}" fill="${(CLUSTERS[t.folk] || {}).color || "#ffd27a"}"${t.on_spot ? ' stroke="#fff" stroke-width="1.5"' : ""}><title>${esc(t.name)}</title></circle>`; }).join("")}</svg>`;
    }
    const xp = experts.get(uid);
    return `<section class="pp">
      <p class="pp-kick">SpotFolk passport</p>
      <div class="pp-folks">${folks.length ? folks.map(k => { const lv = levelOf(bf[k]); return `<span class="pp-folk" style="--c:${CLUSTERS[k].color}">${CLUSTERS[k].ico} ${esc(folkOf(k))}<b>${lv ? lv[1] : "New"}</b></span>`; }).join("") : `<span class="muted">No folk chosen yet.</span>`}
        ${xp ? `<span class="pp-folk" style="--c:#ffd9a0">🧭 Local expert<b>${esc(xp.area_name)}</b></span>` : ""}
        ${pp.rank && pp.rank <= 100 ? `<span class="pp-folk founder" style="--c:#ffd27a">🏅 Founding folk<b>#${pp.rank}</b></span>` : ""}</div>
      <dl class="me-stats pp-stats">${[["Signatures", tot], ["Places added", pp.places], ["First to sign", pp.firsts], ["On the spot", onSpot], ["Seconded", pp.seconded], ["Useful tips", pp.useful]].map(([a, b]) => `<div><dt>${a}</dt><dd>${fmtN(+b || 0)}</dd></div>`).join("")}</dl>
      ${mapSvg}
      ${stamps.length ? `<p class="pp-h">Latest stamps</p><ul class="pp-stamps">${stamps.slice(0, 18).map(t => `<li><button type="button" data-stamp="${t.id}" style="--c:${(CLUSTERS[t.folk] || {}).color || "#ffd27a"}"><span>${CLUSTERS[t.folk]?.ico || "★"}</span>${esc(t.name)}<small>${esc(fmtWhen(t.at))}${t.on_spot ? " · 📍" : ""}</small></button></li>`).join("")}</ul>` : `<p class="muted">No stamps yet: sign the places you've been to.</p>`}
      <p class="gate-help left">Levels in each folk: <b>Wanderer</b> from the first signature · <b>Pathfinder</b> 10 signatures and a tip · <b>Trusted</b> 25 signatures in at least 3 areas. 50 places in your area (within 50 km) can make you a <b>Local expert</b>.</p>
    </section>`;
  }
  function wireStamps(box, close) {
    box.querySelectorAll("[data-stamp]").forEach(b => b.addEventListener("click", () => { const sp = spotById(+b.dataset.stamp); if (!sp) return toast("This place is not on your map right now.", true); close?.(); if (meView) openOnMap(sp); else focusSpot(sp); }));
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
      ${p.bio ? `<p class="me-bio">${ugc(p.bio)}</p>` : ""}
      <dl class="me-stats">${[["Places", p.places ?? places.length], ["Reviews", p.reviews], ["Photos", p.photos], ["Meetups", p.meetups]].filter(([, v]) => v != null).map(([k, v]) => `<div><dt>${k}</dt><dd>${fmtN(+v || 0)}</dd></div>`).join("")}</dl>
      <p class="sx-links">${p.instagram ? `<a class="text-link" href="https://www.instagram.com/${encodeURIComponent(p.instagram)}/" target="_blank" rel="noopener">Instagram @${esc(p.instagram)}</a>` : ""}${p.website ? `<a class="text-link" href="${esc(p.website)}" target="_blank" rel="noopener">${ICON.ext}Website</a>` : ""}</p>
      <div data-pp><p class="muted">Loading the passport…</p></div>
      ${places.length ? `<h3 class="me-h">Places added <small>${places.length}</small></h3><ul class="me-list">${places.slice(0, 20).map(s => spotRow(s)).join("")}</ul>` : ""}`;
    loadPassport(uid).then(pp => {
      const box = body.querySelector("[data-pp]"); if (!box) return; box.innerHTML = pp ? passportHtml(pp, uid) : ""; wireStamps(box, () => d.close());
      const h = body.querySelector(".me-id h2"); if (pp?.name && h && h.textContent === "Member") h.textContent = pp.name;   // nome e cognome dal passaporto
    });
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
    spot: [["viewpoint", "Photo spot"], ["nature", "Photo spot"], ["urban", "Point of interest"]],   // in Places si sceglie con i tre pulsanti, non con questa riga   // «urban» resta il valore salvato: ora si chiama Point of interest
    hotel: [["hotel", "Hotel"], ["bnb", "B&B · guesthouse"], ["camping", "Camping"], ["hut", "Mountain hut"]],
    restaurant: [["restaurant", "Restaurant"], ["bar", "Bar · café"], ["streetfood", "Street food"]],
    experience: [["tour", "Tour"], ["boat", "Boat trip"], ["guided", "Guided visit"]],
    trekking: [], workshop: []
  };
  const WZ_GROUPS = [
    { id: "places", label: "Places", cats: ["spot", "trekking"] },
    { id: "essentials", label: "Essentials", cats: ["hotel", "restaurant"] },
    { id: "outdoors", label: "Outdoors", cats: ["workshop", "experience"] },
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
  // Places in tre scelte: Photo spot e Point of interest sono entrambi «spot» (sottocategoria viewpoint / urban), più Trekking
  const PLACE_KINDS = [["spot", "photo", "Photo spot", CATS.spot.icon],
    ["spot", "poi", "Point of interest", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V10M18 20V10M10 20v-6h4v6M3 10l9-6 9 6z"/></svg>'],
    ["trekking", "trek", "Trekking", CATS.trekking.icon]];
  const placeKind = () => wz.cat === "trekking" ? "trek" : wz.cat !== "spot" ? "" : wz.sub === "urban" ? "poi" : wz.sub ? "photo" : wz.edit && spotSub(wz.edit) === "poi" ? "poi" : "photo";
  const SOCIAL_CATS = ["spot", "hotel", "restaurant"];   // Support local e Fragile: Places (spot) ed Essentials
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
      sub: s.category === "spot" ? (["viewpoint", "nature", "urban"].includes(s.subcategory) ? s.subcategory : edit && spotSub(s) === "poi" ? "urban" : "") : (s.subcategory || ""), note: s.note || "", info: { ...(s.info || {}) },
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
          <p>Photographers, travellers, local experts and meetups have their own place in SpotFolk:</p>
          <button type="button" class="outline-link" data-wzmeet>👥 Organise a meetup here</button>
          <button type="button" class="outline-link" data-wzph>📷🎒 Join the community map</button>
          ${passV ? `<button type="button" class="outline-link" data-wzpass>🎁 Pass it on: sell or give away something here</button>` : ""}
        </div>` : `
      ${g === "places" ? `<div class="wz-cats" role="group" aria-label="Category">${PLACE_KINDS.map(([c, sb, label, ico]) => `<button type="button" class="wz-cat${placeKind() === sb ? " on" : ""}" data-wzcat="${c}" data-wzkind="${sb}" style="--c:${CATS[c].color}">${ico}<span>${label}</span></button>`).join("")}</div>`
        : cats.length > 1 ? `<div class="wz-cats" role="group" aria-label="Category">${cats.map(k => `<button type="button" class="wz-cat${k === wz.cat ? " on" : ""}" data-wzcat="${k}" style="--c:${CATS[k].color}">${CATS[k].icon}<span>${CATS[k].label}</span></button>`).join("")}</div>` : ""}
      ${subs.length && profV && g !== "places" ? `<div class="wz-subs" role="group" aria-label="Type">${subs.map(([k, l]) => `<button type="button" class="wz-sub${k === wz.sub ? " on" : ""}" data-wzsub="${k}">${esc(l)}</button>`).join("")}</div>` : ""}
      <label>Description <small>(optional)</small><textarea id="wzNote" rows="3" maxlength="2000" placeholder="What makes it worth it? Best time, what to shoot, tips…">${esc(wz.note)}</textarea></label>
      ${wz.cat === "workshop" ? `<div class="add-dates"><div><label for="wzFrom">From</label><input id="wzFrom" type="date" value="${esc(wz.from)}"></div><div><label for="wzTo">To</label><input id="wzTo" type="date" value="${esc(wz.to)}"></div></div>
        ${wsV ? wsFieldsHtml(s, "wzWs") : ""}` : ""}
      ${wz.cat === "trekking" && tkV ? `<fieldset class="soc-add tk-add"><legend>Trail <small>(optional)</small></legend>${tkFieldsHtml(s, "wzTk")}</fieldset>` : ""}
      ${(WZ_INFO[wz.cat] || []).length ? `<fieldset class="wz-info"><legend>Useful info <small>(optional)</small></legend>${WZ_INFO[wz.cat].map(field).join("")}</fieldset>` : ""}
      ${SOCIAL_CATS.includes(wz.cat) && socialV ? `<fieldset class="soc-add"><legend>Community <small>(optional)</small></legend>
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
    d.querySelectorAll("[data-wzcat]").forEach(b => b.addEventListener("click", () => {
      collect();
      if (b.dataset.wzkind != null) { wz.cat = b.dataset.wzcat; if (wz.cat === "spot") wz.sub = b.dataset.wzkind === "poi" ? "urban" : (wz.sub === "nature" ? "nature" : "viewpoint"); else wz.sub = ""; rerender(); return; }
      (wz.subBy ||= {})[wz.cat] = wz.sub; wz.cat = b.dataset.wzcat; wz.sub = wz.subBy[wz.cat] || ""; rerender();
    }));
    d.querySelectorAll("[data-wzsub]").forEach(b => b.addEventListener("click", () => { collect(); wz.sub = wz.sub === b.dataset.wzsub ? "" : b.dataset.wzsub; rerender(); }));
    d.querySelector("[data-wzmeet]")?.addEventListener("click", () => { const p = { lat: wz.lat, lon: wz.lon }; d.close(); withConduct(() => openMeetup(p.lat != null ? p : null)); });
    d.querySelector("[data-wzph]")?.addEventListener("click", () => { d.close(); openProfile(); });
    d.querySelector("[data-wzpass]")?.addEventListener("click", () => { const p = { lat: wz.lat, lon: wz.lon, exact: wz.lat != null }; d.close(); withConduct(() => openPassOn(p.lat != null ? p : null)); });
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
    box.innerHTML = sim.length ? `<p class="wz-label">Already on SpotFolk nearby — is it the same place?</p>
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
      const urls = data?.length ? await signPhotos(data.map(p => p.path), true) : {};
      wz.photos = (data || []).map(p => ({ ...p, url: thumbUrl(urls, p) || "" }));
      drawThumbs();
    } catch {}
  }

  async function publish() {
    const btn = $("#wzNext");
    const cat = wz.cat, edit = wz.edit;
    const row = { name: wz.name.slice(0, 300), lat: wz.lat, lon: wz.lon, note: wz.note || null };
    if (schemaV2) Object.assign(row, { category: cat, author_name: (wz.author || displayName()).slice(0, 60),
      starts_on: cat === "workshop" ? wz.from || null : null, ends_on: cat === "workshop" ? (wz.to || wz.from || null) : null });
    if (profV) Object.assign(row, { subcategory: cat === "spot" ? (wz.sub || (placeKind() === "poi" ? "urban" : "viewpoint")) : wz.sub || null, info: Object.fromEntries(Object.entries(wz.info).filter(([k]) => (WZ_INFO[cat] || []).some(f => f[0] === k) || (k === "currency" && wz.info.price))) });
    else if (infoRows(wz.info).length) row.note = [row.note, infoRows(wz.info).map(([a, b]) => `${a}: ${b}`).join("\n")].filter(Boolean).join("\n\n");
    if (schemaV2 && socialV && SOCIAL_CATS.includes(cat)) Object.assign(row, { support_local: wz.support, best_months: wz.months || null });
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
      if (schemaV2 && socialV && SOCIAL_CATS.includes(cat) && wz.fragile !== !!edit?.fragile) { try { await api("/rest/v1/rpc/set_fragile", { method: "POST", body: { p_spot: saved.id, p_fragile: wz.fragile } }); } catch {} }
      let photoErr = "";
      for (const id of wz.removePhotos) {
        const p = wz.photos.find(x => x.id === id);
        try { await api(`/rest/v1/spot_photos?id=eq.${id}`, { method: "DELETE" }); if (p) await api("/storage/v1/object/spot-photos", { method: "DELETE", body: { prefixes: [p.path, thumbPath(p.path)] } }); } catch (err) { photoErr = err.message; }
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
  const login = () => { if (session && !guest) return; wantLogin = true; wantJoin = false; if (location.hash !== "#spotfolk" && document.body.dataset.page !== "spots") location.hash = "spotfolk"; render(); setTimeout(() => root()?.scrollIntoView({ behavior: "smooth" }), 60); };
  return { show, showHub, prefetch, handleCallback, loadSession, renderWrite, goOther, login, logout: () => { meView = false; meCache = null; if (location.hash === "#me") location.hash = "spotfolk"; return logout(); }, parse: { fromCSV, fromKML, fromGeoJSON, coordsFromText } };
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
