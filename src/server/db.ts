import { supabaseAdmin } from './supabase-admin';

export const db = supabaseAdmin;
export const toObj = (doc: any) => doc; // Supabase returns objects directly

export function initDb() {
  console.log('Supabase Admin initialized');
}

export { supabaseAdmin as adminDb };
