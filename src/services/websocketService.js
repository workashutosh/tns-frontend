// Global WebSocket Service - Single connection for all components
class WebSocketService {
  constructor() {
    this.ws = null; // MCX/NSE WebSocket
    this.fxWs = null; // FX WebSocket (Crypto/Forex/Commodity)
    this.subscribers = new Map(); // Map to track subscriber callbacks
    this.fxSubscribers = new Map(); // Map to track FX subscriber callbacks
    this.subscribedTokens = new Set(); // Set to track current subscriptions
    this.reconnectAttempts = 0;
    this.fxReconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.isConnecting = false;
    this.fxIsConnecting = false;
    this.reconnectTimeout = null;
    this.fxReconnectTimeout = null;
    this.connectTimeout = null;
    this.fxConnectTimeout = null;
    this.isConnected = false;
    this.fxIsConnected = false;
  }

  // Subscribe to MCX/NSE WebSocket updates
  subscribe(subscriberId, callback) {
    this.subscribers.set(subscriberId, callback);
    
    // Connect if not already connected or connecting
    if (!this.isConnected && !this.isConnecting) {
      this.connect();
    }
    
    return () => {
      this.subscribers.delete(subscriberId);
      console.log(`Subscriber ${subscriberId} removed`);
    };
  }

  // Subscribe to FX WebSocket updates
  subscribeFX(subscriberId, callback) {
    this.fxSubscribers.set(subscriberId, callback);
    
    // Connect if not already connected or connecting
    if (!this.fxIsConnected && !this.fxIsConnecting) {
      this.connectFX();
    }
    
    return () => {
      this.fxSubscribers.delete(subscriberId);
      console.log(`FX Subscriber ${subscriberId} removed`);
    };
  }

