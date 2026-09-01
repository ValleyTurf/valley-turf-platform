// Tier 1 Stage 8: push-only QuickBooks Online integration for native
// invoices (lib/invoices.ts). Jobber already has its own QuickBooks
// sync for Jobber-created invoices -- this only covers the gap: an
// invoice created natively in this app has nowhere else to land in
// QuickBooks.
//
// Unlike lib/jobber.ts, QuickBooks' REST API is fully publicly
// documented (developer.intuit.com), so this was built straight from
// the docs rather than needing a diagnostic/introspection route first
// -- there's no undocumented schema to discover here.
//
// Same OAuth token-storage shape/pattern as lib/jobber.ts: newest row
// in quickbooks_tokens wins, a fresh row is inserted (not updated) on
// every refresh so there's a history of what was issued when. The one
// real difference from Jobber is `environment` -- every request has to
// know whether it's talking to the sandbox or production API base URL
// and which realm (QuickBooks company) to scope to.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export type QuickbooksEnvironment = "sandbox" | "production";

type QuickbooksTokenRow = {
  id: string;
  access_token: string;
  refresh_token: string;
  realm_id: string;
  environment: QuickbooksEnvironment;
  created_at: string;
};

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";
const DEFAULT_ITEM_NAME = "Turf Cleaning Services";

function apiBaseUrl(environment: QuickbooksEnvironment): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function basicAuthHeader(): string {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("QBO_CLIENT_ID/QBO_CLIENT_SECRET are not set.");
  }

  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

// Step 1 of the OAuth dance -- send the user (Ryan, an admin) here to
// approve this app against a real QuickBooks company. `state` is
// round-tripped back to the callback for basic CSRF protection, same
// role as it plays in any OAuth flow.
export function getQuickbooksAuthUrl(params: { redirectUri: string; state: string }): string {
  const clientId = process.env.QBO_CLIENT_ID;

  if (!clientId) {
    throw new Error("QBO_CLIENT_ID is not set.");
  }

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);

  return url.toString();
}

