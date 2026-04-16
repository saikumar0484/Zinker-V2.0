import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from '../src/server/auth';
import { zoomRouter } from '../src/server/zoom';
import { driveRouter } from '../src/server/drive';
import { recordingsRouter } from '../src/server/recordings';
import { runSync } from '../src/server/cron';

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: 'vercel' });
});

// Cron endpoint
app.get('/api/cron/sync', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const secret = process.env.CRON_SECRET;
  
  // If a secret is set, require it in the Authorization header
  if (secret && authHeader !== `Bearer ${secret}`) {
    console.warn('Unauthorized cron trigger attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log('Vercel Cron: Starting sync job...');
  try {
    // We import runSync dynamically or ensure it's exported
    // Note: Since this is serverless, we might need to handle timeouts
    // if the sync takes too long.
    await (runSync as any)();
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Vercel Cron Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/zoom', zoomRouter);
app.use('/api/drive', driveRouter);
app.use('/api/recordings', recordingsRouter);

export default app;
