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
