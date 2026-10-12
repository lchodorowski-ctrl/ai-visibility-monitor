import { getAdapter, isEngineId } from "@/lib/engines/registry";

const [, , engine, ...rest] = process.argv;
if (!engine || !isEngineId(engine)) { console.error("użycie: tsx scripts/try-engine.ts <engine> <prompt>"); process.exit(1); }
const prompt = rest.join(" ") || "Jakie są najlepsze szkolenia z AI dla firm w Polsce?";
getAdapter(engine).query(prompt, { locale: "pl-PL", country: "PL" }).then((r) => {
  console.log(r.model, "\n", r.text, "\n", r.citations);
});
