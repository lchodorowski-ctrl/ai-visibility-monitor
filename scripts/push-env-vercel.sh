#!/usr/bin/env bash
# Wysyła zmienne produkcyjne z `.env.prod.local` do projektu Vercel (środowisko Production).
#
# Wymagania (jednorazowo, przed uruchomieniem):
#   npx vercel login
#   npx vercel link        # wybierz istniejący projekt `ai-visibility-monitor`
#
# Użycie (z katalogu głównego repozytorium):
#   bash scripts/push-env-vercel.sh
#
# Skrypt można uruchamiać wielokrotnie: istniejące zmienne są nadpisywane (--force).
# Wartości trafiają do Vercela przez stdin; skrypt nigdy ich nie wypisuje i nie przekazuje w argumentach.
# Zmienne Trigger.dev (klucze silników itd.) NIE są tu wysyłane, synchronizuje je `trigger.dev deploy`.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.prod.local"

# Zmienne potrzebne aplikacji na Vercelu. Opcjonalne mogą być puste.
REQUIRED_VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  TRIGGER_SECRET_KEY
  TRIGGER_PROJECT_REF
  CRON_SECRET
  ANTHROPIC_API_KEY
  ANTHROPIC_SENTIMENT_MODEL
  ANTHROPIC_GENERATOR_MODEL
)
OPTIONAL_VARS=(
  ANTHROPIC_RECOMMENDER_MODEL
  ANTHROPIC_WORKSPACE_ID
)
# Wartości nietajne: zostają czytelne w panelu Vercela (reszta jest "sensitive" domyślnie).
NON_SENSITIVE_VARS=" NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY TRIGGER_PROJECT_REF ANTHROPIC_SENTIMENT_MODEL ANTHROPIC_GENERATOR_MODEL ANTHROPIC_RECOMMENDER_MODEL ANTHROPIC_WORKSPACE_ID "

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Błąd: brak pliku $ENV_FILE. Utwórz go: cp .env.prod.example $ENV_FILE i uzupełnij wartości." >&2
  exit 1
fi

if [[ ! -f ".vercel/project.json" && ! -f ".vercel/repo.json" ]]; then
  echo "Błąd: katalog nie jest połączony z projektem Vercel. Uruchom najpierw: npx vercel login oraz npx vercel link" >&2
  exit 1
fi

# Prosty parser KEY=VALUE (bez `source`, więc nic z pliku nie jest wykonywane; działa też w bash 3.2 z macOS).
# Pomija komentarze i puste linie, ucina prefiks `export `, zdejmuje otaczające cudzysłowy. Przy duplikatach wygrywa ostatnia linia.
get_value() {
  local want="$1" result="" line key value
  local re_dq='^"(.*)"$' re_sq="^'(.*)'$"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    line="${line#export }"
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    key="${key//[[:space:]]/}"
    [[ "$key" != "$want" ]] && continue
    value="${line#*=}"
    if [[ "$value" =~ $re_dq ]] || [[ "$value" =~ $re_sq ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    result="$value"
  done < "$ENV_FILE"
  printf '%s' "$result"
}

# Zabezpieczenie przed wrzuceniem klucza deweloperskiego na produkcję.
trigger_key="$(get_value TRIGGER_SECRET_KEY)"
if [[ -n "$trigger_key" && "$trigger_key" != tr_prod_* ]]; then
  echo "Błąd: TRIGGER_SECRET_KEY w $ENV_FILE nie zaczyna się od tr_prod_. Użyj klucza ze środowiska Prod (Trigger.dev -> API keys)." >&2
  exit 1
fi

pushed=0
skipped_required=()

push_var() {
  local name="$1" optional="$2" value
  value="$(get_value "$name")"
  if [[ -z "$value" ]]; then
    if [[ "$optional" == "optional" ]]; then
      echo "Pominięto $name (opcjonalna, pusta)."
    else
      echo "Ostrzeżenie: $name jest puste w $ENV_FILE, pomijam." >&2
      skipped_required+=("$name")
    fi
    return 0
  fi
  local flags=(--force --yes)
  if [[ "$NON_SENSITIVE_VARS" == *" $name "* ]]; then
    flags+=(--no-sensitive)
  fi
  local out
  if out="$(printf '%s' "$value" | npx vercel env add "$name" production "${flags[@]}" 2>&1)"; then
    echo "OK: $name"
    pushed=$((pushed + 1))
  else
    echo "Błąd przy wysyłaniu $name:" >&2
    echo "$out" >&2
    exit 1
  fi
}

for name in "${REQUIRED_VARS[@]}"; do push_var "$name" required; done
for name in "${OPTIONAL_VARS[@]}"; do push_var "$name" optional; done

echo
echo "Wysłano zmiennych: $pushed."
if (( ${#skipped_required[@]} > 0 )); then
  echo "Uwaga: pominięto wymagane zmienne (puste): ${skipped_required[*]}. Uzupełnij je w $ENV_FILE i uruchom skrypt ponownie." >&2
  exit 2
fi
echo "Gotowe. Zmienne działają od następnego wdrożenia: npx vercel --prod (lub push na main)."
