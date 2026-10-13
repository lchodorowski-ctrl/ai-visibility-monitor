import { cn } from "cn";

export function EmptyState({
  title,
  description,
  action,
  tone = "neutral",
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div className="rounded-[28px] bg-s1 px-6 py-16 text-center">
      <div
        className={cn("mx-auto mb-5 grid size-14 place-items-center rounded-full bg-bg", tone === "error" ? "text-red" : "text-t2")}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4m0 4h.01" />
        </svg>
      </div>
      <h2 className="mb-3 text-[30px] font-semibold leading-[1.15]">{title}</h2>
      <p className="mx-auto mb-7 max-w-md text-t1">{description}</p>
      {action}
    </div>
  );
}