// Step 2 -- the callback route calls this with the ?code= and
// ?realmId= Intuit appended to the redirect. environment is passed in
// by the caller rather than detected, since nothing in the callback
// itself distinguishes sandbox from production -- that's purely which
// set of Development/Production keys were used to build the auth URL.
export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
  realmId: string;
  environment: QuickbooksEnvironment;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.access_token || !body?.refresh_token) {
    return {
      ok: false,
      error: body?.error_description || body?.error || `Token exchange failed with status ${response.status}.`,
    };
  }

  const { error } = await supabaseServer.from("quickbooks_tokens").insert({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    realm_id: params.realmId,
    environment: params.environment,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

async function getLatestTokenRow(): Promise<QuickbooksTokenRow | null> {
  const { data, error } = await supabaseServer
    .from("quickbooks_tokens")
    .select("id, access_token, refresh_token, realm_id, environment, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as QuickbooksTokenRow;
}

async function refreshToken(tokenRow: QuickbooksTokenRow): Promise<QuickbooksTokenRow | null> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenRow.refresh_token,
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.access_token || !body?.refresh_token) {
    console.error(
      "QuickBooks token refresh failed:",
      body?.error_description || body?.error || response.status
    );
    return null;
  }

  // Intuit issues a new refresh_token on every refresh -- same
  // insert-a-fresh-row approach as lib/jobber.ts, so the newest row is
  // always the one with a still-valid refresh_token.
  const { data: newRow, error } = await supabaseServer
    .from("quickbooks_tokens")
    .insert({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      realm_id: tokenRow.realm_id,
      environment: tokenRow.environment,
    })
    .select("id, access_token, refresh_token, realm_id, environment, created_at")
    .single();

  if (error || !newRow) {
    console.error("Failed to save refreshed QuickBooks token:", error?.message);
    return null;
  }

  return newRow as QuickbooksTokenRow;
}

// Whether this app currently has a usable QuickBooks connection at
// all -- used both by the push helpers below and by anything that
// wants to show connection status in the UI.
export async function getQuickbooksConnection(): Promise<QuickbooksTokenRow | null> {
  return getLatestTokenRow();
}

type QuickbooksApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// All QuickBooks Accounting API calls go through here -- handles
// building the environment-correct base URL, attaching the bearer
// token, and a single retry-after-refresh on 401, mirroring
// lib/jobber.ts's jobberGraphQL retry behavior.
async function quickbooksRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<QuickbooksApiResult<T>> {
  let tokenRow = await getLatestTokenRow();

  if (!tokenRow) {
    return { ok: false, error: "No QuickBooks connection found. Connect QuickBooks first." };
  }

  async function makeRequest(token: string): Promise<Response> {
    return fetch(`${apiBaseUrl(tokenRow!.environment)}/v3/company/${tokenRow!.realm_id}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  }

  let response = await makeRequest(tokenRow.access_token);

  if (response.status === 401) {
    const refreshed = await refreshToken(tokenRow);

    if (!refreshed) {
      return {
        ok: false,
        error: "The QuickBooks connection expired and could not be refreshed. Reconnect QuickBooks.",
      };
    }

    tokenRow = refreshed;
    response = await makeRequest(tokenRow.access_token);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body?.Fault?.Error?.[0]?.Message ||
      body?.Fault?.Error?.[0]?.Detail ||
      body?.error_description ||
      `QuickBooks request failed with status ${response.status}.`;
    return { ok: false, error: message };
  }

  return { ok: true, data: body as T };
}

// Finds (by name) or creates the single generic income Item every
// native invoice line item maps to, per Ryan's choice to start simple
// rather than build a service-category mapping table. Cached in
// quickbooks_settings per environment so this only hits the API once,
// not on every invoice push.
async function ensureDefaultServiceItem(
  environment: QuickbooksEnvironment
): Promise<{ ok: true; itemId: string } | { ok: false; error: string }> {
  const { data: cached } = await supabaseServer
    .from("quickbooks_settings")
    .select("default_item_id")
    .eq("environment", environment)
    .maybeSingle();

  if (cached?.default_item_id) {
    return { ok: true, itemId: cached.default_item_id as string };
  }

  const query = `SELECT * FROM Item WHERE Name = '${DEFAULT_ITEM_NAME}'`;
  const existing = await quickbooksRequest<{
    QueryResponse: { Item?: { Id: string }[] };
  }>(`/query?query=${encodeURIComponent(query)}`);

  let itemId: string | null = null;

  if (existing.ok && existing.data.QueryResponse.Item?.[0]?.Id) {
    itemId = existing.data.QueryResponse.Item[0].Id;
  } else {
    // No existing item -- create one against QuickBooks' built-in
    // default income account (every QBO company has at least one
    // Income-type account out of the box) rather than requiring Ryan
    // to pre-create a Chart of Accounts entry before this works.
    const incomeAccounts = await quickbooksRequest<{
      QueryResponse: { Account?: { Id: string }[] };
    }>(`/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Income'")}`);

    const incomeAccountId = incomeAccounts.ok ? incomeAccounts.data.QueryResponse.Account?.[0]?.Id : null;

    if (!incomeAccountId) {
      return {
        ok: false,
        error: "Could not find an Income account in QuickBooks to attach the default item to.",
      };
    }

    const created = await quickbooksRequest<{ Item: { Id: string } }>("/item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Name: DEFAULT_ITEM_NAME,
        Type: "Service",
        IncomeAccountRef: { value: incomeAccountId },
      }),
    });

    if (!created.ok) {
      return { ok: false, error: created.error };
    }

    itemId = created.data.Item.Id;
  }

  await supabaseServer.from("quickbooks_settings").upsert(
    {
      environment,
      default_item_id: itemId,
      default_item_name: DEFAULT_ITEM_NAME,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "environment" }
  );

  return { ok: true, itemId: itemId! };
}

