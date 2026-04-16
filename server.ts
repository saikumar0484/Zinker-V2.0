import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { initDb } from './src/server/db';
import { authRouter } from './src/server/auth';
import { zoomRouter } from './src/server/zoom';
import { driveRouter } from './src/server/drive';
import { recordingsRouter } from './src/server/recordings';
import { startCronJob } from './src/server/cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Database
  initDb();

  // Middleware
  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json());
  app.use(cookieParser());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/zoom', zoomRouter);
  app.use('/api/drive', driveRouter);
  app.use('/api/recordings', recordingsRouter);

  // Start Background Job
  startCronJob();

  // Test Firestore Connection
  import('./src/server/firebase-admin.ts').then(({ adminDb }) => {
    adminDb.collection('users').limit(1).get()
      .then(() => console.log('✅ Firestore connection successful'))
      .catch((err) => console.error('❌ Firestore connection failed:', err.message));
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
