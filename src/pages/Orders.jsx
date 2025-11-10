import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, XCircle, TrendingUp, TrendingDown, Home, Briefcase, Settings, User } from 'lucide-react';
import { tradingAPI } from '../services/api';
import toast from 'react-hot-toast';

const Orders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  
  // WebSocket references
  const websocketRef = useRef(null);
  const fxWebSocketRef = useRef(null);
  const tokensRef = useRef(null);
  const fxSymbolsRef = useRef([]);
  const mountedRef = useRef(true);
  const reconnectTimeoutRef = useRef(null);
  const fxReconnectTimeoutRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const fxReconnectAttemptRef = useRef(0);
  const [usdToInrRate, setUsdToInrRate] = useState(88.65); // Default fallback rate
  const exchangeRateIntervalRef = useRef(null);
  const ordersStateRef = useRef([]); // Keep reference to current orders for preserving WebSocket updates

  const tabs = [
    { id: 'pending', label: 'Pending' },
    { id: 'active', label: 'Active' },
    { id: 'closed', label: 'Closed' },
    { id: 'sltp', label: 'SL/TP' }
  ];

  const bottomNavItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'orders', icon: FileText, label: 'Orders' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'tools', icon: Settings, label: 'Tools' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  // Fetch USD to INR exchange rate
  const fetchExchangeRate = useCallback(async () => {
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      if (data.rates && data.rates.INR) {
        setUsdToInrRate(data.rates.INR);
        console.log('USD to INR rate updated:', data.rates.INR);
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    }
  }, []);

  // Update market data from WebSocket (MCX/NSE format)
  const updateMarketData = useCallback((data) => {
    if (!data || !data.instrument_token) return;
    
    const tokenToFind = data.instrument_token.toString();
    console.log('Orders: updateMarketData called for token:', tokenToFind, 'activeTab:', activeTab);
    
    setOrders(prevOrders => {
      const updatedOrders = prevOrders.map(order => {
        // Only update active orders (not pending/closed) and non-FX orders
        if (order.TokenNo?.toString() === tokenToFind && activeTab === 'active' && !order.isFX) {
          const bid = data.bid === "0" || data.bid === 0 ? data.last_price : data.bid;
          const ask = data.ask === "0" || data.ask === 0 ? data.last_price : data.ask;
          
          let currentPrice = 0;
          let profitLoss = 0;
          
          if (order.OrderCategory === "SELL") {
            currentPrice = ask;
            profitLoss = (parseFloat(order.OrderPrice) - parseFloat(currentPrice)) * (parseFloat(order.selectedlotsize || 1) * parseFloat(order.Lot || 1));
          } else {
            currentPrice = bid;
            profitLoss = (parseFloat(currentPrice) - parseFloat(order.OrderPrice)) * (parseFloat(order.selectedlotsize || 1) * parseFloat(order.Lot || 1));
          }
          
          console.log('Orders: Updating order', order.ScriptName, 'currentPrice:', currentPrice, 'profitLoss:', profitLoss);
          
          return {
            ...order,
            currentPrice: parseFloat(currentPrice),
            profitLoss: parseFloat(profitLoss.toFixed(2))
          };
        }
        return order;
      });
      ordersStateRef.current = updatedOrders; // Update ref
      return updatedOrders;
    });
  }, [activeTab]);

  // Update market data from FX WebSocket (FOREX/CRYPTO/COMMODITY tick format)
  const updateFXMarketData = useCallback((tickData) => {
    if (!tickData || !tickData.type || tickData.type !== 'tick' || !tickData.data) {
      return;
    }

    const { Symbol, BestBid, BestAsk } = tickData.data;
    
    if (!Symbol) return;

    console.log('Orders: updateFXMarketData called for Symbol:', Symbol, 'activeTab:', activeTab);

    // Get USD prices from tick data
    const bestBidPriceUSD = BestBid?.Price || 0;
    const bestAskPriceUSD = BestAsk?.Price || 0;
    
    // Convert USD prices to INR using real-time exchange rate
    const bestBidPrice = bestBidPriceUSD * usdToInrRate;
    const bestAskPrice = bestAskPriceUSD * usdToInrRate;
    
    setOrders(prevOrders => {
      const updatedOrders = prevOrders.map(order => {
        // Only update active orders (not pending/closed) and FX orders
        if (activeTab === 'active' && order.isFX) {
          // Match by SymbolName (the Symbol from tick data should match SymbolName)
          // Use scriptName if available (from Portfolio), otherwise split ScriptName
          const symbolName = order.scriptName || order.ScriptName?.split('_')[0];
          if (symbolName === Symbol || order.ScriptName === Symbol) {
            console.log('Orders: Matching FX order found:', order.ScriptName, 'Symbol:', Symbol);
            
            let currentPrice = 0;
            let profitLoss = 0;
            
            // Calculate prices and P/L in USD for FX orders
            let currentPriceUSD = 0;
            let profitLossUSD = 0;
            
            if (order.OrderCategory === "SELL") {
              currentPrice = bestAskPrice; // Use ask price for SELL orders (INR)
              currentPriceUSD = bestAskPriceUSD; // Use ask price for SELL orders (USD)
              profitLoss = (parseFloat(order.OrderPrice) - parseFloat(currentPrice)) * (parseFloat(order.selectedlotsize || 1) * parseFloat(order.Lot || 1));
              // Calculate P/L in USD
              const orderPriceUSD = parseFloat(order.OrderPrice) / usdToInrRate;
              profitLossUSD = (orderPriceUSD - currentPriceUSD) * (parseFloat(order.selectedlotsize || 1) * parseFloat(order.Lot || 1));
            } else {
              currentPrice = bestBidPrice; // Use bid price for BUY orders (INR)
              currentPriceUSD = bestBidPriceUSD; // Use bid price for BUY orders (USD)
              profitLoss = (parseFloat(currentPrice) - parseFloat(order.OrderPrice)) * (parseFloat(order.selectedlotsize || 1) * parseFloat(order.Lot || 1));
              // Calculate P/L in USD
              const orderPriceUSD = parseFloat(order.OrderPrice) / usdToInrRate;
              profitLossUSD = (currentPriceUSD - orderPriceUSD) * (parseFloat(order.selectedlotsize || 1) * parseFloat(order.Lot || 1));
            }
            
            console.log('Orders: Updating FX order', order.ScriptName, 'currentPrice:', currentPrice, 'profitLoss:', profitLoss);
            
            return {
              ...order,
              currentPrice: parseFloat(currentPrice),
              profitLoss: parseFloat(profitLoss.toFixed(2)),
              currentPriceUSD: parseFloat(currentPriceUSD.toFixed(4)),
              profitLossUSD: parseFloat(profitLossUSD.toFixed(2)),
              buyUSD: bestAskPriceUSD,
              sellUSD: bestBidPriceUSD,
              ltpUSD: (bestBidPriceUSD + bestAskPriceUSD) / 2
            };
          }
        }
        return order;
      });
      ordersStateRef.current = updatedOrders; // Update ref
      return updatedOrders;
    });
  }, [activeTab, usdToInrRate]);

  // Initialize WebSocket with robust reconnection
  const initializeWebSocket = useCallback((tokens) => {
    const uri = "wss://ws.tradewingss.com/api/webapiwebsoc";
    
    // Close existing connection gracefully if any
    if (websocketRef.current) {
      try {
        websocketRef.current.close(1000, 'Reconnecting');
      } catch (error) {
        console.log('Error closing existing WebSocket:', error);
      }
      websocketRef.current = null;
    }
    
    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    const maxReconnectAttempts = 10;
    
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(uri);
        websocketRef.current = ws;
        
        const connectTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        }, 10000);
        
        ws.onopen = () => {
          clearTimeout(connectTimeout);
          
          if (!mountedRef.current) {
            ws.close();
            return;
          }
          
          reconnectAttemptRef.current = 0;
          console.log('Orders: WebSocket connected, sending tokens:', tokens);
          
          if (tokens && tokens.trim().length > 0) {
            try {
              ws.send(tokens);
            } catch (error) {
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(tokens);
                  } catch (err) {}
                }
              }, 1000);
            }
          } else {
            ws.send("");
          }
        };
        
        ws.onerror = () => {
          clearTimeout(connectTimeout);
        };
        
        ws.onclose = () => {
          clearTimeout(connectTimeout);
          if (!mountedRef.current) return;
          
          websocketRef.current = null;
          
          if (mountedRef.current && tokensRef.current && reconnectAttemptRef.current < maxReconnectAttempts) {
            reconnectAttemptRef.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && tokensRef.current) {
                connectWebSocket();
              }
            }, delay);
          }
        };
        
        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          
          if (!event.data || event.data === "" || event.data === "true") {
            return;
          }
          
          try {
            const data = JSON.parse(event.data);
            console.log('Orders: Received WebSocket data:', data);
            updateMarketData(data);
          } catch (error) {
            console.error('Error parsing WebSocket data:', error);
          }
        };
        
      } catch (error) {
        if (mountedRef.current && tokensRef.current && reconnectAttemptRef.current < maxReconnectAttempts) {
          reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && tokensRef.current) {
              connectWebSocket();
            }
          }, delay);
        }
      }
    };
    
    connectWebSocket();
  }, [updateMarketData]);

  // Initialize FX WebSocket for FOREX/CRYPTO/COMMODITY
  const initializeFXWebSocket = useCallback(() => {
    const uri = "wss://www.fxsoc.tradenstocko.com:8001/ws";
    
    // Close existing FX connection if any
    if (fxWebSocketRef.current) {
      try {
        fxWebSocketRef.current.close(1000, 'Reconnecting');
      } catch (error) {
        console.log('Error closing existing FX WebSocket:', error);
      }
      fxWebSocketRef.current = null;
    }
    
    // Clear any existing reconnection timeout
    if (fxReconnectTimeoutRef.current) {
      clearTimeout(fxReconnectTimeoutRef.current);
      fxReconnectTimeoutRef.current = null;
    }
    
    const maxReconnectAttempts = 10;
    
    const connectFXWebSocket = () => {
      try {
        console.log(`Attempting FX WebSocket connection (attempt ${fxReconnectAttemptRef.current + 1})...`);
        
        const ws = new WebSocket(uri);
        fxWebSocketRef.current = ws;
        
        const connectTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.log('FX WebSocket connection timeout');
            ws.close();
          }
        }, 10000);
        
        ws.onopen = () => {
          clearTimeout(connectTimeout);
          
          if (!mountedRef.current) {
            ws.close();
            return;
          }
          
          console.log('✓ FX WebSocket connected successfully');
          fxReconnectAttemptRef.current = 0;
          
          // FX WebSocket automatically sends all data, no need to send tokens
        };
        
        ws.onerror = (event) => {
          clearTimeout(connectTimeout);
          if (!mountedRef.current) return;
          console.error('FX WebSocket error:', event);
        };
        
        ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          if (!mountedRef.current) return;
          
          console.log('FX WebSocket disconnected', { 
            code: event.code, 
            reason: event.reason 
          });
          fxWebSocketRef.current = null;
          
          // Reconnect logic
          if (mountedRef.current && fxSymbolsRef.current.length > 0 && fxReconnectAttemptRef.current < maxReconnectAttempts) {
            fxReconnectAttemptRef.current++;
            const delay = Math.min(1000 * Math.pow(2, fxReconnectAttemptRef.current - 1), 30000);
            
            console.log(`Scheduling FX reconnect in ${delay}ms (attempt ${fxReconnectAttemptRef.current}/${maxReconnectAttempts})`);
            
            fxReconnectTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && fxSymbolsRef.current.length > 0) {
                connectFXWebSocket();
              }
            }, delay);
          }
        };
        
        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          
          if (!event.data || event.data === "" || event.data === "true") {
            return;
          }
          
          try {
            const data = JSON.parse(event.data);
            console.log('Orders: Received FX WebSocket data:', data);
            updateFXMarketData(data);
          } catch (error) {
            console.error('Error parsing FX WebSocket data:', error);
          }
        };
        
      } catch (error) {
        console.error('Error creating FX WebSocket:', error);
        
        if (mountedRef.current && fxSymbolsRef.current.length > 0 && fxReconnectAttemptRef.current < maxReconnectAttempts) {
          fxReconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, fxReconnectAttemptRef.current - 1), 30000);
          
          fxReconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && fxSymbolsRef.current.length > 0) {
              connectFXWebSocket();
            }
          }, delay);
        }
      }
    };
    
    connectFXWebSocket();
  }, [updateFXMarketData]);

  // Cleanup on unmount
  useEffect(() => {
    // Fetch exchange rate on mount and set up periodic updates (every 5 minutes)
    fetchExchangeRate();
    exchangeRateIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        fetchExchangeRate();
      }
    }, 5 * 60 * 1000); // Update every 5 minutes
    
    return () => {
      mountedRef.current = false;
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      if (fxWebSocketRef.current) {
        fxWebSocketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (fxReconnectTimeoutRef.current) {
        clearTimeout(fxReconnectTimeoutRef.current);
      }
      if (exchangeRateIntervalRef.current) {
        clearInterval(exchangeRateIntervalRef.current);
      }
    };
  }, [fetchExchangeRate]);

  useEffect(() => {
    if (user?.UserId) {
      fetchOrders();
    }
  }, [user]);

  useEffect(() => {
    if (user?.UserId && activeTab) {
      fetchOrdersByStatus();
    }
  }, [activeTab, user?.UserId]);

  const fetchOrdersByStatus = async () => {
    setLoading(true);
    try {
      let response;
      
      if (activeTab === 'sltp') {
        // Get SL/TP orders
        response = await tradingAPI.getSLTP(user.UserId);
      } else {
        // Get orders by status (Pending, Active, or Closed)
        response = await tradingAPI.getOrders(activeTab.charAt(0).toUpperCase() + activeTab.slice(1), user.UserId);
      }
      
      // Parse response if it's a string
      let data = typeof response === 'string' ? JSON.parse(response) : response;
      
      // For active orders, preserve WebSocket updates and initialize WebSocket for live updates
      if (activeTab === 'active' && data.length > 0) {
        let tokens = '';
        const fxSymbols = [];
        
        // Preserve existing WebSocket updates from current orders state
        const existingOrdersMap = new Map();
        ordersStateRef.current.forEach(order => {
          if (order.TokenNo) {
            existingOrdersMap.set(order.TokenNo.toString(), {
              currentPrice: order.currentPrice,
              profitLoss: order.profitLoss,
              currentPriceUSD: order.currentPriceUSD,
              profitLossUSD: order.profitLossUSD
            });
          }
        });
        
        data = data.map(item => {
          // Check if this is an FX symbol (FOREX, CRYPTO, COMMODITY)
          const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(item.SymbolType);
          
          if (!isFX && item.TokenNo) {
            tokens += item.TokenNo + ',';
          } else if (isFX) {
            // For FX symbols, store symbol name for FX WebSocket
            const scriptParts = item.ScriptName?.split('_') || [item.ScriptName];
            const symbolName = scriptParts[0];
            fxSymbols.push({
              symbolName,
              tokenNo: item.TokenNo
            });
          }
          
          // Calculate initial P/L
          let profitLoss = 0;
          let profitLossUSD = 0;
          let orderPriceUSD = 0;
          let currentPriceUSD = 0;
          const cmp = parseFloat(item.cmp || 0);
          const orderPrice = parseFloat(item.OrderPrice || 0);
          const lotSize = (parseFloat(item.selectedlotsize || 1) * parseFloat(item.Lot || 1));
          
          // Check if we have WebSocket-updated values for this order
          const existingUpdate = existingOrdersMap.get(item.TokenNo?.toString());
          const hasWebSocketUpdate = existingUpdate && existingUpdate.currentPrice > 0;
          
          if (hasWebSocketUpdate) {
            // Use WebSocket-updated values
            profitLoss = existingUpdate.profitLoss || 0;
            profitLossUSD = existingUpdate.profitLossUSD || 0;
            currentPriceUSD = existingUpdate.currentPriceUSD || 0;
          } else if (cmp > 0) {
            // Only calculate P/L if we have a valid current price (cmp > 0)
            // If cmp is 0, P/L will be 0 initially and updated by WebSocket with live prices
            // For FX orders, calculate USD prices and P/L
            if (isFX && usdToInrRate > 0) {
              // Convert OrderPrice from INR to USD
              orderPriceUSD = orderPrice / usdToInrRate;
              // Convert CMP from INR to USD
              currentPriceUSD = cmp / usdToInrRate;
              
              // Calculate P/L in USD
              if (item.OrderCategory === "SELL") {
                profitLossUSD = (orderPriceUSD - currentPriceUSD) * lotSize;
              } else {
                profitLossUSD = (currentPriceUSD - orderPriceUSD) * lotSize;
              }
            }
            
            // Calculate P/L in INR (for non-FX or as fallback)
            if (item.OrderCategory === "SELL") {
              profitLoss = (orderPrice - cmp) * lotSize;
            } else {
              profitLoss = (cmp - orderPrice) * lotSize;
            }
          }
          
          return {
            ...item,
            scriptName: item.ScriptName?.split('_')[0] || item.ScriptName, // Add scriptName for FX symbol matching
            currentPrice: hasWebSocketUpdate ? existingUpdate.currentPrice : cmp,
            profitLoss: parseFloat(profitLoss.toFixed(2)),
            profitLossUSD: isFX ? parseFloat(profitLossUSD.toFixed(2)) : 0,
            orderPriceUSD: isFX ? parseFloat(orderPriceUSD.toFixed(4)) : 0,
            currentPriceUSD: isFX ? parseFloat(currentPriceUSD.toFixed(4)) : 0,
            isFX,
            symbolType: item.SymbolType
          };
        });
        
        tokensRef.current = tokens.slice(0, -1);
        fxSymbolsRef.current = fxSymbols;
        ordersStateRef.current = data; // Update ref
        setOrders(data);
        
        // Initialize WebSocket for MCX/NSE orders
        if (tokensRef.current && tokensRef.current.trim().length > 0) {
          console.log('Orders: Initializing WebSocket with tokens:', tokensRef.current);
          initializeWebSocket(tokensRef.current);
        }
        
        // Initialize FX WebSocket for FOREX/CRYPTO/COMMODITY orders
        if (fxSymbols.length > 0) {
          console.log('Orders: Initializing FX WebSocket with symbols:', fxSymbols);
          initializeFXWebSocket();
        }
      } else {
        ordersStateRef.current = data; // Update ref
        setOrders(data);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    // This is called on initial load - fetch active orders by default
    setActiveTab('active');
  };

  const getStatusIcon = (status) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'closed':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <FileText className="w-4 h-4 text-blue-500" />;
    }
  };

  const getActionIcon = (action) => {
    return action.toLowerCase() === 'buy' ? 
      <TrendingUp className="w-4 h-4 text-green-500" /> : 
      <TrendingDown className="w-4 h-4 text-red-500" />;
  };

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
  };

  const handleNavClick = (navId) => {
    switch(navId) {
      case 'home':
        navigate('/dashboard');
        break;
      case 'orders':
        // Already on orders page
        break;
      case 'portfolio':
        navigate('/portfolio');
        break;
      case 'tools':
        navigate('/tools');
        break;
      case 'profile':
        navigate('/profile');
        break;
      default:
        break;
    }
  };

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
        <div className="px-2 py-2">
          <h1 className="text-md font-bold text-white">Orders</h1>
        </div>
      </div>

      {/* Fixed Tabs */}
      <div className="flex-shrink-0 flex bg-gray-800 border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white bg-gray-700 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-750'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable Orders List */}
      <div className="flex-1 overflow-y-auto px-2 py-4 pb-24">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-4">
            {orders.map((order, index) => {
              // Handle SL/TP orders differently
              if (activeTab === 'sltp') {
                const scriptParts = order.ScriptName?.split('_') || [order.ScriptName, ''];
                return (
                  <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-2">
                        <div>
                          <h3 className="font-semibold text-white">{scriptParts[0]}</h3>
                          <p className="text-sm text-gray-400">{scriptParts[1]}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium px-2 py-1 rounded-full bg-green-900 text-green-300">
                          {order.OrderCategory}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Stop Loss</p>
                        <p className="font-medium text-red-400">₹{order.SL}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Take Profit</p>
                        <p className="font-medium text-green-400">₹{order.TP}</p>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">{order.DateTime}</span>
                        <span className="text-green-400 px-2 py-1 rounded bg-green-900">
                          {order.Status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
              
              // Regular orders display
              const scriptParts = order.ScriptName?.split('_') || [order.ScriptName, ''];
              return (
                <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-2">
                      {getActionIcon(order.OrderCategory)}
                      <div>
                        <h3 className="font-semibold text-white">{scriptParts[0]}</h3>
                        <p className="text-sm text-gray-400">{scriptParts[1] || order.ActionType}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(order.OrderStatus)}
                      <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                        order.OrderStatus?.toLowerCase() === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                        order.OrderStatus?.toLowerCase() === 'active' ? 'bg-green-900 text-green-300' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {order.OrderStatus}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Order Type</p>
                      <p className="font-medium text-white">{order.OrderType}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Lot Size</p>
                      <p className="font-medium text-white">{order.Lot}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Order Price</p>
                      <p className="font-medium text-white">
                        ₹{order.OrderPrice ? parseFloat(order.OrderPrice).toFixed(2) : '0.00'}
                      </p>
                    </div>
                    {activeTab === 'active' && order.currentPrice !== undefined && (
                      <div>
                        <p className="text-gray-400">Current Price</p>
                        <p className="font-medium text-white">
                          ₹{order.currentPrice ? parseFloat(order.currentPrice).toFixed(2) : '0.00'}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-400">Margin Used</p>
                      <p className="font-medium text-white">
                        ₹{order.MarginUsed ? parseFloat(order.MarginUsed).toFixed(2) : '0.00'}
                      </p>
                    </div>
                    {activeTab === 'active' && order.profitLoss !== undefined && (
                      <div>
                        <p className="text-gray-400">Profit/Loss</p>
                        <p className={`font-medium ${(order.profitLoss || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {order.profitLoss >= 0 ? '+' : ''}₹{order.profitLoss?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400">
                        {order.OrderDate} at {order.OrderTime}
                      </span>
                      <span className="text-gray-400">Order ID: {order.Id}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No orders found</p>
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-1 py-2">
        <div className="flex justify-around items-center">
          {bottomNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className="flex flex-col items-center py-2"
            >
              <item.icon 
                className={`w-6 h-6 mb-1 ${
                  item.id === 'orders' ? 'text-blue-500' : 'text-gray-400'
                }`} 
              />
              <span className={`text-xs font-medium ${
                item.id === 'orders' ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Orders;
