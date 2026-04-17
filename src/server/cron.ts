import cron from 'node-cron';
import axios from 'axios';
import { google } from 'googleapis';
import { format } from 'date-fns';
import { supabaseAdmin } from './supabase-admin';

export function startCronJob() {
  // Run every minute for regular sync
  cron.schedule('* * * * *', async () => {
    console.log('Running regular Zoom recording sync job...');
    runSync();
  });

  // Nightly retry at 10:00 PM
  cron.schedule('0 22 * * *', async () => {
    console.log('Running nightly retry for failed recordings...');
    try {
      const { error } = await supabaseAdmin
        .from('recordings')
        .update({ status: 'pending' })
        .eq('status', 'failed');
      
      if (error) throw error;
      runSync();
    } catch (error) {
      console.error('Nightly retry failed:', error);
    }
  });
}

export async function runSyncForUser(userId: string) {
  try {
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings || !settings.drive_verified) return;

    const { data: zoomAccounts, error: accountsError } = await supabaseAdmin
      .from('zoom_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('zoom_verified', true);
    
    if (accountsError || !zoomAccounts) return;
    
    for (const account of zoomAccounts) {
      await processUserRecordings(userId, settings, account);
    }

    // Update last_sync_at
    await supabaseAdmin
      .from('settings')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId);
  } catch (error) {
    console.error(`Error processing user ${userId}:`, error);
  }
}

export async function runSync() {
  try {
    const { data: users, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('id');

    if (usersError || !users) return;

    const now = new Date();

    for (const user of users) {
      const userId = user.id;
      const { data: settings, error: settingsError } = await supabaseAdmin
        .from('settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (settingsError || !settings || !settings.drive_verified) continue;

      // Check if it's time to sync based on polling_interval
      if (settings.last_sync_at) {
        const lastSync = new Date(settings.last_sync_at);
        const diffMinutes = (now.getTime() - lastSync.getTime()) / (1000 * 60);
        if (diffMinutes < (settings.polling_interval || 5)) {
          continue; // Skip this user for now
        }
      }

      await runSyncForUser(userId);
    }
  } catch (error) {
    console.error('Global runSync failed:', error);
  }
}

async function getZoomAccessToken(accountId: string, clientId: string, clientSecret: string) {
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await axios.post(tokenUrl, null, {
    headers: {
      Authorization: `Basic ${authHeader}`,
    },
  });

  return response.data.access_token;
}

async function processUserRecordings(userId: string, setting: any, zoomAccount: any) {
  const { zoom_account_id, zoom_client_id, zoom_client_secret } = zoomAccount;

  try {
    // 1. Get Zoom Access Token
    const accessToken = await getZoomAccessToken(zoom_account_id, zoom_client_id, zoom_client_secret);

    // 2. Fetch Recordings (last 30 days)
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const fromStr = from.toISOString().split('T')[0];

    const response = await axios.get(`https://api.zoom.us/v2/users/me/recordings?from=${fromStr}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const meetings = response.data.meetings || [];

    for (const meeting of meetings) {
      // 3. Check Supabase
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('user_id', userId)
        .eq('zoom_id', meeting.uuid)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      let recordingId;
      if (!existing) {
        // Insert as pending
        const { data: newRec, error: insertError } = await supabaseAdmin
          .from('recordings')
          .insert([
            {
              user_id: userId,
              zoom_id: meeting.uuid,
              topic: meeting.topic,
              start_time: meeting.start_time,
              duration: meeting.duration,
              status: 'pending',
              created_at: new Date().toISOString()
            }
          ])
          .select();
        
        if (insertError) throw insertError;
        recordingId = newRec[0].id;
      } else {
        if (existing.status === 'synced' || existing.status === 'syncing') {
          continue;
        }
        recordingId = existing.id;
      }

      // 4. Process pending or failed recordings
      await uploadRecording(userId, recordingId, meeting, setting, accessToken);
    }
  } catch (error) {
    console.error(`Error processing Zoom account ${zoomAccount.id} for user ${userId}:`, error);
  }
}

async function uploadRecording(userId: string, recordingId: string, meeting: any, setting: any, zoomToken: string) {
  const { drive_parent_folder_id, google_client_id, google_client_secret, google_redirect_uri, google_refresh_token } = setting;
  
  // Mark as syncing
  await supabaseAdmin
    .from('recordings')
    .update({ status: 'syncing' })
    .eq('id', recordingId);

  try {
    if (!google_refresh_token) {
      throw new Error('Google Drive is not authenticated');
    }

    const oauth2Client = new google.auth.OAuth2(google_client_id, google_client_secret, google_redirect_uri);
    oauth2Client.setCredentials({ refresh_token: google_refresh_token });
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const folderName = `${meeting.topic} - ${format(new Date(meeting.start_time), 'yyyy-MM-dd hh:mm a')}`;
    
    // Create folder in Drive
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: drive_parent_folder_id ? [drive_parent_folder_id] : undefined,
    };

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id, webViewLink',
    });

    const folderId = folder.data.id;
    const folderLink = folder.data.webViewLink;
    
    if (!meeting.recording_files || meeting.recording_files.length === 0) {
      console.log(`No recording files found for meeting ${meeting.uuid}. It might still be processing.`);
      await supabaseAdmin
        .from('recordings')
        .update({ status: 'pending' })
        .eq('id', recordingId);
      return;
    }
    
    // For simplicity, we'll just track the first file's size and download URL if needed
    const firstFile = meeting.recording_files[0];

    for (const file of meeting.recording_files) {
      console.log(`Uploading file ${file.id} (${file.file_type})`);
      
      // Download from Zoom
      const downloadUrl = `${file.download_url}?access_token=${zoomToken}`;
      const response = await axios.get(downloadUrl, { responseType: 'stream' });

      // Upload to Drive
      const fileMetadata = {
        name: `${meeting.topic}_${file.file_type}.${file.file_extension}`,
        parents: [folderId as string],
      };

      const media = {
        mimeType: response.headers['content-type'],
        body: response.data,
      };

      await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id',
      });
    }

    // Mark as synced
    await supabaseAdmin
      .from('recordings')
      .update({
        status: 'synced',
        drive_file_id: folderId,
        download_url: folderLink,
        file_size: firstFile.file_size
      })
      .eq('id', recordingId);

  } catch (error) {
    console.error(`Upload failed for meeting ${meeting.uuid}:`, error);
    await supabaseAdmin
      .from('recordings')
      .update({ status: 'failed' })
      .eq('id', recordingId);
  }
}
