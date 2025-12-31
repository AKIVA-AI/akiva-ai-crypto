import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTradingCopilot } from '@/hooks/useTradingCopilot';
import { cn } from '@/lib/utils';
import {
  Bot,
  Send,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Loader2,
  User,
  Lightbulb,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Activity,
  Zap,
  Brain,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useLocation } from 'react-router-dom';

const QUICK_PROMPTS = [
  { label: 'Market Analysis', prompt: 'Give me a quick analysis of current market conditions.', icon: Activity },
  { label: 'Trading Ideas', prompt: 'What are the best trading opportunities right now?', icon: Zap },
  { label: 'Risk Assessment', prompt: 'What key risks should I monitor?', icon: AlertTriangle },
  { label: 'BTC Outlook', prompt: 'What is the Bitcoin outlook based on latest data?', icon: TrendingUp },
  { label: 'Strategy Status', prompt: 'Status update on active strategies.', icon: Brain },
];

interface AICopilotSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AICopilotSidebar({ isOpen, onToggle }: AICopilotSidebarProps) {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();

  const {
    messages,
    isTyping,
    sendMessage,
    isSending,
    clearMessages,
  } = useTradingCopilot();

  // Sidebar width based on expanded state
  const sidebarWidth = isExpanded ? 'w-[520px]' : 'w-[380px]';
  const sidebarWidthPx = isExpanded ? 520 : 380;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Focus textarea when sidebar opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 120) + 'px';
    }
  }, [input]);

  // Derive context from current route
  const getContextFromRoute = useCallback(() => {
    const path = location.pathname;
    if (path.includes('trade')) return { page: 'trade' };
    if (path.includes('arbitrage')) return { page: 'arbitrage' };
    if (path.includes('positions')) return { page: 'positions' };
    if (path.includes('risk')) return { page: 'risk' };
    if (path.includes('strategies')) return { page: 'strategies' };
    return { page: 'dashboard' };
  }, [location.pathname]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    const context = getContextFromRoute();
    sendMessage({
      message: input.trim(),
      context,
    });
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    const context = getContextFromRoute();
    sendMessage({
      message: prompt,
      context,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getRiskBadgeClass = (risk: string) => {
    const variants: Record<string, string> = {
      low: 'bg-success/20 text-success border-success/30',
      moderate: 'bg-warning/20 text-warning border-warning/30',
      high: 'bg-destructive/20 text-destructive border-destructive/30',
    };
    return variants[risk] || variants.moderate;
  };

  // Collapsed state - just show toggle button
  if (!isOpen) {
    return (
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-30">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-l-xl rounded-r-none border-r-0 h-14 w-8 bg-background shadow-lg hover:w-10 transition-all"
              onClick={onToggle}
            >
              <PanelRightOpen className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Open Crypto CoPilot</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        'fixed right-0 top-0 z-40 h-screen bg-background border-l border-border flex flex-col shadow-xl transition-all duration-300',
        sidebarWidth
      )}
      style={{ width: sidebarWidthPx }}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-border shrink-0 bg-card/50">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Crypto CoPilot</h2>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] text-muted-foreground">Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isExpanded ? 'Collapse' : 'Expand'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={clearMessages}
                disabled={messages.length === 0}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear chat</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle}>
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close sidebar</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="space-y-6">
            {/* Welcome */}
            <div className="text-center py-8">
              <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 shadow-lg">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Crypto CoPilot</h3>
              <p className="text-sm text-muted-foreground max-w-[300px] mx-auto leading-relaxed">
                Real-time market intelligence and trading insights powered by AI
              </p>
            </div>

            {/* Quick prompts */}
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5 px-1">
                <Lightbulb className="h-3 w-3" />
                Quick Actions
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {QUICK_PROMPTS.map((item) => (
                  <Button
                    key={item.label}
                    size="sm"
                    variant="ghost"
                    onClick={() => handleQuickPrompt(item.prompt)}
                    disabled={isSending}
                    className="w-full justify-start text-left h-11 px-3 text-sm font-normal hover:bg-muted/60 rounded-lg"
                  >
                    <item.icon className="h-4 w-4 mr-3 text-muted-foreground" />
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl p-3.5 space-y-2',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                  {/* Insights for assistant */}
                  {msg.role === 'assistant' && msg.insights && (
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/30">
                      {msg.insights.suggested_actions.map((action) => (
                        <Badge
                          key={action}
                          variant="outline"
                          className={cn(
                            'text-xs',
                            action === 'BUY' && 'text-success border-success/40 bg-success/10',
                            action === 'SELL' && 'text-destructive border-destructive/40 bg-destructive/10',
                            action === 'HOLD' && 'text-muted-foreground bg-muted'
                          )}
                        >
                          {action === 'BUY' && <TrendingUp className="h-3 w-3 mr-1" />}
                          {action === 'SELL' && <TrendingDown className="h-3 w-3 mr-1" />}
                          {action}
                        </Badge>
                      ))}
                      <Badge variant="outline" className={cn('text-xs', getRiskBadgeClass(msg.insights.risk_level))}>
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {msg.insights.risk_level}
                      </Badge>
                    </div>
                  )}

                  <span className="text-xs opacity-50 block">
                    {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                  </span>
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area - Larger, Lovable-style */}
      <div className="p-4 border-t border-border shrink-0 bg-card/80 backdrop-blur-sm">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            placeholder="Ask about markets, strategies, risk assessment..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isSending}
            rows={1}
            className="w-full resize-none bg-background pr-12 py-3 px-4 text-sm rounded-xl border-border focus-visible:ring-1 focus-visible:ring-primary min-h-[48px] max-h-[120px]"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            size="icon"
            className="absolute right-2 bottom-2 h-8 w-8 rounded-lg"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Press Enter to send • Shift+Enter for new line
        </p>
      </div>
    </aside>
  );
}
