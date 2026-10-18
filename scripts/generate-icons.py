"""Generate the original RGBA launcher and control icons (standard library only)."""
from pathlib import Path
import math
import struct
import zlib

OUTPUT = Path(__file__).resolve().parents[1] / 'src/common/icons'
COLORS = {'dark': (34, 34, 34), 'muted': (139, 139, 139)}
ACCENTS = {'mint': (110, 231, 183), 'blue': (125, 211, 252),
           'violet': (196, 181, 253), 'amber': (252, 211, 77)}


def line(x1, y1, x2, y2, width=1.8):
    def hit(x, y):
        length = (x2 - x1) ** 2 + (y2 - y1) ** 2
        t = max(0, min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / length))
        return (x - x1 - t * (x2 - x1)) ** 2 + (y - y1 - t * (y2 - y1)) ** 2 <= (width / 2) ** 2
    return hit


def polygon(points):
    def hit(x, y):
        inside = False
        previous = points[-1]
        for current in points:
            ax, ay = previous
            bx, by = current
            if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                inside = not inside
            previous = current
        return inside
    return hit


def circle(cx, cy, radius, width=1.8):
    return lambda x, y: abs(math.hypot(x - cx, y - cy) - radius) <= width / 2


SHAPES = {
    'play': [polygon([(10, 6), (27, 16), (10, 26)])],
    'stop': [polygon([(8, 8), (24, 8), (24, 24), (8, 24)])],
    'vibration': [
        line(11, 7, 21, 7), line(21, 7, 21, 25), line(21, 25, 11, 25), line(11, 25, 11, 7),
        line(7, 10, 5, 13), line(5, 13, 7, 16), line(7, 16, 5, 19), line(5, 19, 7, 22),
        line(25, 10, 27, 13), line(27, 13, 25, 16), line(25, 16, 27, 19), line(27, 19, 25, 22)
    ],
    # A crescent moon for foreground dark mode, using the same 32-unit canvas.
    'dark': [lambda x, y: (x - 16) ** 2 + (y - 16) ** 2 <= 10 ** 2
             and (x - 21) ** 2 + (y - 11) ** 2 >= 9 ** 2],
    'flash': [circle(16, 16, 5)] + [
        line(16 + 9 * math.cos(i * math.pi / 4), 16 + 9 * math.sin(i * math.pi / 4),
             16 + 13 * math.cos(i * math.pi / 4), 16 + 13 * math.sin(i * math.pi / 4))
        for i in range(8)
    ]
}


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def render(name, shapes, color):
    size = 64
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            hits = sum(any(shape((x + (sx + 0.5) / 3) / 2, (y + (sy + 0.5) / 3) / 2)
                           for shape in shapes) for sx in range(3) for sy in range(3))
            row.extend((*color, round(255 * hits / 9)))
        rows.append(b'\0' + row)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
    (OUTPUT / (name + '.png')).write_bytes(png)


def render_app_icon():
    # Preserve the original badge and bars exactly; the exterior is real alpha,
    # not a dark square painted to resemble a particular launcher background.
    size = 192
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            inside = (x - 96) ** 2 + (y - 96) ** 2 < 78 ** 2
            color = (41, 52, 61, 255) if inside else (0, 0, 0, 0)
            if (((52 <= x < 70 or 122 <= x < 140) and 73 <= y < 119)
                    or (87 <= x < 105 and 48 <= y < 144)):
                color = (112, 224, 189, 255)
            row.extend(color)
        rows.append(b'\0' + row)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
    (OUTPUT.parent / 'icon.png').write_bytes(png)


OUTPUT.mkdir(parents=True, exist_ok=True)
render_app_icon()
for icon in ('play', 'stop'):
    render(icon + '-dark', SHAPES[icon], COLORS['dark'])
for icon in ('vibration', 'dark', 'flash'):
    for theme, color in ACCENTS.items():
        render(icon + '-' + theme, SHAPES[icon], color)
    render(icon + '-off', SHAPES[icon] + [line(5, 27, 27, 5, 2.2)], COLORS['muted'])
print('Generated transparent launcher icon and seventeen control icons in', OUTPUT.parent)
