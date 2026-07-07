import { createClient } from "@supabase/supabase-js";

console.log(
  "Service key exists:",
  !!process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);