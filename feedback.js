// Feedback dei visitatori: un piccolo avviso (sparisce da solo dopo 5 secondi o si chiude con ×)
// apre un questionario a risposte multiple, tutto facoltativo. Le risposte vanno nella tabella «feedback» di Supabase.
(function () {
  const t = s => (window.I18N ? I18N.t(s) : s);
  const KEY = "fcph-feedback";            // { sent, closedAt, shown }
  const state = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const Q = [
    { id: "came", multi: true, q: "What brought you here?", o: {
      photos: "The photographs", spots: "The Spots map", tools: "The Tools (sun, moon, planner)", journal: "Articles and guides",
      workshops: "Workshops and meetups", social: "Instagram or a friend" } },
    { id: "interest", multi: true, q: "What interests you most?", o: {
      locations: "Photo spots and locations", light: "Planning the light (sun, moon, Milky Way)", guides: "Practical travel guides",
      stories: "Reportage and stories", community: "Workshops and meeting other photographers", prints: "Prints and photo licences" } },
    { id: "spots", multi: true, q: "How do you use Spots?", o: {
      trip: "To plan a trip", near: "To find spots near me", add: "I add my own places", reviews: "Reviews and real prices",
      meet: "Meetups with other members", notyet: "I haven't tried it yet" } },
    { id: "often", multi: false, q: "How often would you come back?", o: {
      weekly: "Every week", monthly: "Every month", trips: "Before a trip", rarely: "Rarely" } },
    { id: "missing", multi: true, q: "What would you like to see next?", o: {
      offline: "Offline maps", conditions: "Live weather and conditions", routes: "Hiking routes (GPX)", app: "An app in the stores",
      videos: "Videos", newsletter: "A monthly newsletter" } }
  ];

  let tip = null, hideTimer = 0;
  function showTip() {
    if (tip || state.sent) return;
    // non sovrapporsi all'invito a installare l'app o a una finestra aperta: riprova più tardi
    if (document.querySelector("dialog[open], .install-tip")) { setTimeout(showTip, 20000); return; }
    if (state.closedAt && Date.now() - state.closedAt < 30 * 864e5) return;
    if ((state.shown || 0) >= 4) return;
    state.shown = (state.shown || 0) + 1; save();
    tip = document.createElement("div");
    tip.className = "fb-tip";
    tip.setAttribute("role", "status");
    tip.innerHTML = `<button type="button" class="fb-open"><span class="fb-ico" aria-hidden="true">✦</span>
        <span><b>${esc(t("Help me improve the site"))}</b><small>${esc(t("1 minute, all questions optional"))}</small></span></button>
      <button type="button" class="fb-x" aria-label="${esc(t("Close"))}">×</button><span class="fb-bar" aria-hidden="true"></span>`;
    document.body.appendChild(tip);
    requestAnimationFrame(() => tip.classList.add("show"));
    tip.querySelector(".fb-open").addEventListener("click", () => { hide(); openForm(); });
    tip.querySelector(".fb-x").addEventListener("click", () => { state.closedAt = Date.now(); save(); hide(); window.fcTrack?.("Feedback: banner closed"); });
    // sparisce da solo dopo 5 secondi, ma non mentre ci si passa sopra
    const arm = () => { clearTimeout(hideTimer); tip?.classList.remove("paused"); hideTimer = setTimeout(hide, 5000); };
    tip.addEventListener("mouseenter", () => { clearTimeout(hideTimer); tip.classList.add("paused"); });
    tip.addEventListener("mouseleave", arm);
    tip.addEventListener("focusin", () => { clearTimeout(hideTimer); tip.classList.add("paused"); });
    arm();
    window.fcTrack?.("Feedback: banner shown");
  }
  function hide() {
    clearTimeout(hideTimer);
    if (!tip) return;
    const el = tip; tip = null;
    el.classList.remove("show");
    setTimeout(() => el.remove(), 400);
  }

  function openForm() {
    let d = document.getElementById("feedbackDialog");
    if (!d) { d = document.createElement("dialog"); d.id = "feedbackDialog"; d.className = "import-dialog fb-dialog"; document.body.appendChild(d); d.addEventListener("click", e => { if (e.target === d) d.close(); }); }
    d.innerHTML = `<button class="dialog-close" type="button" data-close aria-label="${esc(t("Close"))}">×</button>
      <form class="import-body gate-form fb-form" novalidate>
        <span class="eyebrow">${esc(t("Your feedback"))}</span>
        <h2>${esc(t("Help me improve the site"))}</h2>
        <p class="gate-help left">${esc(t("Every question is optional: answer only what you like, then send."))}</p>
        <fieldset class="fb-q"><legend>${esc(t("How do you like the site?"))}</legend>
          <div class="fb-stars" role="radiogroup">${[5, 4, 3, 2, 1].map(n => `<label><input type="radio" name="rating" value="${n}"><span aria-hidden="true">★</span><span class="sr-only">${n}</span></label>`).join("")}</div>
        </fieldset>
        ${Q.map(q => `<fieldset class="fb-q"><legend>${esc(t(q.q))}${q.multi ? ` <small>${esc(t("(choose any)"))}</small>` : ""}</legend>
          <div class="fb-opts">${Object.entries(q.o).map(([k, l]) => `<label class="fb-opt"><input type="${q.multi ? "checkbox" : "radio"}" name="${q.id}" value="${k}"><span>${esc(t(l))}</span></label>`).join("")}</div>
        </fieldset>`).join("")}
        <label for="fbMsg">${esc(t("Anything else? Ideas, problems, places you'd like to see"))}</label>
        <textarea id="fbMsg" rows="3" maxlength="2000"></textarea>
        <label for="fbMail">${esc(t("Your email, if you'd like a reply"))} <small>(${esc(t("optional"))})</small></label>
        <input id="fbMail" type="email" maxlength="200" placeholder="you@example.com" autocomplete="email">
        <button class="outline-link" type="submit">${esc(t("SEND FEEDBACK"))} <span aria-hidden="true">→</span></button>
        <p class="gate-note" id="fbStatus" role="status"></p>
        <p class="gate-help left">${esc(t("Answers are anonymous unless you add your email. See the"))} <a href="#privacy">${esc(t("privacy page"))}</a>.</p>
      </form>`;
    d.querySelector("[data-close]").onclick = () => d.close();
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.target, status = d.querySelector("#fbStatus"), btn = f.querySelector("[type=submit]");
      const answers = {};
      Q.forEach(q => { const v = [...f.querySelectorAll(`[name="${q.id}"]:checked`)].map(i => i.value); if (v.length) answers[q.id] = q.multi ? v : v[0]; });
      const rating = +(f.querySelector("[name=rating]:checked")?.value || 0) || null;
      const message = d.querySelector("#fbMsg").value.trim() || null, email = d.querySelector("#fbMail").value.trim() || null;
      if (!Object.keys(answers).length && !rating && !message) { status.className = "gate-note warn"; status.textContent = t("Pick at least one answer or write a line, then send."); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.className = "gate-note warn"; status.textContent = t("Please check the email address."); return; }
      btn.disabled = true; status.className = "gate-note"; status.textContent = t("Sending…");
      const body = { answers, rating, message, email, lang: (window.I18N?.lang || "en").slice(0, 10),
        page: (location.hash.slice(1) || "home").slice(0, 40), device: matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop" };
      try {
        const cfg = typeof SPOTS_CONFIG !== "undefined" ? SPOTS_CONFIG : null;
        if (!cfg) throw new Error("not configured");
        let auth = {};
        try { const s = JSON.parse(localStorage.getItem("fcph-session") || "null"); if (s?.access_token && s.expires_at > Date.now()) auth = { Authorization: `Bearer ${s.access_token}` }; } catch {}
        const res = await fetch(`${cfg.url.replace(/\/$/, "")}/rest/v1/feedback`, { method: "POST",
          headers: { apikey: cfg.anonKey, "Content-Type": "application/json", Prefer: "return=minimal", ...auth }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.sent = Date.now(); save();
        window.fcTrack?.("Feedback: sent");
        f.innerHTML = `<span class="eyebrow">${esc(t("Your feedback"))}</span><h2>${esc(t("Thank you!"))}</h2>
          <p class="gate-help left">${esc(t("Every answer helps me decide what to build next."))}</p>`;
        setTimeout(() => d.open && d.close(), 2600);
      } catch (err) { btn.disabled = false; status.className = "gate-note warn"; status.textContent = `${t("Could not send, please try again later")} (${err.message}).`; }
    });
    if (!d.open) d.showModal();
    window.fcTrack?.("Feedback: form opened");
  }

  /* ---------- Diventa contributor (writer, fotografi, guide, sviluppatori…) ---------- */
  const ROLES = { writer: "Writer for the Journal", photographer: "Photographer (reportage, photo essays)", local: "Local expert / mountain guide",
    spots: "Curating spots in my area", developer: "Developer (help build Spots)", translator: "Translator", other: "Something else" };
  function openContribute(pre) {
    let d = document.getElementById("contribDialog");
    if (!d) { d = document.createElement("dialog"); d.id = "contribDialog"; d.className = "import-dialog fb-dialog"; document.body.appendChild(d); d.addEventListener("click", e => { if (e.target === d) d.close(); }); }
    d.innerHTML = `<button class="dialog-close" type="button" data-close aria-label="${esc(t("Close"))}">×</button>
      <form class="import-body gate-form fb-form" novalidate>
        <span class="eyebrow">${esc(t("Join the crew"))}</span>
        <h2>${esc(t("Become a contributor"))}</h2>
        <p class="gate-help left">${esc(t("Spots and the Journal grow with the people who love these places. Tell me how you'd like to help: I read every message and reply personally."))}</p>
        <fieldset class="fb-q"><legend>${esc(t("How would you like to contribute?"))} <small>${esc(t("(choose any)"))}</small></legend>
          <div class="fb-opts">${Object.entries(ROLES).map(([k, l]) => `<label class="fb-opt"><input type="checkbox" name="role" value="${k}"${pre === k ? " checked" : ""}><span>${esc(t(l))}</span></label>`).join("")}</div>
        </fieldset>
        <div class="ws-fields">
          <label>${esc(t("Name"))}<input id="ctName" maxlength="80" autocomplete="name" required></label>
          <label>Email<input id="ctMail" type="email" maxlength="200" autocomplete="email" required></label>
        </div>
        <label for="ctLinks">${esc(t("Your work: Instagram, portfolio, articles, GitHub…"))} <small>(${esc(t("optional"))})</small></label>
        <input id="ctLinks" maxlength="500" placeholder="https://…">
        <label for="ctMsg">${esc(t("A few words about you and your idea"))} <small>(${esc(t("optional"))})</small></label>
        <textarea id="ctMsg" rows="4" maxlength="3000"></textarea>
        <button class="outline-link" type="submit">${esc(t("SEND"))} <span aria-hidden="true">→</span></button>
        <p class="gate-note" id="ctStatus" role="status"></p>
        <p class="gate-help left">${esc(t("Your details are used only to reply to you. See the"))} <a href="#privacy">${esc(t("privacy page"))}</a>.</p>
      </form>`;
    d.querySelector("[data-close]").onclick = () => d.close();
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.target, st = d.querySelector("#ctStatus"), btn = f.querySelector("[type=submit]");
      const warn = m => { st.className = "gate-note warn"; st.textContent = m; };
      const roles = [...f.querySelectorAll("[name=role]:checked")].map(i => i.value);
      const name = d.querySelector("#ctName").value.trim(), email = d.querySelector("#ctMail").value.trim();
      if (name.length < 2) return warn(t("Please enter your name."));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return warn(t("Please enter a valid email address."));
      btn.disabled = true; st.className = "gate-note"; st.textContent = t("Sending…");
      try {
        const cfg = typeof SPOTS_CONFIG !== "undefined" ? SPOTS_CONFIG : null;
        if (!cfg) throw new Error("not configured");
        let auth = {};
        try { const s = JSON.parse(localStorage.getItem("fcph-session") || "null"); if (s?.access_token && s.expires_at > Date.now()) auth = { Authorization: `Bearer ${s.access_token}` }; } catch {}
        const res = await fetch(`${cfg.url.replace(/\/$/, "")}/rest/v1/contributor_requests`, { method: "POST",
          headers: { apikey: cfg.anonKey, "Content-Type": "application/json", Prefer: "return=minimal", ...auth },
          body: JSON.stringify({ roles, name, email, links: d.querySelector("#ctLinks").value.trim() || null, message: d.querySelector("#ctMsg").value.trim() || null, lang: (window.I18N?.lang || "en").slice(0, 10) }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        window.fcTrack?.(`Contributor: request sent (${roles.join(",") || "none"})`);
        f.innerHTML = `<span class="eyebrow">${esc(t("Join the crew"))}</span><h2>${esc(t("Thank you!"))}</h2>
          <p class="gate-help left">${esc(t("I'll get back to you by email soon."))}</p>`;
        setTimeout(() => d.open && d.close(), 3000);
      } catch (err) { btn.disabled = false; warn(`${t("Could not send, please try again later")} (${err.message}).`); }
    });
    if (!d.open) d.showModal();
    window.fcTrack?.("Contributor: form opened");
  }
  document.addEventListener("click", e => { const a = e.target.closest?.("[data-contribute]"); if (a) { e.preventDefault(); openContribute(a.dataset.contribute || ""); } });

  window.FCFeedback = { open: openForm, tip: showTip, contribute: openContribute };
  // l'avviso compare dopo 30 secondi di visita (mai durante la prima mezz'ora dopo averlo chiuso, mai dopo aver risposto)
  setTimeout(showTip, 30000);
  document.addEventListener("click", e => { const a = e.target.closest?.("[data-feedback]"); if (a) { e.preventDefault(); openForm(); } });
})();
