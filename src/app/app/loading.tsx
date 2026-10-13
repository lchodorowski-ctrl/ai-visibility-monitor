import { Skeleton, TileSkeleton } from "@/components/psai";

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-10">
      <div className="pt-6"><Skeleton className="h-3 w-40" /><Skeleton className="mt-4 h-16 w-2/3 max-w-xl" /></div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4"><TileSkeleton /><TileSkeleton /><TileSkeleton /><TileSkeleton /></div>
    </div>
  );
}
