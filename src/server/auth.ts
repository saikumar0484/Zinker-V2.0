import { Router } from 'express';
import { supabaseAdmin } from './supabase-admin';

export const authRouter = Router();

// Initialize user document and settings in Supabase
authRouter.post('/init-user', async (req, res) => {
  const { uid, email } = req.body;
  if (!uid || !email) return res.status(400).json({ error: 'UID and Email are required' });

  try {
    // Check if user profile exists in 'profiles' table
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw fetchError;
    }

    if (!profile) {
      // Create profile
      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert([
          { id: uid, email: email, created_at: new Date().toISOString() }
        ]);
      
      if (insertError) throw insertError;

      // Create default settings
      const { error: settingsError } = await supabaseAdmin
        .from('settings')
        .insert([
          { user_id: uid, polling_interval: 5, drive_verified: false, last_sync_at: new Date().toISOString() }
        ]);
      
      if (settingsError) throw settingsError;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error initializing user:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      code: error.code
    });
  }
});

// Middleware to protect routes using Supabase Access Token
export const requireAuth = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      throw error || new Error('User not found');
    }

    req.userId = user.id;
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};