  // Add tokens to subscription (only if not already subscribed)
  subscribeToTokens(tokens) {
    if (!tokens || tokens.trim().length === 0) return;
    
    const tokenArray = tokens.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const newTokens = tokenArray.filter(token => !this.subscribedTokens.has(token));
    
    if (newTokens.length > 0) {
      console.log('New tokens to subscribe:', newTokens);
      tokenArray.forEach(token => this.subscribedTokens.add(token));
      
      // If WebSocket is connected, send updated subscription
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const allTokens = Array.from(this.subscribedTokens).join(',');
        try {
          this.ws.send(allTokens);
          console.log(`Resubscribed to ${this.subscribedTokens.size} tokens`);
        } catch (error) {
          console.error('Error resubscribing:', error);
        }
      }
    } else {
      console.log('All tokens already subscribed');
    }
  }

  // Connect to MCX/NSE WebSocket (only connect once)
  connect() {
    // Prevent multiple connection attempts
    if (this.isConnecting || this.isConnected) {
      console.log('MCX/NSE WebSocket already connecting or connected, skipping...');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max MCX/NSE reconnection attempts reached');
      return;
    }

    this.isConnecting = true;
    const uri = "wss://ws.tradewingss.com/api/webapiwebsoc";
    
    console.log(`Attempting MCX/NSE WebSocket connection (attempt ${this.reconnectAttempts + 1})...`);
    
    // Close existing connection if any
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.log('Error closing existing WebSocket:', error);
      }
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(uri);
      
      this.connectTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.log('WebSocket connection timeout');
          this.ws.close();
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(this.connectTimeout);
        
        console.log('✓ MCX/NSE WebSocket connected successfully');
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Subscribe to current tokens if any
        if (this.subscribedTokens.size > 0) {
          const allTokens = Array.from(this.subscribedTokens).join(',');
          try {
            this.ws.send(allTokens);
            console.log(`Subscribed to ${this.subscribedTokens.size} tokens`);
          } catch (error) {
            console.error('Error sending initial tokens:', error);
          }
        } else {
          this.ws.send("");
        }
      };

      this.ws.onmessage = (event) => {
        // Handle empty or ping messages
        if (!event.data || event.data === "" || event.data === "true") {
          return;
        }

        try {
          const data = JSON.parse(event.data);
          
          // Broadcast to all subscribers
          this.subscribers.forEach((callback, subscriberId) => {
            try {
              callback(data);
            } catch (error) {
              console.error(`Error in subscriber ${subscriberId}:`, error);
            }
          });
        } catch (error) {
          console.error('Error parsing WebSocket data:', error);
          console.log('Raw data:', event.data);
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(this.connectTimeout);
        // Don't log error if connection is already closed (readyState 3)
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
          console.error('MCX/NSE WebSocket error:', error);
        }
        this.isConnected = false;
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        clearTimeout(this.connectTimeout);
        
        // Only log if it wasn't a clean close or unexpected
        if (!event.wasClean && event.code !== 1000) {
          console.log('MCX/NSE WebSocket disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });
        }
        
        this.isConnected = false;
        this.isConnecting = false;
        this.ws = null;
        
        // Notify all subscribers only if we have subscribers
        if (this.subscribers.size > 0) {
          this.subscribers.forEach((callback) => {
            try {
              callback({ type: 'disconnected' });
            } catch (error) {
              console.error('Error notifying subscriber:', error);
            }
          });

          // Reconnect with exponential backoff only if we have subscribers
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
            
            console.log(`Scheduling MCX/NSE reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            this.reconnectTimeout = setTimeout(() => {
              if (this.subscribers.size > 0) {
                this.connect();
              }
            }, delay);
          } else {
            console.error('Max MCX/NSE reconnection attempts reached');
          }
        }
      };

    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.isConnecting = false;
      
      // Retry with exponential backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
        
        this.reconnectTimeout = setTimeout(() => {
          this.connect();
        }, delay);
      }
    }
  }

  // Disconnect WebSocket
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
    this.subscribers.clear();
    this.subscribedTokens.clear();
  }

  // Connect to FX WebSocket (only connect once)
  connectFX() {
    // Prevent multiple connection attempts
    if (this.fxIsConnecting || this.fxIsConnected) {
      console.log('FX WebSocket already connecting or connected, skipping...');
      return;
    }

    if (this.fxReconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max FX reconnection attempts reached');
      return;
    }

    this.fxIsConnecting = true;
    const uri = "wss://www.fxsoc.tradenstocko.com:8001/ws";
    
    console.log(`Attempting FX WebSocket connection (attempt ${this.fxReconnectAttempts + 1})...`);
    
    // Close existing connection if any
    if (this.fxWs) {
      try {
        this.fxWs.close();
      } catch (error) {
        console.log('Error closing existing FX WebSocket:', error);
      }
      this.fxWs = null;
    }

    try {
      this.fxWs = new WebSocket(uri);
      
      this.fxConnectTimeout = setTimeout(() => {
        if (this.fxWs && this.fxWs.readyState === WebSocket.CONNECTING) {
          console.log('FX WebSocket connection timeout');
          this.fxWs.close();
        }
      }, 10000);

      this.fxWs.onopen = () => {
        clearTimeout(this.fxConnectTimeout);
        
        console.log('✓ FX WebSocket connected successfully');
        this.fxIsConnected = true;
        this.fxIsConnecting = false;
        this.fxReconnectAttempts = 0;
        
        // FX WebSocket automatically sends all data, no need to send tokens
      };

      this.fxWs.onmessage = (event) => {
        // Handle empty or ping messages
        if (!event.data || event.data === "" || event.data === "true") {
          return;
        }

        try {
          const data = JSON.parse(event.data);
          
          // Broadcast to all FX subscribers
          this.fxSubscribers.forEach((callback, subscriberId) => {
            try {
              callback(data);
            } catch (error) {
              console.error(`Error in FX subscriber ${subscriberId}:`, error);
            }
          });
        } catch (error) {
          console.error('Error parsing FX WebSocket data:', error);
        }
      };

      this.fxWs.onerror = (error) => {
        clearTimeout(this.fxConnectTimeout);
        // Don't log error if connection is already closed
        if (this.fxWs && this.fxWs.readyState !== WebSocket.CLOSED) {
          console.error('FX WebSocket error:', error);
        }
        this.fxIsConnected = false;
        this.fxIsConnecting = false;
      };

      this.fxWs.onclose = (event) => {
        clearTimeout(this.fxConnectTimeout);
        
        // Only log if it wasn't a clean close
        if (!event.wasClean && event.code !== 1000) {
          console.log('FX WebSocket disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });
        }
        
        this.fxIsConnected = false;
        this.fxIsConnecting = false;
        this.fxWs = null;
        
        // Notify all FX subscribers only if we have subscribers
        if (this.fxSubscribers.size > 0) {
          this.fxSubscribers.forEach((callback) => {
            try {
              callback({ type: 'disconnected' });
            } catch (error) {
              console.error('Error notifying FX subscriber:', error);
            }
          });

          // Reconnect with exponential backoff only if we have subscribers
          if (this.fxReconnectAttempts < this.maxReconnectAttempts) {
            this.fxReconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.fxReconnectAttempts - 1), 30000);
            
            console.log(`Scheduling FX reconnect in ${delay}ms (attempt ${this.fxReconnectAttempts}/${this.maxReconnectAttempts})`);
            
            this.fxReconnectTimeout = setTimeout(() => {
              if (this.fxSubscribers.size > 0) {
                this.connectFX();
              }
            }, delay);
          } else {
            console.error('Max FX reconnection attempts reached');
          }
        }
      };

    } catch (error) {
      console.error('Error creating FX WebSocket:', error);
      this.fxIsConnecting = false;
      
      // Retry with exponential backoff only if we have subscribers
      if (this.fxSubscribers.size > 0 && this.fxReconnectAttempts < this.maxReconnectAttempts) {
        this.fxReconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.fxReconnectAttempts - 1), 30000);
        
        this.fxReconnectTimeout = setTimeout(() => {
          if (this.fxSubscribers.size > 0) {
            this.connectFX();
          }
        }, delay);
      }
    }
  }

  // Get current connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      fxIsConnected: this.fxIsConnected,
      fxIsConnecting: this.fxIsConnecting,
      subscribedTokens: Array.from(this.subscribedTokens),
      subscriberCount: this.subscribers.size,
      fxSubscriberCount: this.fxSubscribers.size
    };
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

// DO NOT auto-connect - let components request connection when needed
// webSocketService.connect();

export default webSocketService;
