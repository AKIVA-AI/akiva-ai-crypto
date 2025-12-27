import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  insights?: {
    mentioned_instruments: string[];
    suggested_actions: string[];
    risk_level: string;
    confidence: number;
  };
}

interface CopilotContext {
  instrument?: string;
  positions?: any[];
  portfolio_value?: number;
  page?: string;
}

export function useTradingCopilot() {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const sendMessage = useMutation({
    mutationFn: async ({ 
      message, 
      context 
    }: { 
      message: string; 
      context?: CopilotContext;
    }) => {
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke('trading-copilot', {
        body: { 
          message,
          context,
          conversation_history: conversationHistory,
        },
      });
      
      if (error) throw error;
      return data;
    },
    onMutate: ({ message }) => {
      setIsTyping(true);
      setMessages(prev => [...prev, {
        role: 'user',
        content: message,
        timestamp: new Date(),
      }]);
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        insights: data.insights,
      }]);
    },
    onError: (error: any) => {
      const errorMsg = error?.message || 'Failed to get response';
      toast.error(errorMsg);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${errorMsg}. Please try again.`,
        timestamp: new Date(),
      }]);
    },
    onSettled: () => {
      setIsTyping(false);
    },
  });

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, {
      role: 'assistant',
      content,
      timestamp: new Date(),
    }]);
  }, []);

  return {
    messages,
    isTyping,
    sendMessage: sendMessage.mutate,
    isSending: sendMessage.isPending,
    clearMessages,
    addSystemMessage,
  };
}
