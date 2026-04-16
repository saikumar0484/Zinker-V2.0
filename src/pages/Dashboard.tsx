import { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { RefreshCw, ExternalLink } from 'lucide-react';

export function Dashboard() {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecordings = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await axios.get('/api/recordings');
      setRecordings(res.data.recordings);
    } catch (error) {
      console.error('Failed to fetch recordings', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
    // Refresh the UI every 30 seconds to show latest status
    const interval = setInterval(() => fetchRecordings(true), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (id: number) => {
    try {
      await axios.post(`/api/recordings/${id}/retry`);
      fetchRecordings();
    } catch (error) {
      console.error('Retry failed', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <Badge className="bg-green-500">Completed</Badge>;
      case 'PROCESSING': return <Badge className="bg-blue-500">Processing</Badge>;
      case 'FAILED': return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 font-sans">Dashboard</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500 font-mono">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-600 font-medium">Background sync active</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => fetchRecordings()} disabled={loading} variant="outline" className="shadow-sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-md bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider font-mono">Total Backups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 font-sans">{recordings.length}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider font-mono">Successful Syncs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 font-sans">
              {recordings.filter(r => r.status === 'COMPLETED').length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider font-mono">Pending/Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600 font-sans">
              {recordings.filter(r => r.status !== 'COMPLETED').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-lg bg-white overflow-hidden">
        <CardHeader className="bg-gray-50 border-b border-gray-100">
          <CardTitle className="text-lg font-semibold text-gray-800">Recent Recordings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider text-gray-400 py-4">Meeting Name</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider text-gray-400 py-4">Zoom Account</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider text-gray-400 py-4">Date & Time</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider text-gray-400 py-4">Status</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider text-gray-400 py-4">Files</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider text-gray-400 py-4">Drive Link</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider text-gray-400 py-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-gray-400 italic font-sans">
                      No recordings found. Check your settings and wait for the next sync.
                    </TableCell>
                  </TableRow>
                ) : (
                  recordings.map((rec) => {
                    const files = JSON.parse(rec.files_uploaded || '[]');
                    return (
                      <TableRow key={rec.id} className="hover:bg-gray-50/80 transition-colors border-b border-gray-100 last:border-0">
                        <TableCell className="font-medium text-gray-900 py-4">{rec.meeting_name}</TableCell>
                        <TableCell className="py-4">
                          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-tight bg-gray-50 text-gray-600 border-gray-200">
                            {rec.zoom_account_name || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600 py-4 font-mono text-sm">{format(new Date(rec.start_time), 'MMM d, yyyy h:mm a')}</TableCell>
                        <TableCell className="py-4">{getStatusBadge(rec.status)}</TableCell>
                        <TableCell className="text-gray-500 py-4 font-mono text-xs">{files.length} files</TableCell>
                        <TableCell className="py-4">
                          {rec.drive_folder_link ? (
                            <a href={rec.drive_folder_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 font-medium text-sm">
                              View Folder <ExternalLink className="w-3.3 h-3.3" />
                            </a>
                          ) : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="text-right py-4">
                          {rec.status === 'FAILED' && (
                            <Button variant="outline" size="sm" onClick={() => handleRetry(rec.id)} className="h-8 px-3 text-xs font-semibold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all">
                              Retry Sync
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
