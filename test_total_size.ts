import 'dotenv/config';
import axios from 'axios';
import { supabaseAdmin } from './src/server/supabase-admin.js';
import { refreshZoomToken } from './src/server/cron.js';

async function test() {
  const { data: accounts } = await supabaseAdmin.from('zoom_accounts').select('*').limit(1);
  if (!accounts || accounts.length === 0) return console.log('no account');
  const zoomAccount = accounts[0];
  const token = await refreshZoomToken(zoomAccount.id);
  
  try {
     const response = await axios.get(`https://api.zoom.us/v2/users/me/recordings?from=2024-01-01&to=2026-04-21`, {
        headers: { Authorization: `Bearer ${token}` }
     });
     
     const meetings = response.data.meetings || [];
     console.log(`Found ${meetings.length} meetings`);
     for (const m of meetings.slice(0, 3)) {
         console.log(`\nMeeting: ${m.topic}`);
         console.log(`  Top-Level total_size: ${m.total_size} bytes`);
         const totalPerFiles = m.recording_files?.reduce((acc: any, f: any) => acc + (f.file_size || 0), 0);
         console.log(`  Sum of recording_files sizes: ${totalPerFiles} bytes`);
         for (const f of m.recording_files || []) {
             console.log(`    - File: ${f.file_type}, Size: ${f.file_size}`);
         }
     }
  } catch(e: any) {
    console.error(e.response?.data || e.message);
  }
}
test();
