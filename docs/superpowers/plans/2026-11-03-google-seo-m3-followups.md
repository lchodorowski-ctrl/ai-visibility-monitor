# Moduł Google M3: odłożone uwagi i decyzje

Data: 2026-11-03. Plan: `docs/superpowers/plans/2026-11-03-google-seo-m3.md`. Gałąź `feat/google-seo-m3`: 5 zadań, przeglądy per zadanie, końcowy przegląd (opus) i jedna fala poprawek. Testy: 1098.

## Sprawdzone na żywo (lokalnie, prawdziwe DataForSEO)

- Wyszukiwanie fraz z filtrem tematycznym konkurencji: 0,13 USD, 6 fraz własnej domeny (np. „szkolenia ai” poz. 52, „kurs ai” poz. 78), 20 trafnych luk, 23 podpowiedzi.
- Odświeżenie wolumenów i Trends dla 5 fraz: 0,10 USD; 12 miesięcy wolumenu i 52 tygodnie Trends dla fraz z ruchem.
- Upsert podpowiedzi bez `status` zachowuje „odrzucona” (PostgREST lokalnie).

## Do zrobienia w planie M2 (przed śledzeniem pozycji)

- Data „stan na” w sekcji „Gdzie już jesteście” brana z `updated_at` wierszy, które podbija też „Śledź”/„Odrzuć”: brać datę z ostatniego zadania `keyword_research` (R11).
- Wspólne helpery bramki budżetu i zamykania zadania (3 kopie) oraz zapis kosztu po każdym płatnym wywołaniu (`addCost`), żeby równoległe zadania nie przekroczyły limitu (R9).
- Pozycja w tabeli śledzonych fraz (dziś tylko w sekcji „Gdzie już jesteście”).

## Decyzje (ruling: co, dlaczego, koszt pomyłki)

- R1: Ruling: Task 5 adds DEFAULT_SEEDS to src/lib/seo/keywords.ts (plan text says so; file list omits it); one home for keyword constants; if wrong, a constant moves.
- R2: Ruling: manual phrases are stored in normalized form (text = key, lowercase); Google queries are case-insensitive and lowercase reads as search phrases; if wrong, capitalization from the form is lost.
- R3: Ruling: Task 4 stores only complete Trends weeks (drops points whose week starts less than 7 days before now); the last Trends point is a partial week (missing_data true) and would show a fake dip; if wrong, the newest week appears a week later.
- R4: Ruling: Task 4 passes bare domains to rankedKeywords (strip protocol, www and path via normalizeDomainInput from src/lib/validation/settings.ts); Labs expects a bare target; if wrong, ranked results come back empty.
- R5: Ruling: accept acceptSuggestion copying search_volume and cpc from the suggestion into the new keyword; a freshly tracked phrase would otherwise show "brak danych" until a paid refresh; if wrong, two fields are dropped.
- R6: Ruling: Task 4 fix round: competitor rankedKeywords calls send a topic filter (regex TOPIC_REGEX = "(^| )(ai|chatgpt|gpt|copilot|gemini|llm|prompt|prompty|chatbot|chatboty)( |$)|sztuczn[a-ząćęłńóśźż]* inteligenc") and rank_group <= 20 server-side; unfiltered gaps are useless for the owner; if wrong, some relevant non-AI phrases (e.g. "szkolenia z excela") are missed.
- R7: Ruling: keyword-volumes must not overwrite a known search_volume/cpc/competition with null from Google Ads (keep last known value); Ads returns null for close variants it folds into another phrase, and "brak danych" after a paid refresh reads as a bug; if wrong, a stale Labs number stays visible.
- R8: Ruling: one fix wave covers R7, ranked completeness, stale cleanup + date, all-null trend skip, "najwyżej" wording, >10-word phrases filtered before Google Ads, status omitted from suggestion upsert, per-phrase "stan na" date, accept 80-char cap + status=new, total cap 500, shared pickRivals, 3-decimal marginal costs, DEFAULT_SEEDS comment, d.values null-safe, dedupe competitor domains; all cheap and they change what the owner sees; if wrong, a slightly bigger diff to review.
- R9: Ruling: defer helper dedupe (gate/catch) and incremental addCost to the M2 plan (before rank tracking); not user-visible now; worst overshoot ~1,8 USD within the 10 USD cap; if wrong, a parallel overspend before M2.
- R10: Ruling: accept "status = new" required only for labs/gap accepts; ranked rows (no Odrzuć, shown in every status) can be re-tracked after delete; literal rule would make Śledź a silent no-op there; if wrong, a stale page can re-add a ranked phrase.
- R11: Ruling: park the research-date defect for the M2 plan (take the date from the last done keyword_research job, or stop accept/dismiss writing updated_at) and surface it to Łukasz; skill allows no second fix wave; impact is only the freshness label after a click; if wrong, the label shows the click date instead of the research date until the next research.

## Odłożone drobne uwagi

Task 1: implementer DONE_WITH_CONCERNS 0a55cf3; minor (deferred): server-side coerce of empty budget still saves 0 (validation/settings.ts)
- T1: decideSeoSpend accepts negative/infinite estimate; no test pins required/step attrs
- T2: invisible combining accent in keywords.test.ts:26 (use \u escape); with check not tested for keywords tables
- T3: trends real-fixture test title says anchor last but fixture has it first; partial cost lost if batch 2+ throws (>1000 phrases); d.values[j] not null-safe; res.cost ?? 0 under-counts if missing; cpc float32 noise (round in Task 4)
- T4: gate/catch/errorMessage/round2 duplicated (3 copies incl. gsc-sync) - extract helpers before next paid job; cost only recorded at finishJob (killed runs lose spend; two jobs can both pass gate); schedule test checks query shape only; long runKeywordResearch with nested ternary; duplicate competitor domains queried twice; Ads-normalized phrase keeps stale volume
- T5 (zrobione w fali poprawek): pickRivals duplicated between page and task (cost parity); marginal costs both shown as 0,02; acceptSuggestion lacks 80-char cap; no total cap on tracked phrases (>500 invisible); DEFAULT_SEEDS comment misleading; stale accept can re-add deleted phrase
- Fala poprawek: empty ranked result still triggers stale delete; "najwyżej" rounds down (0.123 -> 0,12); budgetExceededMessage says "ok."; silent no-op Śledź for >80-char labs rows and at the 500 cap; 500 cap not atomic
