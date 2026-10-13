import { Eyebrow } from "./Eyebrow";

export function PageHero({ eyebrow, title, actions }: { eyebrow: string; title: string; actions?: React.ReactNode }) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-6 pt-6">
      <div>
        <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
        <h1 className="text-[clamp(40px,7vw,72px)] font-semibold leading-[1.02]">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </section>
  );
}
