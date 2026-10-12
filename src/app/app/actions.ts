"use server";
import { tasks } from "@trigger.dev/sdk";
import { revalidatePath } from "next/cache";
import type { runProject } from "@/trigger/run-project";
import { getCurrentProject } from "@/lib/workspace";

export async function runNow() {
  const project = await getCurrentProject();
  await tasks.trigger<typeof runProject>("run-project", { projectId: project.id, source: "manual" });
  revalidatePath("/app");
}
