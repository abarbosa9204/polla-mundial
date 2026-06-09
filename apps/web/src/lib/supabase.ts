import { createBrowserClient } from '@polla/data';
import { ENV } from './env.js';

/** Cliente Supabase del navegador (clave anon, sujeto a RLS). */
export const supabase = createBrowserClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
