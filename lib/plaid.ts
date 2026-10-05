// Server-only Plaid client (bank feed, Phase 2 of the QuickBooks
// replacement). Same "quietly do nothing until configured" posture as
// lib/stripe.ts's getStripeClient() -- PLAID_CLIENT_ID/PLAID_SECRET
// aren't set until Ryan creates a Plaid developer account for Plaid
// Knickers LLC, so this only throws when something actually tries to
// use it, not at import/build time.
import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let cachedClient: PlaidApi | null = null;

function resolveEnvironment(): string {
  const env = process.env.PLAID_ENV ?? "sandbox";

  if (env !== "sandbox" && env !== "production") {
    throw new Error(
      `Invalid PLAID_ENV "${env}" -- expected "sandbox" or "production".`
    );
  }

  return PlaidEnvironments[env];
}

export function getPlaidClient(): PlaidApi {
  if (cachedClient) {
    return cachedClient;
  }

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!clientId || !secret) {
    throw new Error(
      "PLAID_CLIENT_ID/PLAID_SECRET are not configured. Set them in the environment before using Plaid."
    );
  }

  const configuration = new Configuration({
    basePath: resolveEnvironment(),
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  cachedClient = new PlaidApi(configuration);

  return cachedClient;
}

// Only used to tell the sandbox apart from production in logs/audit
// entries -- never exposes the actual secret.
export function getPlaidEnv(): string {
  return process.env.PLAID_ENV ?? "sandbox";
}
