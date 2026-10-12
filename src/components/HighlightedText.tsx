import { foldText } from "@/lib/extract/normalize";

export interface Segment { text: string; kind?: "own" | "competitor" }

type Mention = { charIndex: number; name: string; kind: "own" | "competitor" };

export function buildHighlightSegments(
  text: string,
  mentions: Mention[],
  aliasesByName: Record<string, string[]>,
): Segment[] {
  const folded = foldText(text);
  const marks = mentions
    .map((m) => {
      const aliases = [m.name, ...(aliasesByName[m.name] ?? [])].map(foldText);
      const hit = aliases.find((a) => a.length > 0 && folded.startsWith(a, m.charIndex));
      return hit ? { start: m.charIndex, end: m.charIndex + hit.length, kind: m.kind } : null;
    })
    .filter((x): x is { start: number; end: number; kind: "own" | "competitor" } => x !== null)
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const m of marks) {
    if (m.start < pos) continue;
    if (m.start > pos) out.push({ text: text.slice(pos, m.start) });
    out.push({ text: text.slice(m.start, m.end), kind: m.kind });
    pos = m.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

export function HighlightedText({ text, mentions, aliases }: {
  text: string;
  mentions: Mention[];
  aliases: Record<string, string[]>;
}) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-6">
      {buildHighlightSegments(text, mentions, aliases).map((s, i) =>
        s.kind
          ? <mark key={i} className={s.kind === "own" ? "bg-green-200 text-foreground dark:bg-green-900/60 dark:text-green-100" : "bg-amber-200 text-foreground dark:bg-amber-900/60 dark:text-amber-100"}>{s.text}</mark>
          : <span key={i}>{s.text}</span>,
      )}
    </p>
  );
}
