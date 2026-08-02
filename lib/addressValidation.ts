// Validates a lead's mailing address via Google's Address Validation API —
// catches typos, missing unit numbers, and undeliverable addresses at
// intake time instead of after a crew shows up. Mirrors lib/googleRoutes.ts's
// conventions: server-only, fails soft (returns null) on a missing key, a
// non-2xx response, or any network error, and a narrowly-scoped API key
// (GOOGLE_ADDRESS_VALIDATION_API_KEY, restricted to only the Address
// Validation API in Google Cloud Console) rather than reusing
// GOOGLE_ROUTES_API_KEY. Until that env var is set this always returns null
// immediately with no network call, so shipping this makes no behavioral
// difference until then.
import "server-only";

export type AddressValidationInput = {
  addressLine: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

// Mirrors Google's PossibleNextAction enum, lowercased for storage. "unknown"
// covers POSSIBLE_NEXT_ACTION_UNSPECIFIED and any value Google adds later
// that this code doesn't recognize yet.
export type AddressValidationStatus =
  | "accept"
  | "confirm"
  | "confirm_add_subpremises"
  | "fix"
  | "unknown";

export type AddressValidationResult = {
  status: AddressValidationStatus;
  formattedAddress: string | null;
  addressComplete: boolean;
  hasUnconfirmedComponents: boolean;
  latitude: number | null;
  longitude: number | null;
};

const NEXT_ACTION_STATUS: Record<string, AddressValidationStatus> = {
  ACCEPT: "accept",
  CONFIRM: "confirm",
  CONFIRM_ADD_SUBPREMISES: "confirm_add_subpremises",
  FIX: "fix",
};

export async function validateAddress(
  input: AddressValidationInput
): Promise<AddressValidationResult | null> {
  const apiKey = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;

  if (!apiKey || !input.addressLine?.trim()) {
    return null;
  }

  const addressLines = [input.addressLine.trim()];
  const cityStateZip = [input.city, input.state, input.zip]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (cityStateZip) {
    addressLines.push(cityStateZip);
  }

  const body = {
    address: {
      regionCode: "US",
      addressLines,
    },
  };

  try {
    const response = await fetch(
      "https://addressvalidation.googleapis.com/v1:validateAddress",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error(
        "Google Address Validation API request failed:",
        response.status,
        await response.text()
      );
      return null;
    }

    const json = (await response.json()) as {
      result?: {
        verdict?: {
          addressComplete?: boolean;
          hasUnconfirmedComponents?: boolean;
          possibleNextAction?: string;
        };
        address?: { formattedAddress?: string };
        geocode?: { location?: { latitude?: number; longitude?: number } };
      };
    };

    const result = json.result;

    if (!result) {
      return null;
    }

    const nextAction = result.verdict?.possibleNextAction ?? "";

    return {
      status: NEXT_ACTION_STATUS[nextAction] ?? "unknown",
      formattedAddress: result.address?.formattedAddress ?? null,
      addressComplete: result.verdict?.addressComplete ?? false,
      hasUnconfirmedComponents:
        result.verdict?.hasUnconfirmedComponents ?? false,
      latitude: result.geocode?.location?.latitude ?? null,
      longitude: result.geocode?.location?.longitude ?? null,
    };
  } catch (error) {
    console.error("Google Address Validation API error:", error);
    return null;
  }
}
