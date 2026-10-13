import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";
import { toRunProgress, needsResponseCount } from "@/lib/runs/progress";

const NO_STORE = { "Cache-Control": "no-store" };

function serverError(step: string, detail: string) {
  console.error(`GET /api/runs/[id]/progress (${step}): ${detail}`);
  return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
}

/** Live progress of one measurement: status, stage and responses written so far (RLS-scoped to the user's project). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const { data: run, error } = await supabase.from("runs").select("status, stage, queries_total")
    .eq("id", id).eq("project_id", project.id).maybeSingle();
  if (error) return serverError("runs", error.message);
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  if (!needsResponseCount(run.stage)) return NextResponse.json(toRunProgress(run, null), { headers: NO_STORE });
  const { count, error: countError } = await supabase.from("responses").select("id", { count: "exact", head: true }).eq("run_id", id);
  if (countError) return serverError("responses", countError.message);

  return NextResponse.json(toRunProgress(run, count ?? 0), { headers: NO_STORE });
}
