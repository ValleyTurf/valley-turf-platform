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

// Plaid's Node client throws a plain Axios error on a non-2xx response,
// and Axios's own Error#message is just "Request failed with status
// code 400" -- it says nothing about *why*. Plaid's actual reason lives
// in error.response.data (error_code/error_message/display_message --
// https://plaid.com/docs/errors/). Shared by every route that calls the
// Plaid client (create-link-token, exchange-token, sync) so the CRM and
// bank_connections.last_error both show that real reason instead of
// Axios's generic one.
export function describePlaidError(error: unknown): string {
  const data = (
    error as {
      response?: {
        data?: {
          error_code?: string;
          error_message?: string;
          display_message?: string | null;
        };
      };
    }
  )?.response?.data;

  if (data?.display_message) {
    return data.display_message;
  }

  if (data?.error_message) {
    return data.error_code
      ? `${data.error_message} (${data.error_code})`
      : data.error_message;
  }

  return error instanceof Error ? error.message : "Plaid request failed.";
}
