import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  ChevronDown, 
  Users, 
  BarChart3, 
  Bookmark, 
  FileText, 
  Briefcase, 
  Pin, 
  User,
  TrendingUp,
  TrendingDown,
  X
} from 'lucide-react';
import { tradingAPI } from '../services/api';
import toast from 'react-hot-toast';

const Portfolio = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State management
  const [activeTab, setActiveTab] = useState('Holdings');
  const [activeSubTab, setActiveSubTab] = useState('Active');
  const [loading, setLoading] = useState(true);
  const [balanceData, setBalanceData] = useState({
    ledgerBalance: 0,
    marginAvailable: 0,
    activePL: 0,
    m2m: 0,
    netPL: 0
  });
  const [activeOrders, setActiveOrders] = useState([]);
  const [closedOrders, setClosedOrders] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [showSLTPModal, setShowSLTPModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [slValue, setSLValue] = useState('');
  const [tpValue, setTPValue] = useState('');
  const [usdToInrRate, setUsdToInrRate] = useState(88.65); // Default fallback rate
  
  // WebSocket and refs
  const websocketRef = useRef(null);
  const fxWebSocketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const fxReconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const tokensRef = useRef('');
  const fxSymbolsRef = useRef([]);
  const totalMarginUsedRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const fxReconnectAttemptRef = useRef(0);
  const exchangeRateIntervalRef = useRef(null);

  // Bottom navigation items
  const bottomNavItems = [
    { id: 'dashboard', icon: Bookmark, label: 'Home' },
    { id: 'orders', icon: FileText, label: 'Orders' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'tools', icon: Pin, label: 'Tools' },
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
      // Keep using the previous rate or default
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    // Fetch exchange rate on mount and set up periodic updates (every 5 minutes)
    fetchExchangeRate();
    exchangeRateIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        fetchExchangeRate();
      }
    }, 5 * 60 * 1000); // Update every 5 minutes
    
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (fxReconnectTimeoutRef.current) {
        clearTimeout(fxReconnectTimeoutRef.current);
      }
      if (exchangeRateIntervalRef.current) {
        clearInterval(exchangeRateIntervalRef.current);
      }
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
      if (fxWebSocketRef.current) {
        fxWebSocketRef.current.close();
        fxWebSocketRef.current = null;
      }
    };
  }, [fetchExchangeRate]);

  // Initialize data on component mount
  useEffect(() => {
    if (user?.UserId) {
      initializePortfolioData();
    }
    
    // Cleanup WebSocket on unmount
    return () => {
      if (websocketRef.current) {
        try {
          websocketRef.current.close();
          websocketRef.current = null;
        } catch (error) {
          console.log('Error closing WebSocket on unmount:', error);
        }
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [user]);

  // Initialize portfolio data
  const initializePortfolioData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        getUserBalance(),
        getActiveOrders(),
        getClosedOrders()
      ]);
    } catch (error) {
      console.error('Error initializing portfolio data:', error);
      toast.error('Failed to load portfolio data');
    } finally {
      setLoading(false);
    }
  };

  // Refresh closed orders when exchange rate changes (for USD conversion)
  useEffect(() => {
    if (user?.UserId && usdToInrRate > 0 && closedOrders.length > 0) {
      // Re-process closed orders with updated exchange rate
      setClosedOrders(prevOrders => {
        return prevOrders.map(order => {
          if (order.isFX && usdToInrRate > 0) {
            const orderPriceUSD = parseFloat(order.OrderPrice || 0) / usdToInrRate;
            const broughtByUSD = parseFloat(order.BroughtBy || 0) / usdToInrRate;
            const plUSD = parseFloat(order.P_L || 0) / usdToInrRate;
            
            return {
              ...order,
              orderPriceUSD: parseFloat(orderPriceUSD.toFixed(4)),
              broughtByUSD: parseFloat(broughtByUSD.toFixed(4)),
              plUSD: parseFloat(plUSD.toFixed(2))
            };
          }
          return order;
        });
      });
    }
  }, [usdToInrRate, user?.UserId]);

  // Get user balance and financial data
  const getUserBalance = async () => {
    try {
      const response = await tradingAPI.getLedgerBalance(user.UserId);
      const ledgerBalance = parseInt(response) || 0;
      
      // Get net P/L for closed orders
      const netPLData = await tradingAPI.getNetPL(user.UserId);
      const netPL = parseInt(netPLData.P_L) || 0;
      
      const creditLimit = parseFloat(localStorage.getItem('CreditLimit')) || 0;
      const m2m = ledgerBalance + creditLimit;
      const marginAvailable = m2m - totalMarginUsedRef.current;
      
      setBalanceData({
        ledgerBalance,
        marginAvailable: Math.max(0, marginAvailable),
        activePL: 0, // Will be updated by WebSocket
        m2m,
        netPL
      });
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  // Get active orders (consolidated trades)
  const getActiveOrders = async () => {
    try {
      const response = await tradingAPI.getConsolidatedTrades(user.UserId);
      const data = JSON.parse(response);
      
      if (data.length > 0) {
        let tokens = '';
        let totalMargin = 0;
        const fxSymbols = [];
        
        const orders = data.map(item => {
          // Check if this is an FX symbol (FOREX, CRYPTO, COMMODITY)
          const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(item.SymbolType);
          
          if (!isFX) {
            tokens += item.TokenNo + ',';
          } else {
            // For FX symbols, store symbol name for FX WebSocket
            const scriptParts = item.ScriptName.split('_');
            const symbolName = scriptParts[0];
            fxSymbols.push({
              symbolName,
              tokenNo: item.TokenNo,
              orderCategory: item.OrderCategory,
              orderPrice: parseFloat(item.OrderPrice || 0),
              lotSize: (parseFloat(item.selectedlotsize || 1) * parseFloat(item.Lot || 1))
            });
          }
          
          totalMargin += Math.round(item.MarginUsed);
          
          const scriptParts = item.ScriptName.split('_');
          const scriptName = scriptParts[0];
          const exchange = scriptParts[1];
          
          // Check if this is a stop loss order
          const isStopLossOrder = item.isstoplossorder === 'true' || item.isstoplossorder === true;
          const orderCategoryDisplay = isStopLossOrder ? `Stop ${item.OrderCategory}` : item.OrderCategory;
          
          // Calculate initial P/L from cmp value (exactly like original)
          let profitLoss = 0;
          let profitLossUSD = 0;
          const cmp = parseFloat(item.cmp || 0);
          const orderPrice = parseFloat(item.OrderPrice || 0);
          const lotSize = (parseFloat(item.selectedlotsize || 1) * parseFloat(item.Lot || 1));
          
          // For FX orders, calculate USD prices and P/L
          let orderPriceUSD = 0;
          let currentPriceUSD = 0;
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
          
          return {
            ...item,
            scriptName,
            exchange,
            profitLoss: parseFloat(profitLoss.toFixed(2)),
            profitLossUSD: isFX ? parseFloat(profitLossUSD.toFixed(2)) : 0,
            orderPriceUSD: isFX ? parseFloat(orderPriceUSD.toFixed(4)) : 0,
            currentPriceUSD: isFX ? parseFloat(currentPriceUSD.toFixed(4)) : 0,
            currentPrice: item.cmp,
            isStopLossOrder,
            orderCategoryDisplay,
            stopLossPrice: item.StopLossPrice || '',
            takeProfitPrice: item.TakeProfitPrice || '',
            isFX,
            symbolType: item.SymbolType
          };
        });
        
        totalMarginUsedRef.current = totalMargin;
        tokensRef.current = tokens.slice(0, -1); // Remove trailing comma
        fxSymbolsRef.current = fxSymbols;
        
        setActiveOrders(orders);
        
        // Initialize WebSocket for MCX/NSE orders
        if (tokensRef.current) {
          initializeWebSocket(tokensRef.current);
        }
        
        // Initialize FX WebSocket for FOREX/CRYPTO/COMMODITY orders
        if (fxSymbols.length > 0) {
          initializeFXWebSocket();
        }
      } else {
        setActiveOrders([]);
        tokensRef.current = '';
        fxSymbolsRef.current = [];
      }
    } catch (error) {
      console.error('Error fetching active orders:', error);
      setActiveOrders([]);
    }
  };

  // Get closed orders
  const getClosedOrders = async () => {
    try {
      const data = await tradingAPI.getUserClosedOrders(user.UserId);
      
      if (data.length > 0) {
        // Process closed orders to add FX detection and USD prices
        const processedData = data.map(item => {
          const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(item.SymbolType);
          
          // Calculate USD prices for FX orders
          let orderPriceUSD = 0;
          let broughtByUSD = 0;
          let plUSD = 0;
          
          if (isFX && usdToInrRate > 0) {
            orderPriceUSD = parseFloat(item.OrderPrice || 0) / usdToInrRate;
            broughtByUSD = parseFloat(item.BroughtBy || 0) / usdToInrRate;
            // Convert P/L from INR to USD
            plUSD = parseFloat(item.P_L || 0) / usdToInrRate;
          }
          
          return {
            ...item,
            isFX,
            orderPriceUSD: isFX ? parseFloat(orderPriceUSD.toFixed(4)) : 0,
            broughtByUSD: isFX ? parseFloat(broughtByUSD.toFixed(4)) : 0,
            plUSD: isFX ? parseFloat(plUSD.toFixed(2)) : 0
          };
        });
        
        setClosedOrders(processedData);
      } else {
        setClosedOrders([]);
      }
    } catch (error) {
      console.error('Error fetching closed orders:', error);
      setClosedOrders([]);
    }
  };

  // Update market data from WebSocket (MCX/NSE format)
  const updateMarketData = useCallback((data) => {
    if (!data || !data.instrument_token) return;
    
    const tokenToFind = data.instrument_token.toString();
    
    setActiveOrders(prevOrders => {
      const updatedOrders = prevOrders.map(order => {
        // Only update non-FX orders
        if (order.TokenNo?.toString() === tokenToFind && !order.isFX) {
          const bid = data.bid === "0" || data.bid === 0 ? data.last_price : data.bid;
          const ask = data.ask === "0" || data.ask === 0 ? data.last_price : data.ask;
          
          let currentPrice = 0;
          let profitLoss = 0;
          
          if (order.OrderCategory === "SELL") {
            currentPrice = ask;
            profitLoss = (parseFloat(order.OrderPrice) - parseFloat(currentPrice)) * (order.selectedlotsize * order.Lot);
          } else {
            currentPrice = bid;
            profitLoss = (parseFloat(currentPrice) - parseFloat(order.OrderPrice)) * (order.selectedlotsize * order.Lot);
          }
          
          return {
            ...order,
            currentPrice: parseFloat(currentPrice),
            profitLoss: parseFloat(profitLoss.toFixed(2))
          };
        }
        return order;
      });
      
      return updatedOrders;
    });
  }, []);

  // Update market data from FX WebSocket (FOREX/CRYPTO/COMMODITY tick format)
  const updateFXMarketData = useCallback((tickData) => {
    if (!tickData || !tickData.type || tickData.type !== 'tick' || !tickData.data) {
      return;
    }

    const { Symbol, BestBid, BestAsk } = tickData.data;
    
    if (!Symbol) return;

    // Get USD prices from tick data
    const bestBidPriceUSD = BestBid?.Price || 0;
    const bestAskPriceUSD = BestAsk?.Price || 0;
    
    // Convert USD prices to INR using real-time exchange rate
    const bestBidPrice = bestBidPriceUSD * usdToInrRate;
    const bestAskPrice = bestAskPriceUSD * usdToInrRate;
    
    // Calculate LTP (Last Traded Price) in INR - midpoint of best bid/ask
    const ltp = bestBidPrice && bestAskPrice ? (bestBidPrice + bestAskPrice) / 2 : (bestBidPrice || bestAskPrice || 0);
    
    setActiveOrders(prevOrders => {
      const updatedOrders = prevOrders.map(order => {
        // Match by SymbolName (the Symbol from tick data should match SymbolName)
        const symbolName = order.scriptName || order.ScriptName?.split('_')[0];
        if (order.isFX && (symbolName === Symbol || order.ScriptName === Symbol)) {
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
        return order;
      });
      
      return updatedOrders;
    });
  }, [usdToInrRate]);
  
  // Calculate and update balance data when active orders change
  useEffect(() => {
    if (activeOrders.length === 0) return;
    
    // Calculate total active P/L from all orders (exactly like original calcm2m)
    const totalActivePL = activeOrders.reduce((total, order) => total + (order.profitLoss || 0), 0);
    
    // Update balance data
    setBalanceData(prev => {
      const creditLimit = parseFloat(localStorage.getItem('CreditLimit')) || 0;
      const ledgerBalance = prev.ledgerBalance;
      const m2m = ledgerBalance + totalActivePL + creditLimit;
      const marginAvailable = m2m - totalMarginUsedRef.current;
      
      return {
        ...prev,
        activePL: totalActivePL,
        m2m,
        marginAvailable: Math.max(0, marginAvailable)
      };
    });
  }, [activeOrders]);

  // Initialize WebSocket connection with 0 failure rate
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
    
    // Store reconnect attempt count
    const maxReconnectAttempts = 10;
    
    const connectWebSocket = () => {
      try {
        console.log(`Attempting WebSocket connection (attempt ${reconnectAttemptRef.current + 1})...`);
        
        const ws = new WebSocket(uri);
        websocketRef.current = ws;
        
        const connectTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.log('WebSocket connection timeout');
            ws.close();
          }
        }, 10000); // 10 second timeout
        
        ws.onopen = () => {
          clearTimeout(connectTimeout);
          
          if (!mountedRef.current) {
            ws.close();
            return;
          }
          
          console.log('✓ WebSocket connected successfully');
          setWsConnected(true);
          setWsError(null);
          reconnectAttemptRef.current = 0; // Reset on successful connection
          
          // Send tokens to subscribe
          if (tokens && tokens.trim().length > 0) {
            console.log('Subscribing to tokens:', tokens);
            try {
              ws.send(tokens);
            } catch (error) {
              console.error('Error sending tokens:', error);
              // Retry sending tokens after 1 second
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(tokens);
                  } catch (err) {
                    console.error('Retry send failed:', err);
                  }
                }
              }, 1000);
            }
          } else {
            console.log('No tokens to subscribe');
            ws.send("");
          }
        };
        
        ws.onerror = (event) => {
          clearTimeout(connectTimeout);
          if (!mountedRef.current) return;
          
          console.error('WebSocket error:', event);
          setWsError('Connection error occurred');
          setWsConnected(false);
          
          // Don't reconnect on error, let onclose handle it
        };
        
        ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          if (!mountedRef.current) return;
          
          console.log('WebSocket disconnected', { 
            code: event.code, 
            reason: event.reason,
            wasClean: event.wasClean
          });
          setWsConnected(false);
          websocketRef.current = null;
          
          // Reconnect logic with exponential backoff
          if (mountedRef.current && tokensRef.current && reconnectAttemptRef.current < maxReconnectAttempts) {
            reconnectAttemptRef.current++;
            
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);
            
            console.log(`Scheduling reconnect in ${delay}ms (attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && tokensRef.current) {
                connectWebSocket();
              }
            }, delay);
          } else if (reconnectAttemptRef.current >= maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            setWsError('Connection failed after multiple attempts');
            // Reset after a longer delay to try again
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptRef.current = 0;
              if (mountedRef.current && tokensRef.current) {
                connectWebSocket();
              }
            }, 60000); // Try again after 60 seconds
          }
        };
        
        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          
          // Handle empty or ping messages
          if (!event.data || event.data === "" || event.data === "true") {
            return;
          }
          
          try {
            const data = JSON.parse(event.data);
            updateMarketData(data);
          } catch (error) {
            console.error('Error parsing WebSocket data:', error);
            console.log('Raw data:', event.data);
          }
        };
        
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        setWsError('Failed to create WebSocket connection');
        setWsConnected(false);
        
        // Attempt to reconnect with exponential backoff
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

  // Close trade functionality
  const closeTrade = async (order) => {
    const minutecount = localStorage.getItem("profittradestoptime");
    
    // Check scalping restriction
    if (minutecount && minutecount !== "" && minutecount > 0) {
      const currentDate = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const utcTime = currentDate.getTime() + (currentDate.getTimezoneOffset() * 60000);
      const istTime = new Date(utcTime + istOffset);
      
      const currentHours = istTime.getHours();
      const currentMinutes = istTime.getMinutes();
      
      const orderTimeParts = order.OrderTime.split(':');
      const orderHours = parseInt(orderTimeParts[0]);
      const orderMinutes = parseInt(orderTimeParts[1]);
      
      const currentTotalMinutes = (currentHours * 60) + currentMinutes;
      const orderTotalMinutes = (orderHours * 60) + orderMinutes;
      const timeDifferenceInMinutes = currentTotalMinutes - orderTotalMinutes;
      
      if (order.profitLoss > 0 && timeDifferenceInMinutes < parseInt(minutecount)) {
        toast.error(`Scalping not allowed. You can only close profitable trades after ${minutecount} minutes from order placement.`);
        return;
      }
    }
    
    // Show confirmation dialog
    const confirmed = window.confirm("Do you want to close this trade?");
    if (!confirmed) return;
    
    try {
      // Get refId from user object or localStorage, fallback to '4355'
      const refid = user?.Refid || localStorage.getItem("Refid") || '4355';
      
      // Check market time
      const marketTimeResponse = await tradingAPI.getMarketTime(order.SymbolType, refid);
      const marketData = marketTimeResponse.split('|');
      
      // Handle market time - if response already has seconds, use as-is, otherwise add ":00"
      let startTime = marketData[0] || '';
      let endTime = marketData[1] || '';
      
      // Check if time already includes seconds (format: HH:MM:SS)
      if (startTime && startTime.split(':').length === 2) {
        startTime = startTime + ":00";
      }
      if (endTime && endTime.split(':').length === 2) {
        endTime = endTime + ":00";
      }
      
      // Special case: If start and end time are the same (like "5:00:00|5:00:00"), 
      // it might indicate 24/7 market (crypto) - allow closing anytime
      const is24x7Market = startTime === endTime && startTime !== '';
      
      const today = new Date();
      if (!is24x7Market && (today.getDay() === 6 || today.getDay() === 0)) {
        toast.error("Market not open.");
        return;
      }
      
      const currentTime = new Date();
      const currentTimeStr = currentTime.getHours() + ":" + currentTime.getMinutes() + ":00";
      
      // For 24/7 markets (crypto), skip time validation
      if (is24x7Market) {
        // Allow closing for 24/7 markets
      } else {
        const currentSeconds = getTimeInSeconds(currentTimeStr);
        const startSeconds = getTimeInSeconds(startTime);
        const endSeconds = getTimeInSeconds(endTime);
        
        if (currentSeconds < startSeconds || currentSeconds > endSeconds) {
          toast.error("Market not open.");
          return;
        }
      }
      
      // Get order number - in the backend it's the Id field
      const orderNo = order.Id || order.OrderNo || order.OrderId || order.orderNo || order.orderId;
      
      console.log('Closing order with OrderNo:', orderNo, 'Full order:', order);
      
      if (!orderNo) {
        toast.error("Order number not found");
        return;
      }
      
      // Calculate P/L - ALWAYS use INR values for backend (even for FX orders)
      // Note: For FX orders, profitLossUSD is for display only, backend always expects INR
      const pl = order.profitLoss; // This is always in INR
      
      // Calculate brokerage (you may need to adjust this based on your logic)
      const brokerage = Math.abs(pl) * 0.01; // Example: 1% of absolute P/L
      
      // Get current date for ClosedAt
      const datee = new Date();
      const finaldate = datee.getFullYear() + "-" + (datee.getMonth() + 1) + "-" + datee.getDate();
      
      // Always send INR values to backend (rupees)
      const result = await tradingAPI.updateOrder(
        pl.toFixed(2),              // lp (P/L in INR)
        brokerage.toFixed(2),       // brokerage (in INR)
        order.currentPrice,          // BroughtBy (current price in INR)
        finaldate,                   // ClosedAt
        orderNo,                     // orderno
        user.UserId,                 // uid
        order.OrderCategory,         // ordertype
        order.TokenNo                // tokenno
      );
      
      if (result === 'true' || result === true) {
        toast.success("Trade Closed!");
        // Refresh data
        await initializePortfolioData();
      } else {
        toast.error("Failed to close trade");
      }
    } catch (error) {
      console.error('Error closing trade:', error);
      toast.error('Failed to close trade');
    }
  };

  // Helper function to convert time to seconds
  const getTimeInSeconds = (timeStr) => {
    const parts = timeStr.split(':');
    return (+parts[0]) * 60 * 60 + (+parts[1]) * 60 + (+parts[2]);
  };

  // Handle SL/TP modal
  const handleSLTPClick = (order) => {
    setSelectedOrder(order);
    setSLValue(order.stopLossPrice || '');
    setTPValue(order.takeProfitPrice || '');
    setShowSLTPModal(true);
  };

  // Handle SL/TP submission
  const handleSLTPSubmit = async () => {
    if (!selectedOrder) return;
    
    try {
      const result = await tradingAPI.setSLTP(selectedOrder.Id, slValue, tpValue);
      toast.success('SL/TP set successfully');
      setShowSLTPModal(false);
      setSelectedOrder(null);
      setSLValue('');
      setTPValue('');
      
      // Refresh the portfolio data to show updated SL/TP values
      await initializePortfolioData();
    } catch (error) {
      console.error('Error setting SL/TP:', error);
      toast.error('Failed to set SL/TP');
    }
  };

  // Close SL/TP modal
  const closeSLTPModal = () => {
    setShowSLTPModal(false);
    setSelectedOrder(null);
    setSLValue('');
    setTPValue('');
  };

  // Handle tab navigation
  const handleTabClick = (tabId) => {
    switch(tabId) {
      case 'dashboard':
        navigate('/dashboard');
        break;
      case 'orders':
        navigate('/orders');
        break;
      case 'portfolio':
        // Already on portfolio page
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

  // Render empty state
  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      {/* Briefcase Illustration */}
      <div className="relative mb-8">
        <div className="w-32 h-24 bg-gray-300 rounded-lg relative">
          {/* Briefcase body */}
          <div className="absolute top-2 left-2 right-2 bottom-2 bg-gray-200 rounded-md"></div>
          {/* Handle */}
          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-8 h-2 bg-gray-400 rounded-full"></div>
          
          {/* Documents */}
          <div className="absolute top-3 left-3 right-3 bottom-3">
            {/* Main document */}
            <div className="absolute top-0 left-0 w-16 h-12 bg-gray-100 rounded-sm transform rotate-3">
              <div className="absolute top-1 left-1 right-1 h-0.5 bg-gray-300"></div>
              <div className="absolute top-2 left-1 right-1 h-0.5 bg-gray-300"></div>
              <div className="absolute top-3 left-1 right-1 h-0.5 bg-gray-300"></div>
              <div className="absolute bottom-1 right-1 w-4 h-1 bg-blue-500 rounded-sm"></div>
              <div className="absolute top-1 right-1 w-2 h-1 bg-red-500 rounded-sm"></div>
            </div>
            
            {/* Small document */}
            <div className="absolute bottom-2 right-2 w-8 h-6 bg-gray-100 rounded-sm">
              <div className="absolute top-0.5 left-0.5 right-0.5 h-0.5 bg-gray-300"></div>
              <div className="absolute top-1 left-0.5 right-0.5 h-0.5 bg-gray-300"></div>
              <div className="absolute bottom-0.5 right-0.5 w-2 h-0.5 bg-blue-500 rounded-sm"></div>
            </div>
            
            {/* Small colored shapes */}
            <div className="absolute top-1 right-1 w-1 h-1 bg-yellow-400 transform rotate-45"></div>
            <div className="absolute bottom-1 left-1 w-1 h-1 bg-red-500 transform rotate-45"></div>
            <div className="absolute top-2 right-2 w-1 h-1 bg-blue-500 transform rotate-45"></div>
          </div>
        </div>
      </div>
      
      <h3 className="text-xl font-bold text-white mb-2">No holdings</h3>
      <p className="text-gray-400 text-center">Buy equities from your watchlist</p>
    </div>
  );

  // Render active orders
  const renderActiveOrders = () => {
    if (activeOrders.length === 0) {
      return renderEmptyState();
    }
    
    return (
      <div className="space-y-3">
        {activeOrders.map((order, index) => (
          <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="text-white font-semibold">{order.scriptName}</h4>
                <p className="text-gray-400 text-sm">{order.exchange}</p>
                {order.isStopLossOrder && (
                  <p className="text-orange-400 text-xs font-medium">Stop Loss Order</p>
                )}
              </div>
              <div className="text-right">
                <div className={`font-semibold ${order.OrderCategory === 'SELL' ? 'text-red-400' : 'text-green-400'}`}>
                  {order.orderCategoryDisplay} {order.Lot} @ {
                    order.isFX ? (
                      <>${order.orderPriceUSD ? order.orderPriceUSD.toFixed(4) : (order.OrderPrice && usdToInrRate ? (parseFloat(order.OrderPrice) / usdToInrRate).toFixed(4) : '0.0000')}</>
                    ) : (
                      <>{order.OrderPrice ? parseFloat(order.OrderPrice).toFixed(2) : '0.00'}</>
                    )
                  }
                </div>
                <div className={`text-sm font-medium ${(order.isFX ? order.profitLossUSD : order.profitLoss) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {order.isFX ? (
                    <>{(order.profitLossUSD || 0) >= 0 ? '+' : ''}${(order.profitLossUSD || 0).toFixed(2)}</>
                  ) : (
                    <>{order.profitLoss >= 0 ? '+' : ''}{order.profitLoss.toFixed(2)}</>
                  )}
                </div>
              </div>
            </div>
            
            {/* SL/TP Information */}
            {(order.stopLossPrice || order.takeProfitPrice) && (
              <div className="mb-2 p-2 bg-gray-700 rounded text-xs">
                {order.stopLossPrice && (
                  <div className="text-red-400">
                    SL: <span className="text-white font-medium">{order.stopLossPrice}</span>
                  </div>
                )}
                {order.takeProfitPrice && (
                  <div className="text-green-400">
                    TP: <span className="text-white font-medium">{order.takeProfitPrice}</span>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-400">
                CMP: <span className="text-white font-medium">
                  {order.isFX ? (
                    <>${order.currentPriceUSD ? order.currentPriceUSD.toFixed(4) : '0.0000'}</>
                  ) : (
                    <>{order.currentPrice ? parseFloat(order.currentPrice).toFixed(2) : '0.00'}</>
                  )}
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleSLTPClick(order)}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm font-medium"
                >
                  SL/TP
                </button>
                <button
                  onClick={() => closeTrade(order)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium"
                >
                  Close Trade
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render closed orders
  const renderClosedOrders = () => {
    if (closedOrders.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No closed orders</h3>
          <p className="text-gray-400 text-center">Your closed trades will appear here</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-3">
        {closedOrders.map((order, index) => (
          <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="text-white font-semibold">{order.ScriptName}</h4>
                <p className="text-gray-400 text-sm">Qty: <span className="text-white">{order.Lot}</span></p>
              </div>
            </div>
            
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm text-gray-400">
                AvgSell: <span className="text-white font-medium">
                  {order.isFX ? (
                    <>${order.orderPriceUSD ? order.orderPriceUSD.toFixed(4) : (order.OrderPrice && usdToInrRate ? (parseFloat(order.OrderPrice) / usdToInrRate).toFixed(4) : '0.0000')}</>
                  ) : (
                    <>{order.OrderPrice ? parseFloat(order.OrderPrice).toFixed(2) : '0.00'}</>
                  )}
                </span>
              </div>
              <div className="text-sm text-gray-400">
                AvgBuy: <span className="text-white font-medium">
                  {order.isFX ? (
                    <>${order.broughtByUSD ? order.broughtByUSD.toFixed(4) : (order.BroughtBy && usdToInrRate ? (parseFloat(order.BroughtBy) / usdToInrRate).toFixed(4) : '0.0000')}</>
                  ) : (
                    <>{order.BroughtBy ? parseFloat(order.BroughtBy).toFixed(2) : '0.00'}</>
                  )}
                </span>
              </div>
            </div>
            
            <div className="text-sm">
              Profit/Loss: <span className={`font-medium ${(order.isFX ? order.plUSD : parseInt(order.P_L || 0)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {order.isFX ? (
                  <>{(order.plUSD || 0) >= 0 ? '+' : ''}${(order.plUSD || 0).toFixed(2)}</>
                ) : (
                  <>{parseInt(order.P_L || 0) >= 0 ? '+' : ''}{parseInt(order.P_L || 0)}</>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-800 flex flex-col">
      {/* Top Navigation */}
      <div className="flex-shrink-0 pt-3 bg-gray-800">
        {/* Active/Closed Tabs */}
        <div className="px-2 py-2">
          <div className="flex space-x-8 relative justify-center text-center items-center">
          <button
            onClick={() => setActiveSubTab('Active')}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeSubTab === 'Active' 
                ? 'text-blue-400 border-b-2 border-blue-400' 
                : 'text-gray-400'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveSubTab('Closed')}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeSubTab === 'Closed' 
                ? 'text-blue-400 border-b-2 border-blue-400' 
                : 'text-gray-400'
            }`}
          >
            Closed
          </button>
          </div>
        </div>
        
        
 
      </div>

      {/* Balance Summary */}
      <div className="flex-shrink-0 bg-gray-900 rounded-t-2xl border-b border-gray-700 px-4 py-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-gray-400 text-md mb-1">Balance</p>
            <p className="text-white font-bold text-xs">{balanceData.ledgerBalance.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-md mb-1">Margin</p>
            <p className="text-white font-bold text-xs">{Math.round(balanceData.marginAvailable).toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-md mb-1">P/L</p>
            <p className={`font-bold text-xs ${balanceData.activePL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {balanceData.activePL >= 0 ? '+' : ''}{balanceData.activePL.toFixed(2)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-md mb-1">M2M</p>
            <p className="text-white font-bold text-xs">{Math.round(balanceData.m2m).toLocaleString()}</p>
          </div>
        </div>
      </div>



      {/* Content Area */}
      <div className="flex-1 bg-gray-900 overflow-y-auto px-2 py-2 pb-24">
        {activeSubTab === 'Active' ? renderActiveOrders() : (
          <div>
            {/* Closed Orders Balance Summary */}
            {activeSubTab === 'Closed' && (
              <div className="bg-gray-800 rounded-lg p-2 mb-4 border border-gray-700">
                <div className="flex justify-around items-center">
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-400 text-sm">Balance:</span>
                    <span className="text-white font-bold text-sm">{balanceData.ledgerBalance.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-400 text-sm">Net P/L:</span>
                    <span className={`font-bold text-sm ${balanceData.netPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {balanceData.netPL >= 0 ? '+' : ''}{balanceData.netPL.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {renderClosedOrders()}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-1 py-2">
        <div className="flex justify-around items-center">
          {bottomNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className="flex flex-col items-center py-2"
            >
              <item.icon 
                className={`w-6 h-6 mb-1 ${
                  item.id === 'portfolio' ? 'text-blue-500' : 'text-gray-400'
                }`} 
              />
              <span className={`text-xs font-medium ${
                item.id === 'portfolio' ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* SL/TP Modal */}
      {showSLTPModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-80 max-w-sm mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Set SL/TP</h3>
              <button
                onClick={closeSLTPModal}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-gray-300 text-sm mb-2">
                {selectedOrder.scriptName} - {selectedOrder.orderCategoryDisplay}
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  Stop Loss (SL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={slValue}
                  onChange={(e) => setSLValue(e.target.value)}
                  placeholder="Enter SL price"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  Take Profit (TP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tpValue}
                  onChange={(e) => setTPValue(e.target.value)}
                  placeholder="Enter TP price"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={closeSLTPModal}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSLTPSubmit}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium"
              >
                Set SL/TP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Portfolio;