"""Regenerates the app icons and the bell sound.

Run from the repository root (needs `pip install pillow`):

    python3 scripts/generate-assets.py

The files it writes are committed, so you only need this to change the design.
For a hand-drawn icon, replace apps/desktop/app-icon.png and run
`pnpm --filter desktop tauri icon app-icon.png` instead.
"""

import math
import struct
import wave
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DESKTOP = ROOT / "apps" / "desktop"
ICONS = DESKTOP / "src-tauri" / "icons"
ASSETS = DESKTOP / "src-tauri" / "assets"

BACKGROUND = (246, 193, 119, 255)  # warm amber
GLYPH = (58, 46, 42, 255)  # dark brown


def bell_mask(size: int) -> Image.Image:
    """A bell silhouette drawn in a unit square, white on black."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)

    def p(value: float) -> float:
        return value * size

    draw.ellipse([p(0.455), p(0.09), p(0.545), p(0.18)], fill=255)  # knob
    draw.ellipse([p(0.27), p(0.15), p(0.73), p(0.62)], fill=255)  # dome
    draw.polygon(
        [(p(0.27), p(0.38)), (p(0.73), p(0.38)), (p(0.85), p(0.71)), (p(0.15), p(0.71))],
        fill=255,
    )  # flared body
    draw.rounded_rectangle([p(0.11), p(0.69), p(0.89), p(0.77)], radius=p(0.04), fill=255)  # rim
    draw.ellipse([p(0.42), p(0.78), p(0.58), p(0.93)], fill=255)  # clapper
    return mask


def app_icon(size: int = 1024) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    plate = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(plate).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * 0.225), fill=BACKGROUND
    )
    image.alpha_composite(plate)

    glyph_size = int(size * 0.62)
    mask = bell_mask(glyph_size * 2).resize((glyph_size, glyph_size), Image.LANCZOS)
    glyph = Image.new("RGBA", (glyph_size, glyph_size), GLYPH)
    glyph.putalpha(mask)
    image.alpha_composite(glyph, ((size - glyph_size) // 2, (size - glyph_size) // 2 - int(size * 0.01)))
    return image


def tray_icon() -> Image.Image:
    """Black on transparent: macOS treats it as a template and recolors it."""
    mask = bell_mask(640).resize((40, 40), Image.LANCZOS)
    glyph = Image.new("RGBA", (40, 40), (0, 0, 0, 255))
    glyph.putalpha(mask)
    image = Image.new("RGBA", (44, 44), (0, 0, 0, 0))
    image.alpha_composite(glyph, (2, 2))
    return image


def write_icons() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    base = app_icon(1024)
    base.save(DESKTOP / "app-icon.png")
    for name, size in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512)]:
        base.resize((size, size), Image.LANCZOS).save(ICONS / name)
    base.save(
        ICONS / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    base.save(ICONS / "icon.icns", format="ICNS")
    tray_icon().save(ICONS / "tray.png")


def write_bell(path: Path) -> None:
    """A soft struck-bell sound: a few inharmonic partials that fade at different speeds."""
    rate = 44100
    seconds = 3.6
    base_hz = 660.0
    # (frequency ratio, loudness, decay per second)
    partials = [(1.0, 1.0, 1.1), (2.76, 0.45, 1.8), (5.40, 0.25, 2.6), (8.93, 0.12, 3.8)]

    frames = bytearray()
    for i in range(int(rate * seconds)):
        t = i / rate
        sample = sum(
            loudness * math.sin(2 * math.pi * base_hz * ratio * t) * math.exp(-decay * t)
            for ratio, loudness, decay in partials
        )
        sample *= min(1.0, t / 0.004)  # 4 ms attack avoids a click
        remaining = seconds - t
        if remaining < 0.2:
            sample *= remaining / 0.2  # fade to silence at the very end
        value = max(-1.0, min(1.0, sample * 0.35))
        frames += struct.pack("<h", int(value * 32767))

    ASSETS.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(bytes(frames))


if __name__ == "__main__":
    write_icons()
    write_bell(ASSETS / "bell.wav")
    print("Wrote icons to", ICONS)
    print("Wrote bell sound to", ASSETS / "bell.wav")
