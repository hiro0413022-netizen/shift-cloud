# -*- coding: utf-8 -*-
"""
FRANK GOLF — サンプル画像生成（実写差し替え前提）
------------------------------------------------------------
存在しない施設の実写を捏造すると誤認・MEO上のリスクになるため、
ここではブランドトーンの「抽象アトモスフィア画像」をサンプルとして生成します。
本番では assets/img/ の各ファイルを実写に差し替えてください（同じファイル名で上書きすればOK）。

  実行: python _build_images.py
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets", "img")
os.makedirs(OUT, exist_ok=True)

INK      = (16, 18, 16)
INK_DEEP = (9, 11, 9)
TXT      = (247, 243, 233)
BRASS    = (201, 162, 76)
BRASS_2  = (227, 193, 119)
GREEN    = (62, 142, 99)
GREEN_D  = (30, 62, 44)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def base(w, h, top, bottom):
    img = Image.new("RGB", (w, h), top)
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bottom, y / max(1, h - 1)))
    return img


def glow(img, cx, cy, r, color, alpha):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    steps = 48
    for i in range(steps, 0, -1):
        rr = r * i / steps
        a = int(alpha * (1 - i / steps) ** 2)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=color + (a,))
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))


def bokeh(img, n, seed, palette, region=None, rmin=0.010, rmax=0.038, amax=26, blur=6):
    """ラウンジの間接照明のような玉ボケ（小さめ・柔らかめ）。region=(x0,y0,x1,y1)割合で範囲限定"""
    random.seed(seed)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w, h = img.size
    rx0, ry0, rx1, ry1 = region or (0.0, 0.0, 1.0, 1.0)
    for _ in range(n):
        r = random.randint(int(w * rmin), int(w * rmax))
        x = random.randint(int(w * rx0), int(w * rx1))
        y = random.randint(int(h * ry0), int(h * ry1))
        c = random.choice(palette)
        a = random.randint(8, amax)
        # リング状（フォトリアルな玉ボケ）
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (max(4, a - 8),))
        d.ellipse([x - r, y - r, x + r, y + r], outline=c + (a,), width=max(1, r // 10))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))


def grain(img, amount=6, seed=1):
    random.seed(seed)
    w, h = img.size
    noise = Image.new("L", (w, h))
    noise.putdata([random.randint(128 - amount, 128 + amount) for _ in range(w * h)])
    noise = noise.resize((w // 2, h // 2)).resize((w, h))
    img.paste(Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.05), (0, 0))


def vignette(img, strength=0.55):
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([-w * 0.25, -h * 0.25, w * 1.25, h * 1.25], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(w * 0.12))
    dark = Image.new("RGB", (w, h), (0, 0, 0))
    img.paste(Image.composite(img, dark, mask.point(lambda p: int(255 - (255 - p) * strength))), (0, 0))


def dimples(d, cx, cy, r, color, alpha, rows=7):
    """ゴルフボールのディンプル模様（抽象）"""
    layer = Image.new("RGBA", (1, 1))  # placeholder
    for i in range(rows):
        for j in range(rows):
            ang = (i / rows) * math.pi
            rad = r * (j / rows)
            x = cx + rad * math.cos(i * 0.9 + j)
            y = cy + rad * math.sin(i * 0.9 + j) * 0.6
            rr = max(2, r * 0.045 * (1 - j / rows))
            d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=color + (alpha,), width=1)


def vlines(img, gap, color, alpha):
    """打席の光を抽象化した縦ライン"""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x in range(gap, img.size[0], gap):
        d.line([(x, 0), (x, img.size[1])], fill=color + (alpha,), width=1)
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))


def save(img, name):
    img.save(os.path.join(OUT, name), "JPEG", quality=82, optimize=True, progressive=True)
    print(f"  wrote assets/img/{name} ({img.size[0]}x{img.size[1]})")


# ---------------- HERO（メインビジュアル背景） ----------------
def hero():
    w, h = 1920, 1200
    img = base(w, h, (7, 9, 8), INK)
    vlines(img, 128, (232, 226, 212), 6)
    glow(img, int(w * 0.82), int(h * 0.20), 680, BRASS, 58)
    glow(img, int(w * 0.10), int(h * 0.90), 600, GREEN, 40)
    # 玉ボケは右上の光源まわりに少数だけ
    bokeh(img, 12, 7, [BRASS_2, BRASS], region=(0.55, 0.0, 1.0, 0.55), amax=20, blur=7)
    vignette(img, 0.62)
    grain(img)
    save(img, "hero.jpg")


# ---------------- PLAY（打席・練習） ----------------
def play():
    w, h = 1280, 900
    img = base(w, h, INK, (7, 10, 8))
    glow(img, int(w * 0.5), int(h * 0.12), 560, BRASS, 42)
    glow(img, int(w * 0.5), int(h * 0.92), 720, GREEN, 40)   # ターフの緑
    vlines(img, 78, (232, 226, 212), 12)
    d = ImageDraw.Draw(img, "RGBA")
    # 打席マットのパースライン
    for i in range(6):
        y = int(h * (0.5 + i * 0.085))
        d.line([(int(w*0.15), y), (int(w*0.85), y - 18)], fill=GREEN + (26,), width=2)
    # ボール（大きめ・スポットライト）
    cx, cy, r = int(w*0.5), int(h*0.52), 78
    glow(img, cx, cy, 200, (255, 250, 235), 40)
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(238, 234, 224, 235))
    d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=(255,255,255,120), width=2)
    dimples(d, cx, cy, r*0.9, (120, 120, 115), 150, rows=6)
    # ティー
    d.line([(cx, cy+r-6), (cx, cy+r+40)], fill=(200, 180, 140, 130), width=5)
    vignette(img, 0.52); grain(img, seed=2)
    save(img, "play.jpg")


# ---------------- LESSON（レッスン・データ） ----------------
def lesson():
    w, h = 1280, 900
    img = base(w, h, INK, INK_DEEP)
    glow(img, int(w * 0.3), int(h * 0.3), 520, GREEN, 50)
    glow(img, int(w * 0.8), int(h * 0.7), 420, BRASS, 34)
    d = ImageDraw.Draw(img, "RGBA")
    # スイング解析のグラフ風ライン
    pts = [(int(w * x / 12), int(h * (0.6 - 0.28 * math.sin(x * 0.7)))) for x in range(13)]
    d.line(pts, fill=BRASS_2 + (150,), width=3, joint="curve")
    for x, y in pts:
        d.ellipse([x-4, y-4, x+4, y+4], fill=BRASS_2 + (200,))
    # 数値グリッド
    for gy in range(int(h*0.2), int(h*0.85), 60):
        d.line([(0, gy), (w, gy)], fill=(232, 226, 212, 12), width=1)
    vignette(img, 0.5); grain(img, seed=3)
    save(img, "lesson.jpg")


# ---------------- LOUNGE（バー・ラウンジ） ----------------
def lounge():
    w, h = 1280, 900
    img = base(w, h, (20, 16, 12), INK_DEEP)  # 少し暖色
    glow(img, int(w * 0.7), int(h * 0.3), 560, BRASS_2, 66)
    glow(img, int(w * 0.2), int(h * 0.8), 420, BRASS, 40)
    bokeh(img, 18, 11, [BRASS_2, BRASS, (255, 220, 150)], amax=24, blur=6)
    d = ImageDraw.Draw(img, "RGBA")
    # カウンターのライン
    d.line([(0, int(h*0.72)), (w, int(h*0.66))], fill=BRASS + (70,), width=3)
    # グラス2つのシルエット
    for cx in (int(w*0.42), int(w*0.56)):
        d.polygon([(cx-24, int(h*0.5)), (cx+24, int(h*0.5)), (cx+12, int(h*0.66)), (cx-12, int(h*0.66))],
                  outline=BRASS_2 + (120,))
    vignette(img, 0.5); grain(img, seed=4)
    save(img, "lounge.jpg")


# ---------------- COMMUNITY（交流・コンペ） ----------------
def community():
    w, h = 1280, 900
    img = base(w, h, INK, INK_DEEP)
    glow(img, int(w * 0.5), int(h * 0.4), 560, GREEN, 52)
    glow(img, int(w * 0.85), int(h * 0.2), 360, BRASS, 34)
    d = ImageDraw.Draw(img, "RGBA")
    # フラッグ（グリーンのピン）
    fx, fy = int(w*0.5), int(h*0.3)
    d.line([(fx, fy), (fx, int(h*0.72))], fill=TXT + (160,), width=3)
    d.polygon([(fx, fy), (fx+70, fy+16), (fx, fy+32)], fill=BRASS_2 + (200,))
    d.ellipse([fx-90, int(h*0.68), fx+90, int(h*0.78)], outline=GREEN + (120,), width=2)
    bokeh(img, 10, 15, [GREEN, BRASS], amax=20, blur=6)
    vignette(img, 0.5); grain(img, seed=5)
    save(img, "community.jpg")


# ---------------- CONCEPT（コンセプト帯） ----------------
def concept():
    w, h = 1280, 720
    img = base(w, h, INK_DEEP, INK)
    vlines(img, 110, (232, 226, 212), 8)
    glow(img, int(w * 0.75), int(h * 0.3), 520, BRASS, 56)
    glow(img, int(w * 0.2), int(h * 0.8), 420, GREEN, 42)
    bokeh(img, 12, 21, [BRASS_2, GREEN], amax=20, blur=7)
    vignette(img, 0.5); grain(img, seed=6)
    save(img, "concept.jpg")


if __name__ == "__main__":
    print("FRANK GOLF sample images")
    hero(); play(); lesson(); lounge(); community(); concept()
    print("done.")
