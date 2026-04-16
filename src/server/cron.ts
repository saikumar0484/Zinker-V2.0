import cron from 'node-cron';
import axios from 'axios';
import { google } from 'googleapis';
import { format } from 'date-fns';
import { adminDb } from './firebase-admin.ts';

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
      const usersSnap = await adminDb.collection('users').get();
      for (const userDoc of usersSnap.docs) {
        const recordingsSnap = await userDoc.ref.collection('recordings').where('status', '==', 'FAILED').get();
        for (const recDoc of recordingsSnap.docs) {
          await recDoc.ref.update({ status: 'PENDING', updatedAt: new Date().toISOString() });
        }
      }
      runSync();
    } catch (error) {
      console.error('Nightly retry failed:', error);
    }
  });
}

export async function runSyncForUser(userId: string) {
  try {
    const userRef = adminDb.collection('users').doc(userId);
    const settingsSnap = await userRef.collection('settings').doc('config').get();
    const userSetting = settingsSnap.data();

    if (!userSetting || !userSetting.drive_verified) return;

    const zoomAccountsSnap = await userRef.collection('zoom_accounts').where('zoom_verified', '==', true).get();
    
    for (const accountDoc of zoomAccountsSnap.docs) {
      const account = { id: accountDoc.id, ...accountDoc.data() };
      await processUserRecordings(userId, userSetting, account);
    }

    // Update last_sync_at
    await userRef.collection('settings').doc('config').update({ last_sync_at: new Date().toISOString() });
  } catch (error) {
    console.error(`Error processing user ${userId}:`, error);
  }
}

export async function runSync() {
  try {
    const usersSnap = await adminDb.collection('users').get();
    const now = new Date();

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const settingsSnap = await userDoc.ref.collection('settings').doc('config').get();
      const userSetting = settingsSnap.data();

      if (!userSetting || !userSetting.drive_verified) continue;

      // Check if it's time to sync based on polling_interval
      if (userSetting.last_sync_at) {
        const lastSync = new Date(userSetting.last_sync_at);
        const diffMinutes = (now.getTime() - lastSync.getTime()) / (1000 * 60);
        if (diffMinutes < (userSetting.polling_interval || 5)) {
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
      // 3. Check Firestore
      const recordingsRef = adminDb.collection('users').doc(userId).collection('recordings');
      const existingSnap = await recordingsRef.where('uuid', '==', meeting.uuid).get();

      let recordingDoc;
      if (existingSnap.empty) {
        // Insert as PENDING
        recordingDoc = await recordingsRef.add({
          zoom_account_id: zoomAccount.id,
          zoom_account_name: zoomAccount.account_name,
          meeting_id: meeting.id,
          uuid: meeting.uuid,
          meeting_name: meeting.topic,
          start_time: meeting.start_time,
          status: 'PENDING',
          files_uploaded: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } else {
        const existing = existingSnap.docs[0];
        if (existing.data().status === 'COMPLETED' || existing.data().status === 'PROCESSING') {
          continue;
        }
        recordingDoc = existing.ref;
      }

      // 4. Process PENDING or FAILED recordings
      await uploadRecording(userId, recordingDoc.id, meeting, setting, accessToken);
    }
  } catch (error) {
    console.error(`Error processing Zoom account ${zoomAccount.id} for user ${userId}:`, error);
  }
}

async function uploadRecording(userId: string, recordingId: string, meeting: any, setting: any, zoomToken: string) {
  const { drive_parent_folder_id, google_client_id, google_client_secret, google_redirect_uri, google_refresh_token } = setting;
  const recordingRef = adminDb.collection('users').doc(userId).collection('recordings').doc(recordingId);
  
  // Mark as PROCESSING
  await recordingRef.update({ status: 'PROCESSING', updatedAt: new Date().toISOString() });

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
    
    const uploadedFiles = [];
    
    if (!meeting.recording_files || meeting.recording_files.length === 0) {
      console.log(`No recording files found for meeting ${meeting.uuid}. It might still be processing.`);
      await recordingRef.update({ status: 'PENDING', updatedAt: new Date().toISOString() });
      return;
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

      const uploadedFile = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id',
      });

      uploadedFiles.push(uploadedFile.data.id);
    }

    // Mark as COMPLETED
    await recordingRef.update({
      status: 'COMPLETED',
      drive_folder_link: folderLink,
      files_uploaded: uploadedFiles,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Upload failed for meeting ${meeting.uuid}:`, error);
    await recordingRef.update({ status: 'FAILED', updatedAt: new Date().toISOString() });
  }
}
