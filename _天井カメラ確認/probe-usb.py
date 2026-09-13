# -*- coding: utf-8 -*-
"""
VID_03C3 のカメラに WinUSB を当てた後で実行する調査スクリプト。
やること:
  1. デスクリプタ一式（コンフィグ・インタフェース・エンドポイント）を出す
  2. Cypress EZ-USB(FX2/FX3) のベンダーコマンド 0xA0 に反応するか試す
  3. 反応したら EEPROM(0xA2) の先頭も読んでみる
結果は result-probe.txt に書き出す。
"""
import sys, io, os, traceback

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "result-probe.txt")
buf = io.StringIO()
def W(*a):
    print(*a)
    print(*a, file=buf)

try:
    import usb.core, usb.util
except Exception:
    W("pyusb が入っていません。 pip install pyusb libusb を実行してください。")
    open(OUT, "w", encoding="utf-8").write(buf.getvalue()); sys.exit(1)

VID = 0x03C3
found = list(usb.core.find(find_all=True, idVendor=VID))
W("=== VID_03C3 devices found: %d ===" % len(found))
if not found:
    W("見つかりません。WinUSB がまだ当たっていないか、カメラが繋がっていません。")
    open(OUT, "w", encoding="utf-8").write(buf.getvalue()); sys.exit(1)

for dev in found:
    W("")
    W("#" * 60)
    W("idVendor=0x%04X  idProduct=0x%04X  bcdDevice=0x%04X" % (dev.idVendor, dev.idProduct, dev.bcdDevice))
    W("bus=%s address=%s  bDeviceClass=0x%02X  bMaxPacketSize0=%s" %
      (dev.bus, dev.address, dev.bDeviceClass, dev.bMaxPacketSize0))
    W("bcdUSB=0x%04X  speed=%s" % (dev.bcdUSB, getattr(dev, "speed", "?")))
    for attr in ("iManufacturer", "iProduct", "iSerialNumber"):
        idx = getattr(dev, attr)
        s = None
        if idx:
            try: s = usb.util.get_string(dev, idx)
            except Exception as e: s = "(read error: %s)" % e
        W("  %s index=%s value=%r" % (attr, idx, s))

    W("  --- configurations ---")
    try:
        for cfg in dev:
            W("  cfg %d: bNumInterfaces=%d  MaxPower=%dmA" % (cfg.bConfigurationValue, cfg.bNumInterfaces, cfg.bMaxPower * 2))
            for intf in cfg:
                W("    intf %d alt %d  class=0x%02X sub=0x%02X proto=0x%02X" %
                  (intf.bInterfaceNumber, intf.bAlternateSetting,
                   intf.bInterfaceClass, intf.bInterfaceSubClass, intf.bInterfaceProtocol))
                for ep in intf:
                    t = usb.util.endpoint_type(ep.bmAttributes)
                    d = "IN " if usb.util.endpoint_direction(ep.bEndpointAddress) == usb.util.ENDPOINT_IN else "OUT"
                    tn = {0: "CONTROL", 1: "ISO", 2: "BULK", 3: "INTERRUPT"}.get(t, str(t))
                    W("      ep 0x%02X %s %-9s wMaxPacketSize=%d interval=%d" %
                      (ep.bEndpointAddress, d, tn, ep.wMaxPacketSize, ep.bInterval))
    except Exception as e:
        W("  (config 読み取りエラー: %s)" % e)

    W("  --- Cypress EZ-USB test: vendor 0xA0 read RAM 0xE600 (CPUCS) ---")
    try:
        r = dev.ctrl_transfer(0xC0, 0xA0, 0xE600, 0x0000, 1, 3000)
        W("    OK -> %s   ★EZ-USB(FX2/FX3)系の可能性が高い" % list(r))
    except Exception as e:
        W("    NG -> %s" % e)

    W("  --- vendor 0xA2 read (EEPROM) first 32 bytes ---")
    try:
        r = dev.ctrl_transfer(0xC0, 0xA2, 0x0000, 0x0000, 32, 3000)
        W("    OK -> %s" % " ".join("%02X" % b for b in r))
    except Exception as e:
        W("    NG -> %s" % e)

    W("  --- vendor 0xA1 / 0xB0 probe (参考) ---")
    for req in (0xA1, 0xB0, 0xB1):
        try:
            r = dev.ctrl_transfer(0xC0, req, 0x0000, 0x0000, 8, 1000)
            W("    0x%02X OK -> %s" % (req, " ".join("%02X" % b for b in r)))
        except Exception as e:
            W("    0x%02X NG -> %s" % (req, type(e).__name__))

open(OUT, "w", encoding="utf-8").write(buf.getvalue())
W("")
W("DONE -> " + OUT)
