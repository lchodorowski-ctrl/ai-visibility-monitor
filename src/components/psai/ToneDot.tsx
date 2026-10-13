import { cn } from "cn";
import { TONE_LABEL, toneDotClass, type VisibilityTone } from "@/lib/metrics/tone";

/** Mała kropka stanu widoczności; kolor nie jest jedynym nośnikiem znaczenia, bo etykieta idzie w aria-label. */
export function ToneDot({ tone, className }: { tone: VisibilityTone; className?: string }) {
  return <span role="img" aria-label={TONE_LABEL[tone]} className={cn("inline-block h-2 w-2 shrink-0 rounded-full", toneDotClass(tone), className)} />;
}
