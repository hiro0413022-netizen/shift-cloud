# -*- coding: utf-8 -*-
"""
ELP-USB8MP02G-SFV (Sony IMX179 / 8MP UVC) 動作確認スクリプト
------------------------------------------------------------
ドライバーのインストールは不要（Windows 標準の UVC ドライバで動作）。

使い方:
    pip install opencv-python
    python camera_test.py            # 既定 3264x2448 @15fps
    python camera_test.py --index 1  # 別のカメラを使う
    python camera_test.py --list     # 接続中のカメラ番号を探す

キー操作:
    s : 静止画を保存 (shot_YYYYmmdd_HHMMSS.jpg)
    q : 終了
"""
import argparse
import datetime
import os
import sys

import cv2

# ELP-USB8MP02G-SFV がサポートする解像度 (MJPEG)
MODES = [
    (3264, 2448, 15),
    (2592, 1944, 20),
    (2048, 1536, 20),
    (1600, 1200, 20),
    (1280, 960, 20),
    (1024, 768, 30),
    (800, 600, 30),
    (640, 480, 30),
]


def list_cameras(max_index=8):
    print("接続中のカメラを検索します...")
    for i in range(max_index):
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
        if cap.isOpened():
            ok, frame = cap.read()
            if ok:
                h, w = frame.shape[:2]
                print(f"  index={i}  取得OK  {w}x{h}")
            else:
                print(f"  index={i}  開けたが映像なし")
            cap.release()
    print("完了。--index で番号を指定してください。")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", type=int, default=0, help="カメラ番号 (既定 0)")
    ap.add_argument("--width", type=int, default=3264)
    ap.add_argument("--height", type=int, default=2448)
    ap.add_argument("--fps", type=int, default=15)
    ap.add_argument("--list", action="store_true", help="カメラ番号を一覧表示して終了")
    args = ap.parse_args()

    if args.list:
        list_cameras()
        return 0

    # Windows は DirectShow 指定が安定
    cap = cv2.VideoCapture(args.index, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print(f"カメラ index={args.index} を開けませんでした。--list で番号を確認してください。")
        return 1

    # MJPEG を先に指定しないと高解像度でフレームレートが出ない
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    cap.set(cv2.CAP_PROP_FPS, args.fps)

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"実際の設定: {w}x{h} @ {fps:.1f}fps")
    if (w, h) != (args.width, args.height):
        print("※ 要求した解像度と違います。対応モード:")
        for mw, mh, mf in MODES:
            print(f"   {mw}x{mh} @ {mf}fps")

    out_dir = os.path.dirname(os.path.abspath(__file__))
    cv2.namedWindow("ELP 8MP  (s=保存 / q=終了)", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("ELP 8MP  (s=保存 / q=終了)", 1280, 960)

    while True:
        ok, frame = cap.read()
        if not ok:
            print("フレームを取得できませんでした。")
            break
        cv2.imshow("ELP 8MP  (s=保存 / q=終了)", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("s"):
            name = datetime.datetime.now().strftime("shot_%Y%m%d_%H%M%S.jpg")
            path = os.path.join(out_dir, name)
            cv2.imwrite(path, frame)
            print(f"保存: {path}")

    cap.release()
    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    sys.exit(main())
