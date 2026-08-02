// Anon/public Supabase client for use IN THE BROWSER — a different
// client from lib/supabase-server.ts on purpose. That one uses
// SUPABASE_SERVICE_ROLE_KEY (full access, must never reach client code —
// see its own header comment and lib/clientServerBoundary.test.ts) and
// is guarded by `import "server-only"`. This one uses
// NEXT_PUBLIC_SUPABASE_ANON_KEY, which is safe to ship in the client
// bundle (that's what "anon" means) and has no elevated permissions of
// its own.
//
// Only current use: lib/uploadVisitPhotosClient.ts's direct-to-storage
// photo upload (storage.uploadToSignedUrl), which needs a real
// supabase-js client in the browser to PUT the file bytes straight to
// Supabase's storage service, bypassing our own Vercel functions
// entirely (see lib/visitPhotoUploadAction.ts for why that matters).
// The upload is authorized by a short-lived signed token minted
// server-side with the service-role key, not by this client's own
// permissions.
import { createClient } from "@supabase/supabase-js";

export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
