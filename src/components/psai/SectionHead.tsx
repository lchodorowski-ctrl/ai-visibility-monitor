export function SectionHead({ title, meta, actions }: { title: string; meta?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
      <div className="flex items-baseline gap-4">
        <h2 className="text-[30px] font-semibold leading-[1.15]">{title}</h2>
        {meta}
      </div>
      {actions}
    </div>
  );
}
