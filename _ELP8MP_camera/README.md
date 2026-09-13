# ELP-USB8MP02G-SFV セットアップメモ

## ドライバーは不要です
本機は **UVC (USB Video Class) 準拠のフリードライバ機**。
Windows 10 / 11 に標準搭載の `usbvideo.sys` が自動で当たるため、
メーカー配布のドライバーは存在しません（ELP 公式も "Support free driver: USB Video Class(UVC)" と明記）。

USB に挿す → デバイスマネージャーの「カメラ」に
`USB Camera` / `HD USB Camera` として現れれば準備完了です。

うまく認識しない場合の切り分け:
- USB 2.0 High Speed を使い切る機種なので、**USB ハブ経由ではなく PC 本体のポート**に直挿しする
- 消費電流 5V / 180〜240mA。バスパワー不足のハブだと不安定になる
- 設定 → プライバシーとセキュリティ → カメラ で「デスクトップアプリがカメラにアクセスできるようにする」を ON

## 同梱ファイル
| ファイル | 用途 |
|---|---|
| `AMCap.exe` | UVCカメラ動作確認ソフト。インストール不要、ダブルクリックで起動。Devices で `USB Camera` を選び、Options → Video Capture Pin で解像度を選択 |
| `camera_test.py` | OpenCV で 3264x2448 を開いて静止画保存する確認スクリプト |

### camera_test.py の使い方
```
pip install opencv-python
python camera_test.py --list     # カメラ番号を調べる
python camera_test.py            # 3264x2448 @15fps で開く
python camera_test.py --index 1 --width 1920 --height 1080 --fps 30
```
`s` キーで静止画保存、`q` キーで終了。

## 対応モード (MJPEG)
| 解像度 | fps |
|---|---|
| 3264x2448 | 15 |
| 2592x1944 | 20 |
| 2048x1536 | 20 |
| 1600x1200 | 20 |
| 1280x960 | 20 |
| 1024x768 | 30 |
| 800x600 | 30 |
| 640x480 | 30 |

※ 高解像度で fps を出すには **必ず MJPEG を指定**すること。YUY2 のままだと USB 2.0 の帯域で数 fps まで落ちます。
※ レンズは 2.8-12mm(または 5-50mm) バリフォーカル CS マウント。**ピントと画角は本体のリングを手で回して調整**します（電動ズームではありません）。

## 出典
- ELP 製品ページ: http://www.elpcctv.com/-p-248.html
- ELP ダウンロード一覧: https://elpcctv.com/downloads.html
- AMCap 配布元: https://www.arducam.com/downloads/app/AMCap.exe
