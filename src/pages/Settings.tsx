import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { CheckCircle2, XCircle, AlertCircle, Plus, Trash2, ShieldCheck } from 'lucide-react';

export function Settings() {
  const [zoomAccounts, setZoomAccounts] = useState<any[]>([]);
  const [newZoomAccount, setNewZoomAccount] = useState({
    account_name: '',
    zoom_account_id: '',
    zoom_client_id: '',
    zoom_client_secret: '',
    zoom_verified: false
  });

  const [settings, setSettings] = useState({
    google_client_id: '',
    google_client_secret: '',
    google_redirect_uri: window.location.origin + '/settings',
    drive_folder_link: '',
    drive_parent_folder_id: '',
    drive_verified: false,
    polling_interval: 5
  });

  const [testingZoom, setTestingZoom] = useState(false);
  const [addingZoom, setAddingZoom] = useState(false);
  const [testingDrive, setTestingDrive] = useState(false);
  const [savingDrive, setSavingDrive] = useState(false);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState({ title: '', message: '', tip: '', type: 'success' });

  useEffect(() => {
    fetchZoomAccounts();
    axios.get('/api/drive/settings').then(res => {
      if (res.data.settings) {
        const s = res.data.settings;
        setSettings(prev => ({ 
          ...prev, 
          ...s,
          drive_verified: !!s.drive_verified,
          google_redirect_uri: s.google_redirect_uri || window.location.origin + '/settings',
          drive_folder_link: s.drive_parent_folder_id ? `https://drive.google.com/drive/folders/${s.drive_parent_folder_id}` : ''
        }));
      }
    });
  }, []);

  const fetchZoomAccounts = async () => {
    try {
      const res = await axios.get('/api/zoom/accounts');
      setZoomAccounts(res.data.accounts);
    } catch (error) {
      console.error('Failed to fetch Zoom accounts');
    }
  };

  const extractFolderId = (link: string) => {
    if (!link) return '';
    // Matches standard folder links and open?id= links
    const match = link.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
    return match ? match[1] : link; // Fallback to link if no match (maybe they pasted the ID directly)
  };

  const showDialog = (title: string, message: string, tip: string, type: 'success' | 'error') => {
    setDialogContent({ title, message, tip, type });
    setDialogOpen(true);
  };

  const handleTestZoom = async () => {
    setTestingZoom(true);
    try {
      await axios.post('/api/zoom/test', {
        accountId: newZoomAccount.zoom_account_id,
        clientId: newZoomAccount.zoom_client_id,
        clientSecret: newZoomAccount.zoom_client_secret
      });
      setNewZoomAccount(prev => ({ ...prev, zoom_verified: true }));
      showDialog('Zoom Connected', 'Zoom credentials validated successfully.', '', 'success');
    } catch (error: any) {
      setNewZoomAccount(prev => ({ ...prev, zoom_verified: false }));
      showDialog('Zoom Connection Failed', error.response?.data?.error || 'Unknown error', error.response?.data?.tip || '', 'error');
    } finally {
      setTestingZoom(false);
    }
  };

  const handleAddZoomAccount = async () => {
    setAddingZoom(true);
    try {
      await axios.post('/api/zoom/accounts', newZoomAccount);
      setNewZoomAccount({
        account_name: '',
        zoom_account_id: '',
        zoom_client_id: '',
        zoom_client_secret: '',
        zoom_verified: false
      });
      fetchZoomAccounts();
      showDialog('Account Added', 'Zoom account added successfully.', '', 'success');
    } catch (error) {
      showDialog('Error', 'Failed to add Zoom account.', '', 'error');
    } finally {
      setAddingZoom(false);
    }
  };

  const handleDeleteZoomAccount = async (id: number) => {
    try {
      await axios.delete(`/api/zoom/accounts/${id}`);
      fetchZoomAccounts();
    } catch (error) {
      showDialog('Error', 'Failed to delete Zoom account.', '', 'error');
    }
  };

  const handleConnectDrive = async () => {
    try {
      const folderId = extractFolderId(settings.drive_folder_link);
      const res = await axios.post('/api/drive/auth-url', {
        clientId: settings.google_client_id,
        clientSecret: settings.google_client_secret,
        redirectUri: settings.google_redirect_uri
      });
      
      // Save settings first so we don't lose them
      await handleSaveDrive(false, folderId);
      
      // Redirect to Google OAuth
      window.location.href = res.data.url;
    } catch (error) {
      showDialog('Error', 'Failed to generate Auth URL.', 'Check your client ID and secret.', 'error');
    }
  };

  const handleTestDrive = async () => {
    setTestingDrive(true);
    try {
      const folderId = extractFolderId(settings.drive_folder_link);
      await axios.post('/api/drive/test', {
        clientId: settings.google_client_id,
        clientSecret: settings.google_client_secret,
        redirectUri: settings.google_redirect_uri,
        parentFolderId: folderId
      });
      setSettings(prev => ({ ...prev, drive_verified: true, drive_parent_folder_id: folderId }));
      showDialog('Drive Connected', 'Drive connected successfully. Test file uploaded.', '', 'success');
    } catch (error: any) {
      setSettings(prev => ({ ...prev, drive_verified: false }));
      showDialog('Drive Connection Failed', error.response?.data?.error || 'Unknown error', error.response?.data?.tip || '', 'error');
    } finally {
      setTestingDrive(false);
    }
  };

  const handleSaveDrive = async (showPopup = true, folderIdOverride?: string) => {
    setSavingDrive(true);
    try {
      const folderId = folderIdOverride || extractFolderId(settings.drive_folder_link);
      await axios.post('/api/drive/settings', {
        google_client_id: settings.google_client_id,
        google_client_secret: settings.google_client_secret,
        google_redirect_uri: settings.google_redirect_uri,
        drive_parent_folder_id: folderId,
        drive_verified: settings.drive_verified
      });
      if (showPopup) showDialog('Saved', 'Drive settings saved successfully.', '', 'success');
    } catch (error) {
      if (showPopup) showDialog('Error', 'Failed to save Drive settings.', '', 'error');
    } finally {
      setSavingDrive(false);
    }
  };

  // Handle OAuth callback if code is in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code && settings.google_client_id) {
      axios.post('/api/drive/callback', {
        code,
        clientId: settings.google_client_id,
        clientSecret: settings.google_client_secret,
        redirectUri: settings.google_redirect_uri
      }).then(() => {
        showDialog('Authenticated', 'Successfully authenticated with Google Drive. You can now test the upload.', '', 'success');
        // Remove code from URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }).catch(() => {
        showDialog('Auth Failed', 'Failed to authenticate with Google Drive.', '', 'error');
      });
    }
  }, [settings.google_client_id]);

  return (
    <div className="space-y-8 max-w-3xl pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuration</h1>
        <p className="text-gray-500 mt-2">Complete the step-by-step setup to enable auto-uploads.</p>
      </div>

      {/* STEP 1: ZOOM ACCOUNTS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-800">1</span>
            Zoom Accounts
          </h2>
          <Badge variant="outline">{zoomAccounts.length} Connected</Badge>
        </div>

        {zoomAccounts.length > 0 && (
          <div className="grid gap-4">
            {zoomAccounts.map((account) => (
              <Card key={account.id} className="border-green-100 bg-green-50/30">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <ShieldCheck className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{account.account_name}</p>
                      <p className="text-xs text-gray-500">ID: {account.zoom_account_id}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteZoomAccount(account.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Zoom Account
            </CardTitle>
            <CardDescription>Connect another Zoom account for recording backup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account_name">Account Label</Label>
              <Input id="account_name" value={newZoomAccount.account_name} onChange={e => setNewZoomAccount({...newZoomAccount, account_name: e.target.value})} placeholder="e.g. Personal, Work, Client A"/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zoom_account_id">Account ID</Label>
              <Input id="zoom_account_id" value={newZoomAccount.zoom_account_id} onChange={e => setNewZoomAccount({...newZoomAccount, zoom_account_id: e.target.value, zoom_verified: false})} placeholder="e.g. yXb_..."/>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zoom_client_id">Client ID</Label>
                <Input id="zoom_client_id" value={newZoomAccount.zoom_client_id} onChange={e => setNewZoomAccount({...newZoomAccount, zoom_client_id: e.target.value, zoom_verified: false})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zoom_client_secret">Client Secret</Label>
                <Input id="zoom_client_secret" type="password" value={newZoomAccount.zoom_client_secret} onChange={e => setNewZoomAccount({...newZoomAccount, zoom_client_secret: e.target.value, zoom_verified: false})} />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-4 border-t pt-6">
            {!newZoomAccount.zoom_verified && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                You must test the connection before adding.
              </p>
            )}
            <div className="flex justify-between w-full">
              <Button variant="outline" onClick={handleTestZoom} disabled={testingZoom || !newZoomAccount.zoom_account_id || !newZoomAccount.zoom_client_id || !newZoomAccount.zoom_client_secret}>
                {testingZoom ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button onClick={handleAddZoomAccount} disabled={addingZoom || !newZoomAccount.zoom_verified || !newZoomAccount.account_name}>
                {addingZoom ? 'Adding...' : 'Add Account'}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* STEP 2: GOOGLE DRIVE */}
      <Card className={zoomAccounts.length === 0 ? "opacity-50 pointer-events-none" : settings.drive_verified ? "border-green-200" : "border-blue-200"}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-800">2</span>
                Google Drive Configuration
              </CardTitle>
              <CardDescription className="mt-1.5">Configure OAuth to upload recordings.</CardDescription>
            </div>
            {settings.drive_verified && <CheckCircle2 className="h-6 w-6 text-green-500" />}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="google_client_id">Google Client ID</Label>
            <Input id="google_client_id" value={settings.google_client_id} onChange={e => setSettings({...settings, google_client_id: e.target.value, drive_verified: false})} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_client_secret">Google Client Secret</Label>
            <Input id="google_client_secret" type="password" value={settings.google_client_secret} onChange={e => setSettings({...settings, google_client_secret: e.target.value, drive_verified: false})} />
          </div>
          <div className="space-y-2">
            <Label>Authorized Redirect URI</Label>
            <div className="flex gap-2">
              <Input value={settings.google_redirect_uri} readOnly className="bg-gray-50 font-mono text-xs" />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  navigator.clipboard.writeText(settings.google_redirect_uri);
                  showDialog('Copied', 'Redirect URI copied to clipboard.', '', 'success');
                }}
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-gray-500">Copy this URI and add it to the "Authorized redirect URIs" section in your Google Cloud Console.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="drive_folder_link">Google Drive Folder Link</Label>
            <Input id="drive_folder_link" value={settings.drive_folder_link} onChange={e => setSettings({...settings, drive_folder_link: e.target.value, drive_verified: false})} placeholder="https://drive.google.com/drive/folders/..." />
            <p className="text-xs text-gray-500">Paste the link to the folder where recordings should be uploaded.</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-4 border-t pt-6">
          {!settings.drive_verified && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              You must test the upload before saving.
            </p>
          )}
          <div className="flex justify-between w-full">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleConnectDrive} disabled={!settings.google_client_id || !settings.google_client_secret}>
                Connect Google Drive
              </Button>
              <Button variant="secondary" onClick={handleTestDrive} disabled={testingDrive || !settings.google_client_id || !settings.drive_folder_link}>
                {testingDrive ? 'Testing...' : 'Test Upload'}
              </Button>
            </div>
            <Button onClick={() => handleSaveDrive(true)} disabled={savingDrive || !settings.drive_verified}>
              {savingDrive ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogContent.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
              {dialogContent.title}
            </DialogTitle>
            <DialogDescription className="pt-2 text-base text-gray-700">
              {dialogContent.message}
            </DialogDescription>
          </DialogHeader>
          {dialogContent.tip && (
            <div className="bg-blue-50 p-3 rounded-md flex items-start gap-2 mt-2">
              <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700"><strong>Tip:</strong> {dialogContent.tip}</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
