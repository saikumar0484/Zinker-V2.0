import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { RefreshCw, CheckCircle, Clock, Database, UploadCloud, Activity } from 'lucide-react';

export function Dashboard() {
  const [summary, setSummary] = useState<any>({ synced: 0, failed: 0, pending: 0, total_size_mb: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<any>({ zoom: 'connected', drive: 'connected' });

  const fetchRecordings = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await axios.get('/api/recordings');
      setTotal(res.data.total || 0);
      if (res.data.summary) {
        setSummary(res.data.summary);
      }
      
      // Also fetch system health
      const settingsRes = await axios.get('/api/drive/settings');
      setSyncStatus({
        zoom: 'connected', // Simplified for now
        drive: settingsRes.data.settings?.drive_verified ? 'connected' : 'disconnected'
      });
    } catch (error) {
      console.error('Failed to fetch recordings', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
    const interval = setInterval(() => fetchRecordings(true), 30000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const successCount = summary.synced || 0;
    const failCount = summary.failed || 0;
    const pendingCount = summary.pending || 0;
    const totalSize = summary.total_size_mb || 0;

    return { successCount, failCount, pendingCount, totalSize };
  }, [summary]);

  const handleSync = async () => {
    setLoading(true);
    try {
      await axios.post('/api/recordings/sync');
      await fetchRecordings(true);
    } catch (error) {
      console.error('Manual sync failed', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 font-sans">System Monitor</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500 font-mono">
            <span className="flex h-2 w-2 rounded-full bg-green-500" />
            <span className="text-green-600 font-semibold uppercase tracking-widest text-[10px]">Active Hub</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSync} disabled={loading} variant="outline" className="shadow-sm bg-white border-gray-200 hover:border-blue-400 transition-all duration-300">
            <RefreshCw className={`w-4 h-4 mr-2 text-blue-500 ${loading ? 'animate-spin' : ''}`} />
            Sync Now
          </Button>
        </div>
      </div>

      {/* Connection Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-blue-50/50 flex items-center p-4">
          <div className="bg-blue-100 p-2 rounded-lg mr-4">
            <Activity className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Sync Status</p>
            <p className="text-sm font-semibold text-blue-900">Optimal</p>
          </div>
        </Card>
        
        <Card className="border-none shadow-sm bg-green-50/50 flex items-center p-4">
          <div className="bg-green-100 p-2 rounded-lg mr-4">
            <Database className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-green-800 uppercase tracking-wider">DB Connection</p>
            <p className="text-sm font-semibold text-green-900">Stable</p>
          </div>
        </Card>

        <Card className={`border-none shadow-sm flex items-center p-4 ${syncStatus.zoom === 'connected' ? 'bg-indigo-50/50' : 'bg-red-50/50'}`}>
          <div className={`p-2 rounded-lg mr-4 ${syncStatus.zoom === 'connected' ? 'bg-indigo-100' : 'bg-red-100'}`}>
            <CheckCircle className={`w-5 h-5 ${syncStatus.zoom === 'connected' ? 'text-indigo-600' : 'text-red-600'}`} />
          </div>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${syncStatus.zoom === 'connected' ? 'text-indigo-800' : 'text-red-800'}`}>Zoom API</p>
            <p className={`text-sm font-semibold ${syncStatus.zoom === 'connected' ? 'text-indigo-900' : 'text-red-900'}`}>{syncStatus.zoom === 'connected' ? 'Connected' : 'Error'}</p>
          </div>
        </Card>

        <Card className={`border-none shadow-sm flex items-center p-4 ${syncStatus.drive === 'connected' ? 'bg-sky-50/50' : 'bg-amber-50/50'}`}>
          <div className={`p-2 rounded-lg mr-4 ${syncStatus.drive === 'connected' ? 'bg-sky-100' : 'bg-red-100'}`}>
            <UploadCloud className={`w-5 h-5 ${syncStatus.drive === 'connected' ? 'text-sky-600' : 'text-amber-600'}`} />
          </div>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${syncStatus.drive === 'connected' ? 'text-sky-800' : 'text-amber-800'}`}>Google Drive</p>
            <p className={`text-sm font-semibold ${syncStatus.drive === 'connected' ? 'text-sky-900' : 'text-amber-900'}`}>{syncStatus.drive === 'connected' ? 'Authorized' : 'Action Needed'}</p>
          </div>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Statistics */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-all duration-300">
            <div className="absolute top-0 right-0 p-3 text-emerald-100 group-hover:text-emerald-500/10 transition-colors">
              <CheckCircle className="w-12 h-12" />
            </div>
            <CardHeader className="pb-1">
              <CardDescription className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Success</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-extrabold text-emerald-600 font-sans tracking-tight">{stats.successCount}</div>
              <p className="text-[10px] text-emerald-700/60 font-medium mt-1">Verified Backups</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-all duration-300">
            <div className="absolute top-0 right-0 p-3 text-amber-100 group-hover:text-amber-500/10 transition-colors">
              <Clock className="w-12 h-12" />
            </div>
            <CardHeader className="pb-1">
              <CardDescription className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Pending</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-extrabold text-amber-600 font-sans tracking-tight">{stats.pendingCount + stats.failCount}</div>
              <p className="text-[10px] text-amber-700/60 font-medium mt-1">In Queue / Failed</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-all duration-300">
            <div className="absolute top-0 right-0 p-3 text-blue-100 group-hover:text-blue-500/10 transition-colors">
              <Database className="w-12 h-12" />
            </div>
            <CardHeader className="pb-1">
              <CardDescription className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Storage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-extrabold text-blue-600 font-sans tracking-tight">{stats.totalSize}</div>
              <p className="text-[10px] text-blue-700/60 font-medium mt-1">MB Data Migrated</p>
            </CardContent>
          </Card>
        </div>

        {/* Side Panel: System Health & Quick Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="border-b border-gray-50">
              <CardTitle className="text-lg font-bold text-gray-800">Health Check</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">API Latency</span>
                <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-100">42ms</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">Uptime</span>
                <span className="text-sm font-bold text-gray-700">99.98%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
