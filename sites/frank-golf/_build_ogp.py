# -*- coding: utf-8 -*-
"""
FRANK GOLF — OGP画像 / favicon 生成
------------------------------------------------------------
公式LINE・SNSでURLを共有したときに表示される画像を作ります。
写真が用意でき次第、assets/ogp.png を撮影画像ベースのものに差し替えてください。

  実行: python _build_ogp.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets")

W, H = 1200, 630

INK = (16, 18, 16)
INK_TOP = (11, 13, 11)
TXT = (247, 243, 233)
BRASS = (201, 162, 76)
BRASS_2 = (227, 193, 119)
GREEN = (62, 142, 99)
DIM = (156, 151, 138)

FONT_JP = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_JP_R = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"


def font(path, size, index=0):
    for p in (path, path.replace("opentype", "truetype")):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=index)
            except Exception:
                pass
    # フォールバック（環境にNotoが無い場合）
    return ImageFont.load_default()


def vgrad(img, top, bottom):
    d = ImageDraw.Draw(img)
    for y in range(img.height):
        t = y / max(1, img.height - 1)
        d.line([(0, y), (img.width, y)],
               fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))


def radial(img, cx, cy, r, color, alpha):
    """ブラス／グリーンの光をふんわり乗せる"""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    steps = 60
    for i in range(steps, 0, -1):
        rr = r * i / steps
        a = int(alpha * (1 - i / steps) ** 2)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=color + (a,))
    img.alpha_composite(layer)


def vlines(img):
    """縦のライン。ImageDrawはアルファ合成せず画素を置換するので、必ず別レイヤで合成する
    （直接描くと convert('RGB') で明るい線として残る）"""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x in range(96, img.width, 96):
        d.line([(x, 96), (x, img.height - 96)], fill=(232, 226, 212, 16), width=1)
    img.alpha_composite(layer)


def build_ogp():
    img = Image.new("RGBA", (W, H), INK)
    vgrad(img, INK_TOP, INK)
    vlines(img)                                                 # 文字より先に敷く
    radial(img, int(W * 0.80), int(H * 0.20), 520, BRASS, 60)   # ラウンジの灯り
    radial(img, int(W * 0.10), int(H * 0.88), 460, GREEN, 46)   # 打席側の光

    d = ImageDraw.Draw(img)

    PAD = 78

    # ブランド（HIMEJIはロゴ実寸を測ってから右に置く）
    f_logo = font(FONT_JP, 34)
    d.text((PAD, 74), "FRANK GOLF", font=f_logo, fill=TXT)
    logo_w = d.textlength("FRANK GOLF", font=f_logo)
    f_sub = font(FONT_JP_R, 17)
    d.text((PAD + logo_w + 26, 84), "H I M E J I", font=f_sub, fill=BRASS)

    # 罫
    d.line([(PAD, 132), (PAD + 150, 132)], fill=BRASS, width=2)

    # メインコピー
    f1 = font(FONT_JP, 60)
    d.text((PAD, 178), "打って、教わって、語れる。", font=f1, fill=TXT)
    d.text((PAD, 258), "姫路・土山のフランクな", font=f1, fill=BRASS_2)
    d.text((PAD, 338), "ゴルフ基地。", font=f1, fill=BRASS_2)

    # サブ
    f2 = font(FONT_JP_R, 23)
    d.text((PAD, 436), "練習・レッスン・交流がひとつになった、", font=f2, fill=DIM)
    d.text((PAD, 472), "大人のための会員制インドアゴルフラウンジ。", font=f2, fill=DIM)

    # プレオープン帯
    by = H - 78
    d.rectangle([0, by, W, H], fill=(GREEN[0], GREEN[1], GREEN[2], 235))
    f3 = font(FONT_JP, 26)
    d.text((PAD, by + 24), "2026年9月2日  PRE-OPEN", font=f3, fill=(244, 251, 246))
    f4 = font(FONT_JP_R, 20)
    d.text((W - PAD - 190, by + 29), "兵庫県姫路市・土山", font=f4, fill=(220, 240, 228))

    img.convert("RGB").save(os.path.join(OUT, "ogp.png"), "PNG", optimize=True)
    print("  wrote assets/ogp.png (1200x630)")


def build_favicon():
    """ブラスの A を抜いたロゴマーク"""
    S = 512
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S, S], radius=96, fill=INK)
    radial(img, int(S * 0.72), int(S * 0.26), 300, BRASS, 60)
    d = ImageDraw.Draw(img)
    f = font(FONT_JP, 300)
    box = d.textbbox((0, 0), "F", font=f)
    d.text(((S - (box[2] - box[0])) / 2 - box[0], (S - (box[3] - box[1])) / 2 - box[1] - 10),
           "F", font=f, fill=TXT)
    # A の一画をブラスで重ねる代わりに、下部にブラスの罫
    d.rounded_rectangle([S * 0.30, S * 0.80, S * 0.70, S * 0.83], radius=4, fill=BRASS)
    img.save(os.path.join(OUT, "favicon.png"), "PNG", optimize=True)
    for size, name in ((180, "apple-touch-icon.png"), (32, "favicon-32.png")):
        img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), "PNG", optimize=True)
        print(f"  wrote assets/{name} ({size}x{size})")
    print("  wrote assets/favicon.png (512x512)")




def build_banner_wide():
    """Web用横長バナー（1200x420）"""
    w, h = 1200, 420
    img = Image.new("RGBA", (w, h), INK)
    vgrad(img, INK_TOP, INK)
    vlines(img)
    radial(img, int(w * 0.88), int(h * 0.28), 440, BRASS, 56)
    radial(img, int(w * 0.05), int(h * 0.92), 340, GREEN, 38)
    d = ImageDraw.Draw(img)
    PAD = 66
    # ロゴ（左上）
    f_logo = font(FONT_JP, 30)
    d.text((PAD, 44), "FRANK GOLF", font=f_logo, fill=TXT)
    lw = d.textlength("FRANK GOLF", font=f_logo)
    d.text((PAD + lw + 20, 54), "H I M E J I", font=font(FONT_JP_R, 15), fill=BRASS)
    # PRE-OPEN ピル（右上）
    f_pill = font(FONT_JP, 20)
    pill = "2026年9月2日  PRE-OPEN"
    pw = d.textlength(pill, font=f_pill)
    d.rounded_rectangle([w - PAD - pw - 44, 44, w - PAD, 44 + 42], radius=21,
                        fill=(GREEN[0], GREEN[1], GREEN[2], 235))
    d.text((w - PAD - pw - 22, 51), pill, font=f_pill, fill=(244, 251, 246))
    # メインコピー
    d.text((PAD, 148), "打って、教わって、語れる。", font=font(FONT_JP, 50), fill=TXT)
    d.text((PAD, 220), "姫路・土山のフランクなゴルフ基地。", font=font(FONT_JP, 38), fill=BRASS_2)
    # サブ
    d.text((PAD, 292), "練習・レッスン・交流がひとつになった、大人の会員制インドアゴルフラウンジ。",
           font=font(FONT_JP_R, 20), fill=DIM)
    # CTA風ピル
    f_cta = font(FONT_JP, 20)
    cta = "体験予約・公式LINE 受付中"
    cw = d.textlength(cta, font=f_cta)
    d.rounded_rectangle([PAD, 338, PAD + cw + 44, 338 + 44], radius=22, outline=BRASS, width=2)
    d.text((PAD + 22, 346), cta, font=f_cta, fill=BRASS_2)
    img.convert("RGB").save(os.path.join(OUT, "banner-wide.jpg"), "JPEG", quality=86, optimize=True)
    print("  wrote assets/banner-wide.jpg (1200x420)")


def build_banner_square():
    """Instagram等の正方形バナー（1080x1080）"""
    w, h = 1080, 1080
    img = Image.new("RGBA", (w, h), INK)
    vgrad(img, INK_TOP, INK)
    vlines(img)
    radial(img, int(w * 0.5), int(h * 0.18), 640, BRASS, 56)
    radial(img, int(w * 0.15), int(h * 0.9), 460, GREEN, 40)
    d = ImageDraw.Draw(img)

    def ctext(y, txt, fnt, fill):
        d.text(((w - d.textlength(txt, font=fnt)) / 2, y), txt, font=fnt, fill=fill)

    ctext(150, "FRANK GOLF", font(FONT_JP, 46), TXT)
    ctext(214, "H I M E J I ／ 姫路・土山", font(FONT_JP_R, 22), BRASS)
    d.line([(w/2 - 60, 288), (w/2 + 60, 288)], fill=BRASS, width=2)
    ctext(360, "打って、", font(FONT_JP, 68), TXT)
    ctext(452, "教わって、", font(FONT_JP, 68), TXT)
    ctext(544, "語れる。", font(FONT_JP, 68), BRASS_2)
    ctext(690, "練習・レッスン・交流がひとつになった、", font(FONT_JP_R, 24), DIM)
    ctext(728, "大人の会員制インドアゴルフラウンジ。", font(FONT_JP_R, 24), DIM)
    # PRE-OPEN 帯
    d.rounded_rectangle([w/2 - 250, 850, w/2 + 250, 936], radius=43,
                        fill=(GREEN[0], GREEN[1], GREEN[2], 235))
    ctext(872, "2026年9月2日  PRE-OPEN", font(FONT_JP, 30), (244, 251, 246))
    ctext(984, "体験予約・公式LINEにて受付中", font(FONT_JP_R, 22), BRASS_2)
    img.convert("RGB").save(os.path.join(OUT, "banner-square.jpg"), "JPEG", quality=86, optimize=True)
    print("  wrote assets/banner-square.jpg (1080x1080)")


def build_banner_line():
    """LINEリッチメニュー用（2500x843）"""
    w, h = 2500, 843
    img = Image.new("RGBA", (w, h), INK)
    vgrad(img, INK_TOP, INK)
    vlines(img)
    radial(img, int(w * 0.82), int(h * 0.3), 900, BRASS, 56)
    radial(img, int(w * 0.08), int(h * 0.85), 640, GREEN, 42)
    d = ImageDraw.Draw(img)
    PAD = 150
    f_logo = font(FONT_JP, 58)
    d.text((PAD, 120), "FRANK GOLF", font=f_logo, fill=TXT)
    d.text((PAD + d.textlength("FRANK GOLF", font=f_logo) + 40, 148),
           "H I M E J I", font=font(FONT_JP_R, 30), fill=BRASS)
    d.text((PAD, 300), "打って、教わって、語れる。", font=font(FONT_JP, 104), fill=TXT)
    d.text((PAD, 448), "姫路・土山のフランクなゴルフ基地。", font=font(FONT_JP, 74), fill=BRASS_2)
    pill = "2026年9月2日  PRE-OPEN"
    fp = font(FONT_JP, 44)
    pw = d.textlength(pill, font=fp)
    d.rounded_rectangle([PAD, 600, PAD + pw + 88, 600 + 92], radius=46,
                        fill=(GREEN[0], GREEN[1], GREEN[2], 235))
    d.text((PAD + 44, 618), pill, font=fp, fill=(244, 251, 246))
    img.convert("RGB").save(os.path.join(OUT, "banner-line.jpg"), "JPEG", quality=84, optimize=True)
    print("  wrote assets/banner-line.jpg (2500x843)")


if __name__ == "__main__":
    print("FRANK GOLF ogp/favicon/banner build")
    build_ogp()
    build_favicon()
    build_banner_wide()
    build_banner_square()
    build_banner_line()
    print("done.")
