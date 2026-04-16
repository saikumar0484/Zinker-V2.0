import { Router } from 'express';
import { google } from 'googleapis';
import { db } from './db';
import { requireAuth } from './auth';

export const driveRouter = Router();

driveRouter.get('/settings', requireAuth, async (req: any, res) => {
  try {
    const settingsRef = db.collection('users').doc(req.userId).collection('settings').doc('config');
    const settingsSnap = await settingsRef.get();
    res.json({ settings: settingsSnap.exists ? settingsSnap.data() : null });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

driveRouter.post('/settings', requireAuth, async (req: any, res) => {
  const { google_client_id, google_client_secret, google_redirect_uri, drive_parent_folder_id, drive_verified } = req.body;
  
  try {
    const settingsRef = db.collection('users').doc(req.userId).collection('settings').doc('config');
    await settingsRef.set({
      google_client_id,
      google_client_secret,
      google_redirect_uri,
      drive_parent_folder_id,
      drive_verified: !!drive_verified,
      last_sync_at: new Date().toISOString()
    }, { merge: true });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

driveRouter.post('/auth-url', requireAuth, (req: any, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent'
  });
  
  res.json({ url });
});

driveRouter.post('/callback', requireAuth, async (req: any, res) => {
  const { code, clientId, clientSecret, redirectUri } = req.body;
  
  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      const settingsRef = db.collection('users').doc(req.userId).collection('settings').doc('config');
      await settingsRef.set({ google_refresh_token: tokens.refresh_token }, { merge: true });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Google OAuth callback error:', error);
    res.status(400).json({ error: 'Failed to authenticate with Google' });
  }
});

driveRouter.post('/test', requireAuth, async (req: any, res) => {
  const { clientId, clientSecret, redirectUri, parentFolderId } = req.body;
  
  try {
    const settingsRef = db.collection('users').doc(req.userId).collection('settings').doc('config');
    const settingsSnap = await settingsRef.get();
    const settings = settingsSnap.data();

    if (!settings?.google_refresh_token) {
      return res.status(400).json({ error: 'Not authenticated with Google Drive', tip: 'Please connect your Google Drive account first.' });
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: settings.google_refresh_token });
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Create a test folder
    const folderMetadata = {
      name: 'ZoomSync_Test_Folder',
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentFolderId ? [parentFolderId] : undefined,
    };

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id',
    });

    // Upload a test file
    const fileMetadata = {
      name: 'test.txt',
      parents: [folder.data.id as string],
    };

    const media = {
      mimeType: 'text/plain',
      body: 'This is a test file from ZoomSync.',
    };

    await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Drive test error:', error);
    let errorMessage = 'Failed to connect to Google Drive';
    let tip = 'Please check your credentials and try again.';

    const status = error.response?.status;
    const responseData = error.response?.data;
    const errorMsg = error.message || '';

    if (status === 401) {
      errorMessage = 'Unauthorized (401)';
      tip = 'Your Google Drive session might have expired. Please try connecting your Google account again.';
    } else if (status === 403) {
      errorMessage = 'Permission Denied (403)';
      tip = 'Ensure the Google Drive API is enabled in your Google Cloud Console and that you have granted the necessary permissions.';
    } else if (errorMsg.includes('redirect_uri_mismatch')) {
      errorMessage = 'Redirect URI Mismatch';
      tip = 'The Redirect URI in your Google Cloud Console must EXACTLY match the one shown in this app (including trailing slashes).';
    } else if (errorMsg.includes('invalid_client')) {
      errorMessage = 'Invalid Client ID or Secret';
      tip = 'Verify your Google Client ID and Client Secret in the Google Cloud Console Credentials page.';
    } else if (responseData?.error?.message?.includes('File not found')) {
      errorMessage = 'Folder Not Found';
      tip = 'The Google Drive folder link you provided could not be found. Ensure the folder exists and you have access to it.';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorMessage = 'Network Error';
      tip = 'Could not reach Google servers. Please check your internet connection or try again later.';
    }

    res.status(status || 400).json({ error: errorMessage, tip });
  }
});
