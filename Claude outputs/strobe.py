# 4連 赤外ストロボ  —  Raspberry Pi Pico 2 (RP2350) / MicroPython
#
# ねらい：1枚の写真の露光中に、赤外LEDを既知の間隔で4回光らせる。
#         これで 90fps のカメラから、実質 2,600fps 相当の時間分解能を得る。
#
# 設計の要：**時間を CPU に触らせない。**
#   ピエゾの検知（＝いつ始めるか）は CPU がやる。ここは数µs遅れても構わない。
#   発光の間隔（＝何ミリ秒あけるか）は PIO がやる。ここは 6.7ns 単位で正確。
#   絶対の開始時刻はどうでもよく、**間隔だけが計測精度に効く**ので、この分担でよい。
#
# 配線（詳細は 配線図.md）
#   GP15 → ゲートドライバ IR4427 の入力 → MOSFET → LED
#   GP14 ← ピエゾ（10kΩ 直列、5.1V ツェナー2個でクランプ）
#   GP25 → 基板上のLED（動作確認用）

import machine
import rp2
import sys
import time
import select

# ----------------------------------------------------------------- 設定
PIN_STROBE = 15          # LED（ゲートドライバへ）
PIN_PIEZO  = 14          # ピエゾ入力
PIN_BUSY   = 16          # 発光中に High。カメラ同期やオシロのトリガに使う

ON_US_DEFAULT   = 20.0   # 1発の発光時間[µs]。再帰反射方式なら 10 まで下げられる
N_PULSES        = 4
SPACING_MM      = 64.0   # 像の間隔の狙い（ボール直径42.67mmの1.5倍）
LOCKOUT_MS      = 400    # 一度光ったら、この間は再発火しない（残響と素振り対策）

# 安全のための上限。**ここを緩めるとLEDが焼ける。**
ON_US_MAX       = 60.0   # デューティが上がると定格3Aのパルス条件を外れる
MIN_INTERVAL_MS = 250    # 連続発光の下限

SPEED_MIN = 5.0          # m/s。パター
SPEED_MAX = 90.0         # m/s。ドライバーに余裕


# ----------------------------------------------------------------- PIO
# FIFO に「次の発光までの待ち時間」を4つ積むだけで、4連発が出る。
# FIFO は4段なので、1バーストぶんがちょうど収まる。
# **バーストの途中で CPU が補充する必要がない** ——ここが効いている。
# 補充が要る作りにすると、USB割り込みが入った瞬間に間隔が狂う。
@rp2.asm_pio(set_init=rp2.PIO.OUT_LOW, out_shiftdir=rp2.PIO.SHIFT_RIGHT)
def _strobe_prog():
    pull(block)                 # 最初の1語だけ「発光の長さ」。以後 y に保持
    mov(y, osr)

    label("next")
    pull(block)                 # 次の1語＝この発光までの待ち時間
    mov(x, osr)
    label("gap")
    jmp(x_dec, "gap")           # 1周1サイクル

    mov(x, y)                   # y は保たれる
    set(pins, 1)                # 点灯
    label("on")
    jmp(x_dec, "on")
    set(pins, 0)                # 消灯
    jmp("next")


class Strobe:
    def __init__(self):
        self.clk = machine.freq()          # Pico 2 の既定は 150 MHz
        self.ns_per_cycle = 1_000_000_000 / self.clk
        self.sm = rp2.StateMachine(
            0, _strobe_prog, freq=self.clk,
            set_base=machine.Pin(PIN_STROBE))
        self.busy = machine.Pin(PIN_BUSY, machine.Pin.OUT, value=0)
        self.on_us = ON_US_DEFAULT
        self.n = N_PULSES
        self.gaps_us = [0.0] * N_PULSES
        self.set_speed(50.0)
        self.sm.active(1)
        self.sm.put(self._cycles(self.on_us))   # 発光の長さを1回だけ渡す

    # -------------------------------------------------- 時間 → サイクル数
    # ループ1周が1サイクル。前後の pull/mov/set で数サイクル余分に掛かるので、
    # その分を引く。**この定数はオシロで実測して合わせること。**
    _OVERHEAD = 5

    def _cycles(self, us):
        c = int(us * 1000.0 / self.ns_per_cycle) - self._OVERHEAD
        return c if c > 1 else 1

    # -------------------------------------------------- 間隔の決め方
    def set_speed(self, v_ms):
        """想定初速[m/s]から、像の間隔が SPACING_MM になる待ち時間を決める。

        速い球ほど短く、遅い球ほど長くなる。こうしないと、
        ドライバーでは像が離れすぎ、ウェッジでは像が重なる。
        """
        v = min(SPEED_MAX, max(SPEED_MIN, float(v_ms)))
        dt_us = SPACING_MM / v * 1000.0        # mm / (m/s) = ms → ×1000 で µs
        self.speed = v
        # 1発目は待たずに撃つ。2発目以降を dt ずつあける。
        self.gaps_us = [1.0] + [dt_us] * (self.n - 1)
        return dt_us

    def set_gaps(self, gaps):
        g = [max(1.0, float(x)) for x in gaps][:4]
        while len(g) < self.n:
            g.append(g[-1])
        self.gaps_us = g

    def set_on(self, us):
        us = min(ON_US_MAX, max(1.0, float(us)))
        self.on_us = us
        # 発光の長さは y に入ったままなので、入れ直すには積み直しが要る
        self.sm.active(0)
        self.sm.restart()
        self.sm.active(1)
        self.sm.put(self._cycles(us))
        return us

    # -------------------------------------------------- 発火
    def fire(self):
        self.busy.value(1)
        for g in self.gaps_us[:self.n]:
            self.sm.put(self._cycles(g))
        # 全部出し終わるまでの見込み時間だけ待つ（余裕2倍）
        total_us = sum(self.gaps_us[:self.n]) + self.on_us * self.n
        time.sleep_us(int(total_us * 2) + 200)
        self.busy.value(0)
        return total_us


