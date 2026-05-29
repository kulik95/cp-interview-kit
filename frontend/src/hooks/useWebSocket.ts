import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authSlice';

interface WebSocketMessage {
  type: string;
  data?: any;
}

type MessageHandler = (message: WebSocketMessage) => void;

export function useWebSocket() {
  const { isAuthenticated } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const handlersRef = useRef<MessageHandler[]>([]);

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!isAuthenticated || !token) return;

    // Pass JWT for server-side auth; org is derived from the token, not the URL.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.hostname}:3001?token=${encodeURIComponent(token)}`
    );

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setLastMessage(message);

        // Notify all handlers
        handlersRef.current.forEach((handler) => {
          try {
            handler(message);
          } catch (error) {
            console.error('Handler error:', error);
          }
        });
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      // Could cause rapid reconnection attempts
      setTimeout(connect, 1000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, [isAuthenticated]);
  useEffect(() => {
    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.log('WebSocket not connected, message not sent');
    }
  }, []);

  const addHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.push(handler);
    return () => {
      const index = handlersRef.current.indexOf(handler);
      if (index > -1) {
        handlersRef.current.splice(index, 1);
      }
    };
  }, []);
  return {
    isConnected,
    lastMessage,
    sendMessage,
    addHandler,
  };
}

// Hook for subscribing to specific message types
export function useWebSocketMessage(type: string, callback: (data: any) => void) {
  const { addHandler } = useWebSocket();
  useEffect(() => {
    const cleanup = addHandler((message) => {
      if (message.type === type) {
        callback(message.data);
      }
    });

    return cleanup;
  }, [type, addHandler]);
}

// Hook for real-time dashboard updates
export function useDashboardSync(dashboardId: string | undefined) {
  const { addHandler, sendMessage } = useWebSocket();
  const [updates, setUpdates] = useState<any[]>([]);

  useEffect(() => {
    if (!dashboardId) return;

    // Subscribe to dashboard updates
    sendMessage({
      type: 'subscribe',
      data: { dashboardId },
    });

    const cleanup = addHandler((message) => {
      if (
        message.type === 'dashboard_update' &&
        message.data?.dashboardId === dashboardId
      ) {
        updates.push(message.data);
        setUpdates(updates);
      }
    });

    return () => {
      cleanup();
      sendMessage({
        type: 'unsubscribe',
        data: { dashboardId },
      });
    };
  }, [dashboardId]);

  return updates;
}
