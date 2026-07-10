import { supabaseServer } from "@/lib/supabase-server";

type JobberTokenRow = {
  id: string;
  access_token: string;
  refresh_token: string;
  created_at: string;
};

type JobberTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

type JobberGraphQLError = {
  message: string;
};

type JobberGraphQLResponse<T> = {
  data: T | null;
  errors: JobberGraphQLError[] | null;
};

async function readResponseBody(
  response: Response
): Promise<Record<string, unknown> | string | null> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
}

function getResponseMessage(
  body: Record<string, unknown> | string | null,
  fallback: string
): string {
  if (typeof body === "string") {
    return body.trim() || fallback;
  }

  if (body && typeof body.message === "string") {
    return body.message;
  }

  if (body && typeof body.error === "string") {
    return body.error;
  }

  return fallback;
}

async function getLatestTokenRow(): Promise<JobberTokenRow | null> {
  const { data, error } = await supabaseServer
    .from("jobber_tokens")
    .select("id, access_token, refresh_token, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    console.error(
      "Could not load the latest Jobber token:",
      error?.message ?? "No token row found."
    );

    return null;
  }

  return data as JobberTokenRow;
}

async function refreshJobberToken(
  tokenRow: JobberTokenRow
): Promise<string | null> {
  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing Jobber client credentials.");
    return null;
  }

  const response = await fetch(
    "https://api.getjobber.com/api/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenRow.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
    }
  );

  const body = await readResponseBody(response);

  if (!response.ok) {
    console.error(
      "Jobber token refresh failed:",
      getResponseMessage(
        body,
        `Token refresh failed with status ${response.status}.`
      )
    );

    return null;
  }

  if (
    !body ||
    typeof body === "string" ||
    typeof body.access_token !== "string"
  ) {
    console.error(
      "Jobber token refresh did not return an access token:",
      body
    );

    return null;
  }

  const tokenData = body as JobberTokenResponse;
  const accessToken = tokenData.access_token;

  const refreshToken =
    typeof tokenData.refresh_token === "string" &&
    tokenData.refresh_token.length > 0
      ? tokenData.refresh_token
      : tokenRow.refresh_token;

  const { error: saveError } = await supabaseServer
    .from("jobber_tokens")
    .insert({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

  if (saveError) {
    console.error(
      "Failed to save refreshed Jobber token:",
      saveError.message
    );

    return null;
  }

  return accessToken;
}

export async function getJobberAccessToken(
  forceRefresh = false
): Promise<string | null> {
  const tokenRow = await getLatestTokenRow();

  if (!tokenRow) {
    return null;
  }

  if (forceRefresh) {
    return refreshJobberToken(tokenRow);
  }

  return tokenRow.access_token;
}

export async function jobberGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<JobberGraphQLResponse<T>> {
  let accessToken = await getJobberAccessToken();

  if (!accessToken) {
    return {
      data: null,
      errors: [
        {
          message: "No Jobber connection was found.",
        },
      ],
    };
  }

  async function makeRequest(token: string): Promise<Response> {
    return fetch("https://api.getjobber.com/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-JOBBER-GRAPHQL-VERSION": "2026-05-12",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      cache: "no-store",
    });
  }

  let response = await makeRequest(accessToken);

  if (response.status === 401) {
    const refreshedToken = await getJobberAccessToken(true);

    if (!refreshedToken) {
      return {
        data: null,
        errors: [
          {
            message:
              "The Jobber connection expired and could not be refreshed. Reconnect Jobber.",
          },
        ],
      };
    }

    accessToken = refreshedToken;
    response = await makeRequest(accessToken);
  }

  const body = await readResponseBody(response);

  /*
   * Jobber may return an HTTP 429 response or occasionally a
   * non-JSON provider response when the request is throttled.
   * Normalize either situation into an error the sync route can retry.
   */
  if (response.status === 429) {
    return {
      data: null,
      errors: [
        {
          message: `Throttled: ${getResponseMessage(
            body,
            "Jobber rate limit reached."
          )}`,
        },
      ],
    };
  }

  if (!response.ok) {
    const message = getResponseMessage(
      body,
      `Jobber request failed with status ${response.status}.`
    );

    const looksThrottled =
      response.status === 503 ||
      message.toLowerCase().includes("throttl") ||
      message.toLowerCase().includes("rate limit") ||
      message.toLowerCase().includes("provider");

    return {
      data: null,
      errors: [
        {
          message: looksThrottled
            ? `Throttled: ${message}`
            : message,
        },
      ],
    };
  }

  if (!body) {
    return {
      data: null,
      errors: [
        {
          message: "Jobber returned an empty response.",
        },
      ],
    };
  }

  if (typeof body === "string") {
    const looksThrottled =
      body.toLowerCase().includes("throttl") ||
      body.toLowerCase().includes("rate limit") ||
      body.toLowerCase().includes("provider");

    return {
      data: null,
      errors: [
        {
          message: looksThrottled
            ? `Throttled: ${body}`
            : `Jobber returned an unexpected response: ${body}`,
        },
      ],
    };
  }

  const graphqlErrors = Array.isArray(body.errors)
    ? body.errors
        .map((error) => {
          if (
            error &&
            typeof error === "object" &&
            "message" in error &&
            typeof error.message === "string"
          ) {
            return {
              message: error.message,
            };
          }

          return {
            message: "Jobber returned an unknown GraphQL error.",
          };
        })
    : null;

  return {
    data: (body.data as T | undefined) ?? null,
    errors: graphqlErrors,
  };
}