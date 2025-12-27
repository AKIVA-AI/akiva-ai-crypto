import { useState, useEffect, useCallback, useRef } from 'react';

export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempts: number;
  lastConnectedAt: number | null;
  latencyMs: number | null;
}

interface UseWebSocketManagerOptions {
  url: string;
  enabled?: boolean;
  maxReconnectAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  pingIntervalMs?: number;
  onMessage?: (data: unknown) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocketManager({
  url,
  enabled = true,
  maxReconnectAttempts = 10,
  initialBackoffMs = 1000,
  maxBackoffMs = 30000,
  pingIntervalMs = 30000,
  onMessage,
  onConnect,
  onDisconnect,
}: UseWebSocketManagerOptions) {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnectAttempts: 0,
    lastConnectedAt: null,
    latencyMs: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingStartTimeRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const urlRef = useRef(url);

  // Update refs when props change
  useEffect(() => {
    enabledRef.current = enabled;
    urlRef.current = url;
  }, [enabled, url]);

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const calculateBackoff = useCallback((attempts: number): number => {
    // Exponential backoff with jitter
    const exponentialDelay = initialBackoffMs * Math.pow(2, attempts);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, maxBackoffMs);
  }, [initialBackoffMs, maxBackoffMs]);

  const connect = useCallback(() => {
    const readyState = wsRef.current?.readyState;
    if (!enabledRef.current || readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) {
      return;
    }

    // Cancel any pending reconnect since we are actively (re)connecting now
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      console.log(`[WebSocket] Connecting to ${urlRef.current}...`);
      const ws = new WebSocket(urlRef.current);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null,
          reconnectAttempts: 0,
          lastConnectedAt: Date.now(),
        }));
        onConnect?.();

        // Start ping interval for latency monitoring
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingStartTimeRef.current = Date.now();
          }
        }, pingIntervalMs);
      };

      ws.onmessage = (event) => {
        // Calculate latency if we have a ping start time
        if (pingStartTimeRef.current) {
          const latency = Date.now() - pingStartTimeRef.current;
          setState(prev => ({ ...prev, latencyMs: latency }));
          pingStartTimeRef.current = null;
        }

        try {
          const data = JSON.parse(event.data);
          onMessage?.(data);
        } catch {
          // Not JSON, pass raw data
          onMessage?.(event.data);
        }
      };

      ws.onerror = (error) => {
        // This error event often has no useful details in browsers; avoid spamming.
        console.error('[WebSocket] Error:', error);
        setState(prev => ({ ...prev, error: 'Connection error' }));
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Closed: ${event.code} - ${event.reason}`);
        wsRef.current = null;

        setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
        clearTimers();
        onDisconnect?.();

        // Attempt reconnection if enabled and not at max attempts
        if (enabledRef.current) {
          setState(prev => {
            // Guard against multiple scheduled reconnects (can happen with rapid close/error cycles)
            if (reconnectTimeoutRef.current) {
              return prev;
            }

            if (prev.reconnectAttempts < maxReconnectAttempts) {
              const delay = calculateBackoff(prev.reconnectAttempts);
              console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${prev.reconnectAttempts + 1}/${maxReconnectAttempts})`);

              reconnectTimeoutRef.current = setTimeout(() => {
                reconnectTimeoutRef.current = null;
                connect();
              }, delay);

              return { ...prev, reconnectAttempts: prev.reconnectAttempts + 1 };
            }

            console.error('[WebSocket] Max reconnection attempts reached');
            return { ...prev, error: 'Max reconnection attempts reached' };
          });
        }
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: 'Failed to create WebSocket connection',
      }));
    }
  }, [calculateBackoff, clearTimers, maxReconnectAttempts, onConnect, onDisconnect, onMessage, pingIntervalMs]);

  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0,
    }));
    console.log('[WebSocket] Disconnected manually');
  }, [clearTimers]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const resetReconnectAttempts = useCallback(() => {
    setState(prev => ({ ...prev, reconnectAttempts: 0 }));
  }, []);

  // Connect/disconnect based on enabled state and URL changes
  useEffect(() => {
    if (enabled && url) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, url, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    send,
    resetReconnectAttempts,
    ws: wsRef.current,
  };
}
