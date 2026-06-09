/** Cliente Supabase con service_role (bypasea RLS). Solo servidor. */
import { createServiceClient, type SupabaseClient } from '@polla/data';
import { loadEnv } from './env.js';

let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!client) {
    const env = loadEnv();
    client = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return client;
}
