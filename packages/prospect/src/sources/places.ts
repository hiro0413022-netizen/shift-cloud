// 取得アダプタ② Google Places API (New) — Text Search
//
// **これが営業リストの主軸**（2026-08-07にユーザーと決定 #117）。
// 名簿は「業界団体が名簿を公開している業種」にしか使えないが、Placesはエリア×業種で
// どの業種でも機械的に取れ、実在も保証される。名簿はPlacesに無い情報（診療科など）を補う位置づけ。
//
// そのため GOOGLE_PLACES_API_KEY が未設定なら**エラーにせず黙ってskip**する。
// キーをVercelのenvに入れた瞬間に、コード変更なしで有効になる。
//
// 課金に触るので上限は必ずかける（max_per_run）。FieldMask は必要な項目だけにする
// （Places APIは返すフィールドで課金階層が変わるため、id/displayName/address/phone/website に絞る）。

import type { AdapterContext, ProspectCandidate, SourceAdapter, SourceRow } from "../types";
import { cityFromAddress } from "../parse";
import { normalizeName } from "../dedupe";

export { cityFromAddress };

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

interface PlacesResponse {
  places?: {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
  }[];
  nextPageToken?: string;
}

/**
 * 屋号＋市区町村から1件だけ引き当てて、公式サイトの有無を確認する（#119）。
 *
 * 名簿から拾った先は一覧しか見ていないので「HPがあるのか無いのか」を知らない。
 * ここでPlacesに問い合わせて確認済みにする＝名簿由来の先も採点できるようになる。
 *
 * **別の店を掴まないことが最優先**なので、返ってきた屋号が正規化して一致しなければ捨てる。
 * 一致しなければ未確認のまま（＝採点しない）で構わない。誤った相手に営業する方がはるかに高くつく。
 */
export async function lookupWebsite(
  p: { name: string; city?: string | null; address?: string | null },
  key: string,
): Promise<{ found: true; websiteUrl: string | null; matched: string } | { found: false; reason: string }> {
  const q = [p.name, p.city ?? p.address ?? ""].filter(Boolean).join(" ");
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.websiteUri,places.formattedAddress",
      },
      body: JSON.stringify({ textQuery: q, languageCode: "ja", regionCode: "JP", maxResultCount: 1 }),
    });
    if (!res.ok) return { found: false, reason: `Places ${res.status}` };
    const json = (await res.json()) as PlacesResponse;
    const hit = json.places?.[0];
    const name = hit?.displayName?.text?.trim();
    if (!hit || !name) return { found: false, reason: "該当なし" };
    if (normalizeName(name) !== normalizeName(p.name)) return { found: false, reason: `別の店の可能性（${name}）` };
    return { found: true, websiteUrl: hit.websiteUri ?? null, matched: name };
  } catch (e) {
    return { found: false, reason: String(e).slice(0, 80) };
  }
}

export const placesAdapter: SourceAdapter = {
  kind: "places",
  async collect(source: SourceRow, ctx: AdapterContext) {
    const key = ctx.env.GOOGLE_PLACES_API_KEY;
    if (!key) return { candidates: [], errors: ["GOOGLE_PLACES_API_KEY 未設定のためskip"] };

    const q = source.query ?? [source.name, source.city].filter(Boolean).join(" ");
    if (!q) return { candidates: [], errors: ["query が未設定です"] };

    const candidates: ProspectCandidate[] = [];
    const errors: string[] = [];
    let pageToken: string | undefined;

    while (candidates.length < ctx.limit) {
      let json: PlacesResponse;
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": FIELDS,
          },
          body: JSON.stringify({
            textQuery: q,
            languageCode: "ja",
            regionCode: "JP",
            // 1コールで最大20件。nextPageToken で最大60件まで辿れる（Places APIの上限）。
            // 件数を稼ぎたいときはクエリを分ける（「美容室 伊丹市中央」など）方が確実
            maxResultCount: 20,
            ...(pageToken ? { pageToken } : {}),
          }),
        });
        if (!res.ok) {
          errors.push(`Places API ${res.status}: ${(await res.text()).slice(0, 200)}`);
          break;
        }
        json = (await res.json()) as PlacesResponse;
      } catch (e) {
        errors.push(`Places API: ${String(e)}`);
        break;
      }

      for (const p of json.places ?? []) {
        if (candidates.length >= ctx.limit) break;
        const refKey = `places:${p.id}`;
        if (ctx.seen.has(refKey)) continue;
        const name = p.displayName?.text?.trim();
        if (!name) continue;
        candidates.push({
          refKey,
          name,
          industry: source.industry,
          address: p.formattedAddress ?? null,
          city: cityFromAddress(p.formattedAddress) ?? source.city ?? null,
          phone: p.nationalPhoneNumber ?? null,
          websiteUrl: p.websiteUri ?? null,
          // Places は websiteUri を返すか返さないかで「サイトの有無」を答えている＝確認済み（#119）
          websiteChecked: true,
          gmapUrl: p.googleMapsUri ?? null,
          sourceUrl: p.googleMapsUri ?? null,
        });
      }

      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }

    return { candidates, errors };
  },
};
