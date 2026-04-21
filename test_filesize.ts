import 'dotenv/config';
import { supabaseAdmin } from './src/server/supabase-admin.js';

async function test() {
  const { data } = await supabaseAdmin.from('recordings')
    .select('id, topic, zoom_id, file_size, status')
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(data);
}
test();
