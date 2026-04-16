import { Router } from 'express';
import { db, toObj } from './db.ts';
import { requireAuth } from './auth.ts';
import { runSyncForUser } from './cron.ts';

export const recordingsRouter = Router();

recordingsRouter.get('/', requireAuth, async (req: any, res) => {
  try {
    const recordingsRef = db.collection('users').doc(req.userId).collection('recordings');
    const querySnapshot = await recordingsRef.orderBy('createdAt', 'desc').get();
    const recordings = querySnapshot.docs.map(toObj);
    res.json({ recordings });
  } catch (error) {
    console.error('Error fetching recordings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual sync
recordingsRouter.post('/sync', requireAuth, async (req: any, res) => {
  try {
    await runSyncForUser(req.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Manual sync failed:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Manual retry
recordingsRouter.post('/:id/retry', requireAuth, async (req: any, res) => {
  const { id } = req.params;
  try {
    const recordingRef = db.collection('users').doc(req.userId).collection('recordings').doc(id);
    await recordingRef.update({ status: 'PENDING', updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (error) {
    console.error('Retry failed:', error);
    res.status(500).json({ error: 'Retry failed' });
  }
});
