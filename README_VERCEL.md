# Deploying Zinket to Vercel

This application has been refactored to support Vercel's serverless architecture.

## Steps to Deploy

1. **Export Code**: Click the **Settings** (gear icon) in AI Studio and select **Download ZIP** or **Export to GitHub**.
2. **Create Vercel Project**: Go to [Vercel](https://vercel.com) and import your repository.
3. **Configure Environment Variables**:
   In your Vercel Project Settings -> Environment Variables, add the following:
   - `FIREBASE_SERVICE_ACCOUNT_KEY`: The JSON content of your Firebase Service Account key.
   - `GEMINI_API_KEY`: Your Google Gemini API key.
   - `APP_URL`: Your Vercel deployment URL (e.g., `https://your-app.vercel.app`).
4. **Deploy**: Click Deploy.

## Background Sync (Cron)

Vercel does not support long-running background processes. Instead, this app uses **Vercel Cron Jobs**.
- The configuration is already in `vercel.json`.
- It is set to trigger the sync job every 5 minutes at `/api/cron/sync`.
- **Note**: Cron jobs are available on Vercel's Pro and Hobby plans (with some limits).

## Architecture Changes

- **API**: Moved from a custom Express server to Vercel Serverless Functions in the `/api` directory.
- **Frontend**: Standard Vite build served as static files.
- **Database**: Continues to use Firestore (Enterprise Edition), which is compatible with serverless.