# ----------------------------------------------------------------- 本体
class Unit:
    def __init__(self):
        self.st = Strobe()
        self.armed = True
        self.last_fire = -10_000
        self.count = 0
        self.piezo = machine.Pin(PIN_PIEZO, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.piezo.irq(trigger=machine.Pin.IRQ_RISING, handler=self._hit)
        self.led = machine.Pin(PIN_BUSY, machine.Pin.OUT)
        self._pending = False

    def _hit(self, pin):
        # 割り込みの中では最小限だけ。発光はメインループでやる。
        # 割り込み内で長く居座ると、次の割り込みを取りこぼす。
        now = time.ticks_ms()
        if not self.armed:
            return
        if time.ticks_diff(now, self.last_fire) < LOCKOUT_MS:
            return
        self.last_fire = now
        self._pending = True

    def service(self):
        if not self._pending:
            return
        self._pending = False
        self.st.fire()
        self.count += 1
        print("FIRE {} v={:.1f} on={:.1f} gaps={}".format(
            self.count, self.st.speed, self.st.on_us,
            ",".join("{:.0f}".format(g) for g in self.st.gaps_us[:self.st.n])))

    # -------------------------------------------------- PCからの指示
    # 1行1コマンド。PC側は普通のシリアルとして開けばよい。
    def command(self, line):
        line = line.strip()
        if not line:
            return
        c = line[0].upper()
        arg = line[1:].strip()
        try:
            if c == "V":                       # V 62.5  想定初速[m/s]
                dt = self.st.set_speed(float(arg))
                print("OK v={:.1f} dt={:.0f}us".format(self.st.speed, dt))
            elif c == "G":                     # G 850 1200 1200 1200  待ち[µs]直接
                self.st.set_gaps(arg.replace(",", " ").split())
                print("OK gaps=" + ",".join("{:.0f}".format(g)
                                            for g in self.st.gaps_us))
            elif c == "W":                     # W 20  発光の長さ[µs]
                print("OK on={:.1f}us".format(self.st.set_on(float(arg))))
            elif c == "N":                     # N 4  発光の回数
                n = min(4, max(2, int(arg)))
                self.st.n = n
                self.st.set_speed(self.st.speed)
                print("OK n={}".format(n))
            elif c == "T":                     # T  手動で1発
                self.st.fire()
                self.count += 1
                print("TEST {}".format(self.count))
            elif c == "A":                     # A 1 / A 0  待機の入切
                self.armed = (arg not in ("0", "off", "OFF"))
                print("OK armed={}".format(int(self.armed)))
            elif c == "?":
                print("clk={}MHz on={:.1f}us n={} v={:.1f} gaps={} armed={} count={}"
                      .format(self.st.clk // 1_000_000, self.st.on_us, self.st.n,
                              self.st.speed,
                              ",".join("{:.0f}".format(g)
                                       for g in self.st.gaps_us[:self.st.n]),
                              int(self.armed), self.count))
            else:
                print("ERR unknown: " + line)
        except Exception as e:
            print("ERR " + str(e))


def main():
    unit = Unit()
    poll = select.poll()
    poll.register(sys.stdin, select.POLLIN)
    buf = ""
    print("strobe ready. '?' for status, 'T' to test fire.")
    while True:
        unit.service()
        if poll.poll(0):
            ch = sys.stdin.read(1)
            if ch in ("\n", "\r"):
                unit.command(buf)
                buf = ""
            else:
                buf += ch
                if len(buf) > 80:
                    buf = ""
        time.sleep_ms(1)


if __name__ == "__main__":
    main()
