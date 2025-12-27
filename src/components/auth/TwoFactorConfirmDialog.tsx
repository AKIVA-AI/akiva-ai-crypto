import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TwoFactorConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  action: string;
  description: string;
  severity?: 'warning' | 'critical';
  requiredCode?: string; // For demo - in production, this would be sent via SMS/email
}

export function TwoFactorConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  action,
  description,
  severity = 'warning',
  requiredCode,
}: TwoFactorConfirmProps) {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [generatedCode, setGeneratedCode] = useState('');

  // Generate a random 6-digit code on open
  useEffect(() => {
    if (open) {
      const newCode = requiredCode || Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedCode(newCode);
      setCode('');
      setError(null);
      setCountdown(30);
      
      // Show the code in toast (simulating SMS/email delivery)
      toast.info(`Verification code: ${newCode}`, {
        duration: 15000,
        description: 'In production, this would be sent via SMS/email',
      });
    }
  }, [open, requiredCode]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0 && open) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, open]);

  const handleVerify = async () => {
    if (code !== generatedCode) {
      setError('Invalid verification code');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      await onConfirm();
      onOpenChange(false);
      toast.success(`${action} confirmed successfully`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Verification failed';
      setError(errorMessage);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = () => {
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(newCode);
    setCountdown(30);
    setCode('');
    setError(null);
    
    toast.info(`New verification code: ${newCode}`, {
      duration: 15000,
      description: 'Code resent',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className={cn(
              "h-5 w-5",
              severity === 'critical' ? 'text-destructive' : 'text-warning'
            )} />
            Confirm {action}
          </DialogTitle>
          <DialogDescription>
            This action requires two-factor verification
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Action description */}
          <Alert className={cn(
            severity === 'critical' 
              ? 'border-destructive/50 bg-destructive/10' 
              : 'border-warning/50 bg-warning/10'
          )}>
            <AlertTriangle className={cn(
              "h-4 w-4",
              severity === 'critical' ? 'text-destructive' : 'text-warning'
            )} />
            <AlertDescription className="ml-2">
              {description}
            </AlertDescription>
          </Alert>

          {/* Severity badge */}
          <div className="flex items-center justify-center">
            <Badge variant={severity === 'critical' ? 'destructive' : 'outline'} className="text-sm">
              {severity === 'critical' ? 'Critical Action' : 'Privileged Action'}
            </Badge>
          </div>

          {/* OTP Input */}
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter the 6-digit verification code
            </p>
            
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              disabled={isVerifying}
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

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Resend option */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {countdown > 0 ? (
                <span>Resend code in {countdown}s</span>
              ) : (
                <button
                  onClick={handleResend}
                  className="text-primary hover:underline"
                  disabled={isVerifying}
                >
                  Resend code
                </button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isVerifying}
          >
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={code.length !== 6 || isVerifying}
            className={cn(
              severity === 'critical' && 'bg-destructive hover:bg-destructive/90'
            )}
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Confirm {action}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}