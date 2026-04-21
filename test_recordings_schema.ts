import 'dotenv/config';
import { supabaseAdmin } from './src/server/supabase-admin.js';

async function test() {
  const { data, error } = await supabaseAdmin.from('recordings').select('*').limit(1);
  console.log(Object.keys(data?.[0] || {}));
}
test();
