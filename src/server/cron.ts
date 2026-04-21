import cron from 'node-cron';
import axios from 'axios';
import { google } from 'googleapis';
import { format } from 'date-fns';
import { supabaseAdmin } from './supabase-admin';

export function startCronJob() {
  // Run every 5 minutes to see new meetings
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running regular Zoom recording sync job...');
    runSync();
  });

  // Nightly retry at 10:00 PM
  cron.schedule('0 22 * * *', async () => {
    console.log('Running nightly retry for failed/stuck recordings...');
    try {
      const { error } = await supabaseAdmin
        .from('recordings')
        .update({ status: 'pending' })
        .in('status', ['failed', 'syncing']);
      
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

    if (settingsError || !settings) return;

    // We proceed with Zoom sync even if Drive isn't verified yet, 
    // so recordings appear in History as 'pending'

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

    const meetings: any[] = [];
    let next_page_token = '';

    do {
      const url = `https://api.zoom.us/v2/users/me/recordings?from=${fromStr}&page_size=300${next_page_token ? `&next_page_token=${next_page_token}` : ''}`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.data.meetings) {
        meetings.push(...response.data.meetings);
      }
      next_page_token = response.data.next_page_token || '';
    } while (next_page_token);

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
        const insertData: any = {
          user_id: userId,
          zoom_id: meeting.uuid,
          topic: meeting.topic,
          start_time: meeting.start_time,
          duration: meeting.duration,
          status: 'pending',
          created_at: new Date().toISOString()
        };

        // Store account tracking info
        if (zoomAccount.account_name) {
          insertData.zoom_account_name = zoomAccount.account_name;
        }

        const { data: newRec, error: insertError } = await supabaseAdmin
          .from('recordings')
          .insert([insertData])
          .select();
        
        if (insertError) {
          // If columns don't exist, try again without the extra tracking fields
          if (insertError.message?.includes('column') && insertError.message?.includes('does not exist')) {
            const cleanData = { ...insertData };
            delete cleanData.zoom_account_name;
            
            const { data: retryRec, error: retryError } = await supabaseAdmin
              .from('recordings')
              .insert([cleanData])
              .select();
            if (retryError) throw retryError;
            recordingId = retryRec[0].id;
          } else {
            console.error('Insert error details:', insertError);
            throw insertError;
          }
        } else {
          recordingId = newRec[0].id;
        }
      } else {
        recordingId = existing.id;

        // Backfill missing account name or storage info for existing records during sync
        if (zoomAccount.id && (!existing.zoom_account_name || !existing.file_size)) {
          const updateData: any = {};
          if (!existing.zoom_account_name) updateData.zoom_account_name = zoomAccount.account_name;
          
          // Calculate and backfill total size if missing/0 (useful for correcting historical data)
          if (!existing.file_size && meeting.recording_files) {
            updateData.file_size = meeting.recording_files.reduce((acc: number, f: any) => acc + (f.file_size || 0), 0);
          }
          
          if (Object.keys(updateData).length > 0) {
            try {
              const { error } = await supabaseAdmin
                .from('recordings')
                .update(updateData)
                .eq('id', existing.id);
                
              if (error && error.code !== '42703' && !error.message?.includes('column')) {
                 console.error(`Backfill failed for ${existing.id}:`, error.message);
              }
            } catch (err) {
              // Silently catch exceptions
            }
          }
        }

        if (existing.status === 'synced' || existing.status === 'syncing') {
          continue;
        }
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
    if (!google_refresh_token || !setting.drive_verified) {
      console.log('Google Drive not ready, skipping upload for recording:', recordingId);
      await supabaseAdmin
        .from('recordings')
        .update({ status: 'pending' })
        .eq('id', recordingId);
      return;
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
    
    // Calculate total size across all files for this meeting
    let totalMeetingSize = 0;
    if (meeting.recording_files && meeting.recording_files.length > 0) {
      totalMeetingSize = meeting.recording_files.reduce((acc: number, f: any) => acc + (f.file_size || 0), 0);
    }

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
        file_size: totalMeetingSize
      })
      .eq('id', recordingId);

  } catch (error: any) {
    console.error(`Upload failed for meeting ${meeting.uuid}:`, error);
    
    // Determine user-friendly tip based on common error patterns
    let tip = "Ensure your Zoom account and Google Drive are properly connected and have sufficient permissions/storage.";
    let msg = error.message || 'Unknown error';
    
    if (msg.includes('Insufficient storage') || msg.includes('quota')) {
      tip = "Your Google Drive is out of space. Please clear some files or upgrade your Google One storage plan.";
    } else if (msg.includes('token') || msg.includes('auth') || msg.includes('refresh') || msg.includes('Invalid Credentials')) {
      tip = "Your cloud storage authorization may have expired. Please go to Settings, disconnect, and reconnect your Google Drive account.";
    } else if (msg.includes('File not found') || msg.includes('404')) {
      tip = "The recording file was not found on Zoom. It might have been deleted manually before syncing could complete.";
    } else if (msg.includes('network') || msg.includes('socket') || msg.includes('ECONNRESET')) {
      tip = "A temporary network issue occurred during transfer. The nightly job will automatically retry this.";
    }

    const errorDetails = JSON.stringify({ msg, tip });

    await supabaseAdmin
      .from('recordings')
      .update({ 
        status: 'failed',
        download_url: errorDetails 
      })
      .eq('id', recordingId);
  }
}
