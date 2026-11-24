#!/usr/bin/env python3
"""Miniature tonde per i pin della mappa (i posti di Fabio su SpotFolk).

Le foto del sito pesano in media mezzo megabyte: metterle sui pin significherebbe
scaricarne venti o trenta all'apertura della mappa. Questo script ne ricava una
copia quadrata da 112 px (qualche kB l'una) in img/pins/.

Il nome del file si ricava dal percorso della foto con la stessa regola che usa
app.js, così nel sito non serve nessun elenco: img/foto/x.jpg -> img-foto-x-jpg.webp
Se una miniatura manca, il pin ricade sulla foto intera da solo.

Si rilancia quando aggiungi foto:  python3 scripts/build-pins.py
"""
import json, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "img", "pins")
SIZE = 112
SOURCES = ["content/viaggi.json", "content/guide.json"]
PATTERN = re.compile(r'"(/[^"]+?\.(?:jpg|jpeg|png|webp))"', re.I)


def thumb_name(path):
    """Stessa regola di pinThumb() in app.js."""
    return re.sub(r"[^a-z0-9]+", "-", path.lstrip("/").lower()).strip("-") + ".webp"


def main():
    paths = set()
    for rel in SOURCES:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            paths |= set(PATTERN.findall(open(p, encoding="utf-8").read()))

    os.makedirs(OUT, exist_ok=True)
    made = skipped = missing = 0
    keep = set()
    for rel in sorted(paths):
        src = os.path.join(ROOT, rel.lstrip("/"))
        if not os.path.exists(src):
            missing += 1
            continue
        name = thumb_name(rel)
        keep.add(name)
        dst = os.path.join(OUT, name)
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            skipped += 1
            continue
        try:
            im = Image.open(src).convert("RGB")
        except Exception as e:
            print("  salto", rel, e, file=sys.stderr)
            continue
        s = SIZE / min(im.width, im.height)
        im = im.resize((max(SIZE, round(im.width * s)), max(SIZE, round(im.height * s))), Image.LANCZOS)
        x, y = (im.width - SIZE) // 2, (im.height - SIZE) // 2
        im.crop((x, y, x + SIZE, y + SIZE)).save(dst, "WEBP", quality=72, method=6)
        made += 1

    # le miniature di foto non più usate non servono
    removed = 0
    for f in os.listdir(OUT):
        if f.endswith(".webp") and f not in keep:
            os.remove(os.path.join(OUT, f))
            removed += 1

    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"miniature: {made} nuove, {skipped} già a posto, {removed} tolte, "
          f"{missing} foto non trovate — {len(keep)} in tutto, {round(tot / 1024)} kB")


if __name__ == "__main__":
    main()
