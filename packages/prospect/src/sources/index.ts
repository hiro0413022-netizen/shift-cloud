// 取得アダプタの登録簿。新しい取得元を足すときはここに1行足すだけにする。
import type { SourceAdapter } from "../types";
import { directoryAdapter } from "./directory";
import { placesAdapter } from "./places";

export const ADAPTERS: Record<string, SourceAdapter> = {
  directory: directoryAdapter,
  places: placesAdapter,
};

export { directoryAdapter, placesAdapter };
export { extractContact, extractLinks, cityFromAddress, guessIndustry } from "../parse";
export { extractEmails } from "../audit";
