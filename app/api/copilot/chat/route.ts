// AI Copilot (Tier 1: ask-it-things, read-only) chat endpoint. Not under
// app/(platform), so (platform)/layout.tsx's permission gate doesn't
// cover it (that only wraps page children, not API routes) -- the
// requireManager() check below is the real enforcement here, same as
// app/api/timecards/export/route.ts's requireManager() and
// app/api/backup/export/route.ts's requireAdmin() checks.
//
// The client only ever sends/receives plain {role, content} text turns
// (see app/(platform)/copilot/CopilotChat.tsx) -- all tool-calling
// happens inside this one request, server-side, in a loop capped at
// MAX_TOOL_ITERATIONS so a confused model can't spin forever or run up
// an unbounded API bill on a single question. Nothing this route (or
// any of lib/copilotTools.ts) touches is a write -- see that file's
// header comment -- so there's no confirm-before-execute step needed
// for v1.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type {
  MessageParam,
  Tool,
  TextBlock,
  ToolUseBlock,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { requireManager } from "@/lib/currentUser";
import { getAnthropicClient, COPILOT_MODEL } from "@/lib/anthropic";
import { COPILOT_TOOL_DEFINITIONS, runCopilotTool } from "@/lib/copilotTools";

const MAX_TOOL_ITERATIONS = 6;

const SYSTEM_PROMPT = `You are the internal AI Copilot for Valley Turf Revival, a lawn/turf care business. You answer staff questions about their own business data -- revenue, job costing/margins, the customer reactivation pipeline, outstanding invoices, who's currently working, and individual customer accounts.

Rules:
- Answer ONLY using the tool results you get back. Never guess at or estimate a number that a tool could give you.
- If a question needs a specific customer, call search_customers first to find their jobberClientId, then get_customer_summary.
- If a tool comes back empty or you're not confident you have what's needed to answer, say so plainly instead of filling the gap with a guess.
- Keep answers short and direct -- a sentence or two, or a short list of numbers. This is a quick lookup tool, not a report generator.
- Dollar amounts should be formatted like $1,234.56. Percentages like 24.3%.
- You have no ability to change any data -- only to look things up. If asked to do something else (send an email, change a status, etc), say that's not something you can do yet.`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function isValidHistory(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    await requireManager();
  } catch {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages =
    body && typeof body === "object" ? (body as { messages?: unknown }).messages : undefined;

  if (!isValidHistory(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages must be a non-empty array." }, { status: 400 });
  }

  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user." }, { status: 400 });
  }

  let client;
  try {
    client = getAnthropicClient();
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "The AI Copilot is not configured yet.",
      },
      { status: 503 }
    );
  }

  // MessageParam accepts string content directly for plain text turns --
  // only tool_use/tool_result turns (added below, inside this request's
  // own loop) need the structured content-block form.
  const conversation: MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await client.messages.create({
        model: COPILOT_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: conversation,
        tools: COPILOT_TOOL_DEFINITIONS as Tool[],
      });

      if (response.stop_reason !== "tool_use") {
        const reply = response.content
          .filter((block): block is TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();

        return NextResponse.json({
          reply: reply || "I don't have an answer for that.",
        });
      }

      // Model wants to call one or more tools -- run each, feed the
      // results back, and loop so it can either call another tool or
      // give a final answer on the next iteration.
      conversation.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          try {
            const result = await runCopilotTool(
              block.name,
              (block.input ?? {}) as Record<string, unknown>
            );
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: `Error: ${err instanceof Error ? err.message : "Tool failed."}`,
              is_error: true,
            };
          }
        })
      );

      conversation.push({ role: "user", content: toolResults });
    }

    return NextResponse.json(
      { error: "The Copilot took too many steps to answer that -- try rephrasing." },
      { status: 500 }
    );
  } catch (err) {
    console.error("Copilot chat failed:", err);
    return NextResponse.json(
      { error: "Something went wrong answering that." },
      { status: 500 }
    );
  }
}
