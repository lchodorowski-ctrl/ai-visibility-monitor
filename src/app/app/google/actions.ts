"use server";
import { tasks } from "@trigger.dev/sdk";
import { revalidatePath } from "next/cache";
import type { gscSyncTask } from "@/trigger/gsc-sync";
import { getCurrentProject } from "@/lib/workspace";

/** Starts a Search Console sync for the current project. Two clicks within 10 minutes share one task run. */
export async function syncGscNow() {
  const project = await getCurrentProject();
  // an unreachable Trigger must not throw into the page; the status line shows whether a sync actually started
  try {
    await tasks.trigger<typeof gscSyncTask>(
      "gsc-sync",
      { projectId: project.id },
      { idempotencyKey: `gsc-sync:${project.id}:${Math.floor(Date.now() / 600_000)}`, idempotencyKeyTTL: "10m" },
    );
  } catch (e) {
    console.error("gsc-sync trigger failed", e instanceof Error ? e.message : e);
  }
  revalidatePath("/app/google");
}
