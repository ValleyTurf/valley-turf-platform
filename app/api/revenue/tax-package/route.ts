// ZIP download of the tax-time package (see lib/taxPackage.ts). Gated like
// the Transactions CSV: the "financials" role_permissions section, not a
// hardcoded role.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRolePermissions, isPathAllowedForRole } from "@/lib/permissions";
import { buildTaxPackageZip } from "@/lib/taxPackage";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const permissions = await getRolePermissions();

  if (!isPathAllowedForRole("/transactions", user.role, permissions)) {
    return NextResponse.json(
      { error: "You don't have access to Financials." },
      { status: 403 }
    );
  }

  const year = Number(new URL(request.url).searchParams.get("year"));

  if (!Number.isInteger(year) || year < 2015 || year > 2100) {
    return NextResponse.json({ error: "Pick a year." }, { status: 400 });
  }

  try {
    const zip = await buildTaxPackageZip(year);

    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="valley-turf-tax-package-${year}.zip"`,
      },
    });
  } catch (error) {
    console.error("Tax package failed:", error);
    return NextResponse.json({ error: "Couldn't build the tax package." }, { status: 500 });
  }
}
