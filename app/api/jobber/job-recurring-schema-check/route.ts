import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

// Round 3. Live error on a real recurring job attempt: "If scheduling
// recurrence is informed, duration is required." — Jobber requires
// timeframe.durationValue + timeframe.durationUnits whenever
// scheduling.recurrence is set (TimeframeAttributes' shape was already
// known from round 2; this app just wasn't sending duration at all).
// The only remaining unknown is what DurationUnit's valid enum values
// actually are (DAYS/WEEKS/MONTHS/YEARS? something else?) — this round
// introspects that directly instead of guessing a string that has to
// match exactly.
//
// Safe to delete once the recurring/pricing/instructions fields are
// confirmed working. Not linked from any UI, makes no data changes.
const SCHEMA_QUERY = `
  query JobDurationSchemaCheck {
    durationUnit: __type(name: "DurationUnit") {
      name
      enumValues {
        name
      }
    }
  }
`;

export async function GET() {
  try {
    const response = await jobberGraphQL<Record<string, unknown>>(SCHEMA_QUERY);

    if (response.errors?.length) {
      return NextResponse.json(
        { success: false, errors: response.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      schema: response.data,
    });
  } catch (error) {
    console.error("Jobber job-duration schema check failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown schema check error.",
      },
      { status: 500 }
    );
  }
}
