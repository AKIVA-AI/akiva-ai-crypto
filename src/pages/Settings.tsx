import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { NotificationChannelManager } from '@/components/settings/NotificationChannelManager';
import { UserRoleManager } from '@/components/settings/UserRoleManager';
import { MfaSettings } from '@/components/settings/MfaSettings';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { AvatarUpload } from '@/components/settings/AvatarUpload';
import { AccountDeletion } from '@/components/settings/AccountDeletion';
import { ExchangeAPIManager } from '@/components/intelligence/ExchangeAPIManager';
import {
  Settings as SettingsIcon,
  Server,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  RefreshCw,
  Database,
  User,
} from 'lucide-react';
import { useGlobalSettings } from '@/hooks/useControlPlane';
import { useRoleAccess, AdminOnly } from '@/components/auth/RoleGate';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export default function Settings() {
  const { data: settings, isLoading } = useGlobalSettings();
  const { isAdmin, isCIO } = useRoleAccess();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [backendUrl, setBackendUrl] = useState(settings?.api_base_url || '');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'failed'>('unknown');
  const [backendVersion, setBackendVersion] = useState<string | null>(null);

  // Profile state
  const [profileName, setProfileName] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('UTC');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Load profile data
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Sync profile data to form state
  useEffect(() => {
    if (profile) {
      setProfileName(profile.full_name ?? '');
      setProfileCompany((profile as Record<string, unknown>).company as string ?? '');
      setProfileTimezone((profile as Record<string, unknown>).timezone as string ?? 'UTC');
    }
  }, [profile]);

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      let settingsId = settings?.id;

      if (!settingsId) {
        const { data, error } = await supabase
          .from('global_settings')
          .insert({})
          .select('id')
          .single();
        if (error) throw error;
        settingsId = data.id;
      }

      const { error } = await supabase
        .from('global_settings')
        .update(updates)
        .eq('id', settingsId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-settings'] });
      toast.success('Settings updated');
    },
    onError: (error) => {
      toast.error(`Failed to update settings: ${error.message}`);
    },
  });

  const handleToggle = async (key: string, value: boolean) => {
    await updateSettings.mutateAsync({ [key]: value });
  };

  const handleSaveBackendUrl = async () => {
    await updateSettings.mutateAsync({ api_base_url: backendUrl });
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profileName.trim() || null,
        })
        .eq('id', user.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      toast.success('Profile updated');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
      toast.error(msg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const testBackendConnection = async () => {
    if (!backendUrl) {
      toast.error('Please enter a backend URL first');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('unknown');
    setBackendVersion(null);

    try {
      const healthResponse = await fetch(`${backendUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      if (!healthResponse.ok) {
        throw new Error(`Health check failed: ${healthResponse.status}`);
      }

      try {
        const versionResponse = await fetch(`${backendUrl}/version`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (versionResponse.ok) {
          const versionData = await versionResponse.json();
          setBackendVersion(versionData.version || versionData.v || JSON.stringify(versionData));
        }
      } catch {
        // Version endpoint is optional
      }

      setConnectionStatus('connected');
      toast.success('Backend connection successful');
    } catch (error) {
      setConnectionStatus('failed');
      toast.error(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const canEdit = isAdmin || isCIO;

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SettingsIcon className="h-7 w-7 text-primary" />
            System Settings
          </h1>
          <p className="text-muted-foreground">Configure global system settings, profile, and integrations</p>
        </div>

        {!canEdit && (
          <Alert variant="destructive">
            <Shield className="h-4 w-4" />
            <AlertTitle>Read-Only Access</AlertTitle>
            <AlertDescription>
              You don&apos;t have permission to modify system settings. Contact an administrator.
            </AlertDescription>
          </Alert>
        )}

        {/* Profile Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profile
            </CardTitle>
            <CardDescription>
              Your personal information and avatar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AvatarUpload
              currentUrl={profile?.avatar_url}
              onUploaded={() => queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })}
            />

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  value={user?.email ?? ''}
                  disabled
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-company">Company</Label>
                <Input
                  id="profile-company"
                  value={profileCompany}
                  onChange={(e) => setProfileCompany(e.target.value)}
                  placeholder="Company name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-timezone">Timezone</Label>
                <Input
                  id="profile-timezone"
                  value={profileTimezone}
                  onChange={(e) => setProfileTimezone(e.target.value)}
                  placeholder="UTC"
                />
              </div>
            </div>
            <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Profile
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Appearance */}
        <ThemeToggle />

        {/* MFA Settings */}
        <MfaSettings />

        {/* Trading Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Trading Controls
            </CardTitle>
            <CardDescription>
              Global trading controls that affect all books and strategies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Kill Switch */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="kill-switch" className="font-semibold">Global Kill Switch</Label>
                  {settings?.global_kill_switch && (
                    <Badge variant="destructive" className="animate-pulse">ACTIVE</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Immediately halt all trading activity across all books
                </p>
              </div>
              <Switch
                id="kill-switch"
                checked={settings?.global_kill_switch ?? false}
                onCheckedChange={(checked) => handleToggle('global_kill_switch', checked)}
                disabled={!canEdit || updateSettings.isPending}
                className={cn(settings?.global_kill_switch && "data-[state=checked]:bg-destructive")}
              />
            </div>

            <Separator />

            {/* Reduce Only Mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="reduce-only" className="font-semibold">Reduce-Only Mode</Label>
                  {settings?.reduce_only_mode && (
                    <Badge variant="warning">ENABLED</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Only allow position-reducing trades (no new positions)
                </p>
              </div>
              <Switch
                id="reduce-only"
                checked={settings?.reduce_only_mode ?? false}
                onCheckedChange={(checked) => handleToggle('reduce_only_mode', checked)}
                disabled={!canEdit || updateSettings.isPending}
              />
            </div>

            <Separator />

            {/* Paper Trading Mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="paper-mode" className="font-semibold">Paper Trading Mode</Label>
                  {settings?.paper_trading_mode && (
                    <Badge className="bg-chart-4/20 text-chart-4 border-chart-4/30">PAPER</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Simulate all trades without executing on exchanges
                </p>
              </div>
              <Switch
                id="paper-mode"
                checked={settings?.paper_trading_mode ?? false}
                onCheckedChange={(checked) => handleToggle('paper_trading_mode', checked)}
                disabled={!canEdit || updateSettings.isPending}
              />
            </div>

            <Separator />

            {/* DEX Venues */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="dex-enabled" className="font-semibold">DEX Venues Enabled</Label>
                <p className="text-sm text-muted-foreground">
                  Allow trading on decentralized exchanges
                </p>
              </div>
              <Switch
                id="dex-enabled"
                checked={settings?.dex_venues_enabled ?? true}
                onCheckedChange={(checked) => handleToggle('dex_venues_enabled', checked)}
                disabled={!canEdit || updateSettings.isPending}
              />
            </div>

            <Separator />

            {/* Meme Module */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="meme-enabled" className="font-semibold">Meme Coin Studio</Label>
                <p className="text-sm text-muted-foreground">
                  Enable the meme coin venture module
                </p>
              </div>
              <Switch
                id="meme-enabled"
                checked={settings?.meme_module_enabled ?? true}
                onCheckedChange={(checked) => handleToggle('meme_module_enabled', checked)}
                disabled={!canEdit || updateSettings.isPending}
              />
            </div>
          </CardContent>
        </Card>

        {/* Backend Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              Trading Backend Integration
            </CardTitle>
            <CardDescription>
              Configure connection to external FastAPI trading microservices
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backend-url">Backend Base URL</Label>
              <div className="flex gap-2">
                <Input
                  id="backend-url"
                  placeholder="https://api.trading-backend.example.com"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  disabled={!canEdit}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={testBackendConnection}
                  disabled={isTestingConnection || !backendUrl}
                >
                  {isTestingConnection ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  onClick={handleSaveBackendUrl}
                  disabled={!canEdit || updateSettings.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The control plane will make read-only health checks to this URL
              </p>
            </div>

            {/* Connection Status */}
            {connectionStatus !== 'unknown' && (
              <div className={cn(
                "flex items-center gap-3 p-3 rounded-lg",
                connectionStatus === 'connected' && "bg-success/10 border border-success/30",
                connectionStatus === 'failed' && "bg-destructive/10 border border-destructive/30"
              )}>
                {connectionStatus === 'connected' ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <div>
                      <p className="font-medium text-success">Connected</p>
                      {backendVersion && (
                        <p className="text-sm text-muted-foreground">Version: {backendVersion}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="font-medium text-destructive">Connection Failed</p>
                      <p className="text-sm text-muted-foreground">Check URL and try again</p>
                    </div>
                  </>
                )}
              </div>
            )}

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Security Notice</AlertTitle>
              <AlertDescription>
                This control plane never stores API keys or credentials. All privileged operations
                are performed via authenticated Edge Functions with full audit logging.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Exchange API Keys */}
        <ExchangeAPIManager />

        {/* User Role Management */}
        <UserRoleManager />

        {/* Notification Channels */}
        <NotificationChannelManager />

        {/* System Info */}
        <AdminOnly>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Environment</Label>
                  <p className="font-mono text-sm">Production</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Database</Label>
                  <p className="font-mono text-sm">Supabase (Postgres)</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Realtime</Label>
                  <p className="font-mono text-sm flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                    Connected
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Auth Provider</Label>
                  <p className="font-mono text-sm">Supabase Auth</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </AdminOnly>

        {/* Account Deletion — always last */}
        <AccountDeletion />
      </div>
    </MainLayout>
  );
}
