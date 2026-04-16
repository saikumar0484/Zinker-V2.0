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

## Background Sync (External Trigger)

Since Vercel's Hobby plan limits internal crons to once per day, you can use an external service like **[Cron-job.org](https://cron-job.org)** to trigger the sync every 5 minutes.

### Setup Instructions:
1.  **Set a Secret**: In your Vercel Environment Variables, add a `CRON_SECRET` (e.g., a random string like `my-secret-123`).
2.  **Create Cron Job**: On Cron-job.org, create a new job:
    *   **URL**: `https://your-app.vercel.app/api/cron/sync`
    *   **Schedule**: Every 5 minutes.
    *   **HTTP Headers**: Add a header named `Authorization` with the value `Bearer your-secret-here`.
3.  **Save**: Now your app will sync every 5 minutes regardless of Vercel's plan limits!

## Architecture Changes

- **API**: Moved from a custom Express server to Vercel Serverless Functions in the `/api` directory.
- **Frontend**: Standard Vite build served as static files.
- **Database**: Continues to use Firestore (Enterprise Edition), which is compatible with serverless.
