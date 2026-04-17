import { Router } from 'express';
import axios from 'axios';
import { db, toObj } from './db';
import { requireAuth } from './auth';

export const zoomRouter = Router();

zoomRouter.get('/accounts', requireAuth, async (req: any, res) => {
  try {
    const { data: accounts, error } = await db
      .from('zoom_accounts')
      .select('*')
      .eq('user_id', req.userId);

    if (error) throw error;
    res.json({ accounts });
  } catch (error) {
    console.error('Error fetching zoom accounts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

zoomRouter.post('/accounts', requireAuth, async (req: any, res) => {
  const { account_name, zoom_account_id, zoom_client_id, zoom_client_secret, zoom_verified } = req.body;
  
  try {
    const { data, error } = await db
      .from('zoom_accounts')
      .insert([
        {
          user_id: req.userId,
          account_name,
          zoom_account_id,
          zoom_client_id,
          zoom_client_secret,
          zoom_verified: !!zoom_verified,
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      console.error('Supabase error inserting zoom account:', error);
      return res.status(500).json({ error: error.message || 'Database error' });
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from insert');
    }

    res.json({ success: true, id: data[0].id });
  } catch (error: any) {
    console.error('Error creating zoom account:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

zoomRouter.delete('/accounts/:id', requireAuth, async (req: any, res) => {
  const { id } = req.params;
  try {
    const { error } = await db
      .from('zoom_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', req.userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting zoom account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

zoomRouter.post('/test', requireAuth, async (req: any, res) => {
  const { accountId, clientId, clientSecret } = req.body;

  try {
    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await axios.post(tokenUrl, null, {
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
    });

    const accessToken = tokenResponse.data.access_token;

    // Test API call
    await axios.get('https://api.zoom.us/v2/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Zoom test error:', error.response?.data || error.message);
    let errorMessage = 'Failed to connect to Zoom';
    let tip = 'Please check your credentials and try again.';

    const responseData = error.response?.data;
    const status = error.response?.status;

    if (status === 401) {
      if (responseData?.reason === 'Invalid client_id or client_secret') {
        errorMessage = 'Invalid Client ID or Client Secret';
        tip = 'Double-check your Client ID and Client Secret in the Zoom App Marketplace. Ensure there are no extra spaces.';
      } else if (responseData?.reason === 'Invalid account_id') {
        errorMessage = 'Invalid Account ID';
        tip = 'Verify your Account ID in the Zoom App Marketplace under the "App Credentials" tab.';
      } else {
        errorMessage = 'Unauthorized (401)';
        tip = 'Ensure Server-to-Server OAuth is enabled for your Zoom app and credentials are correct.';
      }
    } else if (status === 403) {
      errorMessage = 'Forbidden (403)';
      tip = 'Your Zoom app might be missing required scopes. Ensure "recording:read:admin" and "user:read:admin" are added and authorized.';
    } else if (status === 400) {
      errorMessage = 'Bad Request (400)';
      tip = responseData?.message || 'Check your input fields for errors.';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorMessage = 'Network Error';
      tip = 'Could not reach Zoom servers. Please check your internet connection or try again later.';
    }

    res.status(status || 400).json({ error: errorMessage, tip });
  }
});
