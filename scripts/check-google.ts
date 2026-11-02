// Sprawdza dostęp konta usługi Google do Search Console: wypisuje usługi (property) z poziomem uprawnień
// i potwierdza, że wskazana property jest na liście. Klucza prywatnego nie wypisuje.
// Użycie: npx tsx --env-file=.env.local scripts/check-google.ts [property]
import { getGoogleAuth } from "@/lib/google/auth";
import { googleJson } from "@/lib/google/http";

const PROPERTY = process.argv[2] ?? "sc-domain:polskaszkola.ai";

async function main() {
  try {
    const auth = getGoogleAuth();
    console.log(`Konto usługi: ${auth.email}`);
    const { siteEntry = [] } = await googleJson<{ siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> }>(
      auth,
      "https://www.googleapis.com/webmasters/v3/sites",
    );
    if (siteEntry.length === 0) console.log("Konto nie ma dostępu do żadnej usługi Search Console.");
    for (const site of siteEntry) console.log(`${site.siteUrl}  ${site.permissionLevel}`);
    if (!siteEntry.some((site) => site.siteUrl === PROPERTY)) {
      console.error(`BŁĄD: brak ${PROPERTY} na liście. Dodaj ${auth.email} w Search Console (Ustawienia → Użytkownicy i uprawnienia).`);
      process.exit(1);
    }
    console.log(`OK: ${PROPERTY} dostępna`);
  } catch (e) {
    console.error(`BŁĄD: ${e instanceof Error ? e.message.slice(0, 400) : String(e)}`);
    process.exit(1);
  }
}

main();
