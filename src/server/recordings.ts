import { Router } from 'express';
import { db, toObj } from './db';
import { requireAuth } from './auth';
import { runSyncForUser } from './cron';

export const recordingsRouter = Router();

recordingsRouter.get('/', requireAuth, async (req: any, res) => {
  try {
    const { data: recordings, error } = await db
      .from('recordings')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
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
    const { error } = await db
      .from('recordings')
      .update({ status: 'pending' })
      .eq('id', id)
      .eq('user_id', req.userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Retry failed:', error);
    res.status(500).json({ error: 'Retry failed' });
  }
});
