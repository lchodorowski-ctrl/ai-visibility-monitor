import { Meta } from "./Meta";

export function TileInverse({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-8 rounded-[28px] bg-ink p-8 text-bg md:p-12">
      <div className="max-w-2xl">
        {eyebrow && <Meta className="text-bg/70">{eyebrow}</Meta>}
        <h3 className="mt-2 text-[clamp(26px,3.4vw,36px)] font-semibold leading-[1.15]">{title}</h3>
        {children && <div className="mt-3 text-bg/80">{children}</div>}
      </div>
      {action}
    </div>
  );
}
