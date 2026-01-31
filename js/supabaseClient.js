import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://dzncmwtgeaddgzrcdpaj.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_Ee9asI0KG4LZ9jkCGb3uow_ueRPOr3s";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
