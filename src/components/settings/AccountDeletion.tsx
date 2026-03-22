import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function AccountDeletion() {
  const { user } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestDeletion = async () => {
    if (confirmText !== 'DELETE') {
      setError('Please type DELETE to confirm');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (!user?.email) {
      setError('Unable to verify identity');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Re-authenticate with password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (signInError) {
        setError('Incorrect password');
        return;
      }

      // Schedule deletion via RPC (7-day cooling-off period)
      // RPC defined in migration — cast needed until types are regenerated
      const { error: rpcError } = await (supabase.rpc as CallableFunction)(
        'schedule_account_deletion',
        { p_user_id: user.id }
      );

      if (rpcError) throw rpcError;

      toast.success('Account deletion scheduled', {
        description: 'Your account will be deleted in 7 days. Sign in again to cancel.',
        duration: 10000,
      });

      setShowDialog(false);
      setConfirmText('');
      setPassword('');

      // Sign out
      await supabase.auth.signOut();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to schedule account deletion';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data.
            This action has a 7-day cooling-off period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Account deletion is irreversible after the 7-day cooling-off period.
              All trading data, strategies, and configurations will be permanently removed.
            </AlertDescription>
          </Alert>
          <Button
            variant="destructive"
            onClick={() => setShowDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Request Account Deletion
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) {
          setConfirmText('');
          setPassword('');
          setError(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Account Deletion
            </DialogTitle>
            <DialogDescription>
              This will schedule your account for deletion after a 7-day cooling-off period.
              During this time you can sign in to cancel the deletion.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono font-bold">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="delete-password">Confirm your password</Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isLoading}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRequestDeletion}
              disabled={confirmText !== 'DELETE' || !password || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete My Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
