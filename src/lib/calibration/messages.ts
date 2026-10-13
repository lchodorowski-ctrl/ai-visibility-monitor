// Komunikaty błędów kalibracji pokazywane użytkownikowi (error.tsx rozpoznaje je po treści).
export const CALIBRATION_MESSAGES = {
  noRun: "Najpierw uruchom pomiar",
  noPrompts: "Brak pytań z ostatniego pomiaru do kalibracji",
  closedOrMissing: "Kalibracja zamknięta lub nie istnieje",
} as const;

export function isCalibrationMessage(message: string): boolean {
  return (Object.values(CALIBRATION_MESSAGES) as string[]).includes(message);
}
