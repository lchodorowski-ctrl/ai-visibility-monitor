import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import type { runProject } from "@/trigger/run-project";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // brak sekretu = brak dostępu (nigdy nie porównujemy z pustym "Bearer undefined")
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminSupabase();
  const { data: projects, error } = await admin.from("projects").select("id").eq("schedule", "weekly");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const handles = await Promise.all(
    (projects ?? []).map((p) => tasks.trigger<typeof runProject>("run-project", { projectId: p.id, source: "cron" })),
  );
  return NextResponse.json({ triggered: handles.length });
}
