import type { GoogleAuth } from "./auth";
import { googleJson } from "./http";

export type GscDimension = "date" | "query" | "page" | "device";

export interface GscRow {
  /** Wartości wymiarów w kolejności z zapytania (data jako RRRR-MM-DD, urządzenie wielkimi literami, strona jako pełny adres). */
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscQuery {
  startDate: string;
  endDate: string;
  dimensions: GscDimension[];
  dataState?: "final" | "all";
  rowLimit?: number;
  startRow?: number;
}

/** Maksimum wierszy na jedną odpowiedź Search Console API. */
const MAX_ROW_LIMIT = 25000;

/** Jedno zapytanie searchAnalytics (wyszukiwanie w sieci). Brak `rows` w odpowiedzi oznacza brak danych. */
export async function querySearchAnalytics(auth: GoogleAuth, property: string, q: GscQuery): Promise<GscRow[]> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const res = await googleJson<{ rows?: GscRow[] }>(auth, url, { method: "POST", body: { ...q, type: "web" } });
  return res.rows ?? [];
}

/** Wszystkie wiersze okna: kolejne strony po `startRow`, aż przyjdzie strona krótsza niż `pageSize`. */
export async function fetchAllRows(
  auth: GoogleAuth,
  property: string,
  q: Omit<GscQuery, "rowLimit" | "startRow">,
  pageSize = MAX_ROW_LIMIT,
): Promise<GscRow[]> {
  const all: GscRow[] = [];
  for (let startRow = 0; ; startRow += pageSize) {
    const rows = await querySearchAnalytics(auth, property, { ...q, rowLimit: pageSize, startRow });
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
