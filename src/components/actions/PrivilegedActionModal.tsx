import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Shield, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ActionSeverity = 'normal' | 'warning' | 'critical';

interface PrivilegedActionModalProps {
  trigger: React.ReactNode;
  title: string;
  description: string;
  severity?: ActionSeverity;
  confirmLabel?: string;
  cancelLabel?: string;
  requireReason?: boolean;
  reasonPlaceholder?: string;
  additionalFields?: {
    name: string;
    label: string;
    type: 'text' | 'number';
    placeholder?: string;
    required?: boolean;
  }[];
  onConfirm: (data: { reason: string; [key: string]: string | number }) => Promise<void>;
  isLoading?: boolean;
}

export function PrivilegedActionModal({
  trigger,
  title,
  description,
  severity = 'normal',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  requireReason = true,
  reasonPlaceholder = 'Enter reason for this action...',
  additionalFields = [],
  onConfirm,
  isLoading = false,
}: PrivilegedActionModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [additionalData, setAdditionalData] = useState<Record<string, string | number>>({});
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await onConfirm({ reason, ...additionalData });
      setIsOpen(false);
      setReason('');
      setAdditionalData({});
    } finally {
      setIsPending(false);
    }
  };

  const isValid = !requireReason || reason.trim().length > 0;
  const allFieldsValid = additionalFields.every(
    f => !f.required || (additionalData[f.name] !== undefined && additionalData[f.name] !== '')
  );

  const getSeverityStyles = () => {
    switch (severity) {
      case 'critical':
        return {
          badge: 'bg-destructive/20 text-destructive border-destructive/30',
          icon: AlertTriangle,
          button: 'bg-destructive hover:bg-destructive/90',
        };
      case 'warning':
        return {
          badge: 'bg-warning/20 text-warning border-warning/30',
          icon: Shield,
          button: 'bg-warning hover:bg-warning/90 text-warning-foreground',
        };
      default:
        return {
          badge: 'bg-primary/20 text-primary border-primary/30',
          icon: Lock,
          button: '',
        };
    }
  };

  const styles = getSeverityStyles();
  const SeverityIcon = styles.icon;

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', styles.badge)}>
              <SeverityIcon className="h-5 w-5" />
            </div>
            <span>{title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Severity warning for critical actions */}
          {severity === 'critical' && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-destructive">Critical Action</p>
                <p className="text-muted-foreground">
                  This action will have immediate and significant impact. Proceed with caution.
                </p>
              </div>
            </div>
          )}

          {/* Additional fields */}
          {additionalFields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Input
                id={field.name}
                type={field.type}
                placeholder={field.placeholder}
                value={additionalData[field.name] ?? ''}
                onChange={(e) => setAdditionalData(prev => ({
                  ...prev,
                  [field.name]: field.type === 'number' ? parseFloat(e.target.value) : e.target.value
                }))}
              />
            </div>
          ))}

          {/* Reason field */}
          {requireReason && (
            <div className="space-y-2">
              <Label htmlFor="reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                placeholder={reasonPlaceholder}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[80px] resize-none"
              />
              <p className="text-xs text-muted-foreground">
                This will be logged in the audit trail
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending || isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isPending || isLoading || !isValid || !allFieldsValid}
            className={cn(styles.button)}
          >
            {(isPending || isLoading) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
