/* Fabio Costa Ph / SpotFolk — hub.js
   The Folk Hub: the community feed, the folk to discover, the places you follow, notifications and reputation.
   Loaded only when someone opens the Hub (spots.js → showHub). Everything is read from the existing tables
   through the functions in supabase-folk-hub-2.sql: no content is copied, nothing here is sample data. */
"use strict";

window.FolkHub = (() => {
  let K = null, box = null;
  const lang = window.I18N?.lang || "en";

  /* ---------- words (the rest of the site is translated by i18n.js; the Hub translates itself) ---------- */
  const IT = {
    "The Folk": "The Folk", "Hub": "Hub", "People, places and shared knowledge.": "Persone, luoghi e conoscenza condivisa.",
    "Feed": "Feed", "Following": "Seguiti", "Discover folk": "Scopri i folk", "Your places": "I tuoi posti", "Notifications": "Notifiche", "Your passport": "Il tuo passaporto",
    "Discover": "Scopri", "Places": "Posti", "Alerts": "Avvisi", "Me": "Io", "Map": "Mappa",
    "Places you follow": "Posti che segui", "No news": "Nessuna novità", "Save a place on the map to follow it here.": "Salva un posto sulla mappa per seguirlo qui.",
    "What's": "Cosa", "happening": "succede", "From the folk and the places on the map.": "Dai folk e dai posti della mappa.", "From folk you follow and places you saved.": "Dai folk che segui e dai posti che hai salvato.",
    "For you": "Per te", "Map updates": "Mappa", "Stories": "Storie", "Checks": "Verifiche", "Place pulse": "Place pulse",
    "Signed": "Firmato", "Fabio's pick": "Scelto da Fabio", "Before you go": "Before you go", "Updated info": "Info aggiornata", "Checked": "Verificato dai folk", "Folk story": "Folk story",
    "Impressions": "Impressioni", "Photo": "Foto", "New spot": "Nuovo posto", "Spot update": "Aggiornamento",
    "on the spot": "sul posto", "was there": "c'è stato", "knows the area": "conosce la zona",
    "a place in": "un posto in", "the map": "la mappa",
    "signed {p}": "ha firmato {p}", "picked {p}": "ha scelto {p}", "says how it is now at {p}": "dice com'è adesso a {p}", "added {t} at {p}": "ha aggiunto {t} a {p}",
    "updated {t} at {p}": "ha aggiornato {t} a {p}", "checked {t} at {p}": "ha verificato {t} a {p}", "told a story about {p}": "ha raccontato {p}",
    "gave impressions of {p}": "ha dato le sue impressioni su {p}", "added a photo of {p}": "ha aggiunto una foto di {p}", "added {p} to the map": "ha aggiunto {p} alla mappa",
    "updated {f} of {p}": "ha aggiornato {f} di {p}",
    "👑 First to sign it": "👑 Il primo a firmarlo", "No folk yet: be the first to sign it": "Nessun folk ancora: firmalo per primo",
    "expires {w}": "scade {w}", "expired": "scaduto", "Confirmed by {n} folk": "Confermato da {n} folk", "Not confirmed yet": "Non ancora confermato",
    "🔒 This place is on the folk's map.": "🔒 Questo posto è sulla mappa dei folk.", "Become folk to see where →": "Diventa folk per vedere dove →",
    "🛡️ A fragile place: its name stays among the folk who know it.": "🛡️ Un posto fragile: il nome resta tra i folk che lo conoscono.",
    "Appreciate": "Apprezza", "Useful": "Utile", "Been there!": "Ci sono stato!", "You've been": "Ci sei stato", "Save": "Salva", "Saved": "Salvato",
    "✓ Still so": "✓ È ancora così", "✓ Still correct": "✓ È ancora giusto", "✓ You confirmed": "✓ Hai confermato", "Open the place →": "Apri il posto →", "Report": "Segnala",
    "+ Follow": "+ Segui", "Following ✓": "Segui ✓", "Follow": "Segui", "Unfollow": "Non seguire più",
    "Only folk can do this.": "Solo i folk possono farlo.", "Become folk, free →": "Diventa folk, è gratis →",
    "Sign it from its card on the map: tap ✍ Sign.": "Firmalo dalla sua scheda sulla mappa: tocca ✍ Firma.",
    "Thanks!": "Grazie!", "Reported. Thanks for looking after the map.": "Segnalato. Grazie per prenderti cura della mappa.",
    "You can't react to your own contributions.": "Non puoi reagire ai tuoi contributi.", "Could not save it: {e}": "Non salvato: {e}",
    "Loading…": "Caricamento…", "Load more": "Carica altro", "That's all for now.": "Per ora è tutto.",
    "The folk room is waiting for its first voices.": "La folk room aspetta le sue prime voci.",
    "Sign a place you've been, tell the folk how it is now, or check what they wrote.": "Firma un posto dove sei stato, racconta com'è adesso o verifica quello che hanno scritto gli altri folk.",
    "Nothing of this kind yet.": "Ancora niente di questo tipo.", "Follow folk or save places to see their news here.": "Segui dei folk o salva dei posti per vedere qui le loro novità.",
    "Open the map": "Apri la mappa", "Could not load the Hub. Check your connection and try again.": "Impossibile caricare l'Hub. Controlla la connessione e riprova.",
    "The Folk Hub needs its database update (supabase-folk-hub-2.sql).": "Il Folk Hub ha bisogno dell'aggiornamento del database (supabase-folk-hub-2.sql).", "Try again": "Riprova",
    "Activity on the map": "Attività sulla mappa", "Open map →": "Apri mappa →", "New spots": "Nuovi posti", "Pulse": "Pulse", "7 days": "7 giorni", "30 days": "30 giorni", "Folk I follow": "Folk che seguo",
    "Full screen": "Schermo intero", "Close": "Chiudi", "No activity on the map in this period.": "Nessuna attività sulla mappa in questo periodo.",
    "{n} updates · {w}": "{n} novità · {w}", "1 update · {w}": "1 novità · {w}",
    "Folk to follow": "Folk da seguire", "Folk to know": "Folk da conoscere", "Discover →": "Scopri →",
    "Your reputation": "La tua reputazione", "How it works": "Come funziona", "Reputation": "Reputazione",
    "Built only from things others can verify. Followers and volume don't count.": "Nasce solo da cose che altri possono verificare. Follower e quantità non contano.",
    "New voice": "Nuova voce", "Contributor": "Contributore", "Reliable folk": "Folk affidabile", "Expert folk": "Folk esperto", "Pillar of the map": "Colonna della mappa", "No contributions yet": "Ancora nessun contributo",
    "Field experience": "Esperienza sul campo", "Checked knowledge": "Conoscenza verificata", "Useful to others": "Utile agli altri", "Spot contributions": "Posti aggiunti",
    "Local knowledge": "Conoscenza locale", "Community trust": "Fiducia della community",
    "{n} on the spot": "{n} sul posto", "{n} confirmed by others": "{n} confermate da altri", "{n} folk": "{n} folk", "{n} signed by others": "{n} firmati da altri",
    "{n} in your area": "{n} nella tua zona", "no local area yet": "nessuna zona locale", "{n} folk, {m} months": "{n} folk, {m} mesi",
    "Strongest in": "Più forte in", "Open your passport →": "Apri il tuo passaporto →",
    "How reputation works": "Come funziona la reputazione",
    "Every folk has a level from I to V, built from six things others can verify: being on the spot, information confirmed by other folk, people who found you useful, places you added that others signed, knowledge of your area, and the trust of the community. Each one grows slowly: posting a lot doesn't make you rise, being right does.":
      "Ogni folk ha un livello da I a V, costruito da sei cose che altri possono verificare: essere sul posto, informazioni confermate da altri folk, persone che ti hanno trovato utile, posti che hai aggiunto e altri hanno firmato, conoscenza della tua zona, fiducia della community. Ognuna cresce piano: pubblicare tanto non fa salire, avere ragione sì.",
    "Join the folk to build yours.": "Diventa folk per costruire la tua.",
    "Search folk by name or area": "Cerca folk per nome o zona", "All": "Tutti", "Suggested for you": "Suggeriti per te", "No folk found.": "Nessun folk trovato.",
    "{n} signatures": "{n} firme", "{n} on the spot ": "{n} sul posto ", "{n} followers": "{n} follower", "local in {a}": "locale a {a}",
    "followed by {n} folk you follow": "seguito da {n} folk che segui", "signed {n} of your places": "ha firmato {n} dei tuoi posti",
    "local folk in {a}": "folk locale a {a}", "{n} infos confirmed by others": "{n} info confermate da altri", "{n} signatures on the spot": "{n} firme sul posto", "travels like you": "viaggia come te",
    "See activity": "Vedi attività", "Open full profile →": "Apri il profilo completo →", "Recent activity": "Attività recenti", "No public activity yet.": "Ancora nessuna attività pubblica.",
    "followers": "follower", "following": "seguiti",
    "The places you saved, and what the folk say about them.": "I posti che hai salvato e cosa ne dicono i folk.",
    "Notify me": "Avvisami", "Muted": "Silenziato", "Saved on this device. Become folk to keep them everywhere.": "Salvati su questo dispositivo. Diventa folk per averli ovunque.",
    "No saved places yet. Tap ♡ Save on a place to follow it.": "Ancora nessun posto salvato. Tocca ♡ Salva su un posto per seguirlo.",
    "Mark all as read": "Segna tutto come letto", "Nothing new. When something happens on your places, to your folk or to your contributions, it shows up here.":
      "Niente di nuovo. Quando succede qualcosa nei tuoi posti, ai folk che segui o ai tuoi contributi, lo trovi qui.",
    "Notify me about": "Avvisami per", "My places": "I miei posti", "Folk I follow ": "Folk che seguo ", "My contributions": "I miei contributi", "New followers": "Nuovi follower",
    "Notifications are for folk. As a visitor you can follow places: their news is in Your places.": "Le notifiche sono per i folk. Come visitatore puoi seguire i posti: le loro novità sono in I tuoi posti.",
    "{n} started following you": "{n} ha iniziato a seguirti", "{n} appreciated {w}": "{n} ha apprezzato {w}", "{n} found {w} useful": "{n} ha trovato utile {w}",
    "{n} checked your info at {p}": "{n} ha verificato la tua info a {p}", "{n} signed {p}, a place you added": "{n} ha firmato {p}, un posto che hai aggiunto",
    "{n} signed {p}": "{n} ha firmato {p}", "{n} shared how it is now at {p}": "{n} ha detto com'è adesso a {p}", "{n} added info at {p}": "{n} ha aggiunto un'info a {p}",
    "{n} checked info at {p}": "{n} ha verificato un'info a {p}", "{n} told a story about {p}": "{n} ha raccontato {p}", "{n} gave impressions of {p}": "{n} ha dato impressioni su {p}",
    "{n} added a photo of {p}": "{n} ha aggiunto una foto di {p}", "{n} updated {p}": "{n} ha aggiornato {p}", "{n} added {p}": "{n} ha aggiunto {p}",
    "a fragile place": "un posto fragile", "A folk": "Un folk", "a folk": "un folk", "your signature": "la tua firma", "your story": "la tua storia", "your info": "la tua info", "your update": "il tuo aggiornamento", "your photo": "la tua foto", "your place": "il tuo posto",
    "on your places": "sui tuoi posti", "from folk you follow": "dai folk che segui",
    "just now": "adesso", "{n} min ago": "{n} min fa", "{n} h ago": "{n} h fa", "yesterday": "ieri", "{n} days ago": "{n} giorni fa", "in {n} h": "tra {n} h", "in {n} days": "tra {n} giorni",
    "Your passport and reputation": "Il tuo passaporto e la reputazione", "Become folk — free": "Diventa folk — è gratis",
    "description": "la descrizione", "useful info": "le info utili", "best months": "i mesi migliori", "position": "la posizione", "type": "il tipo", "link": "il link", "name": "il nome", "category": "la categoria", "trail info": "le info del sentiero", "workshop info": "le info del workshop", "dates": "le date", "Support local": "Support local",
    "Wrong or outdated?": "Sbagliato o superato?",
    "Finding and following other folk is for members. Join free to meet the people behind the places.": "Trovare e seguire gli altri folk è per gli iscritti. Iscriviti gratis per conoscere le persone dietro i posti.",
    "Your passport collects the places you've signed, your stamps and your folk. It's free.": "Il passaporto raccoglie i posti che hai firmato, i tuoi timbri e i tuoi folk. È gratis.",
    "Find your folk": "Trova i tuoi folk", "Follow the folk who travel like you and the places you love: their news comes to you.": "Segui i folk che viaggiano come te e i posti che ami: le loro novità arrivano a te.",
    "You're seeing a preview.": "Stai vedendo un'anteprima.",
    "Here is what the folk bring to the places of the public map. Become folk to see the whole map, follow people and places, and take part.": "Ecco cosa portano i folk sui posti della mappa pubblica. Diventa folk per vedere tutta la mappa, seguire persone e posti e partecipare."
  };
  const tx = (s, v = {}) => { let o = (lang === "it" && IT[s]) || s; for (const k in v) o = o.split(`{${k}}`).join(v[k]); return o; };
  const e = s => K.esc(String(s ?? ""));
  const ago = t => {
    const m = Math.round((Date.now() - new Date(t)) / 60e3);
    if (m < 1) return tx("just now"); if (m < 60) return tx("{n} min ago", { n: m }); if (m < 1440) return tx("{n} h ago", { n: Math.round(m / 60) });
    if (m < 2880) return tx("yesterday"); if (m < 60 * 24 * 30) return tx("{n} days ago", { n: Math.round(m / 1440) });
    return new Date(t).toLocaleDateString(window.I18N?.locale || "en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const until = t => { const h = (new Date(t) - Date.now()) / 36e5; return h <= 0 ? tx("expired") : tx("expires {w}", { w: h < 48 ? tx("in {n} h", { n: Math.max(1, Math.round(h)) }) : tx("in {n} days", { n: Math.round(h / 24) }) }); };
  const KIND = {
    sign: ["k-sign", "Signed"], cond: ["k-pulse", "Place pulse"], fact: ["k-check", "Before you go"], check: ["k-check", "Checked"], story: ["k-story", "Folk story"],
    impression: ["k-story", "Impressions"], photo: ["k-photo", "Photo"], place: ["k-new", "New spot"], update: ["k-upd", "Spot update"]
  };
  const PIN = { sign: "#ffbe7a", place: "#f28c1e", cond: "#7fc8ff", fact: "#9fe3c8", check: "#9fe3c8", story: "#e9a6ff", impression: "#e9a6ff", photo: "#ffd166", update: "#ffd166" };
  const LEVEL = ["No contributions yet", "New voice", "Contributor", "Reliable folk", "Expert folk", "Pillar of the map"];
  const ROMAN = ["–", "I", "II", "III", "IV", "V"];
  const COMP = [["field", "Field experience"], ["checked", "Checked knowledge"], ["useful", "Useful to others"], ["spots", "Spot contributions"], ["local", "Local knowledge"], ["trust", "Community trust"]];
  const FIELD = { name: "name", note: "description", category: "category", subcategory: "type", info: "useful info", lat: "position", lon: "position", url: "link", support_local: "Support local", best_months: "best months", starts_on: "dates", ends_on: "dates" };
  const fieldLabel = f => tx(FIELD[f] || (f.startsWith("tk_") ? "trail info" : f.startsWith("ws_") ? "workshop info" : f.replace(/_/g, " ")));

  /* ---------- state ---------- */
  const S = {
    view: "feed", filter: "all", items: [], next: null, busy: false, end: false, err: "", urls: {},
    mapDays: 7, mapFol: false, mapPts: null, map: null, mapLayer: null, mapFull: false,
    sugg: null, rep: null, upd: null, places: null, placeFeed: null, found: null, q: "", qFolk: "", follow: new Map()
  };
  const who = () => K.who();
  const isMember = () => who().member;
  const rpc = (fn, body = {}) => K.api(`/rest/v1/rpc/${fn}`, { method: "POST", body }).then(r => r.data);
  const missing = err => /hub_feed|hub_map|discover_folk|folk_reputation|my_updates|function|schema cache|PGRST202/i.test(err?.message || "");

  /* ---------- photos (thumbnails, signed links) ---------- */
  async function sign(paths) {
    const need = [...new Set(paths.filter(Boolean))].filter(p => !(p in S.urls)).slice(0, 60);
    if (!need.length) return;
    try { const u = await K.signPhotos(need, true); need.forEach(p => { S.urls[p] = u?.[p.replace(/\.jpg$/i, "-t.jpg")] || u?.[p] || ""; }); } catch { need.forEach(p => { S.urls[p] = ""; }); }
  }
  const photo = path => (path && S.urls[path]) || "";   // only real photos of the place: never a stock image under a real name
  const catIcon = cat => { const c = K.CATS[cat] || K.CATS.spot; return `<span class="hb-cat" style="--c:${c.color}">${c.icon}</span>`; };

  /* ---------- small pieces ---------- */
  function face(p, size = 44) {
    const c = K.CLUSTERS[p.folk] || K.CLUSTERS[(p.folks || [])[0]];
    const inner = p.avatar ? `<img src="${e(K.avatarUrl(p.avatar))}" alt="" loading="lazy">` : `<span>${e(p.name ? K.initials(p.name) : "·")}</span>`;
    const tag = p.user_id ? `button type="button" data-folk="${e(p.user_id)}" aria-label="${e(p.name || "")}"` : "span";
    return `<${tag} class="hb-av" style="--s:${size}px;--c:${c?.color || "#ffbe7a"}">${inner}</${tag.split(" ")[0]}>`;
  }
  const folkChip = k => k === "fabio" ? `<span class="hb-folk" style="--c:#ffd27a">★ ${e(tx("Fabio's pick"))}</span>` : K.CLUSTERS[k] ? `<span class="hb-folk" style="--c:${K.CLUSTERS[k].color}">${K.CLUSTERS[k].ico} ${e(K.CLUSTERS[k].folk)}</span>` : "";
  const nameOf = i => i.name || (i.folk && K.CLUSTERS[i.folk] ? `${tx("A folk").split(" ")[0]} ${K.CLUSTERS[i.folk].folk.toLowerCase()}` : tx("A folk"));
  const n = v => (v ? `<b>${v}</b>` : "");
  function joinNote(card) {
    if (!card || card.querySelector(".hb-joinnote")) return;
    card.insertAdjacentHTML("beforeend", `<p class="hb-joinnote">${e(tx("Only folk can do this."))} <a href="#join">${e(tx("Become folk, free →"))}</a></p>`);
    K.track("Hub: join prompt");
  }

  /* ---------- a card of the feed ---------- */
  function card(i) {
    const me = i.me || {}, nn = i.n || {}, open = i.open && i.spot_id;
    const place = open ? `<b>${e(i.spot)}</b>` : `${e(tx("a place in"))} <b>${e(i.zone === "the map" ? tx("the map") : i.zone)}</b>`;
    const kl = KIND[i.kind] || ["", ""];
    const kindLabel = i.kind === "sign" && i.folk === "fabio" ? "Fabio's pick" : i.kind === "fact" && i.extra?.changed ? "Updated info" : kl[1];
    const spotTag = i.extra?.on_spot ? ` · 📍 ${e(tx("on the spot"))}` : i.extra?.basis === "visited" ? ` · 🧳 ${e(tx("was there"))}` : i.extra?.basis === "local" ? ` · 🏡 ${e(tx("knows the area"))}` : "";
    const canFollow = i.user_id && !me.own;
    const fol = canFollow ? (me.follows || S.follow.get(i.user_id) ? "" : `<button type="button" class="hb-fol" data-follow="${e(i.user_id)}">${e(tx("+ Follow"))}</button>`) : "";
    const head = `<header class="hb-ch">${face(i)}<div class="hb-who"><p><b>${e(nameOf(i))}</b>${folkChip(i.folk || (i.folks || [])[0])}</p><small>${ago(i.at)}${spotTag}</small></div><span class="hb-kind ${kl[0]}">${e(tx(kindLabel))}</span>${fol}</header>`;
    const t = K.TOPIC[i.extra?.topic] || ["🧭", "Before you go"];
    let what = "", body = "", big = false, img = "";
    switch (i.kind) {
      case "sign": what = tx(i.folk === "fabio" ? "picked {p}" : "signed {p}", { p: place }); big = open && !!i.txt;
        body = `${i.extra?.first ? `<span class="hb-tag gold">${e(tx("👑 First to sign it"))}</span>` : ""}${i.txt ? `<p class="hb-quote">“${e(i.txt)}”</p>` : ""}`; break;
      case "cond": { const c = K.COND[i.extra?.cond] || ["📣", "An update"]; what = tx("says how it is now at {p}", { p: place });
        body = `<div class="hb-conds"><span>${c[0]} ${e(c[1])}</span>${i.extra?.expires ? `<small>${e(until(i.extra.expires))}</small>` : ""}${nn.checks ? `<small>· ${e(tx("Confirmed by {n} folk", { n: nn.checks }))}</small>` : ""}</div>${i.txt ? `<p class="hb-txt">${e(i.txt)}</p>` : ""}`; break; }
      case "fact": case "check": {
        what = tx(i.kind === "check" ? "checked {t} at {p}" : i.extra?.changed ? "updated {t} at {p}" : "added {t} at {p}", { t: `<b>${t[0]} ${e(t[1])}</b>`, p: place });
        let val = ""; if (open && i.extra?.data) { try { val = K.factValue({ topic: i.extra.topic, data: i.extra.data, note: i.kind === "fact" ? i.txt : null, _s: { lat: i.lat, lon: i.lon } }); } catch {} }
        const conf = nn.checks ? tx("Confirmed by {n} folk", { n: nn.checks }) : tx("Not confirmed yet");
        body = open ? `<div class="hb-fact"><i>${t[0]}</i><div><b>${e(t[1])}</b>${val}<small>${e(conf)}</small></div>${nn.checks ? `<span class="hb-st">✓ ${e(tx("Checked"))}</span>` : ""}</div>` : ""; break; }
      case "story": what = tx("told a story about {p}", { p: place }); big = !!open;
        body = `${i.extra?.title ? `<h3 class="hb-title">${e(i.extra.title)}</h3>` : ""}${i.txt ? `<p class="hb-txt">${e(i.txt)}${i.txt.length >= 280 ? "…" : ""}</p>` : ""}`; break;
      case "impression": { what = tx("gave impressions of {p}", { p: place }); const b = K.BASIS[i.extra?.on_spot ? "onspot" : i.extra?.basis];
        body = i.extra?.score != null ? `<div class="hb-conds"><span>⛰ ${e(i.extra.score)}/5</span>${b ? `<small>${b[0]} ${e(b[1])}</small>` : ""}</div>` : ""; break; }
      case "photo": what = tx("added a photo of {p}", { p: place }); big = open && !!i.extra?.path; break;
      case "place": what = tx("added {p} to the map", { p: place }); big = !!open;
        body = !nn.been ? `<span class="hb-tag">${e(tx("No folk yet: be the first to sign it"))}</span>` : ""; break;
      case "update": what = tx("updated {f} of {p}", { f: e([...new Set((i.extra?.fields || []).map(fieldLabel))].join(", ")), p: place }); break;
    }
    const ph = photo(i.kind === "photo" ? i.extra?.path : i.photo);
    if (big && ph) img = `<div class="hb-ph"><img src="${e(ph)}" alt="" loading="lazy"><div class="hb-pl"><b>${e(i.spot)}</b><small>${e(i.zone === "the map" ? "" : i.zone)}</small></div>${i.kind === "story" && i.extra?.score != null ? `<span class="hb-badge">★ ${e(i.extra.score)}</span>` : ""}</div>`;
    const lock = !i.open ? (who().guest ? `<div class="hb-lock"><span>${e(tx("🔒 This place is on the folk's map."))}</span><a href="#join">${e(tx("Become folk to see where →"))}</a></div>`
      : `<p class="hb-txt hb-mute">${e(tx("🛡️ A fragile place: its name stays among the folk who know it."))}</p>`) : "";
    // actions
    const acts = [];
    const reactable = i.kind !== "check" && i.open;
    if (reactable) acts.push(`<button type="button" class="${me.appreciate ? "on" : ""}" data-react="appreciate" aria-pressed="${!!me.appreciate}" ${me.own ? "disabled" : ""}>👏 ${n(nn.appreciate)} <span class="hb-l">${e(tx("Appreciate"))}</span></button>`);
    if (reactable && !["photo", "place"].includes(i.kind)) acts.push(`<button type="button" class="${me.useful ? "on" : ""}" data-react="useful" aria-pressed="${!!me.useful}" ${me.own ? "disabled" : ""}>💡 ${n(nn.useful)} <span class="hb-l">${e(tx("Useful"))}</span></button>`);
    if (open && i.kind === "cond" && !me.own) acts.push(`<button type="button" data-same>${e(tx("✓ Still so"))}</button>`);
    if (open && (i.kind === "fact" || i.kind === "check") && !me.own) acts.push(me.checked ? `<button type="button" class="on" disabled>${e(tx("✓ You confirmed"))}</button>` : `<button type="button" data-check>${e(tx("✓ Still correct"))}</button>`);
    if (open && ["sign", "story", "photo", "place"].includes(i.kind)) acts.push(`<button type="button" class="${me.been ? "on" : ""}" data-been>📍 ${n(nn.been)} <span class="hb-l">${e(tx(me.been ? "You've been" : "Been there!"))}</span></button>`);
    if (open) acts.push(`<button type="button" class="hb-sp ${me.saved || savedLocal(i.spot_id) ? "on" : ""}" data-save aria-pressed="${!!(me.saved || savedLocal(i.spot_id))}">${me.saved || savedLocal(i.spot_id) ? "♥" : "♡"} <span class="hb-l">${e(tx(me.saved || savedLocal(i.spot_id) ? "Saved" : "Save"))}</span></button>`);
    if (open) acts.push(`<button type="button" data-go title="${e(tx("Open the place →"))}">↗<span class="hb-l"> ${e(tx("Open the place →").replace(" →", ""))}</span></button>`);
    if (i.open && isMember() && !me.own) acts.push(`<button type="button" class="hb-flag" data-flag title="${e(tx("Report"))}" aria-label="${e(tx("Report"))}">⚑</button>`);
    return `<article class="hb-card" data-id="${e(i.id)}">${head}${img}<div class="hb-body"><p class="hb-what">${what}</p>${body}${lock}</div>${acts.length ? `<div class="hb-acts">${acts.join("")}</div>` : ""}</article>`;
  }
  const savedLocal = id => who().guest && K.guestFavs().includes(+id);
  const itemOf = el => { const id = el.closest(".hb-card")?.dataset.id; return [S.items, S.placeFeed?.items || [], S.prev?.items || []].flat().find(x => x.id === id); };
  function repaintCard(i) {
    box.querySelectorAll(`.hb-card[data-id="${CSS.escape(i.id)}"]`).forEach(c => { c.outerHTML = card(i); });
  }

  /* ---------- the shell ---------- */
  const VIEWS = [["feed", "🏠", "Feed"], ["following", "👥", "Following"], ["discover", "🧭", "Discover folk"], ["places", "♡", "Your places"], ["alerts", "🔔", "Notifications"], ["me", "🪪", "Your passport"]];
  function shell() {
    box.innerHTML = `
      <div class="hb">
        <aside class="hb-left">
          <div class="hb-brand"><h1>${e(tx("The Folk"))} <em>${e(tx("Hub"))}</em></h1><p>${e(tx("People, places and shared knowledge."))}</p></div>
          <nav class="hb-menu" aria-label="Folk Hub">${VIEWS.map(([k, ic, l]) => `<button type="button" data-view="${k}"><span aria-hidden="true">${ic}</span>${e(tx(l))}<b data-badge="${k}" hidden></b></button>`).join("")}</nav>
          <div class="hb-box hb-myplaces" data-myplaces></div>
        </aside>
        <main class="hb-main" data-main></main>
        <aside class="hb-right">
          <section class="hb-box hb-mapcard" data-mapcard>
            <div class="hb-bh"><h2>${e(tx("Activity on the map"))}</h2><button type="button" class="hb-link" data-tomap>${e(tx("Open map →"))}</button></div>
            <div class="hb-mapwrap"><div class="hb-map" data-map></div><button type="button" class="hb-full" data-full aria-label="${e(tx("Full screen"))}" title="${e(tx("Full screen"))}">⤢</button><p class="hb-mapempty" data-mapempty hidden>${e(tx("No activity on the map in this period."))}</p></div>
            <div class="hb-legend">${[["#f28c1e", "New spots"], ["#ffbe7a", "Signed"], ["#9fe3c8", "Checks"], ["#7fc8ff", "Pulse"], ["#e9a6ff", "Stories"]].map(([c, l]) => `<span style="--c:${c}">${e(tx(l))}</span>`).join("")}</div>
            <div class="hb-mf"><button type="button" data-days="7">${e(tx("7 days"))}</button><button type="button" data-days="30">${e(tx("30 days"))}</button>${isMember() ? `<button type="button" data-mapfol>${e(tx("Folk I follow"))}</button>` : ""}</div>
          </section>
          <section class="hb-box" data-sugg></section>
        </aside>
      </div>
      <nav class="hb-tabs" aria-label="Folk Hub">${[["feed", "🏠", "Feed"], ["discover", "🧭", "Discover"], ["map", "🗺️", "Map"], ["places", "♡", "Places"], ["alerts", "🔔", "Alerts"], ["me", "🪪", "Me"]].map(([k, ic, l]) => `<button type="button" data-view="${k}"><span aria-hidden="true">${ic}</span>${e(tx(l))}<b data-badge="${k}" hidden></b></button>`).join("")}</nav>
      <dialog class="hb-dlg" data-dlg></dialog>`;
  }

  /* ---------- views ---------- */
  function setView(v) {
    if (v === "map") { openFull(true); return; }
    const f = v === "following" ? "following" : v === "feed" && S.filter === "following" ? "all" : S.filter;
    if (f !== S.filter) { S.filter = f; S.items = []; S.end = false; S.err = ""; }
    S.view = v === "following" ? "feed" : v;
    box.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === (S.view === "feed" && S.filter === "following" ? "following" : S.view)));
    paintMain();
    if (S._ready) { const y = box.getBoundingClientRect().top + window.scrollY - 70; if (window.scrollY > y) window.scrollTo({ top: y }); }
    S._ready = true;
    K.track(`Hub: ${v}`);
  }
  function paintMain() {
    const m = box.querySelector("[data-main]"); if (!m) return;
    if (S.view === "feed") return paintFeed(m);
    if (S.view === "discover") return paintDiscover(m);
    if (S.view === "places") return paintPlaces(m);
    if (S.view === "alerts") return paintAlerts(m);
    if (S.view === "me") return paintMe(m);
  }
  const FILTERS = [["all", "For you"], ["following", "Following"], ["map", "Map updates"], ["stories", "Stories"], ["checks", "Checks"], ["pulse", "Place pulse"]];
  function paintFeed(m) {
    const fol = S.filter === "following";
    m.innerHTML = `
      <div class="hb-head"><h2>${e(tx("What's"))} <em>${e(tx("happening"))}</em></h2><p>${e(tx(fol ? "From folk you follow and places you saved." : "From the folk and the places on the map."))}</p></div>
      ${who().guest ? `<div class="hb-preview"><b>${e(tx("You're seeing a preview."))}</b> ${e(tx("Here is what the folk bring to the places of the public map. Become folk to see the whole map, follow people and places, and take part."))} <a href="#join">${e(tx("Become folk — free"))}</a></div>` : ""}
      <div class="hb-chips" role="tablist">${FILTERS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${S.filter === k}" class="${S.filter === k ? "on" : ""}" data-filter="${k}">${e(tx(l))}</button>`).join("")}</div>
      <div class="hb-feed" data-feed aria-live="polite"></div>
      <div class="hb-more" data-more></div>`;
    drawFeed();
    if (!S.items.length && !S.end && !S.busy) loadFeed(true);
  }
  function skeleton(k = 3) { return Array.from({ length: k }, () => `<div class="hb-card hb-skel"><div></div><div></div><div></div></div>`).join(""); }
  function drawFeed() {
    const f = box.querySelector("[data-feed]"), more = box.querySelector("[data-more]"); if (!f) return;
    if (S.err) { f.innerHTML = errorHtml(S.err); more.innerHTML = ""; return; }
    if (!S.items.length) {
      if (S.busy || !S.end) { f.innerHTML = skeleton(); more.innerHTML = ""; return; }
      f.innerHTML = S.filter === "following" && who().guest ? `<div class="hb-empty"><p>${e(tx("Follow folk or save places to see their news here."))}</p><div class="hb-row"><a class="hb-btn" href="#join">${e(tx("Become folk — free"))}</a></div></div>`
        : S.filter === "following" ? `<div class="hb-empty"><h3>${e(tx("Follow folk or save places to see their news here."))}</h3><div class="hb-row"><button type="button" class="hb-btn" data-view="discover">${e(tx("Discover folk"))}</button><button type="button" class="hb-btn line" data-tomap>${e(tx("Open the map"))}</button></div></div>`
        : S.filter === "all" ? `<div class="hb-empty"><h3>${e(tx("The folk room is waiting for its first voices."))}</h3><p>${e(tx("Sign a place you've been, tell the folk how it is now, or check what they wrote."))}</p><div class="hb-row"><button type="button" class="hb-btn" data-tomap>${e(tx("Open the map"))}</button></div></div>`
        : `<div class="hb-empty"><p>${e(tx("Nothing of this kind yet."))}</p></div>`;
      more.innerHTML = ""; return;
    }
    f.innerHTML = S.items.map(card).join("");
    more.innerHTML = S.end ? `<p class="hb-mute">${e(tx("That's all for now."))}</p>` : `<button type="button" class="hb-btn line" data-loadmore ${S.busy ? "disabled" : ""}>${e(tx(S.busy ? "Loading…" : "Load more"))}</button>`;
    watchMore();
  }
  function errorHtml(err) {
    return `<div class="hb-empty"><p>${e(tx(missing(err) ? "The Folk Hub needs its database update (supabase-folk-hub-2.sql)." : "Could not load the Hub. Check your connection and try again."))}</p><button type="button" class="hb-btn line" data-retry>${e(tx("Try again"))}</button></div>`;
  }
  let io = null;
  function watchMore() {
    const b = box.querySelector("[data-loadmore]"); if (!b || !("IntersectionObserver" in window)) return;
    io?.disconnect(); io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) loadFeed(); }, { rootMargin: "600px" }); io.observe(b);
  }
  async function loadFeed(reset) {
    if (S.busy) return; if (reset) { S.items = []; S.next = null; S.end = false; S.err = ""; }
    if (S.end) return;
    S.busy = true; if (!S.items.length) drawFeed(); else { const b = box.querySelector("[data-loadmore]"); if (b) { b.disabled = true; b.textContent = tx("Loading…"); } }
    const filter = S.filter;
    if (filter === "following" && who().guest) { S.busy = false; S.end = true; return drawFeed(); }
    try {
      const d = await rpc("hub_feed", { p_filter: filter, p_before: S.next, p_limit: 10 });
      if (filter !== S.filter) return;
      const items = (d?.items || []).filter(x => !S.items.some(y => y.id === x.id));
      await sign(items.map(i => i.kind === "photo" ? i.extra?.path : i.photo));
      S.items.push(...items); S.next = d?.next || null; S.end = !S.next;
    } catch (err) { S.err = err; }
    S.busy = false;
    if (S.view === "feed") drawFeed();
  }

  /* ---------- discover ---------- */
  function invite(m, title, text) {
    m.innerHTML = `<div class="hb-head"><h2>${e(tx(title))}</h2></div><div class="hb-empty"><p>${e(tx(text))}</p><div class="hb-row"><a class="hb-btn" href="#join">${e(tx("Become folk — free"))}</a></div></div>`;
  }
  function paintDiscover(m) {
    if (!isMember()) return invite(m, "Discover folk", "Finding and following other folk is for members. Join free to meet the people behind the places.");
    m.innerHTML = `
      <div class="hb-head"><h2>${e(tx("Discover folk"))}</h2></div>
      <div class="hb-search"><input type="search" id="hbQ" placeholder="${e(tx("Search folk by name or area"))}" value="${e(S.q)}" autocomplete="off"></div>
      <div class="hb-chips">${[["", "All"], ...Object.entries(K.CLUSTERS).map(([k, c]) => [k, `${c.ico} ${c.folk}`])].map(([k, l]) => `<button type="button" class="${S.qFolk === k ? "on" : ""}" data-qfolk="${k}">${e(tx(l))}</button>`).join("")}</div>
      <div data-found></div>`;
    const q = m.querySelector("#hbQ"); let tm = 0;
    q.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => { S.q = q.value.trim(); findFolk(); }, 350); });
    findFolk();
  }
  async function findFolk() {
    const out = box.querySelector("[data-found]"); if (!out) return;
    out.innerHTML = `<div class="hb-grid">${skeleton(2)}</div>`;
    try {
      const sugg = isMember() && !S.q && !S.qFolk ? await rpc("discover_folk", { p_suggest: true, p_limit: 6 }) : [];
      const all = await rpc("discover_folk", { p_q: S.q || null, p_folk: S.qFolk || null, p_suggest: false, p_limit: 30 });
      const rest = (all || []).filter(f => !(sugg || []).some(s => s.user_id === f.user_id));
      out.innerHTML = `${(sugg || []).length ? `<p class="hb-kick">${e(tx("Suggested for you"))}</p><div class="hb-grid">${sugg.map(folkCard).join("")}</div>` : ""}
        ${rest.length ? `<div class="hb-grid">${rest.map(folkCard).join("")}</div>` : (sugg || []).length ? "" : `<div class="hb-empty"><p>${e(tx("No folk found."))}</p></div>`}`;
    } catch (err) { out.innerHTML = errorHtml(err); }
  }
  const whyText = w => !w ? "" : w.k === "via" ? tx("followed by {n} folk you follow", { n: w.n }) : w.k === "shared" ? tx("signed {n} of your places", { n: w.n })
    : w.k === "local" ? tx("local folk in {a}", { a: w.area }) : w.k === "checked" ? tx("{n} infos confirmed by others", { n: w.n }) : w.k === "onspot" ? tx("{n} signatures on the spot", { n: w.n }) : w.k === "folk" ? tx("travels like you") : "";
  function folkCard(f) {
    const follows = S.follow.has(f.user_id) ? S.follow.get(f.user_id) : f.follows;
    return `<article class="hb-fcard">
      ${face({ user_id: f.user_id, name: f.name, avatar: f.avatar, folks: f.folks }, 56)}
      <div class="hb-fmain"><button type="button" class="hb-fname" data-folk="${e(f.user_id)}">${e(f.name)}</button>
        <p class="hb-fchips">${(f.folks || []).slice(0, 3).map(folkChip).join("")}</p>
        <small>${[f.area ? tx("local in {a}", { a: f.area }) : "", ...(f.zones || [])].filter(Boolean).map(e).join(" · ")}</small>
        <small class="hb-stats">${e(tx("{n} signatures", { n: f.signs }))}${f.on_spot ? ` · 📍 ${f.on_spot}` : ""}${f.checked ? ` · ✓ ${f.checked}` : ""}${f.followers ? ` · ${e(tx("{n} followers", { n: f.followers }))}` : ""}</small>
        ${f.why ? `<small class="hb-why">${e(whyText(f.why))}</small>` : ""}</div>
      <button type="button" class="hb-fol ${follows ? "on" : ""}" data-follow="${e(f.user_id)}" aria-pressed="${!!follows}">${e(tx(follows ? "Following ✓" : "+ Follow"))}</button>
    </article>`;
  }

  /* ---------- your places ---------- */
  async function loadPlaces() {
    if (isMember()) {
      const { data } = await K.api(`/rest/v1/spot_favorites?select=spot_id,created_at,spots(id,name,list,category)&user_id=eq.${encodeURIComponent(who().uid)}&order=created_at.desc&limit=200`);
      let prefs = {}; try { const st = await K.api(`/rest/v1/hub_state?select=prefs&user_id=eq.${encodeURIComponent(who().uid)}`); prefs = st.data?.[0]?.prefs || {}; } catch {}
      S.prefs = prefs;
      return (data || []).filter(r => r.spots).map(r => ({ id: r.spot_id, name: r.spots.name, zone: r.spots.list, category: r.spots.category, muted: (prefs.muted || []).includes(r.spot_id) }));
    }
    const ids = K.guestFavs(); if (!ids.length) return [];
    const { data } = await K.api(`/rest/v1/public_spots?select=id,name,category&id=in.(${ids.slice(0, 200).join(",")})`, { auth: false });
    return (data || []).map(r => ({ id: r.id, name: r.name, category: r.category }));
  }
  async function paintPlaces(m) {
    m.innerHTML = `<div class="hb-head"><h2>${e(tx("Your places"))}</h2><p>${e(tx("The places you saved, and what the folk say about them."))}</p></div><div data-plist>${skeleton(1)}</div><div class="hb-feed" data-pfeed></div>`;
    try {
      S.places = await loadPlaces(); paintMyPlaces();
      const pl = m.querySelector("[data-plist]");
      if (!S.places.length) { pl.innerHTML = `<div class="hb-empty"><p>${e(tx("No saved places yet. Tap ♡ Save on a place to follow it."))}</p><button type="button" class="hb-btn" data-tomap>${e(tx("Open the map"))}</button></div>`; return; }
      pl.innerHTML = `${who().guest ? `<p class="hb-mute hb-note">${e(tx("Saved on this device. Become folk to keep them everywhere."))} <a href="#join">${e(tx("Become folk, free →"))}</a></p>` : ""}
        <ul class="hb-plist">${S.places.map(p => `<li><button type="button" class="hb-pname" data-gospot="${p.id}">${catIcon(p.category)}<span><b>${e(p.name)}</b><small>${e(p.zone || "")}</small></span></button>
          ${isMember() ? `<button type="button" class="hb-mute-btn ${p.muted ? "" : "on"}" data-mute="${p.id}" aria-pressed="${!p.muted}">${p.muted ? "🔕" : "🔔"} ${e(tx(p.muted ? "Muted" : "Notify me"))}</button>` : ""}</li>`).join("")}</ul>`;
      const pf = m.querySelector("[data-pfeed]"); pf.innerHTML = skeleton(2);
      const d = await rpc("hub_feed", { p_filter: "all", p_limit: 20, p_spots: S.places.map(p => p.id) });
      S.placeFeed = d || { items: [] };
      await sign(S.placeFeed.items.map(i => i.kind === "photo" ? i.extra?.path : i.photo));
      pf.innerHTML = S.placeFeed.items.length ? S.placeFeed.items.map(card).join("") : `<div class="hb-empty"><p>${e(tx("Nothing of this kind yet."))}</p></div>`;
      if (who().guest) { try { localStorage.setItem("sf-hub-places-seen", new Date().toISOString()); } catch {} badges(); }
    } catch (err) { m.querySelector("[data-plist]").innerHTML = errorHtml(err); }
  }
  function paintMyPlaces() {
    const el = box.querySelector("[data-myplaces]"); if (!el) return;
    const list = (S.places || []).slice(0, 5);
    el.innerHTML = `<p class="hb-kick">${e(tx("Places you follow"))}</p>${list.length ? list.map(p => `<button type="button" class="hb-pl2" data-gospot="${p.id}">${catIcon(p.category)}<span><b>${e(p.name)}</b><small>${e(p.zone || "")}</small></span></button>`).join("")
      : `<p class="hb-mute">${e(tx("Save a place on the map to follow it here."))}</p>`}`;
  }

  /* ---------- notifications ---------- */
  const WHAT = { sign: "your signature", story: "your story", impression: "your story", fact: "your info", cond: "your info", photo: "your photo", place: "your place", update: "your update" };
  function updText(u) {
    const nm = `<b>${e(u.name || tx("A folk"))}</b>`, p = u.spot ? `<b>${e(u.spot)}</b>` : tx("a fragile place");
    const w = tx(WHAT[u.extra?.target_kind || u.txt] || "your info");
    const map = { follow: ["{n} started following you"], react_appreciate: ["{n} appreciated {w}"], react_useful: ["{n} found {w} useful"], checked_yours: ["{n} checked your info at {p}"], signed_yours: ["{n} signed {p}, a place you added"],
      sign: ["{n} signed {p}"], cond: ["{n} shared how it is now at {p}"], fact: ["{n} added info at {p}"], check: ["{n} checked info at {p}"], story: ["{n} told a story about {p}"], impression: ["{n} gave impressions of {p}"], photo: ["{n} added a photo of {p}"], update: ["{n} updated {p}"], place: ["{n} added {p}"] };
    let s = tx((map[u.kind] || ["{n} updated {p}"])[0], { n: nm, p, w: e(w) });
    return s;
  }
  async function loadUpdates() { if (!isMember()) return null; try { S.upd = await rpc("my_updates", { p_limit: 40 }); } catch (err) { S.upd = { err }; } badges(); return S.upd; }
  async function paintAlerts(m) {
    if (!isMember()) {
      m.innerHTML = `<div class="hb-head"><h2>${e(tx("Notifications"))}</h2></div><div class="hb-empty"><p>${e(tx("Notifications are for folk. As a visitor you can follow places: their news is in Your places."))}</p><div class="hb-row"><button type="button" class="hb-btn" data-view="places">${e(tx("Your places"))}</button><a class="hb-btn line" href="#join">${e(tx("Become folk — free"))}</a></div></div>`; return;
    }
    m.innerHTML = `<div class="hb-head"><h2>${e(tx("Notifications"))}</h2></div><div data-ulist>${skeleton(2)}</div>`;
    const d = await loadUpdates(); const el = m.querySelector("[data-ulist]"); if (!el) return;
    if (d?.err) { el.innerHTML = errorHtml(d.err); return; }
    const off = d?.prefs?.off || [];
    el.innerHTML = `
      ${(d.items || []).length ? `<ul class="hb-ulist">${d.items.map(u => `<li class="${u.new ? "new" : ""}">${face(u, 40)}<div><p>${updText(u)}</p><small>${ago(u.at)}${u.why === "place" ? ` · ${e(tx("on your places"))}` : u.why === "folk" ? ` · ${e(tx("from folk you follow"))}` : ""}</small></div>${u.spot_id ? `<button type="button" class="hb-link" data-gospot="${u.spot_id}">↗</button>` : ""}</li>`).join("")}</ul>`
        : `<div class="hb-empty"><p>${e(tx("Nothing new. When something happens on your places, to your folk or to your contributions, it shows up here."))}</p></div>`}
      <div class="hb-box hb-prefs"><p class="hb-kick">${e(tx("Notify me about"))}</p>${[["places", "My places"], ["folk", "Folk I follow "], ["you", "My contributions"]].map(([k, l]) => `<label><input type="checkbox" id="hbPref-${k}" data-pref="${k}" ${off.includes(k) ? "" : "checked"}> ${e(tx(l))}</label>`).join("")}</div>`;
    if (d.unread) { try { await rpc("hub_seen"); } catch {} d.unread = 0; badges(); }
  }
  async function savePrefs(patch) {
    const uid = who().uid; S.prefs = { ...(S.prefs || S.upd?.prefs || {}), ...patch };
    try { await K.api("/rest/v1/hub_state", { method: "POST", body: { user_id: uid, prefs: S.prefs }, headers: { Prefer: "return=minimal,resolution=merge-duplicates" } }); }
    catch (err) { K.toast(tx("Could not save it: {e}", { e: err.message }), true); }
  }

  /* ---------- reputation ---------- */
  async function loadRep() { if (!isMember()) return null; try { S.rep = await rpc("folk_reputation", { p_user: who().uid }); } catch (err) { S.rep = { err }; } return S.rep; }
  function repDetail(c, k) {
    const v = c?.[k] ?? 0;
    return k === "field" ? tx("{n} on the spot", { n: v }) : k === "checked" ? tx("{n} confirmed by others", { n: v }) : k === "useful" ? tx("{n} folk", { n: v })
      : k === "spots" ? tx("{n} signed by others", { n: v }) : k === "local" ? (v ? tx("{n} in your area", { n: v }) : tx("no local area yet")) : tx("{n} folk, {m} months", { n: v, m: c?.months ?? 0 });
  }
  function repHtml(r, full) {
    if (!r || r.err) return r?.err ? errorHtml(r.err) : "";
    const d = r.detail || {}, strong = (r.strengths || []).map(k => tx((COMP.find(c => c[0] === k) || [, k])[1]));
    const cats = (r.categories || []).map(c => K.CATS[c.category]?.label || c.category), zones = [r.local_area, ...(r.zones || [])].filter(Boolean);
    return `<div class="hb-lvl"><big>${ROMAN[r.level] || "–"}</big><span><b>${e(tx(LEVEL[r.level] || LEVEL[0]))}</b>${[...zones.slice(0, 2), ...cats.slice(0, 1)].length ? `<small>${e(tx("Strongest in"))} ${e([...zones.slice(0, 2), ...cats.slice(0, 1)].join(" · "))}</small>` : strong.length ? `<small>${e(strong.join(" · "))}</small>` : ""}</span></div>
      ${d.scores ? `<div class="hb-rep">${COMP.map(([k, l]) => `<div class="hb-rr"><span>${e(tx(l))}</span><small>${e(repDetail(d.counts, k))}</small><i><b style="width:${Math.round((d.scores[k] || 0) * 100)}%"></b></i></div>`).join("")}</div>` : ""}
      <p class="hb-mute hb-small">${e(tx("Built only from things others can verify. Followers and volume don't count."))}</p>
      ${full ? `<details class="hb-how"><summary>${e(tx("How reputation works"))}</summary><p>${e(tx("Every folk has a level from I to V, built from six things others can verify: being on the spot, information confirmed by other folk, people who found you useful, places you added that others signed, knowledge of your area, and the trust of the community. Each one grows slowly: posting a lot doesn't make you rise, being right does."))}</p></details>` : ""}`;
  }
  async function paintRepBox() {
    const el = box.querySelector("[data-rep]"); if (!el) return;
    if (!isMember()) {
      el.innerHTML = `<div class="hb-bh"><h2>${e(tx("Reputation"))}</h2></div><p class="hb-small">${e(tx("Every folk has a level from I to V, built from six things others can verify: being on the spot, information confirmed by other folk, people who found you useful, places you added that others signed, knowledge of your area, and the trust of the community. Each one grows slowly: posting a lot doesn't make you rise, being right does."))}</p><a class="hb-btn" href="#join">${e(tx("Join the folk to build yours."))}</a>`;
      return;
    }
    el.innerHTML = `<div class="hb-bh"><h2>${e(tx("Your reputation"))}</h2><button type="button" class="hb-link" data-view="me">${e(tx("How it works"))}</button></div>${S.rep ? repHtml(S.rep) : skeleton(1)}`;
    if (!S.rep) { await loadRep(); el.innerHTML = `<div class="hb-bh"><h2>${e(tx("Your reputation"))}</h2><button type="button" class="hb-link" data-view="me">${e(tx("How it works"))}</button></div>${repHtml(S.rep)}`; }
  }
  async function paintMe(m) {
    if (isMember()) { location.hash = "me"; return; }
    return invite(m, "Your passport", "Your passport collects the places you've signed, your stamps and your folk. It's free.");
    if (!isMember()) { m.innerHTML = `<div class="hb-head"><h2>${e(tx("How reputation works"))}</h2></div><div class="hb-box"><p>${e(tx("Every folk has a level from I to V, built from six things others can verify: being on the spot, information confirmed by other folk, people who found you useful, places you added that others signed, knowledge of your area, and the trust of the community. Each one grows slowly: posting a lot doesn't make you rise, being right does."))}</p><a class="hb-btn" href="#join">${e(tx("Become folk — free"))}</a></div>`; return; }
    m.innerHTML = `<div class="hb-head"><h2>${e(tx("Your passport and reputation"))}</h2></div><div class="hb-box" data-repfull>${skeleton(1)}</div><div class="hb-row"><a class="hb-btn" href="#me">${e(tx("Open your passport →"))}</a></div>`;
    if (!S.rep) await loadRep();
    const el = m.querySelector("[data-repfull]"); if (el) el.innerHTML = repHtml(S.rep, true);
  }

  /* ---------- folk to follow ---------- */
  async function paintSugg() {
    const el = box.querySelector("[data-sugg]"); if (!el) return;
    if (!isMember()) { el.innerHTML = `<div class="hb-bh"><h2>${e(tx("Find your folk"))}</h2></div><p class="hb-small">${e(tx("Follow the folk who travel like you and the places you love: their news comes to you."))}</p><a class="hb-btn" href="#join">${e(tx("Become folk — free"))}</a>`; return; }
    const title = tx(isMember() ? "Folk to follow" : "Folk to know");
    el.innerHTML = `<div class="hb-bh"><h2>${e(title)}</h2><button type="button" class="hb-link" data-view="discover">${e(tx("Discover →"))}</button></div><div data-slist>${skeleton(1)}</div>`;
    try { S.sugg = await rpc("discover_folk", { p_suggest: isMember(), p_limit: 4 }); } catch { S.sugg = []; }
    if (isMember() && !(S.sugg || []).length) { try { S.sugg = (await rpc("discover_folk", { p_limit: 6 }) || []).filter(f => !f.follows).slice(0, 4); } catch {} }
    const l = el.querySelector("[data-slist]"); if (!l) return;
    if (!(S.sugg || []).length) { el.hidden = true; return; }
    l.innerHTML = S.sugg.map(f => { const fo = S.follow.has(f.user_id) ? S.follow.get(f.user_id) : f.follows; return `<div class="hb-sug">${face({ user_id: f.user_id, name: f.name, avatar: f.avatar, folks: f.folks }, 42)}<span><button type="button" class="hb-fname" data-folk="${e(f.user_id)}">${e(f.name)}</button><small>${e([K.CLUSTERS[(f.folks || [])[0]]?.folk, whyText(f.why)].filter(Boolean).join(" · "))}</small></span><button type="button" class="hb-fol ${fo ? "on" : ""}" data-follow="${e(f.user_id)}">${e(tx(fo ? "Following ✓" : "Follow"))}</button></div>`; }).join("");
  }

  /* ---------- the map of the activity ---------- */
  async function loadMap() {
    const card_ = box.querySelector("[data-mapcard]"); if (!card_ || typeof L === "undefined") return;
    card_.querySelectorAll("[data-days]").forEach(b => b.classList.toggle("on", +b.dataset.days === S.mapDays));
    card_.querySelector("[data-mapfol]")?.classList.toggle("on", S.mapFol);
    if (!S.map) {
      S.map = L.map(card_.querySelector("[data-map]"), { zoomControl: false, attributionControl: false, worldCopyJump: true, minZoom: 2, maxZoom: 16 }).setView([46.5, 11.5], 4);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18 }).addTo(S.map);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, opacity: .7 }).addTo(S.map);
      L.control.zoom({ position: "bottomright" }).addTo(S.map);
      S.mapLayer = L.layerGroup().addTo(S.map);
      S.map.on("popupopen", ev => { ev.popup.getElement()?.querySelector("[data-gospot]")?.addEventListener("click", b => { K.goPlace(+b.currentTarget.dataset.gospot); }); });
    }
    try { S.mapPts = await rpc("hub_map", { p_days: S.mapDays, p_following: S.mapFol }) || []; } catch { S.mapPts = []; }
    S.mapLayer.clearLayers();
    S.mapPts.forEach(p => {
      const r = Math.min(13, 6 + Math.log2(1 + p.n) * 2);
      L.circleMarker([p.lat, p.lon], { radius: r, color: "#050b14", weight: 2, fillColor: PIN[p.kind] || "#ffbe7a", fillOpacity: .95 })
        .bindPopup(`<div class="hb-pop"><b>${e(p.name)}</b><small>${e(p.n > 1 ? tx("{n} updates · {w}", { n: p.n, w: ago(p.at) }) : tx("1 update · {w}", { w: ago(p.at) }))}</small><button type="button" data-gospot="${p.spot_id}">${e(tx("Open the place →"))}</button></div>`)
        .addTo(S.mapLayer);
    });
    card_.querySelector("[data-mapempty]").hidden = !!S.mapPts.length;
    if (S.mapPts.length) { const b = L.latLngBounds(S.mapPts.map(p => [p.lat, p.lon])); S.map.fitBounds(b.pad(0.25), { maxZoom: 9 }); }
    setTimeout(() => S.map?.invalidateSize(), 60);
  }
  function openFull(on) {
    const c = box.querySelector("[data-mapcard]"); if (!c) return;
    S.mapFull = on; c.classList.toggle("full", on); c.parentElement.classList.toggle("hb-fullhost", on); document.documentElement.classList.toggle("hb-noscroll", on);
    const b = c.querySelector("[data-full]"); b.textContent = on ? "✕" : "⤢"; b.setAttribute("aria-label", tx(on ? "Close" : "Full screen")); b.title = tx(on ? "Close" : "Full screen");
    if (!S.mapPts) loadMap();
    setTimeout(() => { if (!S.map) return; S.map.invalidateSize(); if (S.mapPts?.length) S.map.fitBounds(L.latLngBounds(S.mapPts.map(p => [p.lat, p.lon])).pad(0.25), { maxZoom: 9 }); }, 120);
    if (on) K.track("Hub: map full screen");
  }

  /* ---------- folk preview ---------- */
  async function preview(uid) {
    const d = box.querySelector("[data-dlg]"); if (!d) return;
    const known = [...S.items, ...(S.sugg || []), ...(S.placeFeed?.items || [])].find(x => x.user_id === uid) || {};
    d.innerHTML = `<div class="hb-pv"><button type="button" class="hb-x" data-close aria-label="${e(tx("Close"))}">✕</button><div class="hb-pvh">${face({ ...known, user_id: null }, 72)}<div><h2>${e(known.name || "")}</h2><p class="hb-fchips">${(known.folks || []).map(folkChip).join("")}</p></div></div><div data-pvbody>${skeleton(1)}</div></div>`;
    try { d.showModal(); } catch { d.setAttribute("open", ""); }
    K.track("Hub: folk preview");
    try {
      const [fs, feed] = await Promise.all([rpc("folk_follow_state", { p_user: uid }).catch(() => null), rpc("hub_feed", { p_filter: "all", p_limit: 5, p_user: uid }).catch(() => ({ items: [] }))]);
      const items = feed?.items || [];
      const name = items[0]?.name || known.name || "", folks = items[0]?.folks || known.folks || [];
      d.querySelector(".hb-pvh h2").textContent = name;
      d.querySelector(".hb-pvh .hb-fchips").innerHTML = folks.map(folkChip).join("");
      const av = items[0]?.avatar || known.avatar; if (av) d.querySelector(".hb-pvh .hb-av").innerHTML = `<img src="${e(K.avatarUrl(av))}" alt="">`;
      const follows = S.follow.has(uid) ? S.follow.get(uid) : fs?.follows;
      await sign(items.map(i => i.kind === "photo" ? i.extra?.path : i.photo));
      S.prev = { items };
      d.querySelector("[data-pvbody]").innerHTML = `
        ${uid !== who().uid ? `<div class="hb-pvrow"><button type="button" class="hb-fol ${follows ? "on" : ""}" data-follow="${e(uid)}">${e(tx(follows ? "Following ✓" : "+ Follow"))}</button></div>` : ""}
        <p class="hb-kick">${e(tx("Recent activity"))}</p>
        <div class="hb-feed">${items.length ? items.map(card).join("") : `<p class="hb-mute">${e(tx("No public activity yet."))}</p>`}</div>
        ${isMember() ? `<button type="button" class="hb-btn line" data-fullprof="${e(uid)}">${e(tx("Open full profile →"))}</button>` : ""}`;
    } catch {}
  }

  /* ---------- actions ---------- */
  function needMember(el) { if (isMember()) return true; joinNote(el.closest(".hb-card, .hb-fcard, .hb-sug, .hb-pv, .hb-box") || el.parentElement); return false; }
  async function react(btn, i) {
    if (!needMember(btn)) return;
    if (i.me?.own) return K.toast(tx("You can't react to your own contributions."));
    const kind = btn.dataset.react, on = !i.me?.[kind];
    btn.disabled = true;
    try {
      const c = await rpc("hub_react", { p_kind: kind, p_target_kind: i.kind, p_target_id: i.tid, p_on: on });
      i.me = { ...(i.me || {}), [kind]: on }; i.n = { ...(i.n || {}), appreciate: c.appreciate, useful: c.useful };
      repaintCard(i); K.track(`Hub: ${kind}`);
    } catch (err) { btn.disabled = false; K.toast(/own content/.test(err.message) ? tx("You can't react to your own contributions.") : tx("Could not save it: {e}", { e: err.message }), true); }
  }
  async function follow(btn, uid) {
    if (!needMember(btn)) return;
    const on = !(S.follow.has(uid) ? S.follow.get(uid) : btn.classList.contains("on"));
    btn.disabled = true;
    try {
      if (on) await K.api("/rest/v1/folk_follows", { method: "POST", body: { followed_id: uid }, headers: { Prefer: "return=minimal,resolution=ignore-duplicates" } });
      else await K.api(`/rest/v1/folk_follows?follower_id=eq.${encodeURIComponent(who().uid)}&followed_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE" });
      S.follow.set(uid, on);
      [S.items, S.placeFeed?.items || [], S.prev?.items || []].flat().filter(x => x.user_id === uid).forEach(x => { x.me = { ...(x.me || {}), follows: on }; });
      box.querySelectorAll(`[data-follow="${CSS.escape(uid)}"]`).forEach(b => {
        if (b.closest(".hb-ch")) { if (on) b.remove(); return; }
        b.disabled = false; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.textContent = tx(on ? "Following ✓" : b.closest(".hb-sug") ? "Follow" : "+ Follow");
      });
      K.track(on ? "Hub: follow" : "Hub: unfollow");
      if (S.filter === "following") S.items = [];
    } catch (err) { btn.disabled = false; K.toast(tx("Could not save it: {e}", { e: err.message }), true); }
  }
  async function save(btn, i) {
    const on = !(i.me?.saved || savedLocal(i.spot_id));
    btn.disabled = true;
    try { await K.setFav(i.spot_id, on); [S.items, S.placeFeed?.items || []].flat().filter(x => x.spot_id === i.spot_id).forEach(x => { x.me = { ...(x.me || {}), saved: on }; }); repaintCard(i);
      [S.items, S.placeFeed?.items || []].flat().filter(x => x.spot_id === i.spot_id && x !== i).forEach(repaintCard);
      S.places = null; K.track(on ? "Hub: place saved" : "Hub: place unsaved");
      loadPlaces().then(p => { S.places = p; paintMyPlaces(); }).catch(() => {});
    } catch (err) { btn.disabled = false; K.toast(tx("Could not save it: {e}", { e: err.message }), true); }
  }
  async function confirmCond(btn, i) {
    if (!needMember(btn)) return; const k = i.extra?.cond; if (!K.COND[k]) return; btn.disabled = true;
    try { await K.api("/rest/v1/place_conditions", { method: "POST", headers: { Prefer: "return=minimal" }, body: { spot_id: i.spot_id, kind: k, author_name: K.displayName(), expires_at: new Date(Date.now() + K.COND[k][2] * 36e5).toISOString() } });
      btn.textContent = `✓ ${tx("Thanks!")}`; K.track("Hub: condition confirmed"); } catch (err) { btn.disabled = false; K.toast(tx("Could not save it: {e}", { e: err.message }), true); }
  }
  async function confirmFact(btn, i) {
    if (!needMember(btn)) return; btn.disabled = true;
    try { await K.api("/rest/v1/fact_checks", { method: "POST", headers: { Prefer: "return=minimal,resolution=ignore-duplicates" }, body: { fact_id: +i.extra.fact_id, author_name: K.displayName() } });
      i.me = { ...(i.me || {}), checked: true }; i.n = { ...(i.n || {}), checks: (i.n?.checks || 0) + 1 }; repaintCard(i); K.track("Hub: fact checked");
    } catch (err) { btn.disabled = false; K.toast(/row-level|policy/i.test(err.message) ? tx("You can't react to your own contributions.") : tx("Could not save it: {e}", { e: err.message }), true); }
  }
  async function flag(btn, i) {
    if (!needMember(btn)) return; btn.disabled = true;
    const kind = i.kind === "story" || i.kind === "impression" ? "review" : i.kind === "photo" ? "photo" : "spot";
    const target = kind === "spot" ? i.spot_id : i.tid;
    try { await K.api("/rest/v1/content_flags", { method: "POST", headers: { Prefer: "return=minimal" }, body: { kind, target_id: String(target), label: `Folk Hub · ${i.kind} #${i.tid} · ${i.spot || ""}`.slice(0, 200), reason: "wrong", note: tx("Wrong or outdated?") } });
      K.toast(tx("Reported. Thanks for looking after the map.")); K.track("Hub: reported");
    } catch (err) { btn.disabled = false; K.toast(tx("Could not save it: {e}", { e: err.message }), true); }
  }

  function onClick(ev) {
    const t = ev.target.closest("button, a"); if (!t || !box.contains(t)) return;
    const ds = t.dataset, i = t.closest(".hb-card") ? itemOf(t) : null;
    if (ds.view) { const dlg = t.closest("dialog"); dlg?.close?.(); return setView(ds.view); }
    if (ds.filter) { S.filter = ds.filter; S.items = []; S.end = false; box.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === (S.filter === "following" ? "following" : "feed"))); paintMain(); return; }
    if (ds.loadmore !== undefined) return loadFeed();
    if (ds.retry !== undefined) { S.err = ""; S.items = []; S.end = false; return paintMain(); }
    if (ds.react && i) return react(t, i);
    if (ds.follow) return follow(t, ds.follow);
    if (ds.folk) { ev.preventDefault(); if (!isMember()) return joinNote(t.closest(".hb-card, .hb-box") || t.parentElement); return preview(ds.folk); }
    if (ds.save !== undefined && i) return save(t, i);
    if (ds.same !== undefined && i) return confirmCond(t, i);
    if (ds.check !== undefined && i) return confirmFact(t, i);
    if (ds.flag !== undefined && i) return flag(t, i);
    if (ds.been !== undefined && i) { if (i.me?.been) return K.goPlace(i.spot_id); K.toast(tx("Sign it from its card on the map: tap ✍ Sign.")); K.track("Hub: been there"); return K.goPlace(i.spot_id); }
    if (ds.go !== undefined && i) { K.track("Hub: place opened"); return K.goPlace(i.spot_id); }
    if (ds.gospot) { t.closest("dialog")?.close?.(); openFull(false); K.track("Hub: place opened"); return K.goPlace(+ds.gospot); }
    if (ds.tomap !== undefined) { openFull(false); return K.toMap(S.mapPts || []); }
    if (ds.full !== undefined) return openFull(!S.mapFull);
    if (ds.days) { S.mapDays = +ds.days; return loadMap(); }
    if (ds.mapfol !== undefined) { S.mapFol = !S.mapFol; return loadMap(); }
    if (ds.mute) { const id = +ds.mute, p = (S.places || []).find(x => x.id === id); if (!p) return; p.muted = !p.muted;
      const muted = (S.places || []).filter(x => x.muted).map(x => x.id); savePrefs({ muted });
      t.classList.toggle("on", !p.muted); t.setAttribute("aria-pressed", !p.muted); t.textContent = `${p.muted ? "🔕" : "🔔"} ${tx(p.muted ? "Muted" : "Notify me")}`; return; }
    if (ds.close !== undefined) return t.closest("dialog")?.close();
    if (ds.fullprof) { t.closest("dialog")?.close(); return K.openProfile(ds.fullprof); }
  }
  function onChange(ev) {
    const p = ev.target.closest("[data-pref]"); if (!p) return;
    const off = [...box.querySelectorAll("[data-pref]")].filter(x => !x.checked).map(x => x.dataset.pref);
    savePrefs({ off }); K.track("Hub: notification preferences");
  }

  /* ---------- badges: unread notifications, news on places saved on this device ---------- */
  function badges() {
    let a = 0, p = 0;
    if (isMember()) a = S.upd?.unread || 0;
    else { let seen = ""; try { seen = localStorage.getItem("sf-hub-places-seen") || ""; } catch {} p = (S.placeFeed?.items || []).filter(i => !seen || i.at > seen).length; }
    box.querySelectorAll('[data-badge="alerts"]').forEach(b => { b.hidden = !a; b.textContent = a > 9 ? "9+" : a; });
    box.querySelectorAll('[data-badge="places"]').forEach(b => { b.hidden = !p || S.view === "places"; b.textContent = p > 9 ? "9+" : p; });
  }

  /* ---------- mount ---------- */
  let mounted = null;
  async function mount(el, kit) {
    K = kit;
    try { await K.ensureSession(); } catch {}
    const sig = `${who().uid}|${who().member}`;
    if (box === el && mounted === sig && el.querySelector(".hb")) {   // coming back: refresh what may have changed
      paintMain(); if (isMember()) loadUpdates(); setTimeout(() => S.map?.invalidateSize(), 60); return;
    }
    box = el; mounted = sig;
    Object.assign(S, { _ready: false, items: [], next: null, end: false, err: "", rep: null, upd: null, places: null, placeFeed: null, sugg: null, mapPts: null, follow: new Map() });
    if (S.map) { try { S.map.remove(); } catch {} S.map = null; }
    shell();
    if (!el._hb) { el._hb = true; el.addEventListener("click", onClick); el.addEventListener("change", onChange); }
    const d = box.querySelector("[data-dlg]"); d?.addEventListener("click", ev => { if (ev.target === d) d.close(); });
    if (!mount._esc) { mount._esc = true; document.addEventListener("keydown", ev => { if (ev.key === "Escape" && S.mapFull) openFull(false); }); }
    setView("feed");
    loadMap(); paintSugg();
    loadPlaces().then(p => { S.places = p; paintMyPlaces();
      if (who().guest && p.length) rpc("hub_feed", { p_filter: "all", p_limit: 20, p_spots: p.map(x => x.id) }).then(f => { S.placeFeed = f; badges(); }).catch(() => {}); }).catch(() => paintMyPlaces());
    if (isMember()) loadUpdates();
    K.track("Hub: opened");
  }
  return { mount };
})();
