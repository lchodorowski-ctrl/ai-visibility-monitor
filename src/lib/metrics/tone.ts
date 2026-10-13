/** Trzy stany widoczności: dobrze (teal), słabo (neutralny), bardzo źle (red). Kolor tylko w tym stylu znaczy sukces lub błąd. */
export type VisibilityTone = "good" | "weak" | "bad";

/** Od tego poziomu widoczność jest dobra (stała, nie ustawienie). Dolny próg to `projects.low_visibility_threshold`. */
export const GOOD_VISIBILITY = 0.67;

/**
 * Porównujemy ZAOKRĄGLONE procenty (`Math.round(rate * 100)`), tak jak etykieta w heatmapie,
 * żeby kolor zawsze zgadzał się z liczbą na ekranie: 0,6667 to "67%" (dobrze), 0,335 to "34%" przy progu 0,34 (słabo).
 */
export function visibilityTone(rate: number, threshold: number): VisibilityTone {
  const p = Math.round(rate * 100);
  if (p >= Math.round(GOOD_VISIBILITY * 100)) return "good";
  if (p < Math.round(threshold * 100)) return "bad";
  return "weak";
}

export const TONE_LABEL: Record<VisibilityTone, string> = { good: "dobrze", weak: "słabo", bad: "bardzo źle" };

export function toneTextClass(t: VisibilityTone): "text-teal" | "text-t0" | "text-red" {
  return t === "good" ? "text-teal" : t === "bad" ? "text-red" : "text-t0";
}

export function toneDotClass(t: VisibilityTone): "bg-teal" | "bg-ink/40" | "bg-red" {
  return t === "good" ? "bg-teal" : t === "bad" ? "bg-red" : "bg-ink/40";
}
