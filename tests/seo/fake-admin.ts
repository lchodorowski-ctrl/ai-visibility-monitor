/** Wspólna atrapa klienta PostgREST dla testów zadań SEO: każde zapytanie jest zapisywane, wynik zwraca `handler`. */
export interface Call {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  cols?: string;
  payload?: unknown;
  opts?: unknown;
  /** Filtry w kolejności wywołania, np. `["eq", "project_id", "p1"]`. */
  filters: unknown[][];
}

export type Handled = { data?: unknown; error?: { message: string } | null };

export function fakeAdmin(handler: (c: Call) => Handled) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const b: Record<string, unknown> = {};
    for (const m of ["eq", "in", "not", "gte", "order", "limit"]) b[m] = (...args: unknown[]) => { call.filters.push([m, ...args]); return b; };
    b.select = (cols: string) => { if (call.op === "select") call.cols = cols; return b; };
    b.insert = (payload: unknown) => { call.op = "insert"; call.payload = payload; return b; };
    b.update = (payload: unknown) => { call.op = "update"; call.payload = payload; return b; };
    b.upsert = (payload: unknown, opts: unknown) => { call.op = "upsert"; call.payload = payload; call.opts = opts; return b; };
    const run = () => { calls.push(call); const r = handler(call); return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }); };
    b.single = run; b.maybeSingle = run;
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => run().then(ok, ko);
    return b;
  };
  return { client: { from } as never, calls };
}

/** Wartość pierwszego filtru danego rodzaju na danej kolumnie (np. `filterValue(call, "in", "key")`). */
export function filterValue(call: Call, kind: string, column: string): unknown {
  return call.filters.find((f) => f[0] === kind && f[1] === column)?.[2];
}

/** Ostatnie `update` tabeli `seo_jobs`, czyli zamknięcie zadania. */
export function jobUpdate(calls: Call[]): Record<string, unknown> {
  return [...calls].reverse().find((c) => c.table === "seo_jobs" && c.op === "update")!.payload as Record<string, unknown>;
}
