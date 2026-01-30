import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "PEGAR_TU_PROJECT_URL";
export const SUPABASE_ANON_KEY = "PEGAR_TU_PUBLISHABLE_ANON_KEY";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
