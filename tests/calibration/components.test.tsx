import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/app/calibration/actions", () => ({ saveCheck: async () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => "/app/calibration" }));

import CalibrationError from "@/app/app/calibration/error";
import { CheckRow, CopyPromptButton } from "@/app/app/calibration/CheckRow";
import { SubmitButton } from "@/app/app/calibration/SubmitButton";
import { AppNav } from "@/components/psai/AppNav";
import type { CalibrationCheckView } from "@/lib/calibration/queries";
import { CALIBRATION_MESSAGES, isCalibrationMessage } from "@/lib/calibration/messages";

describe("CalibrationError", () => {
  const render = (message: string) => renderToStaticMarkup(<CalibrationError error={new Error(message)} retry={() => {}} />);

  it("pokazuje własny polski komunikat", () => {
    const html = render(CALIBRATION_MESSAGES.noRun);
    expect(html).toContain("Coś poszło nie tak");
    expect(html).toContain("Najpierw uruchom pomiar");
    expect(html).toContain("Spróbuj ponownie");
  });

  it("dla obcego komunikatu pokazuje zdanie zastępcze, nie surowy błąd", () => {
    const html = render("duplicate key value violates unique constraint");
    expect(html).toContain("Spróbuj ponownie za chwilę");
    expect(html).not.toContain("duplicate key");
  });

  it("isCalibrationMessage rozpoznaje tylko znane komunikaty", () => {
    expect(isCalibrationMessage(CALIBRATION_MESSAGES.closedOrMissing)).toBe(true);
    expect(isCalibrationMessage("inny błąd")).toBe(false);
  });
});

describe("SubmitButton", () => {
  it("poza wysyłką pokazuje etykietę i jest aktywny; z disabled jest zablokowany", () => {
    const html = renderToStaticMarkup(<SubmitButton>Nowa kalibracja</SubmitButton>);
    expect(html).toContain("Nowa kalibracja");
    expect(html).toContain('type="submit"');
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(renderToStaticMarkup(<SubmitButton disabled>Nowa kalibracja</SubmitButton>)).toMatch(/\sdisabled(=|\s|>)/);
  });
});

describe("CopyPromptButton", () => {
  it("ma aria-label z treścią pytania, skróconą do 60 znaków", () => {
    expect(renderToStaticMarkup(<CopyPromptButton text="Jaki kurs AI wybrać?" />)).toContain('aria-label="Kopiuj pytanie: Jaki kurs AI wybrać?"');
    const long = "a".repeat(100);
    const html = renderToStaticMarkup(<CopyPromptButton text={long} />);
    expect(html).toContain(`aria-label="Kopiuj pytanie: ${"a".repeat(60)}…"`);
    expect(html).not.toContain("a".repeat(61));
  });
});

describe("CheckRow", () => {
  const check: CalibrationCheckView = { id: "c1", promptId: "q1", promptText: "Q", engineId: "openai", manualMentioned: true, manualUrls: [], manualAlias: null, api: "mentioned", apiResponseId: null, apiDomains: [], result: "match" };

  it("ogranicza długość pól tekstowych", () => {
    const html = renderToStaticMarkup(<CheckRow check={check} calibrationId="cal-1" readOnly={false} />);
    expect(html).toMatch(/<textarea[^>]*maxLength="5000"/);
    expect(html).toMatch(/<input[^>]*name="alias"[^>]*maxLength="200"|<input[^>]*maxLength="200"[^>]*name="alias"/);
  });
});

describe("AppNav", () => {
  it("podświetla Ustawienia na /app/calibration", () => {
    const html = renderToStaticMarkup(<AppNav />);
    expect(html).toMatch(/<a[^>]*href="\/app\/settings"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/app\/settings"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
