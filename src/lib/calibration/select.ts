export function selectPrompts<T extends { id: string; is_key: boolean; created_at: string }>(prompts: T[], n = 10, rng: () => number = Math.random): T[] {
  const byDate = (a: T, b: T) => a.created_at.localeCompare(b.created_at);
  const keys = prompts.filter((p) => p.is_key).sort(byDate);
  if (keys.length >= n) return keys.slice(0, n);
  const rest = prompts.filter((p) => !p.is_key).sort(byDate);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...keys, ...rest.slice(0, n - keys.length)];
}
