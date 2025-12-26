import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Shield, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { useApproveMemeProject } from '@/hooks/usePrivilegedActions';
import { useRoleAccess } from '@/components/auth/RoleGate';
import { Database } from '@/integrations/supabase/types';

type MemeProject = Database['public']['Tables']['meme_projects']['Row'];

interface MemeApprovalPanelProps {
  project: MemeProject;
}

export function MemeApprovalPanel({ project }: MemeApprovalPanelProps) {
  const [notes, setNotes] = useState('');
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  
  const { canApproveMeme } = useRoleAccess();
  const approveMutation = useApproveMemeProject();

  const handleApprove = () => {
    approveMutation.mutate(
      { projectId: project.id, approved: true, notes },
      {
        onSuccess: () => {
          setIsApproveOpen(false);
          setNotes('');
        },
      }
    );
  };

  const handleReject = () => {
    approveMutation.mutate(
      { projectId: project.id, approved: false, notes },
      {
        onSuccess: () => {
          setIsRejectOpen(false);
          setNotes('');
        },
      }
    );
  };

  // Build stage is where due diligence happens, launch means approved
  const isReadyForApproval = project.stage === 'build';
  const isAlreadyProcessed = project.stage === 'launch' || project.stage === 'completed';

  if (isAlreadyProcessed) {
    return (
      <div className="glass-panel rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Go/No-Go Decision</h3>
        </div>
        <div className={cn(
          'flex items-center gap-3 p-4 rounded-lg',
          project.go_no_go_approved 
            ? 'bg-success/10 border border-success/30' 
            : 'bg-destructive/10 border border-destructive/30'
        )}>
          {project.go_no_go_approved ? (
            <>
              <CheckCircle2 className="h-8 w-8 text-success" />
              <div>
                <p className="font-semibold text-success">Approved for Launch</p>
                <p className="text-sm text-muted-foreground">This project has been approved and is proceeding to launch</p>
              </div>
            </>
          ) : (
            <>
              <XCircle className="h-8 w-8 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Project Rejected</p>
                <p className="text-sm text-muted-foreground">This project did not pass the go/no-go review</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!isReadyForApproval) {
    return (
      <div className="glass-panel rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Go/No-Go Decision</h3>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border">
          <Clock className="h-6 w-6 text-muted-foreground" />
          <div>
            <p className="font-medium text-muted-foreground">Not Ready for Review</p>
            <p className="text-sm text-muted-foreground">
              Project must be in <Badge variant="outline" className="mx-1">Build</Badge> stage for approval
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!canApproveMeme) {
    return (
      <div className="glass-panel rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Go/No-Go Decision</h3>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
          <AlertTriangle className="h-6 w-6 text-warning" />
          <div>
            <p className="font-medium text-warning">Insufficient Permissions</p>
            <p className="text-sm text-muted-foreground">Only Admin or CIO can approve meme launches</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Go/No-Go Decision</h3>
        <Badge variant="warning" className="ml-auto">Pending Review</Badge>
      </div>

      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
          <p className="text-sm text-warning flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            This decision will move the project to <strong>Approved</strong> or <strong>Closed</strong> stage
          </p>
        </div>

        <div className="flex gap-3">
          {/* Approve Dialog */}
          <AlertDialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="default" className="flex-1 gap-2 bg-success hover:bg-success/90">
                <CheckCircle2 className="h-4 w-4" />
                Approve Launch
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  Approve Meme Launch
                </AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to approve <strong>{project.name} (${project.ticker})</strong> for launch. 
                  This will advance the project to the Approved stage.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="Optional: Add approval notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={approveMutation.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="bg-success hover:bg-success/90"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Confirm Approval
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Reject Dialog */}
          <AlertDialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="flex-1 gap-2">
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  Reject Meme Project
                </AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to reject <strong>{project.name} (${project.ticker})</strong>. 
                  This will close the project and it will not proceed to launch.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="Required: Add rejection reason..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={approveMutation.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleReject}
                  disabled={approveMutation.isPending || !notes.trim()}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Confirm Rejection
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
