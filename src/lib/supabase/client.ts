import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/env";

export function getAuthStorageKey(): string {
  return `sb-${new URL(getSupabaseUrl()).hostname.split(".")[0]}-auth-token`;
}

export function createClient() {
  return createBrowserClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { auth: { storageKey: getAuthStorageKey() } }
  );
}
