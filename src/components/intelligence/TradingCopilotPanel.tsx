import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTradingCopilot } from '@/hooks/useTradingCopilot';
import { cn } from '@/lib/utils';
import { 
  Bot, 
  Send, 
  Trash2, 
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Loader2,
  User,
  Lightbulb,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TradingCopilotPanelProps {
  defaultInstrument?: string;
  compact?: boolean;
}

const QUICK_PROMPTS = [
  { label: 'Market Analysis', prompt: 'Give me a quick analysis of the current market conditions and any notable signals.' },
  { label: 'Trading Ideas', prompt: 'Based on current signals, what are the best trading opportunities right now?' },
  { label: 'Risk Assessment', prompt: 'What are the key risks I should be aware of in the current market?' },
  { label: 'BTC Outlook', prompt: 'What is the current outlook for Bitcoin based on the latest intelligence data?' },
];

export function TradingCopilotPanel({ 
  defaultInstrument = 'BTC-USDT',
  compact = false 
}: TradingCopilotPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { 
    messages, 
    isTyping, 
    sendMessage, 
    isSending, 
    clearMessages 
  } = useTradingCopilot();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    
    sendMessage({
      message: input.trim(),
      context: { instrument: defaultInstrument },
    });
    setInput('');
  };

  const handleQuickPrompt = (prompt: string) => {
    sendMessage({
      message: prompt,
      context: { instrument: defaultInstrument },
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getRiskBadge = (risk: string) => {
    const variants: Record<string, string> = {
      low: 'bg-trading-long/20 text-trading-long',
      moderate: 'bg-warning/20 text-warning',
      high: 'bg-trading-short/20 text-trading-short',
    };
    return variants[risk] || variants.moderate;
  };

  return (
    <Card className="glass-panel border-border/50 flex flex-col h-full">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5 text-primary" />
            Crypto CoPilot
            <Badge variant="secondary" className="text-xs gap-1">
              <Sparkles className="h-3 w-3" />
              Powered by AI
            </Badge>
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearMessages}
            disabled={messages.length === 0}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        {/* Quick Prompts */}
        {messages.length === 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Lightbulb className="h-4 w-4" />
              Quick prompts:
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((item) => (
                <Button
                  key={item.label}
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickPrompt(item.prompt)}
                  disabled={isSending}
                  className="text-xs"
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea 
          ref={scrollRef}
          className={cn(
            "flex-1 pr-4",
            compact ? "h-[300px]" : "h-[400px]"
          )}
        >
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex gap-3",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg p-3 space-y-2",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  
                  {/* Insights badges for assistant messages */}
                  {msg.role === 'assistant' && msg.insights && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
                      {msg.insights.suggested_actions.map((action) => (
                        <Badge 
                          key={action} 
                          variant="outline"
                          className={cn(
                            "text-xs",
                            action === 'BUY' && "text-trading-long border-trading-long/30",
                            action === 'SELL' && "text-trading-short border-trading-short/30",
                            action === 'HOLD' && "text-muted-foreground"
                          )}
                        >
                          {action === 'BUY' && <TrendingUp className="h-3 w-3 mr-1" />}
                          {action === 'SELL' && <TrendingDown className="h-3 w-3 mr-1" />}
                          {action}
                        </Badge>
                      ))}
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs", getRiskBadge(msg.insights.risk_level))}
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {msg.insights.risk_level} risk
                      </Badge>
                      {msg.insights.mentioned_instruments.map((inst) => (
                        <Badge key={inst} variant="secondary" className="text-xs">
                          {inst}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  <span className="text-xs opacity-60">
                    {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                  </span>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            
            {isTyping && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex gap-2 mt-4 flex-shrink-0">
          <Input
            ref={inputRef}
            placeholder="Ask about market conditions, signals, or trading ideas..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isSending}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