// Finds (by exact DisplayName match) or creates a QuickBooks Customer
// for a given local customer, and saves the QuickBooks Id back onto
// customers.quickbooks_customer_id so this only ever runs once per
// customer per environment.
async function ensureQuickbooksCustomer(params: {
  jobberClientId: string;
  environment: QuickbooksEnvironment;
  customerName: string | null;
  email: string | null;
  phone: string | null;
}): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const { data: existingRow } = await supabaseServer
    .from("customers")
    .select("quickbooks_customer_id, quickbooks_environment")
    .eq("jobber_client_id", params.jobberClientId)
    .maybeSingle();

  if (
    existingRow?.quickbooks_customer_id &&
    existingRow.quickbooks_environment === params.environment
  ) {
    return { ok: true, customerId: existingRow.quickbooks_customer_id as string };
  }

  const displayName = (params.customerName || "Customer").trim();
  // QuickBooks DisplayName must be unique per company -- escaping a
  // literal single quote is the one thing that would otherwise break
  // this query (QBO's query language uses SQL-style string literals).
  const escapedName = displayName.replace(/'/g, "''");

  const existing = await quickbooksRequest<{
    QueryResponse: { Customer?: { Id: string }[] };
  }>(`/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${escapedName}'`)}`);

  let customerId: string | null = null;

  if (existing.ok && existing.data.QueryResponse.Customer?.[0]?.Id) {
    customerId = existing.data.QueryResponse.Customer[0].Id;
  } else {
    const payload: Record<string, unknown> = { DisplayName: displayName };
    if (params.email) payload.PrimaryEmailAddr = { Address: params.email };
    if (params.phone) payload.PrimaryPhone = { FreeFormNumber: params.phone };

    const created = await quickbooksRequest<{ Customer: { Id: string } }>("/customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!created.ok) {
      return { ok: false, error: created.error };
    }

    customerId = created.data.Customer.Id;
  }

  await supabaseServer
    .from("customers")
    .update({
      quickbooks_customer_id: customerId,
      quickbooks_environment: params.environment,
    })
    .eq("jobber_client_id", params.jobberClientId);

  return { ok: true, customerId: customerId! };
}

export type PushInvoiceParams = {
  invoiceId: string;
  jobberClientId: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
};

// Pushes a native invoice into QuickBooks as a QuickBooks Invoice.
// Best-effort by design -- callers (app/(platform)/invoices/actions.ts)
// should never let a QuickBooks failure block the actual invoice from
// being created/sent; this returns a result the caller can log/store
// in invoices.quickbooks_push_error rather than throwing.
export async function pushInvoiceToQuickbooks(
  params: PushInvoiceParams
): Promise<{ ok: true; quickbooksInvoiceId: string } | { ok: false; error: string }> {
  const connection = await getLatestTokenRow();

  if (!connection) {
    return { ok: false, error: "No QuickBooks connection found." };
  }

  const itemResult = await ensureDefaultServiceItem(connection.environment);
  if (!itemResult.ok) return itemResult;

  const customerResult = await ensureQuickbooksCustomer({
    jobberClientId: params.jobberClientId,
    environment: connection.environment,
    customerName: params.customerName,
    email: params.customerEmail,
    phone: params.customerPhone,
  });
  if (!customerResult.ok) return customerResult;

  const lines = params.lineItems.map((item) => ({
    Amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
    DetailType: "SalesItemLineDetail",
    SalesItemLineDetail: {
      ItemRef: { value: itemResult.itemId },
      Qty: item.quantity,
      UnitPrice: item.unitPrice,
    },
    Description: item.description,
  }));

  const payload: Record<string, unknown> = {
    CustomerRef: { value: customerResult.customerId },
    TxnDate: params.issueDate,
    Line: lines,
    // DocNumber must be <=21 chars and unique per company --
    // "INV-2026-0001" (this app's format, see lib/invoices.ts) is
    // well under that.
    DocNumber: params.invoiceNumber,
  };

  if (params.dueDate) {
    payload.DueDate = params.dueDate;
  }

  const result = await quickbooksRequest<{ Invoice: { Id: string } }>("/invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, quickbooksInvoiceId: result.data.Invoice.Id };
}

export type PushPaymentParams = {
  jobberClientId: string;
  quickbooksInvoiceId: string;
  amount: number;
  paidDate: string; // ISO date, e.g. "2026-08-31"
};

// Records a QuickBooks Payment linked to an already-pushed Invoice.
// Same best-effort contract as pushInvoiceToQuickbooks above.
export async function pushPaymentToQuickbooks(
  params: PushPaymentParams
): Promise<{ ok: true; quickbooksPaymentId: string } | { ok: false; error: string }> {
  const connection = await getLatestTokenRow();

  if (!connection) {
    return { ok: false, error: "No QuickBooks connection found." };
  }

  const { data: customerRow } = await supabaseServer
    .from("customers")
    .select("quickbooks_customer_id")
    .eq("jobber_client_id", params.jobberClientId)
    .maybeSingle();

  const quickbooksCustomerId = customerRow?.quickbooks_customer_id as string | undefined;

  if (!quickbooksCustomerId) {
    return {
      ok: false,
      error: "Customer has no QuickBooks Id on file -- the invoice push may have failed earlier.",
    };
  }

  const payload = {
    CustomerRef: { value: quickbooksCustomerId },
    TotalAmt: params.amount,
    TxnDate: params.paidDate,
    Line: [
      {
        Amount: params.amount,
        LinkedTxn: [{ TxnId: params.quickbooksInvoiceId, TxnType: "Invoice" }],
      },
    ],
  };

  const result = await quickbooksRequest<{ Payment: { Id: string } }>("/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, quickbooksPaymentId: result.data.Payment.Id };
}
