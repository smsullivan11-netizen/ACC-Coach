"""The team mascot as the app's logo (Store listing, Start menu tiles, program icon). The full mascot
from web/public/team-logo.jpg (512 px, black background) at large sizes; under 64 px the helmet
(team-helmet.jpg) so it stays readable. The tray icon keeps make_icon (it shows the recording dot).
"""
from pathlib import Path

from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parents[2] / "web" / "public"
BLACK = (0, 0, 0, 255)


def make_logo(size: int, rounded: bool = False):
    src = Image.open(PUBLIC / ("team-logo.jpg" if size >= 64 else "team-helmet.jpg")).convert("RGBA")
    img = src.resize((size, size), Image.LANCZOS)
    if rounded:                                     # small icons: rounded corners, transparent outside
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=max(2, size // 6), fill=255)
        img.putalpha(mask)
    return img


TAGLINE = "Faster, together."


def _font(names, size):
    from PIL import ImageFont
    for name in names:   # Windows fonts (Bahnschrift: condensed, close to the site's racing look)
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


def make_poster(w: int = 1440, h: int = 2160):
    """2:3 poster: the mascot on black, the app name and the tagline beneath, the team's red and
    yellow as a bar at the bottom."""
    img = Image.new("RGBA", (w, h), BLACK)
    img.paste(make_logo(w), (0, h // 40))
    d = ImageDraw.Draw(img)
    bar = h // 40
    title = _font(["bahnschrift.ttf", "ariblk.ttf", "arialbd.ttf"], w // 7)
    if hasattr(title, "set_variation_by_name"):
        try:
            title.set_variation_by_name("Bold Condensed")
        except (OSError, ValueError):
            pass
    tag = _font(["bahnschrift.ttf", "arial.ttf"], w // 18)
    text_y = h // 40 + w + (h - 2 * bar - w - h // 40) // 2
    d.text((w / 2, text_y - w // 22), "ACC COACH", fill="#ffffff", font=title, anchor="mm")
    d.rectangle((w // 2 - w // 10, text_y + w // 32, w // 2 + w // 10, text_y + w // 32 + 8), fill="#e10600")
    d.text((w / 2, text_y + w // 9), TAGLINE, fill="#ffd200", font=tag, anchor="mm")
    d.rectangle((0, h - 2 * bar, w, h - bar), fill="#e10600")
    d.rectangle((0, h - bar, w, h), fill="#ffd200")
    return img
