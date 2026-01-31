import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://dzncmwtgeaddgzrcdpaj.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6bmNtd3RnZWFkZGd6cmNkcGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MDY0MzMsImV4cCI6MjA4NTM4MjQzM30.BtXPAMppVTlshx7EedH36XkA8qD7TemPOe4KP2vxo10";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
