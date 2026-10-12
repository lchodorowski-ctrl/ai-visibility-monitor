export type RunDecision =
  | { kind: "empty" }
  | { kind: "budget_exceeded"; spent: number; estimate: number }
  | { kind: "go" };

export function decideRun(jobsCount: number, spent: number, estimate: number, budget: number): RunDecision {
  if (jobsCount === 0) return { kind: "empty" };
  if (spent + estimate > budget) return { kind: "budget_exceeded", spent, estimate };
  return { kind: "go" };
}
