export interface ResponseFacts {
  promptId: string;
  engineId: string;
  noAnswer: boolean;
  error: boolean;
  ownMentioned: boolean;
  ownPosition: number | null;
  ownCited: boolean;
  brandsMentioned: number;
}

export interface MetricRow {
  engineId: string | null;
  promptId: string | null;
  responsesCount: number;
  visibilityRate: number;
  avgPosition: number | null;
  citationRate: number;
  shareOfVoice: number;
  score: number;
}

export function computeScore(m: Pick<MetricRow, "visibilityRate" | "citationRate" | "shareOfVoice" | "avgPosition">): number {
  const posScore = m.avgPosition ? Math.max(0, 1 - (m.avgPosition - 1) / 5) : 0;
  return Math.round(100 * (0.5 * m.visibilityRate + 0.2 * m.citationRate + 0.2 * m.shareOfVoice + 0.1 * posScore));
}

function summarize(engineId: string | null, promptId: string | null, rows: ResponseFacts[]): MetricRow {
  const valid = rows.filter((r) => !r.noAnswer && !r.error);
  const n = valid.length;
  const mentioned = valid.filter((r) => r.ownMentioned);
  const positions = mentioned.map((r) => r.ownPosition).filter((p): p is number => p != null);
  const totalBrands = valid.reduce((s, r) => s + r.brandsMentioned, 0);
  const base = {
    engineId, promptId, responsesCount: n,
    visibilityRate: n ? mentioned.length / n : 0,
    avgPosition: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null,
    citationRate: n ? valid.filter((r) => r.ownCited).length / n : 0,
    shareOfVoice: totalBrands ? mentioned.length / totalBrands : 0,
  };
  return { ...base, score: computeScore(base) };
}

export function computeMetrics(rows: ResponseFacts[]): MetricRow[] {
  const engines = [...new Set(rows.map((r) => r.engineId))];
  const prompts = [...new Set(rows.map((r) => r.promptId))];
  const out: MetricRow[] = [summarize(null, null, rows)];
  // wiersze bez poprawnych odpowiedzi (responsesCount === 0) pomijamy, żeby cichy silnik/prompt
  // nie pojawiał się na dashboardzie jako "0% widoczności"
  const push = (m: MetricRow) => { if (m.responsesCount > 0) out.push(m); };
  for (const e of engines) push(summarize(e, null, rows.filter((r) => r.engineId === e)));
  for (const p of prompts) push(summarize(null, p, rows.filter((r) => r.promptId === p)));
  for (const e of engines) for (const p of prompts) {
    const cell = rows.filter((r) => r.engineId === e && r.promptId === p);
    if (cell.length) push(summarize(e, p, cell));
  }
  return out;
}
