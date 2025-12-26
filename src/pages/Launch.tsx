import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useMemeProjects, useMemeTasks } from '@/hooks/useControlPlane';
import { MemeProjectCard } from '@/components/meme/MemeProjectCard';
import { MemeScorePanel } from '@/components/meme/MemeScorePanel';
import { MemeApprovalPanel } from '@/components/meme/MemeApprovalPanel';
import { MemePipelineView } from '@/components/meme/MemePipelineView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Rocket, LayoutGrid, Columns3, Plus, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type MemeProject = Database['public']['Tables']['meme_projects']['Row'];

export default function Launch() {
  const { data: projects = [], isLoading: projectsLoading } = useMemeProjects();
  const [selectedProject, setSelectedProject] = useState<MemeProject | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('pipeline');
  
  const { data: tasks = [] } = useMemeTasks(selectedProject?.id);

  const handleSelectProject = (project: MemeProject) => {
    setSelectedProject(project);
  };

  // Stats
  const opportunityCount = projects.filter(p => p.stage === 'opportunity').length;
  const buildCount = projects.filter(p => p.stage === 'build').length;
  const launchedCount = projects.filter(p => p.stage === 'launch' || p.stage === 'post_launch').length;

  if (projectsLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Rocket className="h-7 w-7 text-primary" />
              Meme Ventures
            </h1>
            <p className="text-muted-foreground">Pipeline management & go/no-go workflow</p>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('pipeline')}
                className={`p-2 transition-colors ${viewMode === 'pipeline' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
              >
                <Columns3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-panel rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-4/20">
                <AlertCircle className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{opportunityCount}</p>
                <p className="text-sm text-muted-foreground">Opportunities</p>
              </div>
            </div>
          </div>
          <div className="glass-panel rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/20">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{buildCount}</p>
                <p className="text-sm text-muted-foreground">In Build</p>
              </div>
            </div>
          </div>
          <div className="glass-panel rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/20">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{launchedCount}</p>
                <p className="text-sm text-muted-foreground">Launched</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Pipeline or List View */}
          <div className="lg:col-span-2">
            <div className="glass-panel rounded-xl p-4">
              {viewMode === 'pipeline' ? (
                <>
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Columns3 className="h-5 w-5 text-primary" />
                    Project Pipeline
                  </h3>
                  <MemePipelineView 
                    projects={projects} 
                    onSelectProject={handleSelectProject}
                    selectedProjectId={selectedProject?.id}
                  />
                </>
              ) : (
                <>
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <LayoutGrid className="h-5 w-5 text-primary" />
                    All Projects
                  </h3>
                  {projects.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Rocket className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>No meme projects yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {projects.map((project) => (
                        <MemeProjectCard
                          key={project.id}
                          project={project}
                          onSelect={handleSelectProject}
                          isSelected={selectedProject?.id === project.id}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: Project Details */}
          <div className="space-y-4">
            {selectedProject ? (
              <>
                {/* Project Header */}
                <div className="glass-panel rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-bold">{selectedProject.name}</h2>
                      <Badge variant="outline" className="font-mono">${selectedProject.ticker}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedProject.narrative_tags?.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tabs for details */}
                <Tabs defaultValue="scores" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="scores">Scores</TabsTrigger>
                    <TabsTrigger value="approval">Approval</TabsTrigger>
                  </TabsList>
                  <TabsContent value="scores" className="mt-4">
                    <MemeScorePanel project={selectedProject} />
                  </TabsContent>
                  <TabsContent value="approval" className="mt-4">
                    <MemeApprovalPanel project={selectedProject} />
                  </TabsContent>
                </Tabs>

                {/* Tasks */}
                {tasks.length > 0 && (
                  <div className="glass-panel rounded-lg p-4">
                    <h4 className="font-medium mb-3 text-sm">Tasks ({tasks.length})</h4>
                    <div className="space-y-2">
                      {tasks.slice(0, 5).map((task) => (
                        <div 
                          key={task.id} 
                          className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/30"
                        >
                          {task.is_completed ? (
                            <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className={task.is_completed ? 'line-through text-muted-foreground' : ''}>
                            {task.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="glass-panel rounded-xl p-8 text-center">
                <Rocket className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">Select a project to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
