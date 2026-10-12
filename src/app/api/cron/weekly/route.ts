import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import type { runProject } from "@/trigger/run-project";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isoWeekKey } from "@/lib/runs/iso-week";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // brak sekretu = brak dostępu (nigdy nie porównujemy z pustym "Bearer undefined")
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("projects").select("id").eq("schedule", "weekly");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const projects = data ?? [];

  // klucz idempotencji: ponowne wywołanie crona w tym samym tygodniu nie uruchomi runu drugi raz
  const week = isoWeekKey(new Date());
  const settled = await Promise.allSettled(
    projects.map((p) =>
      tasks.trigger<typeof runProject>("run-project", { projectId: p.id, source: "cron" }, { idempotencyKey: `${p.id}-${week}` }),
    ),
  );
  const failed = projects.filter((_, i) => settled[i].status === "rejected").map((p) => p.id);
  return NextResponse.json(
    { triggered: projects.length - failed.length, failed },
    { status: failed.length ? 207 : 200 },
  );
}
