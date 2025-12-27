import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AICopilotContextValue {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

const AICopilotContext = createContext<AICopilotContextValue | undefined>(undefined);

export function AICopilotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true); // Default open for trading platform

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <AICopilotContext.Provider value={{ isOpen, toggle, open, close }}>
      {children}
    </AICopilotContext.Provider>
  );
}

export function useAICopilot() {
  const context = useContext(AICopilotContext);
  if (!context) {
    throw new Error('useAICopilot must be used within AICopilotProvider');
  }
  return context;
}
