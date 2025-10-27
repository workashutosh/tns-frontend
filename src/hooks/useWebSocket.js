import { useEffect, useRef, useState } from 'react';
import webSocketService from '../services/websocketService';

/**
 * Shared WebSocket hook that uses a single global WebSocket connection
 * @param {Array} tokens - Array of token IDs to subscribe to
 * @param {Function} onMessage - Callback when data is received
 */
export const useWebSocket = (tokens, onMessage) => {
  const [isConnected, setIsConnected] = useState(false);
  const subscriberIdRef = useRef(null);
  const tokensStringRef = useRef('');

  useEffect(() => {
    // Subscribe to WebSocket updates
    subscriberIdRef.current = `subscriber_${Date.now()}_${Math.random()}`;
    
    const unsubscribe = webSocketService.subscribe(subscriberIdRef.current, (data) => {
      if (data.type === 'disconnected') {
        setIsConnected(false);
      } else {
        onMessage(data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onMessage]);

  // Subscribe to tokens when they change
  useEffect(() => {
    const tokensString = Array.isArray(tokens) ? tokens.join(',') : '';
    
    if (tokensString !== tokensStringRef.current && tokensString.trim().length > 0) {
      tokensStringRef.current = tokensString;
      webSocketService.subscribeToTokens(tokensString);
    }
  }, [tokens]);

  // Update connection status
  useEffect(() => {
    const status = webSocketService.getStatus();
    setIsConnected(status.isConnected);
  }, []);

  // Poll for connection status (since service doesn't expose events yet)
  useEffect(() => {
    const interval = setInterval(() => {
      const status = webSocketService.getStatus();
      setIsConnected(status.isConnected);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return { isConnected };
};
