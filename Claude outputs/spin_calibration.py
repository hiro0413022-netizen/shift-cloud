"""
spin_calibration.py — スピン係数をボールごとに実測で決める

■ なぜ必要か

spin_model.py は次の式でスピンを求める。

    バックスピン = C · ヘッドスピード · sin(スピンロフト) / ボール半径

この **C はボールそのものの性質** である。カバー材（ウレタン／アイオノマー）、
層構造、硬さで摩擦の効き方が変わるため。実測ではこれだけ違う（MyGolfSpy 2025）。

    ドライバー   最小 2,113rpm 〜 最大 2,967rpm   差 854rpm（40%）
    アイアン     最小 5,365rpm 〜 最大 7,173rpm   差 1,808rpm（34%）
    フルウェッジ 最小 8,613rpm 〜 最大 10,148rpm  差 1,535rpm（18%）
    35yアプローチ 最小 2,058rpm 〜 最大 6,026rpm  差 3,968rpm（**193%**）

しかもこれは市販の高級球どうしの差。レンジボールを混ぜればもっと開く。
**固定の C を1つ持って全店に出荷するのは成立しない。**

■ 解き方: C を「較正パラメータ」として扱う

C は 打つたびに変わる値ではなく、**ボールを替えたときだけ変わる値** である。
だから毎球測る必要はない。**ときどき実測して C を決め直せばよい。**

    導入時   : TrackMan と並べて 20〜30球。C が一発で決まる（最も正確）
    運用中   : ノイズの多いスピン観測を貯めて C をゆっくり更新する
    ボール交換: 残差が偏り始めるので **自動で気づける**

■ 運用中の実測スピンをどこから取るか

  1. レーダー — 屋内では1球あたり誤差が大きい（2回転しか見えない）。
     だが **偏りが無ければ、多数球の平均は正確になる。**
     1球±30%でも100球貯めれば平均は±3%。C を決めるにはそれで足りる。
     「毎球表示する」には使えないが「係数を較正する」には使える。

  2. 天井カメラによる光学計測 — 815fps・2500rpm なら 1フレームあたり18.4°回る。
     ボールは視野内で約69画素あるので、ディンプル模様の移動は最大10画素。
     **相関を取れば回転量は出る。** 追加ハードなしで実測できる可能性がある。
     ただしロゴの向きやボールの汚れに左右されるので、
     **取れた球だけ使う**（全球で成立させようとしない）のが現実的。

どちらも「毎球正確に測る」ことはできないが、
**C を較正するには十分**。ここが設計の勘所になる。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional, Sequence

import numpy as np

from spin_model import Impact, BALL_RADIUS_M, RAD_S_TO_RPM, classify


# =============================================================================
# ボールごとの係数
# =============================================================================

@dataclass
class BallProfile:
    """1種類のボールの、クラブ種別ごとのスピン係数。"""
    name: str
    C: dict = field(default_factory=dict)          # {"driver":…, "iron":…, "wedge":…}
    sigma: dict = field(default_factory=dict)      # 各 C の標準誤差
    n_shots: dict = field(default_factory=dict)
    source: str = ""                               # 何で測ったか
    note: str = ""

    def c_for(self, club: str) -> float:
        return self.C.get(club, self.C.get("iron", 0.80))

    def summary(self) -> str:
        L = [f"  ボール: {self.name}   ({self.source})"]
        for k in ("driver", "iron", "wedge"):
            if k in self.C:
                s = self.sigma.get(k)
                n = self.n_shots.get(k, 0)
                se = f" ±{s:.4f}" if s else ""
                L.append(f"    {k:<8} C = {self.C[k]:.4f}{se}   ({n}球)")
        if self.note:
            L.append(f"    {self.note}")
        return "\n".join(L)


# 出荷時の初期値。**必ず現場で測り直す前提の仮値**
DEFAULT_PROFILES = {
    "tour": BallProfile("ツアー系（ウレタン）", {"driver": 0.4682, "iron": 0.8226, "wedge": 0.8439},
                        source="TrackMan PGAツアー平均から逆算",
                        note="出荷時の仮値。現場のボールで測り直すこと"),
}


def c_from_measurement(imp: Impact, measured_rpm: float) -> Optional[float]:
    """1球ぶんの実測スピンから C を逆算する。"""
    sl = math.radians(imp.spin_loft_deg)
    denom = imp.club_speed_ms * math.sin(sl)
    if denom <= 1e-6 or measured_rpm <= 0:
        return None
    return (measured_rpm / RAD_S_TO_RPM) * BALL_RADIUS_M / denom


def fit_ball_profile(name: str, samples: Sequence, source: str = "") -> BallProfile:
    """(Impact, 実測スピンrpm) の並びから、クラブ種別ごとの C を求める。

    導入時に TrackMan と並べて打つ運用がこれ。20〜30球で十分決まる。
    """
    buckets = {}
    for imp, rpm in samples:
        c = c_from_measurement(imp, rpm)
        if c is None or not (0.05 < c < 3.0):
            continue
        buckets.setdefault(classify(imp.dynamic_loft_deg), []).append(c)

    prof = BallProfile(name, source=source or "実測")
    for club, cs in buckets.items():
        a = np.asarray(cs)
        prof.C[club] = float(a.mean())
        prof.sigma[club] = float(a.std(ddof=1) / math.sqrt(len(a))) if len(a) > 1 else float("nan")
        prof.n_shots[club] = len(a)
    return prof


# =============================================================================
# 運用中の自動較正
# =============================================================================

@dataclass
class OnlineCalibrator:
    """ノイズの多いスピン観測を貯めて、C をゆっくり更新する。

    1球ごとの値は信用しない。**多数球の平均だけを信用する。**
    レーダーでも光学でも、偏りが無ければ同じように使える。
    """
    club: str
    c0: float                        # 出発点（出荷時の値）
    sigma0: float = 0.08             # 出発点の不確かさ
    obs_rel_sigma: float = 0.30      # 1球あたりの観測誤差（相対）
    min_shots: int = 30              # これ未満では C を動かさない

    _n: int = 0
    _sum: float = 0.0
    _sum2: float = 0.0
    _recent: list = field(default_factory=list)

    def add(self, imp: Impact, measured_rpm: float) -> None:
        c = c_from_measurement(imp, measured_rpm)
        if c is None or not (0.05 < c < 3.0):
            return
        self._n += 1
        self._sum += c
        self._sum2 += c * c
        self._recent.append(c)
        if len(self._recent) > 2 * self.window:
            self._recent.pop(0)

    @property
    def n(self) -> int:
        return self._n

    def estimate(self) -> tuple:
        """(現在の推定 C, その標準誤差) を返す。

        観測が少ないうちは出荷時の値を信じ、増えるにつれて実測へ寄せる
        （逆分散重み付け）。
        """
        if self._n == 0:
            return self.c0, self.sigma0
        mean = self._sum / self._n
        if self._n < 2:
            se = mean * self.obs_rel_sigma
        else:
            var = max(0.0, (self._sum2 - self._n * mean * mean) / (self._n - 1))
            se = math.sqrt(var / self._n)
        if self._n < self.min_shots:
            return self.c0, self.sigma0
        w0, w1 = 1 / self.sigma0 ** 2, 1 / max(se, 1e-9) ** 2
        return (self.c0 * w0 + mean * w1) / (w0 + w1), math.sqrt(1 / (w0 + w1))

    window: int = 60                 # 前後それぞれ何球で比べるか

    def ball_changed(self, k: float = 3.0) -> tuple:
        """直近の観測が、それまでの平均から系統的にずれていないか。

        ボールを替えた／仕入先が変わった／ボールが摩耗した、を検出する。
        戻り値: (検出したか, 何σずれているか)
        """
        w = min(self.window, len(self._recent) // 2)
        if w < 8:
            return False, 0.0
        old = np.asarray(self._recent[:w]); new = np.asarray(self._recent[-w:])
        se = math.sqrt(old.var(ddof=1) / w + new.var(ddof=1) / w)
        if se <= 0:
            return False, 0.0
        z = abs(new.mean() - old.mean()) / se
        return z > k, z


# =============================================================================
# 検証
# =============================================================================

def _make_samples(true_c: float, n: int, club: str, rng, rel_sigma: float):
    cfg = {"driver": (50.5, 13.4, -1.3), "iron": (41.1, 26.0, -4.1),
           "wedge": (37.1, 36.6, -5.0)}[club]
    out = []
    for _ in range(n):
        imp = Impact(cfg[0] * rng.normal(1, .05), cfg[1] + rng.normal(0, 1.5),
                     cfg[2] + rng.normal(0, 1.2))
        true = true_c * imp.club_speed_ms * math.sin(math.radians(imp.spin_loft_deg)) \
               / BALL_RADIUS_M * RAD_S_TO_RPM
        out.append((imp, true * rng.normal(1, rel_sigma)))
    return out


def study_shots_needed() -> str:
    rng = np.random.default_rng(5)
    TRUE = 0.62                      # 「現場のレンジボール」の真値
    L = ["=" * 76,
         "  C を決めるのに何球要るか（観測ノイズ別）",
         "=" * 76,
         f"  真値 C = {TRUE}。出荷時の仮値 0.4682（ツアー系）から出発する。",
         "-" * 76,
         f"  {'観測手段':<28}{'1球の誤差':>11}{'20球':>10}{'50球':>10}{'100球':>10}{'300球':>10}"]
    for label, rel in [("TrackMan（導入時に並べる）", 0.03),
                       ("光学計測（取れた球のみ）", 0.12),
                       ("レーダー（屋内・ノイズ大）", 0.30)]:
        row = []
        for n in (20, 50, 100, 300):
            errs = []
            for _ in range(300):
                s = _make_samples(TRUE, n, "driver", rng, rel)
                p = fit_ball_profile("x", s)
                errs.append(abs(p.C["driver"] - TRUE) / TRUE * 100)
            row.append(float(np.mean(errs)))
        L.append(f"  {label:<28}{rel*100:>9.0f}%" + "".join(f"{v:>9.1f}%" for v in row))
    L += ["-" * 76,
          "  スピン表示の誤差は C の誤差とそのまま同じ割合になる。",
          "  レッスンで許せるのは概ね 5% 以内（ドライバーで約130rpm）。",
          "",
          "  → TrackMan を並べれば **20球で 0.7%**。導入作業に組み込むのが最も確実。",
          "  → レーダーだけでも **300球で 1.7%**。1〜2日の稼働で勝手に追いつく。",
          "=" * 76]
    return "\n".join(L)


def study_ball_change() -> str:
    """ボール交換に気づくのに何球要るか。ノイズと変化量で決まる。"""
    rng = np.random.default_rng(9)
    L = ["=" * 76,
         "  ボール交換に気づくのに必要な球数",
         "=" * 76,
         "  C が変わったあと、前後を比べて 3σ を超えたら『交換された』と判定する。",
         "-" * 76,
         f"  {'観測手段':<26}{'C の変化':>10}{'必要球数(前後それぞれ)':>24}{'判定':>10}"]
    for label, rel in [("TrackMan / 光学(良好)", 0.08),
                       ("光学計測", 0.12),
                       ("レーダー（屋内）", 0.30)]:
        for shift in (0.08, 0.16, 0.30):
            found = None
            for w in (10, 20, 40, 80, 150, 300):
                hits = 0
                for _ in range(120):
                    cal = OnlineCalibrator("driver", c0=0.4682, window=w)
                    for imp, rpm in _make_samples(0.62, w, "driver", rng, rel):
                        cal.add(imp, rpm)
                    for imp, rpm in _make_samples(0.62 * (1 + shift), w, "driver", rng, rel):
                        cal.add(imp, rpm)
                    if cal.ball_changed()[0]:
                        hits += 1
                if hits / 120 >= 0.9:
                    found = w
                    break
            mark = f"{found}球" if found else "300球超"
            L.append(f"  {label:<26}{shift*100:>8.0f}%{mark:>20}"
                     f"{'実用的' if found and found<=80 else '厳しい':>12}")
    L += ["-" * 76,
          "  8% 程度のわずかな変化は、レーダーのノイズだと数百球かかる。",
          "  だが 16〜30% 変わる（銘柄を切り替えた／ボールが摩耗した）なら数十球で分かる。",
          "  **導入時に TrackMan で C を決めておけば、以後は大きな変化だけ拾えばよい。**",
          "  細かいドリフトは、そもそもレッスンの精度に影響しない。",
          "=" * 76]
    return "\n".join(L)


def study_impact_on_display() -> str:
    """C を間違えたまま使うと、表示がどれだけ狂うか。"""
    import ball_flight as bf
    L = ["=" * 76,
         "  C を較正しないとどうなるか（ツアー系の仮値のままレンジボールを打つ）",
         "=" * 76,
         f"  {'クラブ':<10}{'仮値でのスピン':>16}{'正しいスピン':>15}{'ズレ':>12}{'キャリーのズレ':>16}"]
    cases = [("ドライバー", "driver", 50.5, 13.4, -1.3, 74.6, 10.9),
             ("7番アイアン", "iron", 41.1, 26.0, -4.1, 52.0, 17.0),
             ("PW", "wedge", 37.1, 36.6, -5.0, 45.0, 25.0)]
    tour = DEFAULT_PROFILES["tour"]
    # レンジボール想定（仮値）。硬いアイオノマーカバーは摩擦が効かず、総じてスピンが減る。
    # MyGolfSpy 2025 の実測でも、最少スピン球（ソフトアイオノマー系）は
    # ツアー系ウレタン球より 3〜4割少なかった。
    RANGE_C = {"driver": 0.33, "iron": 0.58, "wedge": 0.50}
    for name, club, cs, dl, aoa, bs, la in cases:
        imp = Impact(cs, dl, aoa)
        k = imp.club_speed_ms * math.sin(math.radians(imp.spin_loft_deg)) / BALL_RADIUS_M * RAD_S_TO_RPM
        s_wrong, s_right = tour.c_for(club) * k, RANGE_C[club] * k
        c_w = bf.simulate(bf.Shot(bs, la, 0, s_wrong), keep_path=False).carry_yd
        c_r = bf.simulate(bf.Shot(bs, la, 0, s_right), keep_path=False).carry_yd
        L.append(f"  {name:<10}{s_wrong:>14.0f}rpm{s_right:>13.0f}rpm"
                 f"{(s_wrong-s_right)/s_right*100:>+11.0f}%{c_w-c_r:>+14.1f}yd")
    L += ["-" * 76,
          "  ツアー系の仮値のままレンジボールを打つと、スピンを 4割前後 多く表示する。",
          "  ドライバーは飛距離への影響が小さいが（むしろ増える方向に効くこともある）、",
          "  **アイアンとウェッジは止まり方の説明がまるごと狂う。**",
          "  レッスンで一番使う番手ほど影響が大きい。",
          "=" * 76]
    return "\n".join(L)


if __name__ == "__main__":
    print(study_shots_needed()); print()
    print(study_ball_change()); print()
    print(study_impact_on_display())
