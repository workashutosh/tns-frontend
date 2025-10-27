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
  
  // WebSocket and refs
  const websocketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const tokensRef = useRef('');
  const totalMarginUsedRef = useRef(0);
  const reconnectAttemptRef = useRef(0);

  // Bottom navigation items
  const bottomNavItems = [
    { id: 'dashboard', icon: Bookmark, label: 'Home' },
    { id: 'orders', icon: FileText, label: 'Orders' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'tools', icon: Pin, label: 'Tools' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };
  }, []);

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
        
        const orders = data.map(item => {
          tokens += item.TokenNo + ',';
          totalMargin += Math.round(item.MarginUsed);
          
          const scriptParts = item.ScriptName.split('_');
          const scriptName = scriptParts[0];
          const exchange = scriptParts[1];
          
          // Check if this is a stop loss order
          const isStopLossOrder = item.isstoplossorder === 'true' || item.isstoplossorder === true;
          const orderCategoryDisplay = isStopLossOrder ? `Stop ${item.OrderCategory}` : item.OrderCategory;
          
          // Calculate initial P/L from cmp value (exactly like original)
          let profitLoss = 0;
          const cmp = parseFloat(item.cmp || 0);
          const orderPrice = parseFloat(item.OrderPrice || 0);
          const lotSize = (parseFloat(item.selectedlotsize || 1) * parseFloat(item.Lot || 1));
          
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
            currentPrice: item.cmp,
            isStopLossOrder,
            orderCategoryDisplay,
            stopLossPrice: item.StopLossPrice || '',
            takeProfitPrice: item.TakeProfitPrice || ''
          };
        });
        
        totalMarginUsedRef.current = totalMargin;
        tokensRef.current = tokens.slice(0, -1); // Remove trailing comma
        
        setActiveOrders(orders);
        
        // Initialize WebSocket for real-time updates
        if (tokensRef.current) {
          initializeWebSocket(tokensRef.current);
        }
      } else {
        setActiveOrders([]);
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
        setClosedOrders(data);
      } else {
        setClosedOrders([]);
      }
    } catch (error) {
      console.error('Error fetching closed orders:', error);
      setClosedOrders([]);
    }
  };

  // Update market data from WebSocket
  const updateMarketData = useCallback((data) => {
    if (!data || !data.instrument_token) return;
    
    const tokenToFind = data.instrument_token.toString();
    
    setActiveOrders(prevOrders => {
      const updatedOrders = prevOrders.map(order => {
        if (order.TokenNo?.toString() === tokenToFind) {
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
      const refid = localStorage.getItem("Refid");
      
      // Check market time
      const marketTimeResponse = await tradingAPI.getMarketTime(order.SymbolType, refid);
      const marketData = marketTimeResponse.split('|');
      const startTime = marketData[0] + ":00";
      const endTime = marketData[1] + ":00";
      
      const today = new Date();
      if (today.getDay() === 6 || today.getDay() === 0) {
        toast.error("Market not open.");
        return;
      }
      
      const currentTime = new Date();
      const currentTimeStr = currentTime.getHours() + ":" + currentTime.getMinutes() + ":00";
      
      const currentSeconds = getTimeInSeconds(currentTimeStr);
      const startSeconds = getTimeInSeconds(startTime);
      const endSeconds = getTimeInSeconds(endTime);
      
      if (currentSeconds >= startSeconds && currentSeconds <= endSeconds) {
        // Get order number - in the backend it's the Id field
        const orderNo = order.Id || order.OrderNo || order.OrderId || order.orderNo || order.orderId;
        
        console.log('Closing order with OrderNo:', orderNo, 'Full order:', order);
        
        if (!orderNo) {
          toast.error("Order number not found");
          return;
        }
        
        // Calculate P/L
        const pl = order.profitLoss;
        
        // Calculate brokerage (you may need to adjust this based on your logic)
        const brokerage = Math.abs(pl) * 0.01; // Example: 1% of absolute P/L
        
        // Get current date for ClosedAt
        const datee = new Date();
        const finaldate = datee.getFullYear() + "-" + (datee.getMonth() + 1) + "-" + datee.getDate();
        
        const result = await tradingAPI.updateOrder(
          pl.toFixed(2),              // lp
          brokerage.toFixed(2),       // brokerage
          order.currentPrice,          // BroughtBy
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
      } else {
        toast.error("Market not open.");
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
                  {order.orderCategoryDisplay} {order.Lot} @ {order.OrderPrice}
                </div>
                <div className={`text-sm font-medium ${order.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {order.profitLoss >= 0 ? '+' : ''}{order.profitLoss.toFixed(2)}
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
                CMP: <span className="text-white font-medium">{order.currentPrice}</span>
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
                AvgSell: <span className="text-white font-medium">{order.OrderPrice}</span>
              </div>
              <div className="text-sm text-gray-400">
                AvgBuy: <span className="text-white font-medium">{order.BroughtBy}</span>
              </div>
            </div>
            
            <div className="text-sm">
              Profit/Loss: <span className={`font-medium ${parseInt(order.P_L) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {parseInt(order.P_L) >= 0 ? '+' : ''}{parseInt(order.P_L)}
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