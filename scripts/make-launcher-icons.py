#!/usr/bin/env python3
"""Genera los iconos launcher de Android de UroFármacos desde el maestro.

Uso:  python3 scripts/make-launcher-icons.py [ruta-al-maestro]

- Maestro: ~/workspace/urofarmacos/urofarmacos-icon-master.png
  (1024x1024, esquinas transparentes, círculo teal oscuro con
  ilustración blanca que llena casi todo el cuadro).
- Muestra el teal real del círculo (moda de los píxeles opacos no
  blancos) y lo usa como fondo.
- Adaptativo: el círculo se escala para caber en la zona segura de
  66 dp de 108 dp (264 px dentro del foreground de 432 px), para que
  ninguna máscara (círculo, squircle, gota) recorte la ilustración.
- Legacy: maestro escalado entero en las 5 densidades, igual para
  ic_launcher.png e ic_launcher_round.png.
- Actualiza values/ic_launcher_background.xml y
  drawable/ic_launcher_background.xml con el teal muestreado, y
  elimina drawable-v24/ic_launcher_foreground.xml (robot por
  defecto de Capacitor, sin referencias).

android/ NO viaja al repo: tras cada `npx cap add android` hay que
correr este script para recuperar el icono oficial (el `cap sync`
no borra los iconos, verificado 2026-11-17).
"""
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

MASTER = Path(sys.argv[1] if len(sys.argv) > 1 else
              Path.home() / "workspace/urofarmacos/urofarmacos-icon-master.png")
RES = Path(__file__).resolve().parent.parent / "android/app/src/main/res"

DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FG_SIZE = 432          # foreground adaptativo (108 dp a xxxhdpi)
FG_CIRCLE = 264        # círculo dentro del foreground (zona segura 66 dp)


def sample_teal(im):
    """Teal del círculo: color más frecuente entre los píxeles opacos no blancos."""
    px = im.convert("RGBA").getdata()
    counts = Counter(p for p in px if p[3] == 255 and p[:3] != (255, 255, 255))
    (r, g, b, _a), _count = counts.most_common(1)[0]
    return f"#{r:02X}{g:02X}{b:02X}"


def main():
    im = Image.open(MASTER).convert("RGBA")
    teal = sample_teal(im)
    print(f"teal muestreado: {teal}")

    # Bounding box del círculo (píxeles no transparentes).
    bbox = im.getchannel("A").getbbox()
    print(f"bbox del círculo: {bbox}")
    circle = im.crop(bbox)
    assert circle.width == circle.height, "el círculo debe ser cuadrado"

    # Foreground adaptativo: círculo a FG_CIRCLE px centrado en FG_SIZE px.
    fg = Image.new("RGBA", (FG_SIZE, FG_SIZE), (0, 0, 0, 0))
    small = circle.resize((FG_CIRCLE, FG_CIRCLE), Image.LANCZOS)
    off = (FG_SIZE - FG_CIRCLE) // 2
    fg.paste(small, (off, off), small)

    for d, size in DENSITIES.items():
        mipmap = RES / f"mipmap-{d}"
        mipmap.mkdir(parents=True, exist_ok=True)
        fg.save(mipmap / "ic_launcher_foreground.png")
        legacy = im.resize((size, size), Image.LANCZOS)
        legacy.save(mipmap / "ic_launcher.png")
        legacy.save(mipmap / "ic_launcher_round.png")
        print(f"mipmap-{d}: foreground 432, launcher/round {size}")

    (RES / "values/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{teal}</color>\n'
        "</resources>\n")
    (RES / "drawable/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<shape xmlns:android="http://schemas.android.com/apk/res/android" '
        'android:shape="rectangle">\n'
        f'    <solid android:color="{teal}" />\n'
        "</shape>\n")
    stale = RES / "drawable-v24/ic_launcher_foreground.xml"
    if stale.exists():
        stale.unlink()
        try:
            (RES / "drawable-v24").rmdir()
        except OSError:
            pass
    print("XML de fondo actualizados; vector por defecto eliminado si existía.")


if __name__ == "__main__":
    main()
