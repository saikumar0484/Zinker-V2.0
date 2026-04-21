import { Router } from 'express';
import { google } from 'googleapis';
import { db } from './db';
import { requireAuth } from './auth';

export const driveRouter = Router();

driveRouter.get('/settings', requireAuth, async (req: any, res) => {
  try {
    const { data: settings, error } = await db
      .from('settings')
      .select('*')
      .eq('user_id', req.userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json({ settings: settings || null });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

driveRouter.post('/settings', requireAuth, async (req: any, res) => {
  const { 
    google_client_id, 
    google_client_secret, 
    google_redirect_uri, 
    google_refresh_token,
    drive_parent_folder_id, 
    drive_verified 
  } = req.body;
  
  try {
    // 1. Check if settings already exist
    const { data: existing, error: fetchError } = await db
      .from('settings')
      .select('user_id')
      .eq('user_id', req.userId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const settingsData = {
      user_id: req.userId,
      google_client_id,
      google_client_secret,
      google_redirect_uri,
      google_refresh_token,
      drive_parent_folder_id,
      drive_verified: !!drive_verified,
      last_sync_at: new Date().toISOString()
    };

    let result;
    if (existing) {
      // 2. Update existing
      result = await db
        .from('settings')
        .update(settingsData)
        .eq('user_id', req.userId);
    } else {
      // 3. Insert new
      result = await db
        .from('settings')
        .insert([settingsData]);
    }

    if (result.error) {
      console.error('Supabase error saving settings:', JSON.stringify(result.error, null, 2));
      throw result.error;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating settings:', error.message || error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

function extractFolderId(link: string): string {
  if (!link) return '';
  // Try to extract ID from various link formats
  const match = link.match(/[-\w]{25,}/);
  return match ? match[0] : link;
}

driveRouter.post('/auth-url', requireAuth, async (req: any, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  
  try {
    // 1. Store credentials temporarily in pending_oauth keyed by a UUID
    const { data: pending, error } = await db
      .from('pending_oauth')
      .insert({
        user_id: req.userId,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      })
      .select('id')
      .single();

    if (error) throw error;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent',
      state: pending.id // Use the pending ID as state
    });
    
    res.json({ url });
  } catch (error: any) {
    console.error('Error preparing auth URL:', error);
    res.status(500).json({ error: 'Failed to prepare authentication' });
  }
});

// Changed callback to use pending credentials and send tokens back to UI
driveRouter.get('/callback', async (req: any, res) => {
  const { code, state: pendingId } = req.query;
  
  if (!code || !pendingId) {
    return res.status(400).send('Missing code or state');
  }

  try {
    // 1. Retrieve pending credentials
    const { data: pending, error: fetchError } = await db
      .from('pending_oauth')
      .select('*')
      .eq('id', pendingId)
      .single();

    if (fetchError || !pending) {
      throw new Error('OAuth session expired or not found. Please try again.');
    }

    const oauth2Client = new google.auth.OAuth2(
      pending.client_id,
      pending.client_secret,
      pending.redirect_uri
    );

    const { tokens } = await oauth2Client.getToken(code as string);
    
    // 2. Clean up pending entry
    await db.from('pending_oauth').delete().eq('id', pendingId);

    // 3. Return tokens to opener window
    // We send refresh_token back to the main tab
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'GOOGLE_DRIVE_AUTH_SUCCESS', 
                tokens: ${JSON.stringify(tokens)} 
              }, '*');
              window.close();
            } else {
              window.location.href = '/settings';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('Google OAuth callback error:', error);
    res.status(400).send('Failed to authenticate with Google: ' + error.message);
  }
});

driveRouter.post('/test', requireAuth, async (req: any, res) => {
  const { clientId, clientSecret, redirectUri, refreshToken, driveFolderLink } = req.body;
  
  try {
    const parentFolderId = extractFolderId(driveFolderLink);
    
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Create a test folder
    const folderMetadata = {
      name: 'Zinker_Test_Folder',
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
      body: 'This is a test file from Zinker.',
    };

    await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
    });

    res.json({ 
      success: true, 
      folderId: parentFolderId 
    });
  } catch (error: any) {
    console.error('Drive test error:', error);
    res.status(400).json({ error: error.message || 'Failed to connect to Google Drive' });
  }
});
