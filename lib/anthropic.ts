// Server-only Anthropic client for the AI Copilot (Tier 1: ask-it-things,
// read-only). Same "quietly do nothing until configured" posture as
// lib/stripe.ts and lib/notifications.ts's Resend/Twilio guards --
// ANTHROPIC_API_KEY only needs to be set once Ryan actually wants the
// Copilot live, so getAnthropicClient() only throws when something
// tries to use it, not at import or build time.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Sonnet over Haiku: the Copilot answers real business numbers
// (revenue, margins, reactivation stats) via tool calls, and reliable
// tool-use plus not mangling a dollar figure matters more here than
// shaving a fraction of a cent off each answer. Easy to swap later --
// callers all read the model off this one constant rather than hardcoding
// a model string per call site.
export const COPILOT_MODEL = "claude-sonnet-5";

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Set it in the environment before using the AI Copilot."
    );
  }

  cachedClient = new Anthropic({ apiKey });

  return cachedClient;
}
