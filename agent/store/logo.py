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


def make_poster(w: int = 1440, h: int = 2160):
    """2:3 poster: the mascot on black, the team's red and yellow as a bar at the bottom."""
    img = Image.new("RGBA", (w, h), BLACK)
    logo = make_logo(w)
    img.paste(logo, (0, (h - w) // 2 - h // 20))
    d = ImageDraw.Draw(img)
    bar = h // 40
    d.rectangle((0, h - 2 * bar, w, h - bar), fill="#e10600")
    d.rectangle((0, h - bar, w, h), fill="#ffd200")
    return img
