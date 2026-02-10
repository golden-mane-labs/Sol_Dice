import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Custom hook for WebSocket connection with auto-reconnection
 * 
 * @param {string} url - WebSocket URL
 * @param {function} onMessage - Callback for incoming messages
 * @param {function} onError - Callback for errors
 * @param {function} onConnect - Callback when connected
 * @returns {object} - { ws, isConnected }
 */
export const useWebSocket = (url, onMessage, onError, onConnect) => {
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const pingIntervalRef = useRef(null);
  const shouldReconnect = useRef(true);
  const wsRef = useRef(null);
  const errorLoggedRef = useRef(false); // Track if we've already logged an error
  
  const MAX_RECONNECT_ATTEMPTS = 10;
  const INITIAL_RECONNECT_DELAY = 1000; // 1 second
  const MAX_RECONNECT_DELAY = 60000; // 60 seconds
  const PING_INTERVAL = 30000; // 30 seconds

  const connect = useCallback(() => {
    if (!url || !shouldReconnect.current) {
      console.warn('[WebSocket] Cannot connect: URL is empty or reconnection disabled');
      return;
    }

    // Validate URL format
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      console.error('[WebSocket] Invalid URL format:', url);
      if (onError) {
        onError(new Error(`Invalid WebSocket URL: ${url}`));
      }
      return;
    }

    console.log('[WebSocket] Attempting to connect to:', url);

    try {
      const websocket = new WebSocket(url);
      wsRef.current = websocket;

      websocket.onopen = () => {
        console.log('[WebSocket] Connected successfully to:', url);
        setIsConnected(true);
        reconnectAttempts.current = 0;
        errorLoggedRef.current = false; // Reset error flag on successful connection
        
        if (onConnect) {
          onConnect();
        }

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            try {
              websocket.send(JSON.stringify({ type: 'ping' }));
            } catch (e) {
              console.warn('[WebSocket] Error sending ping:', e);
            }
          }
        }, PING_INTERVAL);
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle pong response
          if (data.type === 'pong') {
            return;
          }
          
          // Handle echo (ignore)
          if (data.type === 'echo') {
            return;
          }
          
          // Call message handler
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error, 'Raw data:', event.data);
          if (onError) {
            onError(error);
          }
        }
      };

      websocket.onerror = (event) => {
        // WebSocket error events don't provide much info
        // Only log once to avoid spam, detailed info will be in onclose
        if (!errorLoggedRef.current) {
          console.warn('[WebSocket] Connection error detected for:', url);
          console.warn('[WebSocket] ReadyState:', websocket.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)');
          errorLoggedRef.current = true;
        }
        setIsConnected(false);
        
        // Don't call onError here as it will be called in onclose
        // This prevents duplicate error handling
      };

      websocket.onclose = (event) => {
        const { code, reason, wasClean } = event;
        setIsConnected(false);
        errorLoggedRef.current = false; // Reset for next connection attempt
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Log close information (only once per close event)
        const closeMessages = {
          1000: 'Normal closure',
          1001: 'Going away',
          1002: 'Protocol error',
          1003: 'Unsupported data',
          1006: 'Abnormal closure (no close frame)',
          1007: 'Invalid data',
          1008: 'Policy violation',
          1009: 'Message too big',
          1011: 'Internal server error',
          1012: 'Service restart',
          1013: 'Try again later',
          1014: 'Bad gateway',
          1015: 'TLS handshake failure'
        };
        
        const closeMessage = closeMessages[code] || `Unknown code: ${code}`;
        
        if (code === 1000 && wasClean) {
          console.log('[WebSocket] Normal closure');
        } else if (code === 1006) {
          // Abnormal closure - likely connection refused or network issue
          console.warn(`[WebSocket] Connection failed (${closeMessage}). This usually means:`);
          console.warn('  - Backend server is not running');
          console.warn('  - Network/firewall is blocking the connection');
          console.warn('  - WebSocket endpoint is not accessible');
          console.warn(`  - URL: ${url}`);
        } else {
          console.warn(`[WebSocket] Connection closed: ${closeMessage} (code: ${code}, clean: ${wasClean})`);
          if (reason) {
            console.warn(`[WebSocket] Reason: ${reason}`);
          }
        }

        // Only attempt reconnection if it wasn't a clean close or normal closure
        if (shouldReconnect.current && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          // Don't reconnect on normal closure (code 1000)
          if (code === 1000 && wasClean) {
            return;
          }

          const delay = Math.min(
            INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts.current),
            MAX_RECONNECT_DELAY
          );
          
          console.log(`[WebSocket] Will attempt reconnection in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts.current + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            errorLoggedRef.current = false; // Reset error flag for retry
            connect();
          }, delay);
          
          // Don't call onError when we're retrying - let the retry mechanism handle it
          return;
        } else if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
          // Only report error after all retry attempts are exhausted
          console.error('[WebSocket] Max reconnection attempts reached. Please check:');
          console.error(`  1. Backend is running at ${url.replace('/ws/bets', '')}`);
          console.error('  2. Network/firewall allows WebSocket connections');
          console.error('  3. WebSocket endpoint is properly configured');
          if (onError) {
            onError(new Error(`Max reconnection attempts reached. Last error: ${closeMessage} (code: ${code})`));
          }
        } else if (code === 1000 && wasClean) {
          // Normal closure - no error needed
          return;
        }
        // For other cases (shouldn't normally reach here), don't call onError
        // as it would spam the console during normal reconnection attempts
      };

      setWs(websocket);
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      console.error('[WebSocket] Failed URL:', url);
      setIsConnected(false);
      if (onError) {
        onError(error);
      }
    }
  }, [url, onMessage, onError, onConnect]);

  useEffect(() => {
    connect();

    return () => {
      shouldReconnect.current = false;
      
      // Clear reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Clear ping interval
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      
      // Close WebSocket connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { ws: wsRef.current, isConnected };
};
