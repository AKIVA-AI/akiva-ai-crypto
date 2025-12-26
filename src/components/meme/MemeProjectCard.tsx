import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  Users, 
  Zap,
  CheckCircle2,
  Clock,
  ChevronRight
} from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type MemeProject = Database['public']['Tables']['meme_projects']['Row'];

interface MemeProjectCardProps {
  project: MemeProject;
  onSelect: (project: MemeProject) => void;
  isSelected?: boolean;
}

const stageConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  opportunity: { label: 'Opportunity', color: 'bg-chart-4/20 text-chart-4 border-chart-4/30', icon: Zap },
  build: { label: 'Build', color: 'bg-warning/20 text-warning border-warning/30', icon: Clock },
  launch: { label: 'Launch', color: 'bg-success/20 text-success border-success/30', icon: CheckCircle2 },
  post_launch: { label: 'Post-Launch', color: 'bg-primary/20 text-primary border-primary/30', icon: TrendingUp },
  completed: { label: 'Completed', color: 'bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30', icon: CheckCircle2 },
};

export function MemeProjectCard({ project, onSelect, isSelected }: MemeProjectCardProps) {
  const stage = stageConfig[project.stage] || stageConfig.opportunity;
  const StageIcon = stage.icon;

  const avgScore = (project.viral_score + project.social_velocity + (100 - project.holder_concentration)) / 3;

  return (
    <button
      onClick={() => onSelect(project)}
      className={cn(
        'glass-panel rounded-xl p-4 text-left w-full transition-all duration-200 hover:border-primary/40',
        isSelected && 'border-primary/60 glow-primary'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground">{project.name}</h3>
            <Badge variant="outline" className="font-mono text-xs">${project.ticker}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn('text-xs border', stage.color)}>
              <StageIcon className="h-3 w-3 mr-1" />
              {stage.label}
            </Badge>
            {project.go_no_go_approved && (
              <Badge variant="success" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Approved
              </Badge>
            )}
          </div>
        </div>
        <ChevronRight className={cn(
          'h-5 w-5 text-muted-foreground transition-transform',
          isSelected && 'rotate-90 text-primary'
        )} />
      </div>

      <div className="flex items-center gap-1 mb-2">
        {project.narrative_tags?.slice(0, 3).map((tag) => (
          <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          <span className="font-mono">{project.viral_score.toFixed(0)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          <span className="font-mono">{project.social_velocity.toFixed(0)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <span className="font-mono">{project.holder_concentration.toFixed(0)}%</span>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Composite Score</span>
          <span className={cn(
            'font-mono font-medium',
            avgScore >= 70 ? 'text-success' : avgScore >= 50 ? 'text-warning' : 'text-destructive'
          )}>
            {avgScore.toFixed(0)}/100
          </span>
        </div>
        <Progress value={avgScore} className="h-1.5" />
      </div>
    </button>
  );
}
