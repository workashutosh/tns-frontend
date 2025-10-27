// Global WebSocket Service - Single connection for all components
class WebSocketService {
  constructor() {
    this.ws = null;
    this.subscribers = new Map(); // Map to track subscriber callbacks
    this.subscribedTokens = new Set(); // Set to track current subscriptions
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.isConnecting = false;
    this.reconnectTimeout = null;
    this.connectTimeout = null;
    this.isConnected = false;
  }

  // Subscribe to WebSocket updates
  subscribe(subscriberId, callback) {
    this.subscribers.set(subscriberId, callback);
    
    // If already connected, start receiving updates
    if (this.isConnected) {
      console.log(`Subscriber ${subscriberId} added`);
    }
    
    return () => {
      this.subscribers.delete(subscriberId);
      console.log(`Subscriber ${subscriberId} removed`);
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

  // Connect to WebSocket
  connect() {
    if (this.isConnecting || this.isConnected) {
      console.log('WebSocket already connecting or connected');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.isConnecting = true;
    const uri = "wss://ws.tradewingss.com/api/webapiwebsoc";
    
    console.log(`Attempting WebSocket connection (attempt ${this.reconnectAttempts + 1})...`);
    
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
        
        console.log('✓ WebSocket connected successfully');
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
        console.error('WebSocket error:', error);
        this.isConnected = false;
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        clearTimeout(this.connectTimeout);
        
        console.log('WebSocket disconnected', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        
        this.isConnected = false;
        this.isConnecting = false;
        this.ws = null;
        
        // Notify all subscribers
        this.subscribers.forEach((callback) => {
          try {
            callback({ type: 'disconnected' });
          } catch (error) {
            console.error('Error notifying subscriber:', error);
          }
        });

        // Reconnect with exponential backoff
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
          
          console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          this.reconnectTimeout = setTimeout(() => {
            this.connect();
          }, delay);
        } else {
          console.error('Max reconnection attempts reached');
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

  // Get current connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      subscribedTokens: Array.from(this.subscribedTokens),
      subscriberCount: this.subscribers.size
    };
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

// Auto-connect when first subscriber is added
webSocketService.connect();

export default webSocketService;
