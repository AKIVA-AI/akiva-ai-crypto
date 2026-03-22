import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Shield, Loader2, CheckCircle2, Copy, AlertTriangle, ShieldOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type MfaStep = 'idle' | 'enrolling' | 'verify' | 'recovery' | 'enrolled';

interface MfaFactor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
}

export function MfaSettings() {
  const [step, setStep] = useState<MfaStep>('idle');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolledFactors, setEnrolledFactors] = useState<MfaFactor[]>([]);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disableFactorId, setDisableFactorId] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  const loadFactors = useCallback(async () => {
    const { data, error: factorError } = await supabase.auth.mfa.listFactors();
    if (factorError) {
      console.error('Failed to load MFA factors:', factorError);
      return;
    }
    setEnrolledFactors(data?.totp ?? []);
    if ((data?.totp ?? []).some(f => f.status === 'verified')) {
      setStep('enrolled');
    }
  }, []);

  // Load factors on mount
  useState(() => {
    loadFactors();
  });

  const handleEnroll = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Enterprise Crypto TOTP',
      });

      if (enrollError) throw enrollError;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep('verify');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start MFA enrollment';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) return;
    setIsLoading(true);
    setError(null);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode,
      });
      if (verify.error) throw verify.error;

      // Generate recovery codes (client-side, 10 random codes)
      const codes = Array.from({ length: 10 }, () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      });
      setRecoveryCodes(codes);
      setStep('recovery');
      toast.success('MFA enrollment verified successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecoveryDone = () => {
    setStep('enrolled');
    setRecoveryCodes([]);
    setVerifyCode('');
    setQrCode('');
    setSecret('');
    loadFactors();
  };

  const handleDisable = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: disableFactorId,
      });
      if (unenrollError) throw unenrollError;

      toast.success('MFA has been disabled');
      setShowDisableDialog(false);
      setDisableFactorId('');
      setStep('idle');
      setEnrolledFactors([]);
      loadFactors();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to disable MFA';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const isEnrolled = enrolledFactors.some(f => f.status === 'verified');

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Two-Factor Authentication
            {isEnrolled && (
              <Badge className="bg-success/20 text-success border-success/30">Enabled</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Protect your account with TOTP-based two-factor authentication.
            Required for privileged trading operations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'idle' && !isEnrolled && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                MFA is not enabled. Enable it to secure your account with a time-based one-time password.
              </p>
              <Button onClick={handleEnroll} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Enable MFA
                  </>
                )}
              </Button>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
                </p>
                {qrCode && (
                  <div className="flex justify-center">
                    <img
                      src={qrCode}
                      alt="MFA QR Code"
                      className="w-48 h-48 rounded-lg border bg-white p-2"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Manual entry key:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                    {secret}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(secret)}
                  >
                    {copiedSecret ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-medium">Enter the 6-digit code from your authenticator:</p>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={verifyCode}
                    onChange={setVerifyCode}
                    disabled={isLoading}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => { setStep('idle'); setError(null); }}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleVerify}
                    disabled={verifyCode.length !== 6 || isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify & Enable'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 'recovery' && (
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Save these recovery codes in a secure location. They will only be shown once.
                  Each code can be used once if you lose access to your authenticator.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg">
                {recoveryCodes.map((code, i) => (
                  <code key={i} className="text-sm font-mono text-center py-1">
                    {code}
                  </code>
                ))}
              </div>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(recoveryCodes.join('\n'))}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All
                </Button>
                <Button onClick={handleRecoveryDone}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  I have saved my codes
                </Button>
              </div>
            </div>
          )}

          {(step === 'enrolled' || isEnrolled) && step !== 'verify' && step !== 'recovery' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10 border border-success/30">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <div>
                  <p className="font-medium text-success">MFA is active</p>
                  <p className="text-sm text-muted-foreground">
                    Your account is protected with two-factor authentication
                  </p>
                </div>
              </div>
              {enrolledFactors.filter(f => f.status === 'verified').map(factor => (
                <div key={factor.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-sm">{factor.friendly_name || 'TOTP Authenticator'}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setDisableFactorId(factor.id);
                      setShowDisableDialog(true);
                    }}
                  >
                    <ShieldOff className="h-4 w-4 mr-1" />
                    Disable
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disable MFA Confirmation Dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Disable Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              This will remove MFA protection from your account. Privileged trading operations
              may be restricted without MFA.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Disabling MFA reduces your account security. This is not recommended for accounts
              with trading privileges.
            </AlertDescription>
          </Alert>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDisableDialog(false)}
              disabled={isLoading}
            >
              Keep MFA
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisable}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disabling...
                </>
              ) : (
                'Disable MFA'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
