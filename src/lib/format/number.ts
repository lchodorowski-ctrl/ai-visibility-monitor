export const pct = (v: number) => `${Math.round(v * 100)}%`;

const dateFmt = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
