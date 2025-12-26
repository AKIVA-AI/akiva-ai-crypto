import { cn } from '@/lib/utils';
import { Database } from '@/integrations/supabase/types';
import { Zap, Clock, CheckCircle2, Rocket, Activity } from 'lucide-react';

type MemeProject = Database['public']['Tables']['meme_projects']['Row'];

interface MemePipelineViewProps {
  projects: MemeProject[];
  onSelectProject: (project: MemeProject) => void;
  selectedProjectId?: string;
}

const stages = [
  { id: 'opportunity', label: 'Opportunity', icon: Zap, color: 'bg-chart-4' },
  { id: 'build', label: 'Build', icon: Clock, color: 'bg-warning' },
  { id: 'launch', label: 'Launch', icon: Rocket, color: 'bg-success' },
  { id: 'post_launch', label: 'Post-Launch', icon: Activity, color: 'bg-primary' },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, color: 'bg-muted-foreground' },
];

export function MemePipelineView({ projects, onSelectProject, selectedProjectId }: MemePipelineViewProps) {
  const projectsByStage = stages.map(stage => ({
    ...stage,
    projects: projects.filter(p => p.stage === stage.id),
  }));

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {projectsByStage.map((stage) => {
          const StageIcon = stage.icon;
          return (
            <div key={stage.id} className="w-56 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={cn('p-1.5 rounded-md', stage.color.replace('bg-', 'bg-') + '/20')}>
                  <StageIcon className={cn('h-4 w-4', stage.color.replace('bg-', 'text-'))} />
                </div>
                <span className="font-medium text-sm text-foreground">{stage.label}</span>
                <span className="ml-auto text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {stage.projects.length}
                </span>
              </div>
              
              <div className="space-y-2 min-h-[200px] p-2 rounded-lg bg-muted/20 border border-border/50">
                {stage.projects.length === 0 ? (
                  <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                    No projects
                  </div>
                ) : (
                  stage.projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => onSelectProject(project)}
                      className={cn(
                        'w-full p-3 rounded-lg text-left transition-all duration-200',
                        'bg-card border border-border hover:border-primary/40 hover:bg-card/80',
                        selectedProjectId === project.id && 'border-primary ring-1 ring-primary/30'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-foreground truncate">
                          {project.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-muted-foreground">
                          ${project.ticker}
                        </span>
                        <span className={cn(
                          'text-xs font-mono',
                          project.viral_score >= 70 ? 'text-success' : 
                          project.viral_score >= 50 ? 'text-warning' : 'text-muted-foreground'
                        )}>
                          {project.viral_score.toFixed(0)}
                        </span>
                      </div>
                      {project.go_no_go_approved && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          Approved
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
