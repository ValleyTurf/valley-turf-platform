// The business's own details (name, phone, website, who signs quotes),
// read from business_settings (migration 111) with built-in defaults so
// nothing breaks before the table exists or if a read fails. Cached for a
// minute per server instance so a customer text does not cost an extra
// query every time; saving new details clears the cache on that instance
// and the rest catch up within a minute.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  buildBusiness,
  DEFAULT_BUSINESS_INPUT,
  type Business,
} from "@/lib/businessFormat";

const CACHE_MS = 60_000;

let cached: { at: number; value: Business } | null = null;

export function clearBusinessCache(): void {
  cached = null;
}

export async function getBusiness(): Promise<Business> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.value;
  }

  let value = buildBusiness(DEFAULT_BUSINESS_INPUT);

  try {
    const { data, error } = await supabaseServer
      .from("business_settings")
      .select("business_name, phone_digits, website, owner_first_name")
      .eq("id", 1)
      .maybeSingle();

    if (!error && data) {
      value = buildBusiness({
        name: data.business_name as string,
        phoneDigits: data.phone_digits as string,
        website: data.website as string,
        ownerFirstName: data.owner_first_name as string,
      });
    } else if (error) {
      console.error("getBusiness read failed, using defaults:", error.message);
    }
  } catch (error) {
    console.error("getBusiness failed, using defaults:", error);
  }

  cached = { at: Date.now(), value };

  return value;
}
