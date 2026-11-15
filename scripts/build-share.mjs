// Fabio Costa Ph — share pages with a preview (WhatsApp, Facebook, LinkedIn, Telegram, X…)
// The site is one page: link previews only read the home. So every article, guide and magazine issue gets a tiny page in /s/
// with its own title, description and picture (1200×630, light), which sends people straight to the content.
// Run by .github/workflows/share-pages.yml. Needs ImageMagick («convert») for the pictures; SUPABASE_URL / SUPABASE_ANON for
// the articles written on the site (optional).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SITE = "https://fabiocostaph.com";
const OUT = "s", IMG = path.join(OUT, "img");
fs.mkdirSync(IMG, { recursive: true });
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "luogo";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").replace(/[#*_>`]/g, "").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const abs = u => !u ? "" : /^https?:\/\//.test(u) ? u : `${SITE}/${String(u).replace(/^\/+/, "")}`;
const manifestFile = path.join(OUT, "manifest.json"), manifest = readJSON(manifestFile);

// the picture: the cover cropped to 1200×630, about 100–200 KB (WhatsApp and the others want it light)
async function picture(key, src) {
  const file = path.join(IMG, `${key}.jpg`);
  if (!src) return `${SITE}/img/og-image.jpg`;
  if (manifest[key] === src && fs.existsSync(file)) return `${SITE}/${file}`;
  try {
    let input = src;
    if (/^https?:\/\//.test(src) && !src.startsWith(SITE)) {
      const r = await fetch(src); if (!r.ok) throw new Error(r.status);
      input = path.join("/tmp", `${key}-src`); fs.writeFileSync(input, Buffer.from(await r.arrayBuffer()));
    } else input = String(src).replace(SITE, "").replace(/^\/+/, "");
    if (!fs.existsSync(input)) throw new Error("missing " + input);
    execFileSync("convert", [`${input}[0]`, "-auto-orient", "-resize", "1200x630^", "-gravity", "center", "-extent", "1200x630", "-strip", "-interlace", "Plane", "-quality", "78", file]);
    manifest[key] = src;
    return `${SITE}/${file}`;
  } catch (err) { console.warn(`picture ${key}: ${err.message}`); return `${SITE}/img/og-image.jpg`; }
}

const pages = [];
function page(name, { title, description, image, target, type = "article" }) {
  const url = `${SITE}/${OUT}/${name}.html`, to = /^https?:/.test(target) ? target : `/${target}`;
  pages.push(name);
  fs.writeFileSync(path.join(OUT, `${name}.html`), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, follow">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Fabio Costa Ph">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${esc(/^https?:/.test(target) ? target : `${SITE}/${target}`)}">
<meta http-equiv="refresh" content="0; url=${esc(to)}">
<script>location.replace(${JSON.stringify(to)});</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050b14;color:#f2f6fb;font:16px system-ui,sans-serif}a{color:#ffbe7a}</style>
</head><body><a href="${esc(to)}">${esc(title)} →</a></body></html>
`);
}

// 1. the articles of the panel
const articoli = (readJSON("content/articoli.json").articoli || []).filter(x => x && x.titolo);
for (const x of articoli) {
  const id = slug(x.slug || x.titolo);
  page(`art-${id}`, { title: x.titolo, description: clip(x.estratto || x.testo, 200) || "Field Notes by Fabio Costa Ph", image: await picture(`art-${id}`, x.copertina), target: `#art-${id}` });
}
// 2. the articles written on the site (published), if Supabase is reachable
const siteMonths = [];
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON) {
  try {
    const r = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/journal_submissions?select=id,slug,title,excerpt,body,cover_url,published_at&status=eq.published&order=published_at.desc&limit=300`,
      { headers: { apikey: process.env.SUPABASE_ANON } });
    if (r.ok) for (const x of await r.json()) {
      const id = `c-${x.slug || x.id}`; if (x.published_at) siteMonths.push(String(x.published_at).slice(0, 7));
      page(`art-${id}`, { title: x.title, description: clip(x.excerpt || x.body, 200) || "Field Notes", image: await picture(`art-${id}`, x.cover_url), target: `#art-${id}` });
    }
  } catch (err) { console.warn("site articles:", err.message); }
}
// 3. the guides: zone by zone, and the PDF ones
const G = readJSON("content/guide.json");
for (const g of (G.guide || []).filter(g => g && g.titolo && g.slug && !g.bozza))
  page(`g-${g.slug}`, { title: `${g.titolo}${g.sottotitolo ? ` — ${g.sottotitolo}` : ""}`, description: clip(g.intro, 200) || "A guide by Fabio Costa Ph", image: await picture(`g-${g.slug}`, g.copertina), target: `#g-${g.slug}` });
for (const g of (G.pdf || []).filter(g => g && g.titolo && !g.bozza && (g.file || g.link))) {
  const id = slug(g.titolo), file = String(g.link || g.file).trim();
  page(`pdf-${id}`, { title: `${g.titolo}${g.sottotitolo ? ` — ${g.sottotitolo}` : ""}`, description: clip(g.descrizione, 200) || "A guide in PDF by Fabio Costa Ph", image: await picture(`pdf-${id}`, g.copertina), target: /^https?:/.test(file) ? file : abs(file) });
}
// 4. the magazine: this month's issue and every closed one with stories
const covers = readJSON("content/rivista.json").numeri || [];
const months = [...new Set([...articoli.map(x => String(x.data || "").slice(0, 7)), ...siteMonths].filter(m => /^\d{4}-\d{2}$/.test(m)))].sort();
const first = months[0], now = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const issueNo = m => { if (!first) return 1; const [y0, m0] = first.split("-").map(Number), [y, mo] = m.split("-").map(Number); return (y - y0) * 12 + (mo - m0) + 1; };
const monthName = m => { const [y, mo] = m.split("-").map(Number); return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(y, mo - 1, 15)); };
for (const m of [...new Set([...months, now])]) {
  const c = covers.find(x => String(x.mese || "").trim() === m), stories = articoli.filter(x => String(x.data || "").startsWith(m));
  const cover = c?.copertina || stories.find(x => x.copertina)?.copertina || "";
  const title = `Field Notes From Planet Earth · N° ${issueNo(m)} · ${monthName(m)}`;
  const description = c?.titolo || (stories.length ? `${stories.length} ${stories.length === 1 ? "story" : "stories"}: ${stories.slice(0, 3).map(x => x.titolo).join(" · ")}` : "The monthly magazine of Fabio Costa Ph");
  const img = await picture(`magazine-${m}`, cover);
  page(`magazine-${m}`, { title, description: clip(description, 200), image: img, target: m === now ? "#magazine" : `#magazine-${m}` });
  if (m === now) page("magazine", { title, description: clip(description, 200), image: img, target: "#magazine" });
}

// pages that no longer exist go (their pictures too)
for (const f of fs.readdirSync(OUT)) if (f.endsWith(".html") && !pages.includes(f.replace(/\.html$/, ""))) fs.rmSync(path.join(OUT, f));
for (const f of fs.readdirSync(IMG)) { const k = f.replace(/\.jpg$/, ""); if (!pages.includes(k) && !/^magazine-/.test(k)) { fs.rmSync(path.join(IMG, f)); delete manifest[k]; } }
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
console.log(`${pages.length} share pages`);
