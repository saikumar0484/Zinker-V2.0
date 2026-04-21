import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, History as HistoryIcon, Search, Calendar, X, AlertCircle, Lightbulb } from 'lucide-react';

export function History() {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedError, setSelectedError] = useState<{msg: string, tip: string} | null>(null);

  const fetchRecordings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate })
      });
      const res = await axios.get(`/api/recordings?${params.toString()}`);
      setRecordings(res.data.recordings);
      setTotal(res.data.total);
    } catch (error) {
      console.error('Failed to fetch recordings', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, limit, search, startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRecordings();
    }, 400); // Debounce search
    return () => clearTimeout(timer);
  }, [fetchRecordings]);

  const clearFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleRetry = async (id: number) => {
    try {
      await axios.post(`/api/recordings/${id}/retry`);
      fetchRecordings();
    } catch (error) {
      console.error('Retry failed', error);
    }
  };

  const statusColors: Record<string, string> = {
    synced: 'bg-green-500 hover:bg-green-600',
    syncing: 'bg-blue-500 hover:bg-blue-600 animate-pulse',
    failed: 'bg-red-500 hover:bg-red-600 cursor-pointer',
    pending: 'bg-gray-400 hover:bg-gray-500',
  };

  const handleViewError = (downloadUrlStr: string) => {
    try {
      if (downloadUrlStr) {
        const errObj = JSON.parse(downloadUrlStr);
        setSelectedError(errObj);
      } else {
        setSelectedError({ msg: 'Unknown error', tip: 'No additional details were saved for this error.' });
      }
    } catch (e) {
      setSelectedError({ msg: downloadUrlStr || 'Unknown error', tip: 'No additional tips available for this error.' });
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <HistoryIcon className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 font-sans">Meeting History</h1>
          </div>
          <p className="text-sm text-gray-500">Comprehensive logs of all synchronized meetings</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => fetchRecordings()} disabled={loading} variant="outline" size="sm" className="bg-white">
            <RefreshCw className={`w-4 h-4 mr-2 text-blue-500 ${loading ? 'animate-spin' : ''}`} />
            Refresh Logs
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Search Meetings</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Topic name..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-10 border-gray-200 focus:border-blue-400 focus:ring-blue-400 transition-all bg-white"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">From Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input 
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="pl-9 h-10 border-gray-200 focus:border-blue-400 transition-all bg-white"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">To Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input 
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="pl-9 h-10 border-gray-200 focus:border-blue-400 transition-all bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
           <Button 
            variant="ghost" 
            onClick={clearFilters}
            className="h-10 text-gray-400 hover:text-red-500 hover:bg-red-50"
            disabled={!search && !startDate && !endDate}
          >
            <X className="w-4 h-4 mr-2" /> Clear
          </Button>
          <Button 
            className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200"
            onClick={() => fetchRecordings()}
          >
            Apply Filters
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-xl bg-white overflow-hidden">
        <CardHeader className="bg-gray-50/80 border-b border-gray-100 px-6 py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Show</span>
              <Select value={limit.toString()} onValueChange={(v) => { setLimit(parseInt(v)); setPage(1); }}>
                <SelectTrigger className="w-[70px] h-8 text-[12px] font-bold">
                  <SelectValue placeholder="10" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-gray-500">rows</span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-sm font-medium text-gray-400 uppercase tracking-widest text-[10px]">Total: {total} Records</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 py-5">Meeting Topic</TableHead>
                  <TableHead className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 py-5">Linked to</TableHead>
                  <TableHead className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 py-5">Date & Time</TableHead>
                  <TableHead className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 py-5">Duration</TableHead>
                  <TableHead className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 py-5">Status</TableHead>
                  <TableHead className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 py-5">Size</TableHead>
                  <TableHead className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 py-5">Files</TableHead>
                  <TableHead className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 text-right px-6 py-5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: limit }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                      <TableCell colSpan={8} className="py-4">
                        <div className="h-4 bg-gray-100 rounded w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : recordings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-20 text-gray-400 italic">
                      No meeting history found.
                    </TableCell>
                  </TableRow>
                ) : (
                  recordings.map((rec) => (
                    <TableRow key={rec.id} className="hover:bg-blue-50/30 transition-all duration-200 border-b border-gray-50 last:border-0 group">
                      <TableCell className="font-bold text-gray-800 py-4 px-6">
                        <div className="flex flex-col">
                          <span>{rec.topic}</span>
                          <span className="text-[10px] font-normal text-gray-400 font-mono italic">#{rec.zoom_id.slice(-8)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className="text-[10px] font-bold border-indigo-100 text-indigo-600 bg-indigo-50/30 px-2 py-0.5 whitespace-nowrap">
                          {rec.account_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500 py-4 font-mono text-[11px] font-semibold">
                        {format(new Date(rec.start_time), 'MMM d, yyyy • h:mm a')}
                      </TableCell>
                      <TableCell className="text-gray-500 py-4 font-mono text-[11px]">{rec.duration} mins</TableCell>
                      <TableCell className="py-4">
                        {rec.status === 'failed' ? (
                          <button onClick={() => handleViewError(rec.download_url)} className="focus:outline-none focus:ring-2 focus:ring-red-400 rounded" title="Click for error details">
                            <Badge className={`${statusColors[rec.status]} text-[10px] border-none flex items-center gap-1`}>
                              {rec.status.toUpperCase()}
                              <AlertCircle className="w-3 h-3" />
                            </Badge>
                          </button>
                        ) : (
                          <Badge className={`${statusColors[rec.status]} text-[10px] border-none`}>
                            {rec.status.toUpperCase()}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-4 font-mono text-[10px] text-gray-500">
                        {rec.file_size ? `${(rec.file_size / (1024 * 1024)).toFixed(1)}MB` : '0.0MB'}
                      </TableCell>
                      <TableCell className="py-4">
                        {rec.status === 'synced' && rec.download_url ? (
                          <a href={rec.download_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold text-xs">
                            View Folder <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right py-4 px-6">
                        {/* Placeholder for future advanced actions */}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-500">
              Showing <span className="font-bold text-gray-800">{Math.min(total, (page - 1) * limit + 1)}</span> to{' '}
              <span className="font-bold text-gray-800">{Math.min(total, page * limit)}</span> of{' '}
              <span className="font-bold text-gray-800">{total}</span> results
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1}
                className="bg-white"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  let pageNum = i + 1;
                  // Simple sliding window logic if totalPages > 5
                  if (totalPages > 5 && page > 3) {
                     pageNum = page - 3 + i + 1;
                     if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                  }
                  
                  if (pageNum <= 0) return null;
                  if (pageNum > totalPages) return null;

                  return (
                    <Button 
                      key={pageNum}
                      variant={page === pageNum ? 'default' : 'outline'} 
                      size="sm"
                      className={`w-8 h-8 p-0 ${page === pageNum ? 'bg-blue-600' : 'bg-white'}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                disabled={page === totalPages || total === 0}
                className="bg-white"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedError} onOpenChange={(open) => !open && setSelectedError(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Sync Error Details
            </DialogTitle>
          </DialogHeader>
          {selectedError && (
            <div className="space-y-4 pt-2">
              <div className="bg-red-50 p-4 rounded-md border border-red-100">
                <h4 className="text-sm font-bold text-red-800 mb-1">Error Message</h4>
                <p className="text-sm text-red-700 break-words font-mono text-xs max-h-32 overflow-y-auto">{selectedError.msg}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-md border border-amber-100 flex gap-3 items-start">
                <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-800 mb-1">Resolution Tip</h4>
                  <p className="text-sm text-amber-700">{selectedError.tip}</p>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={() => setSelectedError(null)} variant="outline">Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
