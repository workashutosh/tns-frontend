import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, TrendingUp, ArrowLeft, X, Check, TrendingDown } from 'lucide-react';
import { tradingAPI } from '../services/api';
import OrderModal from '../components/OrderModal';

const MarketWatch = () => {
  // Get user from localStorage (you can modify this based on your auth system)
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : { UserId: 'demo123', Refid: 'ref123' };
  });
  
  const [activeTab, setActiveTab] = useState('MCX');
  const [searchQuery, setSearchQuery] = useState('');
  const [marketData, setMarketData] = useState({});
  const [loading, setLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [selectedTokens, setSelectedTokens] = useState(new Set());
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  const websocketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isInitializingRef = useRef(false);
  const mountedRef = useRef(true);
  const updateCountRef = useRef(0);
  const searchTimeoutRef = useRef(null);

  const tabs = [
    { id: 'MCX', label: 'MCX Futures' },
    { id: 'NSE', label: 'NSE Futures' },
    { id: 'OPT', label: 'OPTION' }
  ];

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };
  }, []);
  
  // Update market data with live prices
  const updateMarketData = useCallback((result) => {
    if (!result || !result.instrument_token) {
      //console.warn('Invalid market data received:', result);
      return;
    }

    const tokenToFind = result.instrument_token.toString();
    
    setMarketData(prev => {
      const newData = { ...prev };
      let updated = false;
      
      // Search through all tabs to find matching token
      Object.keys(newData).forEach(tabKey => {
        if (newData[tabKey] && Array.isArray(newData[tabKey])) {
          newData[tabKey] = newData[tabKey].map(token => {
            // Match by SymbolToken (convert both to string for comparison)
            if (token.SymbolToken?.toString() === tokenToFind) {
              updated = true;
              updateCountRef.current++;
              
              // Handle zero values like the original code
              const bid = result.bid === "0" || result.bid === 0 ? result.last_price : result.bid;
              const ask = result.ask === "0" || result.ask === 0 ? result.last_price : result.ask;
              
              const updatedToken = {
                ...token,
                buy: parseFloat(ask) || 0,
                sell: parseFloat(bid) || 0,
                ltp: parseFloat(result.last_price) || 0,
                chg: parseFloat(result.change) || 0,
                high: parseFloat(result.high_) || 0,
                low: parseFloat(result.low_) || 0,
                open: parseFloat(result.open_) || 0,
                close: parseFloat(result.close_) || 0,
                oi: result.oi || 0,
                volume: result.volume || 0,
                // Store previous values for color changes
                prevBuy: token.buy || parseFloat(ask) || 0,
                prevSell: token.sell || parseFloat(bid) || 0,
                prevLtp: token.ltp || parseFloat(result.last_price) || 0,
                lastUpdate: Date.now()
              };
              
              //console.log(`✓ Updated ${token.SymbolName}: LTP=${updatedToken.ltp}, Bid=${updatedToken.sell}, Ask=${updatedToken.buy}`);
              
              return updatedToken;
            }
            return token;
          });
        }
      });
      
      if (updated) {
        setLastUpdate(Date.now());
      } 
      
      return updated ? newData : prev;
    });
  }, []);

  // Use a ref to store the latest tokens for WebSocket subscription
  const latestTokensRef = useRef('');
  
  // Update tokens ref when selected tokens change (Set, so no frequent updates)
  useEffect(() => {
    const allTokens = Array.from(selectedTokens);
    latestTokensRef.current = allTokens.join(',');
  }, [selectedTokens]);

  // Initialize WebSocket
  const initializeWebSocket = useCallback(() => {
    if (isInitializingRef.current) {
      console.log('WebSocket initialization already in progress, skipping...');
      return;
    }

    if (connectionAttempts >= 5) {
      console.error('Max WebSocket connection attempts reached');
      setWsError('Connection failed after multiple attempts');
      return;
    }
   
    isInitializingRef.current = true;
    const uri = "wss://ws.tradewingss.com/api/webapiwebsoc";
    
    console.log('Attempting WebSocket connection...', { attempt: connectionAttempts + 1 });
    
    if (websocketRef.current) {
      try {
        websocketRef.current.close();
      } catch (e) {
        console.log('Error closing existing WebSocket:', e);
      }
      websocketRef.current = null;
    }
    
    try {
      const ws = new WebSocket(uri);
      websocketRef.current = ws;

      ws.onopen = (event) => {
        if (!mountedRef.current) return;
        
        console.log("✓ WebSocket connected successfully");
        setWsConnected(true);
        setWsError(null);
        setConnectionAttempts(0);
        isInitializingRef.current = false;
        
        // Use the latest tokens from ref (updated separately without causing reconnection)
        const tokenString = latestTokensRef.current || "";
        
        try {
          ws.send(tokenString);
        } catch (error) {
          console.error('Error sending tokens:', error);
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        if (event.data && event.data !== "true" && event.data !== "") {
          try {
            const result = JSON.parse(event.data);
            updateMarketData(result);
          } catch (error) {
            console.error('Error parsing WebSocket data:', error);
          }
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        
        console.log("WebSocket disconnected", { code: event.code, reason: event.reason });
        setWsConnected(false);
        isInitializingRef.current = false;
        websocketRef.current = null;
        
        if (connectionAttempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 30000);
          console.log(`Reconnecting in ${delay}ms...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setConnectionAttempts(prev => prev + 1);
              initializeWebSocket();
            }
          }, delay);
        } else {
          setWsError('Connection lost. Please refresh the page.');
        }
      };

      ws.onerror = (error) => {
        if (!mountedRef.current) return;
        
        console.error('WebSocket error:', {
          readyState: ws.readyState,
          url: ws.url
        });
        
        setWsConnected(false);
        setWsError('Connection error occurred');
        isInitializingRef.current = false;
      };
      
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setWsError('Failed to create WebSocket connection');
      isInitializingRef.current = false;
      
      if (connectionAttempts < 5) {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setConnectionAttempts(prev => prev + 1);
            initializeWebSocket();
          }
        }, 3000);
      }
    }
  }, [connectionAttempts, updateMarketData]);

  // Re-subscribe WebSocket when tokens change or tab changes
  const tokensStringRef = useRef('');
  useEffect(() => {
    // Get current tab's tokens from selectedTokens (Set of token IDs only)
    const allTokens = Array.from(selectedTokens);
    const tokenString = allTokens.join(',');
    
    // Only re-subscribe if tokens actually changed AND WebSocket is connected
    if (tokenString !== tokensStringRef.current && websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      console.log('Tokens/tab changed, re-subscribing WebSocket...', { tab: activeTab, tokenCount: allTokens.length });
      tokensStringRef.current = tokenString;
      latestTokensRef.current = tokenString;
      
      try {
        if (tokenString) {
          websocketRef.current.send(tokenString);
        } else {
          websocketRef.current.send("");
        }
      } catch (error) {
        console.error('Error re-subscribing WebSocket:', error);
      }
    } else if (tokenString !== tokensStringRef.current) {
      tokensStringRef.current = tokenString;
      latestTokensRef.current = tokenString;
    }
  }, [activeTab, selectedTokens]);

  // Initial load
  useEffect(() => {
    if (user?.UserId) {
      loadSelectedTokens();
    }
  }, [user?.UserId, activeTab]);

  // Load selected tokens from backend
  const loadSelectedTokens = async () => {
    setLoading(true);
    try {
      const exchangeMap = {
        'MCX': 'mcx',
        'NSE': 'nse', 
        'OPT': 'cds'
      };
      
      const exchangeKey = exchangeMap[activeTab];
      const response = await tradingAPI.getSelectedTokens(user.UserId, exchangeKey);
      
      // Parse the response (assuming it's a JSON string)
      const tokens = typeof response === 'string' ? JSON.parse(response) : response;
      
      console.log(`Loaded ${tokens.length} selected tokens for ${activeTab}:`, tokens);
      
      // Convert to the format expected by the component
      const formattedTokens = tokens.map(token => ({
        SymbolToken: token.SymbolToken?.toString(),
        SymbolName: token.SymbolName,
        ExchangeType: token.ExchangeType || activeTab,
        Lotsize: token.Lotsize || token.Lotsize,
        buy: parseFloat(token.buy || 0),
        sell: parseFloat(token.sell || 0),
        ltp: parseFloat(token.ltp || 0),
        chg: parseFloat(token.chg || 0),
        high: parseFloat(token.high || 0),
        low: parseFloat(token.low || 0),
        open: parseFloat(token.opn || 0),
        close: parseFloat(token.cls || 0),
        oi: parseFloat(token.ol || 0),
        volume: parseFloat(token.vol || 0),
        lastUpdate: Date.now()
      }));
      
      setMarketData(prev => ({
        ...prev,
        [activeTab]: formattedTokens
      }));
      
      // Update selected tokens set
      const tokenSet = new Set(formattedTokens.map(t => t.SymbolToken));
      setSelectedTokens(tokenSet);
      
      // Initialize WebSocket after data is loaded
      setTimeout(() => {
        if (mountedRef.current) {
          initializeWebSocket();
        }
      }, 500);
      
    } catch (error) {
      console.error('Error loading selected tokens:', error);
      // Fallback to empty data
      setMarketData(prev => ({
        ...prev,
        [activeTab]: []
      }));
    } finally {
      setLoading(false);
    }
  };

  // Search symbols
  const searchSymbols = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    // Get refId from user object or localStorage
    const refId = user.Refid || localStorage.getItem('Refid');
    
    if (!refId) {
      console.error('No Refid found for user');
      setSearchResults([]);
      return;
    }
    
    setSearchLoading(true);
    try {
      const response = await tradingAPI.getSymbols(activeTab, query, refId);
      const symbols = typeof response === 'string' ? JSON.parse(response) : response;
      
      console.log(`Found ${symbols.length} symbols for query "${query}":`, symbols);
      
      setSearchResults(symbols);
    } catch (error) {
      console.error('Error searching symbols:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Add token to watchlist
  const addTokenToWatchlist = async (token, symbolName, lotSize) => {
    try {
      const exchangeType = activeTab === 'OPT' ? 'OPT' : activeTab;
      await tradingAPI.saveToken(symbolName, token, user.UserId, exchangeType, lotSize);
      
      console.log(`Added token ${token} (${symbolName}) to watchlist`);
      
      // Reload the selected tokens
      await loadSelectedTokens();
      
    } catch (error) {
      console.error('Error adding token to watchlist:', error);
    }
  };

  // Remove token from watchlist
  const removeTokenFromWatchlist = async (token) => {
    try {
      await tradingAPI.deleteToken(token, user.UserId);
      
      console.log(`Removed token ${token} from watchlist`);
      
      // Update local state immediately
      setMarketData(prev => ({
        ...prev,
        [activeTab]: prev[activeTab].filter(t => t.SymbolToken !== token)
      }));
      
      // Update selected tokens set
      setSelectedTokens(prev => {
        const newSet = new Set(prev);
        newSet.delete(token);
        return newSet;
      });
      
    } catch (error) {
      console.error('Error removing token from watchlist:', error);
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Handle search modal open
  const handleSearchModalOpen = async () => {
    setShowSearchModal(true);
    setSearchQuery('');
    setSearchResults([]);
    setModalLoading(true);
    
    // Get refId from user object or localStorage
    const refId = user.Refid || localStorage.getItem('Refid');
    
    // Load initial suggestions when modal opens
    try {
      const response = await tradingAPI.getSymbols(activeTab, 'null', refId);
      const symbols = typeof response === 'string' ? JSON.parse(response) : response;
      setSearchResults(symbols); // Show all symbols as suggestions
    } catch (error) {
      console.error('Error loading initial suggestions:', error);
    } finally {
      setModalLoading(false);
    }
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      if (query.length >= 2) {
        searchSymbols(query);
      } else {
        setSearchResults([]);
      }
    }, 300);
  };

  // Handle symbol selection in search modal
  const handleSymbolSelect = async (symbol) => {
    const isSelected = selectedTokens.has(symbol.instrument_token.toString());
    
    if (isSelected) {
      await removeTokenFromWatchlist(symbol.instrument_token.toString());
    } else {
      await addTokenToWatchlist(
        symbol.instrument_token.toString(),
        symbol.tradingsymbol,
        symbol.lot_size
      );
    }
  };

  const handleManualReconnect = () => {
    setConnectionAttempts(0);
    setWsError(null);
    initializeWebSocket();
  };

  // Handle order modal (exactly like original implementation)
  const handleOrderModalOpen = (symbol) => {
    // Store symbol lot size in localStorage exactly like original
    if (symbol && symbol.SymbolToken) {
      localStorage.setItem("SymbolLotSize", symbol.Lotsize || 1);
      localStorage.setItem("selected_token", symbol.SymbolToken);
      localStorage.setItem("selected_script", symbol.SymbolName);
      localStorage.setItem("selectedlotsize", symbol.Lotsize || 1);
    }
    setSelectedSymbol(symbol);
    setShowOrderModal(true);
  };

  const handleOrderModalClose = () => {
    setShowOrderModal(false);
    setSelectedSymbol(null);
  };

  const handleOrderPlaced = () => {
    // Refresh any relevant data after order placement
    console.log('Order placed successfully');
  };

  const formatPrice = (price) => {
    return parseFloat(price || 0).toFixed(2);
  };

  const getExchangeName = (symbolName) => {
    if (activeTab === 'MCX') return 'MCX';
    if (activeTab === 'NSE') return 'NSE';
    if (activeTab === 'OPT') return 'NSE';
    return activeTab;
  };

  // Get price color based on movement
  const getPriceColor = (current, previous) => {
    const curr = parseFloat(current || 0);
    const prev = parseFloat(previous || curr);
    
    if (curr > prev) return 'text-green-400';
    if (curr < prev) return 'text-red-400';
    return 'text-white';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white">Loading market data...</p>
        </div>
      </div>
    );
  }

  const currentSymbols = marketData[activeTab] || [];

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Fixed Header with Connection Status */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
        <div className="px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">MarketWatch</h1>
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'} ${wsConnected ? 'animate-pulse' : ''}`}></div>
            {/* <span className="text-sm text-gray-300">
              {wsConnected ? `Live (${updateCountRef.current} updates)` : wsError ? wsError : 'Connecting...'}
            </span>
            {!wsConnected && (
              <button
                onClick={handleManualReconnect}
                disabled={isInitializingRef.current}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
              >
                {isInitializingRef.current ? 'Connecting...' : 'Reconnect'}
              </button>
            )} */}
          </div>
        </div>
      </div>

      {/* Fixed Tabs */}
      <div className="flex-shrink-0 flex bg-gray-800 border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 py-3 px-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white bg-gray-700 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-750'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Fixed Search Bar */}
      <div className="flex-shrink-0 px-2 py-2 bg-gray-800">
        <div className="flex items-center space-x-3">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search Symbol"
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
          </div>
          <button
            onClick={handleSearchModalOpen}
            className="bg-blue-600 text-white p-1 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Market Data List */}
      <div className="flex-1 overflow-y-auto">
        {currentSymbols.length > 0 ? (
          <div className="bg-gray-900">
            {currentSymbols.map((symbol) => {
              const changeValue = parseFloat(symbol.chg || 0);
              const ltpValue = parseFloat(symbol.ltp || 0);
              const prevLtpValue = parseFloat(symbol.prevLtp || ltpValue);
              
              // Calculate percentage change
              const changePercent = ltpValue && changeValue ? 
                ((changeValue / (ltpValue - changeValue)) * 100).toFixed(2) : 
                '0.00';
              
              const isPositive = changeValue >= 0;
              const changeColor = isPositive ? 'text-green-400' : 'text-red-400';
              const ltpColor = getPriceColor(ltpValue, prevLtpValue);
              const buyColor = getPriceColor(symbol.buy, symbol.prevBuy);
              const sellColor = getPriceColor(symbol.sell, symbol.prevSell);
              
              // Time since last update
              const timeSinceUpdate = symbol.lastUpdate ? 
                Math.round((Date.now() - symbol.lastUpdate) / 1000) : 
                null;
              
              return (
                <div
                  key={symbol.SymbolToken}
                  className="py-2 px-3 border-b border-gray-800 hover:bg-gray-800 transition-colors cursor-pointer"
                  onClick={() => handleOrderModalOpen(symbol)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-white text-sm font-medium">
                          {symbol.SymbolName?.split('_')[0] || 'N/A'}
                        </div>
                        {timeSinceUpdate !== null && timeSinceUpdate < 5 && (
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                        )}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {getExchangeName(symbol.SymbolName)} • Lot: {symbol.Lotsize}
                      </div>
                    </div>
                    
                    <div className="text-right mr-3">
                      <div className={`text-sm font-semibold ${ltpColor} transition-colors duration-300`}>
                        ₹{formatPrice(ltpValue)}
                      </div>
                      <div className={`text-xs ${changeColor}`}>
                        {isPositive ? '+' : ''}{formatPrice(changeValue)} ({isPositive ? '+' : ''}{changePercent}%)
                      </div>
                    </div>

                    {/* Remove Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTokenFromWatchlist(symbol.SymbolToken);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-1.5 py-1 rounded text-xs transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="w-16 h-16 text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No symbols in watchlist</h3>
            <p className="text-gray-400 mb-4">
              Add symbols to your {activeTab} watchlist to start tracking
            </p>
            <button
              onClick={handleSearchModalOpen}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Symbols
            </button>
          </div>
        )}
      </div>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Search & Add Symbol</h3>
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="text-gray-400 hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search symbol..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {modalLoading ? (
                <div className="text-center py-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  <p className="text-gray-400">Loading suggestions...</p>
                </div>
              ) : searchLoading ? (
                <div className="text-center py-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  <p className="text-gray-400">Searching...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((symbol) => {
                    const isSelected = selectedTokens.has(symbol.instrument_token.toString());
                    const symbolParts = symbol.tradingsymbol?.split('_') || [symbol.name];
                    
                    return (
                      <div
                        key={symbol.instrument_token}
                        className={`flex items-center justify-between p-1 rounded-md border cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-green-900 border-green-600' 
                            : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                        }`}
                        onClick={() => handleSymbolSelect(symbol)}
                      >
                        <div className="flex-1">
                          <div className="text-white font-medium">
                            {symbolParts[0] || symbol.name}
                          </div>
                          <div className="text-gray-400 text-xs">
                            {symbolParts[1] && `${symbolParts[1]} • `}
                            Lot: {symbol.lot_size}
                          </div>
                          {/* <div className="text-gray-500 text-xs">
                            Token: {symbol.instrument_token}
                          </div> */}
                        </div>
                        <div className="flex items-center">
                          {isSelected ? (
                            <div className="flex items-center text-green-400">
                              <Check className="w-5 h-5 mr-1" />
                              <span className="text-sm">Added</span>
                            </div>
                          ) : (
                            <Plus className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="text-gray-400 text-center py-8">
                  No symbols found for "{searchQuery}"
                </div>
              ) : (
                <div className="text-gray-400 text-center py-8">
                  Popular symbols for {activeTab}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Modal */}
      <OrderModal
        isOpen={showOrderModal}
        onClose={handleOrderModalClose}
        symbol={selectedSymbol}
        user={user}
        onOrderPlaced={handleOrderPlaced}
      />
    </div>
  );
};

export default MarketWatch;