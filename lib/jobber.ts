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

async function getLatestTokenRow(): Promise<JobberTokenRow | null> {
  const { data, error } = await supabaseServer
    .from("jobber_tokens")
    .select("id, access_token, refresh_token, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
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

  const response = await fetch("https://api.getjobber.com/api/oauth/token", {
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
  });

  const tokenData = (await response.json()) as
    | JobberTokenResponse
    | Record<string, unknown>;

  if (!response.ok || !("access_token" in tokenData)) {
    console.error("Jobber token refresh failed:", tokenData);
    return null;
  }

  const accessToken = String(tokenData.access_token);

  const refreshToken =
    "refresh_token" in tokenData && tokenData.refresh_token
      ? String(tokenData.refresh_token)
      : tokenRow.refresh_token;

  const { error } = await supabaseServer.from("jobber_tokens").insert({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    console.error("Failed to save refreshed Jobber token:", error.message);
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
): Promise<{
  data: T | null;
  errors: Array<{ message: string }> | null;
}> {
  let accessToken = await getJobberAccessToken();

  if (!accessToken) {
    return {
      data: null,
      errors: [{ message: "No Jobber connection was found." }],
    };
  }

  async function makeRequest(token: string) {
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

  const json = await response.json();

  if (!response.ok) {
    return {
      data: null,
      errors: [
        {
          message:
            json?.message ??
            `Jobber request failed with status ${response.status}.`,
        },
      ],
    };
  }

  return {
    data: json?.data ?? null,
    errors: json?.errors ?? null,
  };
}