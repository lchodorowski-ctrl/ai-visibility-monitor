import { AppHeader } from "@/components/psai/AppHeader";
import { getCurrentProject } from "@/lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const project = await getCurrentProject();
  return (
    <>
      <AppHeader projectName={project.name} />
      <main className="mx-auto w-full max-w-page px-6 pb-20 pt-12 lg:px-12">{children}</main>
    </>
  );
}
