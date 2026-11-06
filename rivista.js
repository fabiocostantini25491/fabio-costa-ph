/* Fabio Costa Ph — impaginazione del PDF mensile «Field Notes From Planet Earth».
   Struttura fissa: copertina · sommario (con numeri di pagina) · articoli (ognuno da pagina nuova) · retro.
   Il sommario è cronologico, dal più recente al più vecchio. Le foto sono adattate alla pagina, mai ritagliate.
   La pagina espone window.RIVISTA allo script che stampa il PDF (scripts/build-rivista.cjs). */
(() => {
  const NAME = "Field Notes From Planet Earth";
  const SITE = "fabiocostaph.com";
  const CAT = { Viaggi: "Travel", Fotografia: "Photography", Tecnica: "Technique", Ispirazione: "Inspiration", "Attualità": "Current affairs",
    Luoghi: "Places", "Guide pratiche": "Field guides", Persone: "People", Natura: "Nature" };
  const GLANCE = [["periodo", "Best time"], ["arrivare", "Getting there"], ["parcheggio", "Parking"], ["camminata", "The walk"],
    ["difficolta", "Difficulty"], ["permessi", "Permits & rules"], ["attrezzatura", "Gear"], ["impostazioni", "Settings"]];
  const MAX_PX = 3000;          // lato lungo massimo delle foto nel PDF: circa 300 dpi anche a pagina intera (A4)

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "articolo";
  const media = u => (u ? String(u).trim().replace(/^\/(?!\/)/, "") : "");
  const romeMonth = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
  const prevMonth = m => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 2, 15)); return d.toISOString().slice(0, 7); };
  const monthLabel = m => { const [y, mo] = m.split("-").map(Number); return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(y, mo - 1, 15)); };
  const fmtDate = d => d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d + "T12:00:00")) : "";

  const params = new URLSearchParams(location.search);
  const PRINT = params.get("print") === "1";   // PDF su richiesta: impaginato qui nel browser (Paged.js) e poi «Salva come PDF»
  const month = /^\d{4}-\d{2}$/.test(params.get("mese") || "") ? params.get("mese") : prevMonth(romeMonth());

  function md(text) {
    if (!text) return "";
    if (window.marked?.parse) {
      const tpl = document.createElement("template");
      tpl.innerHTML = marked.parse(String(text), { breaks: true });
      tpl.content.querySelectorAll("script,iframe,object,embed,style").forEach(n => n.remove());
      tpl.content.querySelectorAll("*").forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
      tpl.content.querySelectorAll("img").forEach(i => i.setAttribute("src", media(i.getAttribute("src"))));
      return tpl.innerHTML;
    }
    return String(text).split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join("");
  }
  /* foto nel testo: diventano figure (con didascalia dall'alt) a tutta larghezza */
  function figures(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const fig = img => {
      const f = document.createElement("figure"); f.className = "rv-fig";
      f.appendChild(img.cloneNode(true));
      if (img.alt?.trim()) { const c = document.createElement("figcaption"); c.textContent = img.alt.trim(); f.appendChild(c); }
      return f;
    };
    tpl.content.querySelectorAll("p").forEach(p => { const imgs = p.querySelectorAll("img"); if (imgs.length && !p.textContent.trim()) p.replaceWith(...[...imgs].map(fig)); });
    tpl.content.querySelectorAll("img").forEach(img => { if (!img.closest(".rv-fig")) img.replaceWith(fig(img)); });
    return tpl.innerHTML;
  }

  async function getJSON(p) { const r = await fetch(p, { cache: "no-store" }); if (!r.ok) throw new Error(p); return r.json(); }
  async function supabaseConfig() {
    try { const t = await (await fetch("spots.js", { cache: "no-store" })).text();
      return { url: t.match(/url:\s*"([^"]+)"/)?.[1] || "", key: t.match(/anonKey:\s*"([^"]+)"/)?.[1] || "" }; } catch { return {}; }
  }
  async function loadArticles(owner) {
    const out = [];
    try {
      const raw = await getJSON("content/articoli.json");
      (Array.isArray(raw) ? raw : raw.articoli || []).filter(x => x && x.titolo).forEach(x => {
        const au = x.autore && typeof x.autore === "object" && String(x.autore.nome || "").trim();
        out.push({ id: slug(x.slug || x.titolo), title: x.titolo, category: x.categoria || "Viaggi", date: x.data || "", minutes: +x.minuti || 0,
          cover: media(x.copertina), excerpt: x.estratto || "", text: x.testo || "", place: x.luogo || "",
          type: /reportage/i.test(x.tipo || "") ? "reportage" : "guide", glance: x.in_breve && typeof x.in_breve === "object" ? x.in_breve : {},
          blocks: Array.isArray(x.impaginazione) ? x.impaginazione.filter(b => b && typeof b === "object") : [],
          author: au ? { name: au, bio: x.autore.bio || "", instagram: String(x.autore.instagram || "").replace(/^@/, ""), own: false } : { name: owner, own: true } });
      });
    } catch (e) { console.warn("[rivista] articoli del pannello", e); }
    // articoli scritti sul sito dai membri (pubblicati)
    const sb = await supabaseConfig();
    if (sb.url && sb.key) {
      try {
        const cols = "id,slug,title,kind,topic,place,excerpt,body,cover_url,glance,author_name,author_instagram,author_bio,published_at,updated_at";
        const r = await fetch(`${sb.url.replace(/\/$/, "")}/rest/v1/journal_submissions?select=${cols}&status=eq.published&limit=500`, { headers: { apikey: sb.key } });
        if (r.ok) (await r.json()).forEach(x => {
          const words = String(x.body || "").split(/\s+/).length;
          out.push({ id: `c-${x.slug || x.id}`, title: x.title, category: x.topic || "Luoghi", date: String(x.published_at || x.updated_at || "").slice(0, 10),
            minutes: Math.max(1, Math.round(words / 220)), cover: x.cover_url || "", excerpt: x.excerpt || "", text: x.body || "", place: x.place || "",
            type: x.kind === "reportage" ? "reportage" : "guide", glance: x.glance || {},
            author: { name: x.author_name || owner, bio: x.author_bio || "", instagram: x.author_instagram || "", own: (x.author_name || "").trim() === owner } });
        });
      } catch (e) { console.warn("[rivista] articoli dei membri", e); }
    }
    return out;
  }
  const issueNumber = (all, m) => {
    const first = all.map(a => (a.date || "").slice(0, 7)).filter(Boolean).sort()[0] || m;
    const [y1, m1] = first.split("-").map(Number), [y2, m2] = m.split("-").map(Number);
    return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
  };

  /* le foto grandi vengono ridotte prima della stampa: il PDF resta leggero */
  async function shrinkImages(root) {
    const imgs = [...root.querySelectorAll("img")];
    await Promise.all(imgs.map(img => new Promise(res => {
      const done = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (w && h && Math.max(w, h) > MAX_PX) {
            const k = MAX_PX / Math.max(w, h), c = document.createElement("canvas");
            c.width = Math.round(w * k); c.height = Math.round(h * k);
            // riduzione a passi con ricampionamento di qualità: foto nitide in stampa
            let src = img, sw = w, sh = h;
            while (sw / 2 >= c.width * 1.05) {
              const t = document.createElement("canvas"); t.width = Math.round(sw / 2); t.height = Math.round(sh / 2);
              const tx = t.getContext("2d"); tx.imageSmoothingQuality = "high"; tx.drawImage(src, 0, 0, t.width, t.height); src = t; sw = t.width; sh = t.height;
            }
            const cx = c.getContext("2d"); cx.imageSmoothingQuality = "high"; cx.drawImage(src, 0, 0, c.width, c.height);
            img.onload = img.onerror = () => res(); img.src = c.toDataURL("image/jpeg", 0.92); return;
          }
        } catch { /* immagine di un altro sito senza permessi: resta com'è */ }
        res();
      };
      if (img.complete && img.naturalWidth) done(); else { img.onload = done; img.onerror = () => { img.closest("figure")?.remove(); img.remove(); res(); }; }
    })));
  }

  /* impaginazione a blocchi scelta nel pannello */
  const FMT = { "Tutta larghezza": "full", "Nella colonna": "col", "A sinistra nel testo": "left", "A destra nel testo": "right", "Pagina intera": "page" };
  function blocksHtml(blocks) {
    const fig = (src, cap, fmt) => `<figure class="rv-fig fig-${fmt}"><img src="${esc(media(src))}" alt="">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ""}</figure>`;
    return blocks.map(b => {
      const k = b.blocco || b._block || b.type || "";
      if (k === "testo") return md(b.testo || "");
      if (k === "foto" && b.immagine) return fig(b.immagine, b.didascalia, FMT[b.formato] || "full");
      if (k === "coppia") {
        const imgs = (Array.isArray(b.immagini) ? b.immagini : b.immagini ? [b.immagini] : []).map(x => typeof x === "string" ? x : x?.immagine || "").filter(Boolean).slice(0, 3);
        return imgs.length ? `<div class="rv-spread n${Math.max(2, imgs.length)}">${imgs.map(i => `<img src="${esc(media(i))}" alt="">`).join("")}${b.didascalia ? `<p>${esc(b.didascalia)}</p>` : ""}</div>` : "";
      }
      if (k === "citazione" && b.testo) return `<blockquote><p>${esc(b.testo)}</p>${b.autore ? `<cite>— ${esc(b.autore)}</cite>` : ""}</blockquote>`;
      return "";
    }).join("");
  }
  const textLang = t => {
    const w = " " + String(t || "").toLowerCase().replace(/[^a-zà-ú' ]+/g, " ") + " ";
    const n = re => (w.match(re) || []).length;
    return n(/ (il|che|della|delle|di|per|non|una|sono|nel|alla|gli) /g) > n(/ (the|and|of|to|is|with|that|this|for|you) /g) ? "it" : "en";
  };
  const glanceHtml = g => {
    const rows = GLANCE.filter(([k]) => g && g[k] && String(g[k]).trim());
    return rows.length ? `<aside class="rv-glance"><p>At a glance</p><dl>${rows.map(([k, l]) => `<div><dt>${l}</dt><dd>${esc(g[k])}</dd></div>`).join("")}</dl></aside>` : "";
  };

  async function build() {
    let owner = "Fabio Costantini", about = {};
    try { about = await getJSON("content/chi-sono.json"); owner = about.proprietario || owner; } catch {}
    const all = (await loadArticles(owner)).filter(a => a.date);
    const list = all.filter(a => a.date.slice(0, 7) === month).sort((a, b) => b.date.localeCompare(a.date));
    let covers = [];
    try { const r = await getJSON("content/rivista.json"); covers = Array.isArray(r?.numeri) ? r.numeri : []; } catch {}
    const set = covers.find(c => String(c.mese || "").trim() === month);
    const cover = set?.copertina ? media(set.copertina) : (list.find(a => a.cover)?.cover || "");
    const num = issueNumber(all, month), label = monthLabel(month);
    const authors = [...new Set(list.map(a => a.author.name))];
    const ig = String(about.instagram || "fabiocostaph").replace(/^@/, "");

    // piè di pagina: nome della rivista, numero e mese a sinistra, numero di pagina a destra
    const st = document.createElement("style");
    st.textContent = `@page { @bottom-left { content: "${NAME.replace(/"/g, "")} · N° ${num} · ${label}"; } }`;
    document.head.appendChild(st);

    const issue = document.getElementById("issue");
    issue.innerHTML = `
      <section class="rv-part rv-cover${cover ? "" : " no-img"}" data-part="cover">
        ${cover ? `<img class="rv-cover-img" src="${esc(cover)}" alt="">` : ""}
        <div class="rv-cover-top"><span>N° ${num}</span><span>${esc(label)}</span><span>${esc(SITE)}</span></div>
        <div class="rv-cover-text">
          <h1>Field Notes<span>From Planet Earth</span></h1>
          ${set?.titolo ? `<p class="rv-cover-title">${esc(set.titolo)}</p>` : ""}
          <ul class="rv-cover-lines">${list.slice(0, 4).map(a => `<li>${esc(a.title)}</li>`).join("")}</ul>
        </div>
      </section>
      <section class="rv-part rv-toc" data-part="toc">
        <p class="rv-kicker">N° ${num} · ${esc(label)}</p>
        <h2>Contents</h2>
        <ol>${list.map((a, i) => `<li><span class="rv-n">${String(i + 1).padStart(2, "0")}</span>
          <span class="rv-t"><small>${a.type === "reportage" ? "Reportage" : "Field guide"} · ${esc(CAT[a.category] || a.category)}</small><strong>${esc(a.title)}</strong>
          <em>${esc(a.author.name)} · ${esc(fmtDate(a.date))}</em></span><span class="rv-dots"></span>${PRINT ? `<a class="rv-p rv-pref" href="#rv-art-${i}"></a>` : `<span class="rv-p" data-page-of="art-${i}">—</span>`}</li>`).join("")}</ol>
        <p class="rv-editor">${authors.length > 1 ? `With stories by ${esc(authors.join(", "))}.` : ""} Every story in this issue was published on ${esc(SITE)} during ${esc(label)}.</p>
      </section>
      ${list.map((a, i) => `
      <section class="rv-part rv-article" data-part="art-${i}" id="rv-art-${i}">
        <p class="rv-runhead"><span>${String(i + 1).padStart(2, "0")}</span>${a.type === "reportage" ? "Reportage" : "Field guide"} · ${esc(CAT[a.category] || a.category)}${a.place ? ` · ${esc(a.place)}` : ""}</p>
        <h2 class="rv-title">${esc(a.title)}</h2>
        ${a.excerpt ? `<p class="rv-deck">${esc(a.excerpt)}</p>` : ""}
        <p class="rv-byline">Text and photographs by <b>${esc(a.author.name)}</b> · ${esc(fmtDate(a.date))}${a.minutes ? ` · ${a.minutes} min read` : ""}</p>
        ${a.cover ? `<figure class="rv-fig rv-hero"><img src="${esc(a.cover)}" alt=""></figure>` : ""}
        ${glanceHtml(a.glance)}
        <div class="rv-body" lang="${textLang(a.text + " " + (a.blocks || []).map(b => b.testo || "").join(" "))}">${a.blocks?.length ? blocksHtml(a.blocks) : figures(md(a.text))}</div>
        ${!a.author.own ? `<aside class="rv-author"><b>${esc(a.author.name)}</b>${a.author.bio ? ` — ${esc(a.author.bio)}` : ""}${a.author.instagram ? ` · Instagram @${esc(a.author.instagram)}` : ""}</aside>` : ""}
      </section>`).join("")}
      <section class="rv-part rv-back" data-part="back">
        <h2>Field Notes<span>From Planet Earth</span></h2>
        <p>A monthly issue made of the stories published on <b>${esc(SITE)}</b>. A new issue grows on the site every month and closes on its last day.</p>
        <p>Want to write for the next issue? Go to <b>${esc(SITE)}/#write</b>.</p>
        <p class="rv-back-foot">Instagram @${esc(ig)} · ${esc(SITE)} · © ${month.slice(0, 4)} ${esc(owner)}</p>
      </section>`;
    issue.querySelectorAll("img").forEach(i => { if (/^https?:/i.test(i.getAttribute("src") || "")) i.crossOrigin = "anonymous"; });
    await shrinkImages(issue);
    await document.fonts?.ready;
    return { month, number: num, label, count: list.length, parts: ["cover", "toc", ...list.map((_, i) => `art-${i}`), "back"], titles: list.map(a => a.title) };
  }

  const api = window.RIVISTA = {
    info: null,
    ready: null,
    /* mostra una sola parte (per contarne le pagine) oppure tutto */
    show(part) { document.querySelectorAll("[data-part]").forEach(s => { s.hidden = part !== "all" && s.dataset.part !== part; }); },
    /* scrive i numeri di pagina nel sommario */
    setPages(map) { document.querySelectorAll("[data-page-of]").forEach(el => { if (map[el.dataset.pageOf]) el.textContent = map[el.dataset.pageOf]; }); }
  };
  api.ready = build().then(info => (api.info = info)).catch(e => { console.error(e); document.getElementById("issue").textContent = "Error: " + e.message; api.info = { error: String(e) }; });

  /* ---------- PDF su richiesta (numeri passati) ----------
     Paged.js divide il numero in pagine A4 con le stesse regole del PDF mensile, scrive i numeri di pagina nel sommario,
     poi si apre la finestra di stampa: lì si sceglie «Salva come PDF». Nulla viene salvato online. */
  if (PRINT) {
    document.documentElement.classList.add("rv-print");
    const note = document.createElement("div");
    note.className = "rv-printnote";
    note.innerHTML = `<b>Preparing your PDF…</b><span>When the print window opens, choose <i>Save as PDF</i>.</span>`;
    document.body.appendChild(note);
    api.ready.then(info => {
      if (!info || info.error || !info.count) { note.innerHTML = "<b>This issue has no stories.</b>"; return; }
      document.title = `${NAME} — N° ${info.number} · ${info.label}`;
      note.remove();
      window.PagedConfig = { auto: false };
      const sc = document.createElement("script");
      sc.src = "https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.min.js";
      sc.onload = async () => {
        try {
          await window.PagedPolyfill.preview();
          api.paged = { pages: document.querySelectorAll(".pagedjs_page").length };
          document.body.appendChild(Object.assign(document.createElement("button"), { className: "rv-printbtn", textContent: "Save as PDF", onclick: () => window.print() }));
          if (!params.has("noprint")) setTimeout(() => window.print(), 400);
        } catch (e) { console.error(e); api.paged = { error: String(e) }; window.print(); }
      };
      sc.onerror = () => { api.paged = { error: "pagedjs not loaded" }; window.print(); };
      document.head.appendChild(sc);
    });
  }
})();
