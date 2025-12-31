import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useLocation } from 'react-router-dom';

// Simple suggestion chips that populate the input
const SUGGESTIONS = [
  'Market overview',
  'BTC analysis',
  'Risk check',
  'Top opportunities',
  'Portfolio review',
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
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    textareaRef.current?.focus();
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

  // Collapsed state
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
      className="fixed right-0 top-0 z-40 h-screen bg-background border-l border-border flex flex-col shadow-xl transition-all duration-300"
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
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-[10px] text-muted-foreground">Ready</span>
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="p-4 pb-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px]">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-5 shadow-lg">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Crypto CoPilot</h3>
              <p className="text-sm text-muted-foreground text-center max-w-[280px] leading-relaxed">
                Ask me about market conditions, trading strategies, risk analysis, or portfolio insights.
              </p>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
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
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border shrink-0 bg-card/80 backdrop-blur-sm space-y-3">
        {/* Suggestion chips - only when input is empty and no messages */}
        {!input && messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-2.5 py-1 text-xs rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Textarea
            ref={textareaRef}
            placeholder="Ask about markets, strategies, risk..."
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
        <p className="text-[10px] text-muted-foreground text-center">
          Enter to send • Shift+Enter for new line
        </p>
      </div>
    </aside>
  );
}
