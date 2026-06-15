import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseAdminConfig {
  url: string;
  service_role_key: string;
}

export type SupabaseAdminConfigResult =
  | { ok: true; value: SupabaseAdminConfig }
  | { ok: false; reason: "missing_config" };

export function createSupabaseAdminConfigFromEnv(
  env: Record<string, string | undefined>,
): SupabaseAdminConfigResult {
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return { ok: false, reason: "missing_config" };
  }

  return {
    ok: true,
    value: {
      url,
      service_role_key: serviceRoleKey,
    },
  };
}

export function getSupabaseAdminConfig(): SupabaseAdminConfigResult {
  assertServerRuntime();

  return createSupabaseAdminConfigFromEnv(process.env);
}

export function isSupabaseConfigured(
  env?: Record<string, string | undefined>,
): boolean {
  if (env === undefined) {
    assertServerRuntime();
  }

  return createSupabaseAdminConfigFromEnv(env ?? process.env).ok;
}

export function createSupabaseAdminClient(
  config: SupabaseAdminConfig,
): SupabaseClient {
  assertServerRuntime();

  return createClient(config.url, config.service_role_key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function assertServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new Error("Supabase admin client can only be used on the server.");
  }
}
