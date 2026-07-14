import { createClient } from "@supabase/supabase-js";

// Used in the browser — safe to expose, protected by Row-Level Security
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Used ONLY in API routes (server-side) — bypasses RLS, so it must never
// be imported into any page or component that ships to the browser.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
