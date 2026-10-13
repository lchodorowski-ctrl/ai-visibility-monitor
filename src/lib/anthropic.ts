import Anthropic from "@anthropic-ai/sdk";

/** Anthropic client; sends `anthropic-workspace-id` when ANTHROPIC_WORKSPACE_ID is set (needed for keys not scoped to a workspace). */
export function createAnthropic(): Anthropic {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic({ defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });
}
