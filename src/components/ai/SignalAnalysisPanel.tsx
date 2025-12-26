import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Brain, Sparkles, TrendingUp, Settings, LineChart, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SignalAnalysisPanelProps {
  signalId?: string;
  strategyId?: string;
  instrument?: string;
  onClose?: () => void;
}

type AnalysisType = 'signal_explanation' | 'parameter_optimization' | 'market_context';

export function SignalAnalysisPanel({ signalId, strategyId, instrument, onClose }: SignalAnalysisPanelProps) {
  const [analysisType, setAnalysisType] = useState<AnalysisType>('signal_explanation');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeSignal = async () => {
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-signal', {
        body: {
          signalId,
          strategyId,
          instrument,
          analysisType,
        },
      });

      if (fnError) throw fnError;
      if (!data.success) throw new Error(data.error || 'Analysis failed');

      setAnalysis(data.analysis);
      toast.success('Analysis complete');
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'Failed to analyze signal');
      toast.error('Analysis failed');
    } finally {
      setIsLoading(false);
    }
  };

  const analysisOptions = [
    { value: 'signal_explanation', label: 'Signal Explanation', icon: Sparkles, description: 'Understand why this signal was generated' },
    { value: 'parameter_optimization', label: 'Parameter Optimization', icon: Settings, description: 'Get suggestions for strategy tuning' },
    { value: 'market_context', label: 'Market Context', icon: LineChart, description: 'Analyze current market conditions' },
  ];

  const selectedOption = analysisOptions.find(o => o.value === analysisType);

  return (
    <Card className="glass-panel h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-primary" />
            AI Signal Analysis
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Powered by AI
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col space-y-4 min-h-0">
        {/* Analysis Type Selector */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Analysis Type</label>
          <Select value={analysisType} onValueChange={(v) => setAnalysisType(v as AnalysisType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {analysisOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <option.icon className="h-4 w-4" />
                    <span>{option.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedOption && (
            <p className="text-xs text-muted-foreground">{selectedOption.description}</p>
          )}
        </div>

        {/* Context Info */}
        <div className="flex flex-wrap gap-2">
          {signalId && (
            <Badge variant="secondary" className="text-xs">
              Signal: {signalId.slice(0, 8)}...
            </Badge>
          )}
          {strategyId && (
            <Badge variant="secondary" className="text-xs">
              Strategy: {strategyId.slice(0, 8)}...
            </Badge>
          )}
          {instrument && (
            <Badge variant="outline" className="text-xs">
              {instrument}
            </Badge>
          )}
        </div>

        <Separator />

        {/* Analysis Button */}
        <Button 
          onClick={analyzeSignal} 
          disabled={isLoading || (!signalId && !strategyId && !instrument)}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Analysis
            </>
          )}
        </Button>

        {/* Results */}
        <div className="flex-1 min-h-0">
          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Analysis Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {analysis && (
            <ScrollArea className="h-[350px] rounded-lg border bg-muted/20 p-4">
              <div className="prose prose-sm prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {analysis.split('\n').map((line, i) => {
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return (
                        <h4 key={i} className="text-primary font-semibold mt-4 mb-2">
                          {line.replace(/\*\*/g, '')}
                        </h4>
                      );
                    }
                    if (line.match(/^\d+\.\s\*\*/)) {
                      const [num, ...rest] = line.split('**');
                      return (
                        <div key={i} className="mt-3 mb-1">
                          <span className="text-primary font-semibold">{num}</span>
                          <span className="font-semibold">{rest.join('').replace(/\*\*/g, '')}</span>
                        </div>
                      );
                    }
                    if (line.startsWith('- ')) {
                      return (
                        <div key={i} className="ml-4 text-muted-foreground">
                          • {line.slice(2)}
                        </div>
                      );
                    }
                    return <p key={i} className="text-muted-foreground mb-1">{line}</p>;
                  })}
                </div>
              </div>
            </ScrollArea>
          )}

          {!analysis && !error && !isLoading && (
            <div className="h-[350px] rounded-lg border border-dashed flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select analysis type and click generate</p>
              </div>
            </div>
          )}
        </div>

        {analysis && (
          <Button variant="outline" size="sm" onClick={analyzeSignal} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Regenerate
          </Button>
        )}
      </CardContent>
    </Card>
  );
}