import { task } from "@trigger.dev/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { crawlSite, persistSitePages } from "@/lib/site/crawl";

export const crawlSiteTask = task({
  id: "crawl-site",
  queue: { concurrencyLimit: 1 },
  maxDuration: 900,
  run: async (payload: { projectId: string }) => {
    const admin = createAdminSupabase();
    const { data: project, error } = await admin.from("projects").select("site_url").eq("id", payload.projectId).single();
    if (error) throw new Error(error.message);
    const pages = await crawlSite(project.site_url);
    const result = await persistSitePages(admin, payload.projectId, pages);
    return { pages: pages.length, ok: pages.filter((p) => p.status === 200).length, ...result };
  },
});
