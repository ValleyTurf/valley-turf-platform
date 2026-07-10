import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data: tokenRow, error: tokenError } = await supabaseServer
    .from("jobber_tokens")
    .select("access_token")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (tokenError || !tokenRow?.access_token) {
    return NextResponse.json(
      { success: false, error: "No Jobber token found" },
      { status: 401 }
    );
  }

  const response = await fetch("https://api.getjobber.com/api/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenRow.access_token}`,
      "Content-Type": "application/json",
      "X-JOBBER-GRAPHQL-VERSION": "2026-05-12",
    },
    body: JSON.stringify({
      query: `
        query GetClients {
          clients(first: 10) {
            nodes {
              id
              name
              firstName
              lastName
              companyName
              emails {
                address
              }
              phones {
                number
              }
            }
          }
        }
      `,
    }),
  });

  const data = await response.json();

  return NextResponse.json(data);
}