# -*- coding: utf-8 -*-
"""FRANK GOLF 店頭掲示用QRポスター（A4）の生成（#188）

出力: FRANK_GOLF_出店計画/FRANK_会員ポータルQR_A4.pdf
中身は会員ポータルのログインURLだけ＝誰が読み取っても同じで、会員番号も個人情報も持たない。
（会員ごとの自動ログインQRは作らない＝掲示物・写真から他人が入れてしまうため。ユーザー確定 2026-09-01）

体裁は既存の FRANK_打席QR_A4.pdf に合わせている（金の罫・FRANK GOLF・濃緑の見出し・QR・URL）。

使い方:
    pip install reportlab qrcode pillow
    python scripts/frank-qr-poster.py
"""
import os
import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "apps", "genesis", "src", "assets", "NotoSansJP-Regular.ttf")
OUT = os.path.join(ROOT, "FRANK_GOLF_出店計画", "FRANK_会員ポータルQR_A4.pdf")
URL = "https://my.frankgolf.jp/member/login"

pdfmetrics.registerFont(TTFont("NotoJP", FONT))

GOLD = (0.69, 0.55, 0.25)
GREEN = (0.12, 0.30, 0.20)
BLACK = (0.08, 0.08, 0.08)
GRAY = (0.45, 0.45, 0.45)
W, H = A4
MARGIN = 48


def center(c, text, size, y, color=BLACK, tracking=0.0):
    """A4の幅に必ず収める（入りきらなければ字を小さくする）"""
    if not text:
        return
    while size > 6:
        w = pdfmetrics.stringWidth(text, "NotoJP", size) + tracking * (len(text) - 1)
        if w <= W - MARGIN * 2:
            break
        size -= 0.5
    t = c.beginText((W - w) / 2, y)
    t.setFont("NotoJP", size)
    t.setCharSpace(tracking)  # 文字間はこの場で指定する（前の行の設定を引きずらせない）
    t.setFillColorRGB(*color)
    t.textOut(text)
    c.drawText(t)


def qr_image(data, box=20):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=box, border=0)
    q.add_data(data)
    q.make(fit=True)
    return q.make_image(fill_color="black", back_color="white").convert("RGB")


def page(c, title, sub, url, notes, foot_note=None):
    c.setStrokeColorRGB(*GOLD)
    c.setLineWidth(3)
    c.line(0, H - 10, W, H - 10)
    c.line(0, 10, W, 10)

    center(c, "FRANK GOLF", 17, H - 95, GOLD, tracking=6)
    center(c, title, 44, H - 165, GREEN)
    center(c, sub, 17, H - 205, BLACK)

    size = 290
    c.drawImage(ImageReader(qr_image(url)), (W - size) / 2, H - 240 - size, size, size)

    y = H - 240 - size - 46
    for text, sz, col in notes:
        center(c, text, sz, y, col)
        y -= sz + 12

    center(c, url, 11, 116, GRAY)
    if foot_note:
        center(c, foot_note, 10, 94, GRAY)


def main():
    c = canvas.Canvas(OUT, pagesize=A4)
    c.setTitle("FRANK GOLF 会員ページ QR（A4掲示用）")
    page(
        c,
        "会員ページ",
        "スマホで読み取ると、ログイン画面が開きます",
        URL,
        [
            ("ログインは 会員番号 と 電話番号の下4桁 だけ", 17, BLACK),
            ("打席のご予約・ご予約の確認・レッスンカルテ・ご注文まで", 13, BLACK),
            ("このページからご利用いただけます", 13, BLACK),
            ("", 4, BLACK),
            ("一度ログインすれば、次からは読み取るだけで開きます", 12, GRAY),
        ],
        foot_note="会員番号がお分かりにならない場合はスタッフまでお声がけください",
    )
    c.showPage()
    c.save()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
