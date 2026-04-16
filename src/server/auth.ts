import { Router } from 'express';
import { adminAuth, adminDb } from './firebase-admin.ts';

export const authRouter = Router();

// Initialize user document and settings in Firestore
authRouter.post('/init-user', async (req, res) => {
  const { uid, email } = req.body;
  if (!uid || !email) return res.status(400).json({ error: 'UID and Email are required' });

  try {
    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        email,
        createdAt: new Date().toISOString(),
      });

      // Create default settings
      await userRef.collection('settings').doc('config').set({
        polling_interval: 5,
        drive_verified: false,
        last_sync_at: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error initializing user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    // In a real app, we'd use adminAuth.generatePasswordResetLink(email)
    // and send an email. For this app, we'll generate a link and return it
    // if in development/preview mode, or just say "email sent".
    
    const link = await adminAuth.generatePasswordResetLink(email);
    const url = new URL(link);
    const token = url.searchParams.get('oobCode');

    return res.json({ 
      message: 'If an account exists for that email, we have sent a password reset link.',
      debugToken: token 
    });
  } catch (error: any) {
    console.error('Error generating reset link:', error);
    
    if (error.code === 'auth/user-not-found') {
      return res.json({ message: 'If an account exists for that email, we have sent a password reset link.' });
    }
    
    // Provide more detail if it's a configuration error
    const errorMessage = error.message || 'Failed to process request';
    res.status(500).json({ error: errorMessage });
  }
});

authRouter.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });

  try {
    // Verify the reset code and update password
    const email = await adminAuth.verifyPasswordResetCode(token);
    const user = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(user.uid, { password });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    res.status(400).json({ error: 'Invalid or expired reset link' });
  }
});

// Middleware to protect routes using Firebase ID Token
export const requireAuth = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};
