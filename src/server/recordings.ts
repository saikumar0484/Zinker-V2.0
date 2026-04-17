import { Router } from 'express';
import { subDays, format } from 'date-fns';
import { db, toObj } from './db';
import { requireAuth } from './auth';
import { runSyncForUser } from './cron';

export const recordingsRouter = Router();

recordingsRouter.get('/', requireAuth, async (req: any, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const search = req.query.search as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const offset = (page - 1) * limit;

  try {
    // 1. Prepare base query for count
    let countQuery = db
      .from('recordings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.userId);

    if (search) {
      countQuery = countQuery.ilike('topic', `%${search}%`);
    }
    if (startDate) {
      countQuery = countQuery.gte('start_time', startDate);
    }
    if (endDate) {
      // Add one day to end date to include meetings on that day
      countQuery = countQuery.lte('start_time', endDate + 'T23:59:59Z');
    }

    const { count, error: countError } = await countQuery;

    if (countError) throw countError;

    // 2. Prepare base query for data
    let dataQuery = db
      .from('recordings')
      .select('*')
      .eq('user_id', req.userId);

    if (search) {
      dataQuery = dataQuery.ilike('topic', `%${search}%`);
    }
    if (startDate) {
      dataQuery = dataQuery.gte('start_time', startDate);
    }
    if (endDate) {
      dataQuery = dataQuery.lte('start_time', endDate + 'T23:59:59Z');
    }

    const { data: recordings, error: recError } = await dataQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (recError) throw recError;

    // 3. Get accounts to map names
    const { data: accounts } = await db
      .from('zoom_accounts')
      .select('id, account_name')
      .eq('user_id', req.userId);

    const accountMap = (accounts || []).reduce((acc: any, curr: any) => {
      acc[String(curr.id)] = curr.account_name;
      return acc;
    }, {});
    
    // 4. Transform results safely
    const formattedRecordings = (recordings || []).map(rec => {
      const r = rec as any;
      // 1. Priority: Use stored account name (immutable history)
      if (r.zoom_account_name) return { ...rec, account_name: r.zoom_account_name };
      
      // 2. Fallback: Map by ID if the link exists
      const accountId = r.zoom_account_id ? String(r.zoom_account_id) : null;
      if (accountId && accountMap[accountId]) {
        return { ...rec, account_name: accountMap[accountId] };
      }
      
      // 3. Heuristic: If record has no ID but user only has one account, use it
      if (!accountId && accounts && accounts.length === 1) {
        return { ...rec, account_name: accounts[0].account_name };
      }
      
      // 4. Last Resort
      return { ...rec, account_name: 'Primary' };
    });

    // 5. Global summary across all records (not just page 1) for Dashboard
    const { data: allStats } = await db
      .from('recordings')
      .select('status, file_size, start_time')
      .eq('user_id', req.userId);

    const summary = { synced: 0, failed: 0, pending: 0, total_size_mb: 0 };
    const daily_counts: Record<string, number> = {};
    
    // Initialize last 7 days with 0
    for (let i = 0; i < 7; i++) {
      daily_counts[format(subDays(new Date(), i), 'yyyy-MM-dd')] = 0;
    }

    if (allStats) {
      allStats.forEach((r: any) => {
        // Correct Status Logic: 
        // Syncing belongs in "Pending/In Queue" NOT in "Success"
        if (r.status === 'synced') {
          summary.synced++;
          if (r.file_size) summary.total_size_mb += (r.file_size / (1024 * 1024));
          
          // Count for chart - only successful syncs
          const dateKey = format(new Date(r.start_time), 'yyyy-MM-dd');
          if (daily_counts.hasOwnProperty(dateKey)) {
            daily_counts[dateKey]++;
          }
        } else if (r.status === 'failed') {
          summary.failed++;
          // Even failed/pending records might have size info we want to track globally if we were counting "potential" size,
          // but usually "Storage" card in these apps means "Occupied Storage" or "Successfully Backed Up".
        } else {
          // 'pending', 'syncing', 'processing'
          summary.pending++;
        }
      });
      summary.total_size_mb = parseFloat(summary.total_size_mb.toFixed(1));
    }

    res.json({ 
      recordings: formattedRecordings,
      total: count || 0,
      page,
      limit,
      summary,
      chartData: Object.entries(daily_counts).map(([date, count]) => ({
        date: format(new Date(date), 'MMM d'),
        count,
        rawDate: date
      })).sort((a, b) => a.rawDate.localeCompare(b.rawDate))
    });
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
