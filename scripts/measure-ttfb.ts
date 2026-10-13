// scripts/measure-ttfb.ts — `npx tsx scripts/measure-ttfb.ts http://localhost:3000 <cookie-header>`
// Mierzy TTFB i czas pełnej odpowiedzi dla /login, /app, /app/prompts, /app/responses, /app/recommendations, /app/settings (3 próby, mediana), wypisuje tabelę.
// Bez cookie każdy /app/* zwraca przekierowanie do /login (307), co i tak pokazuje narzut serwera i sprawdzenia sesji.
// Nie wklejaj cookie do commitów, README ani raportów.
const [base = "http://localhost:3000", cookie = ""] = process.argv.slice(2);
const paths = ["/login", "/app", "/app/prompts", "/app/responses", "/app/recommendations", "/app/settings"];
async function once(path: string) {
  const t0 = performance.now();
  const res = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const ttfb = performance.now() - t0; await res.arrayBuffer();
  return { status: res.status, ttfb, total: performance.now() - t0 };
}
const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function main() {
  for (const p of paths) {
    const runs = [await once(p), await once(p), await once(p)];
    console.log(`${p.padEnd(24)} ${runs[0].status}  TTFB ${Math.round(median(runs.map((r) => r.ttfb)))} ms  total ${Math.round(median(runs.map((r) => r.total)))} ms`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
