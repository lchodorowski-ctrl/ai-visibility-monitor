import Link from "next/link";
import { cn } from "cn";

type Props = {
  children: React.ReactNode;
  className?: string;
  href?: string;
  hover?: boolean;
  as?: "div" | "li";
  "aria-label"?: string;
};

const base = "flex h-full flex-col overflow-hidden rounded-[28px] bg-s1 p-6 md:p-8";
const hoverCls = "transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)]";

export function Tile({ children, className, href, hover, as = "div", ...rest }: Props) {
  const cls = cn(base, (hover || href) && hoverCls, className);
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={rest["aria-label"]}>
        {children}
      </Link>
    );
  }
  const Tag = as;
  return (
    <Tag className={cls} aria-label={rest["aria-label"]}>
      {children}
    </Tag>
  );
}
