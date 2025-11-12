import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
// v5 syntax: npm install lightweight-charts@^5.0.9
import { createChart, CandlestickSeries } from 'lightweight-charts';

const ChartModal = ({ isOpen, onClose, symbol: propSymbol }) => {
  const [chartHeight, setChartHeight] = useState(600);
  const [isReady, setIsReady] = useState(false);
  const [data, setData] = useState([]);
  const dataRef = useRef([]); // Keep ref in sync with data for real-time updates
  const [status, setStatus] = useState('Disconnected');
  const [currentBar, setCurrentBar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const deviceIdRef = useRef(null);
  const appSessionIdRef = useRef(null);
  const barFeedFailedRef = useRef(false);
  const barsInfoRef = useRef(null); // Store BarsInfo for timestamp calc
  const updateTimeoutRef = useRef(null); // For debouncing height updates
  const priceType = 'bid'; // Used for QuoteHistoryBars (lowercase)
  const priceTypeForFeed = 'Bid'; // Used for BarFeedSubscribe (capitalized)
  const periodicity = 'M1';
  const historyCount = 100;
  const symbol = propSymbol || 'BTCUSD'; // Updated fallback to BTCUSD (works fully)

  // Credentials
  const WEB_API_ID = '65d219c4-5978-4540-af0f-a70345d9b761';
  const WEB_API_KEY = 'fWgS3W7m6JJAzGHF';
  const WEB_API_SECRET = 'PcjDNzex6E7Dw9ejdZc4SpSbtTsKnHSnxFegKH6wa58sdYB6w69ACzbzsgj5fDgx';

  // UUID generator
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // HMAC-SHA256 signature
  const computeSignature = async (timestamp, webApiId, apiKey, secret) => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const data = encoder.encode(`${timestamp}${webApiId}${apiKey}`);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    const rawSig = new Uint8Array(signature);
    let binary = '';
    for (let i = 0; i < rawSig.byteLength; i++) {
      binary += String.fromCharCode(rawSig[i]);
    }
    return btoa(binary);
  };

  // Send message
  const sendMessage = (msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      //console.log('Sent:', JSON.stringify(msg, null, 2));
    }
  };

  // Fetch BarsInfo for AvailableTo
  const fetchBarsInfo = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('Cannot fetch BarsInfo - WebSocket not connected');
      return;
    }
    const msgId = generateUUID();
    const request = {
      Id: msgId,
      Request: 'QuoteHistoryBarsInfo',
      Params: {
        Symbol: symbol,
        Periodicity: periodicity,
        PriceType: priceType
      }
    };
    sendMessage(request);
  }, [symbol, periodicity, priceType]);

  // Fetch historical using AvailableTo from BarsInfo
  const fetchHistoricalData = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('Cannot fetch historical data - WebSocket not connected');
      return;
    }
    const msgId = generateUUID();
    let timestamp = Date.now() - (historyCount * 60 * 1000); // Fallback
    if (barsInfoRef.current?.AvailableTo) {
      timestamp = barsInfoRef.current.AvailableTo - (historyCount * 60 * 1000); // Recent M1 bars
    }
    const request = {
      Id: msgId,
      Request: 'QuoteHistoryBars',
      Params: {
        Symbol: symbol,
        Periodicity: periodicity,
        PriceType: priceType,
        Timestamp: timestamp,
        Count: historyCount
      }
    };
    sendMessage(request);
  }, [symbol, periodicity, priceType, historyCount]);

  // Subscribe to live
  const subscribeToBarFeed = useCallback(() => {
    if (barFeedFailedRef.current) {
      console.log('Skipping BarFeedSubscribe - previous attempt failed');
      return;
    }
    
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('Cannot subscribe to BarFeed - WebSocket not connected');
      return;
    }
    
    const msgId = generateUUID();
    const request = {
      Id: msgId,
      Request: 'BarFeedSubscribe',
      Params: {
        Subscribe: [{
          Symbol: symbol,
          BarParams: [{
            Periodicity: periodicity,
            PriceType: priceTypeForFeed // Use capitalized "Bid" for BarFeedSubscribe
          }]
        }]
      }
    };
    sendMessage(request);
  }, [symbol, periodicity, priceTypeForFeed]);

  // Handle messages
  const handleMessage = useCallback((response) => {
    if (!response || typeof response !== 'object') {
      console.warn('Invalid response format:', response);
      return;
    }
    
    const { Response, Result, Error, Id } = response;
    
    // Handle errors first - don't log them as regular responses
    if (Response === 'Error') {
      const errorMsg = Error?.Message || Error || 'Unknown error';
      const errorId = Id || '';
      
      // Check if this is a BarFeedSubscribe error
      if (errorId.includes('BarFeedSubscribe') || errorMsg.toLowerCase().includes('barfeedsubscribe') || errorMsg.toLowerCase().includes('internal server error')) {
        barFeedFailedRef.current = true;
        setStatus('Historical Only (Live Unavailable)');
        console.warn('BarFeedSubscribe failed for ' + symbol + ' - using historical data only');
        setIsLoading(false);
        return;
      }
      
      // Handle other errors silently if we have data
      if (errorMsg.toLowerCase().includes('internal server error')) {
        // Only log if it's a critical error or we don't have data yet
        if (data.length === 0) {
          console.error('API Server Error:', errorMsg);
          setStatus('Server Error');
          setIsLoading(false);
        } else {
          // We have data, just silently ignore server errors
          console.debug('Server error (ignored, have data):', errorMsg);
        }
        return;
      }
      
      if (errorMsg.includes('Login') || errorId.includes('Login')) {
        console.error('Login Error:', errorMsg);
        setStatus('Login Failed');
        setIsLoading(false);
        return;
      }
      
      // Other errors - only log if not subscription/feed related
      if (!errorMsg.toLowerCase().includes('subscription') && !errorMsg.toLowerCase().includes('feed')) {
        if (data.length === 0) {
          console.error('API Error:', errorMsg);
          setStatus(`Error: ${errorMsg.substring(0, 30)}`);
          setIsLoading(false);
        }
      }
      return;
    }
    
    // Log successful responses (not errors)
    //console.log('Received:', JSON.stringify(response, null, 2));
    
    if (!Response) {
      console.warn('Response missing Response field:', response);
      return;
    }

    if (Response === 'Login') {
      if (Result?.Info === 'ok') {
        setStatus('Connected');
        fetchBarsInfo(); // First get BarsInfo for recent timestamp
      } else {
        setStatus('Login Failed');
        setIsLoading(false);
      }
    } else if (Response === 'QuoteHistoryBarsInfo') {
      // Store AvailableTo for recent data calc
      barsInfoRef.current = Result;
      fetchHistoricalData(); // Now fetch bars using AvailableTo
    } else if (Response === 'QuoteHistoryBars' || Response === 'QuoteHistoryBarsCache') {
      if (Result?.Bars?.length > 0) {
        const chartData = Result.Bars.map(bar => ({
          time: bar.Timestamp / 1000,
          open: bar.Open,
          high: bar.High,
          low: bar.Low,
          close: bar.Close,
          volume: bar.Volume
        }));
        setData(chartData);
        dataRef.current = chartData; // Keep ref in sync
        setIsLoading(false);
        if (!barFeedFailedRef.current) {
          subscribeToBarFeed();
        } else {
          setStatus('Historical Only (Live Unavailable)');
        }
      } else {
        setStatus('No Historical Data');
        setIsLoading(false);
        if (!barFeedFailedRef.current) {
          subscribeToBarFeed();
        } else {
          setStatus('Historical Only (Live Unavailable)');
        }
      }
    } else if (Response === 'FeedBarUpdate') {
      const { SymbolAlias, Updates, ClosedBarUpdate, BidClose, AskClose, BidVolumeDelta } = Result || {};
      if (!SymbolAlias || SymbolAlias !== symbol) return;

      const closePrice = priceType === 'bid' ? BidClose : AskClose;
      const volumeDelta = BidVolumeDelta || 0;

      // Handle closed bar (bar is complete)
      if (ClosedBarUpdate) {
        if (currentBar) {
          const closedBar = { 
            time: currentBar.time / 1000,
            open: currentBar.open, 
            high: currentBar.high, 
            low: currentBar.low, 
            close: closePrice || currentBar.close, 
            volume: currentBar.volume + volumeDelta 
          };
          setData(prev => {
            const updated = [...prev, closedBar];
            const finalData = updated.length > 200 ? updated.slice(-200) : updated;
            // Update chart immediately
            if (candlestickSeriesRef.current) {
              candlestickSeriesRef.current.update(closedBar);
            }
            return finalData;
          });
          setCurrentBar(null);
        }
      } 
      // Handle updates with new bar data (Updates array has data)
      else if (Updates && Updates.length > 0) {
        const update = Updates[0];
        if (update.Time && !currentBar) {
          // Start a new current bar
          const newBar = {
            time: update.Time,
            open: update.Open || closePrice || 0,
            high: update.High || closePrice || 0,
            low: update.Low || closePrice || 0,
            close: closePrice || update.Close || 0,
            volume: update.Volume || volumeDelta || 0
          };
          setCurrentBar(newBar);
          
          // Update chart with new bar
          const barToUpdate = {
            time: newBar.time / 1000,
            open: newBar.open,
            high: newBar.high,
            low: newBar.low,
            close: newBar.close,
            volume: newBar.volume
          };
          if (candlestickSeriesRef.current) {
            candlestickSeriesRef.current.update(barToUpdate);
          }
        } else if (currentBar) {
          // Update existing current bar
          let updatedBar = { ...currentBar };
          if (update.High !== undefined) updatedBar.high = Math.max(updatedBar.high, update.High);
          if (update.Low !== undefined) updatedBar.low = Math.min(updatedBar.low, update.Low);
          if (closePrice !== undefined && closePrice !== null) updatedBar.close = closePrice;
          if (volumeDelta > 0) updatedBar.volume = (updatedBar.volume || 0) + volumeDelta;
          setCurrentBar(updatedBar);
          
          // Update chart immediately
          const barToUpdate = {
            time: updatedBar.time / 1000,
            open: updatedBar.open,
            high: updatedBar.high,
            low: updatedBar.low,
            close: updatedBar.close,
            volume: updatedBar.volume
          };
          if (candlestickSeriesRef.current) {
            candlestickSeriesRef.current.update(barToUpdate);
          }
        }
      } 
      // Handle updates with empty Updates array but with BidClose/BidVolumeDelta (most common case)
      else if (closePrice !== undefined && closePrice !== null) {
        // Update the last bar in the data array with new close price and volume
        setData(prev => {
          if (prev.length === 0) return prev;
          
          const updated = [...prev];
          const lastBar = updated[updated.length - 1];
          
          // Ensure time is a number (Unix timestamp in seconds)
          if (typeof lastBar.time !== 'number') {
            console.error('Invalid time format - expected number, got:', typeof lastBar.time, lastBar.time);
            return prev;
          }
          
          const updatedLastBar = {
            time: lastBar.time, // Keep the EXACT same time - only update price/volume
            open: lastBar.open,
            high: Math.max(lastBar.high || closePrice, closePrice),
            low: Math.min(lastBar.low || closePrice, closePrice),
            close: closePrice,
            volume: (lastBar.volume || 0) + volumeDelta
          };
          updated[updated.length - 1] = updatedLastBar;
          dataRef.current = updated; // Keep ref in sync
          
          // Chart will update automatically via useEffect when data changes
          // This is more reliable than trying to use update() which can fail
          
          return updated;
        });
      }
    }
  }, [symbol, priceType, periodicity, historyCount, fetchBarsInfo, fetchHistoricalData, subscribeToBarFeed, data]);

  // Login
  const performLogin = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('Cannot login - WebSocket not connected');
      return;
    }
    
    if (!deviceIdRef.current) {
      deviceIdRef.current = generateUUID();
      appSessionIdRef.current = generateUUID();
    }
    try {
      const msgId = generateUUID();
      const timestamp = Date.now();
      const signature = await computeSignature(timestamp, WEB_API_ID, WEB_API_KEY, WEB_API_SECRET);
      const request = {
        Id: msgId,
        Request: 'Login',
        Params: {
          AuthType: 'HMAC',
          WebApiId: WEB_API_ID,
          WebApiKey: WEB_API_KEY,
          Timestamp: timestamp,
          Signature: signature,
          DeviceId: deviceIdRef.current,
          AppSessionId: appSessionIdRef.current
        }
      };
      sendMessage(request);
    } catch (error) {
      console.error('Error performing login:', error);
      setStatus('Login Error');
    }
  }, []);

  // Connect WS
  const connectWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected, skipping reconnection');
      return;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const ws = new WebSocket('wss://marginalttlivewebapi.fxopen.net/feed');
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('Connecting...');
        performLogin();
      };

      ws.onmessage = (event) => {
        try {
          if (!event.data || event.data === '') return;
          const response = JSON.parse(event.data);
          handleMessage(response);
        } catch (err) {
          console.error('Parse error:', err, event.data);
          // Don't crash on parse errors, just log them
        }
      };

      ws.onclose = (event) => {
        setStatus('Disconnected');
        wsRef.current = null;
        // Only reconnect if modal is still open and it wasn't a normal closure
        if (isOpen && event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isOpen && !wsRef.current) {
              connectWS();
            }
          }, 5000);
        }
      };

      ws.onerror = (err) => {
        console.error('WS Error:', err);
        setStatus('Connection Error');
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setStatus('Connection Failed');
    }
  }, [isOpen, symbol, performLogin, handleMessage]);

  // Chart initialization - only runs once when ready
  useEffect(() => {
    if (!isReady || !containerRef.current || data.length === 0) return;
    
    // Only initialize if chart doesn't exist
    if (chartRef.current) return;

    if (typeof createChart !== 'function') {
      console.error('createChart is not a function. Install lightweight-charts@^5.0.9');
      return;
    }

    let isMounted = true;
    let initTimeout = null;

    const initChart = () => {
      // Check if component is still mounted
      if (!isMounted || !containerRef.current) return;
      
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const width = containerRect.width || container.clientWidth || 800;
      const height = chartHeight || containerRect.height || 400;

      if (width <= 0 || height <= 0) {
        initTimeout = setTimeout(initChart, 100);
        return;
      }

      // Double check chart doesn't exist
      if (chartRef.current) return;

      let chart;
      try {
        chart = createChart(container, {
          width,
          height,
          layout: { 
            backgroundColor: '#FFFFFF',
            textColor: '#191919'
          },
          grid: { 
            vertLines: { color: '#E0E0E0', visible: true, style: 2 },
            horzLines: { color: '#E0E0E0', visible: true, style: 2 }
          },
          timeScale: { 
            borderColor: '#E0E0E0',
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 10,
            barSpacing: 6, // More space between bars for better visibility
            minBarSpacing: 2, // Minimum spacing
            rightBarStaysOnScroll: true,
            fixLeftEdge: false,
            fixRightEdge: true, // Keep latest bar visible
            shiftVisibleRangeOnNewBar: true, // Auto-scroll to new bars
          },
          rightPriceScale: { 
            borderColor: '#E0E0E0',
            scaleMargins: { top: 0.05, bottom: 0.05 },
            entireTextOnly: false,
            autoScale: true,
          },
          crosshair: { mode: 1 },
        });

        if (!chart || !isMounted) {
          if (chart) chart.remove();
          return;
        }
      } catch (error) {
        console.error('Error creating chart:', error);
        return;
      }

      let candlestickSeries;
      try {
        // v5: addSeries with CandlestickSeries class
        candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#26a69a', 
          downColor: '#ef5350',
          borderDownColor: '#ef5350', 
          borderUpColor: '#26a69a',
          wickDownColor: '#ef5350', 
          wickUpColor: '#26a69a',
          priceFormat: {
            type: 'price',
            precision: 4,
            minMove: 0.0001,
          },
          priceLineVisible: false,
          lastValueVisible: true,
        });
        
        if (!isMounted) {
          chart.remove();
          return;
        }
        
        candlestickSeriesRef.current = candlestickSeries;

        const dataToDisplay = data.length > 200 ? data.slice(-200) : data;
        candlestickSeries.setData(dataToDisplay);
      } catch (error) {
        console.error('Error creating candlestick series:', error);
        if (chart && isMounted) {
          try {
            chart.remove();
          } catch (e) {}
        }
        return;
      }


      if (!isMounted) {
        try {
          chart.remove();
        } catch (e) {}
        return;
      }

      try {
        // Show last 60 bars for optimal visibility - not too crowded, not too sparse
        const barsToShow = Math.min(60, data.length);
        if (barsToShow > 0 && data.length >= barsToShow) {
          const visibleRange = {
            from: data[data.length - barsToShow].time,
            to: data[data.length - 1].time,
          };
          chart.timeScale().setVisibleRange(visibleRange);
        } else if (data.length > 0) {
          chart.timeScale().fitContent();
        }
      } catch (error) {
        console.error('Error setting chart range:', error);
      }

      if (isMounted) {
        chartRef.current = chart;
      } else {
        try {
          chart.remove();
        } catch (e) {}
      }
    };

    requestAnimationFrame(() => {
      if (isMounted) {
        initTimeout = setTimeout(initChart, 50);
      }
    });

    return () => {
      isMounted = false;
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (e) {
          // Chart might already be disposed
        }
        chartRef.current = null;
        candlestickSeriesRef.current = null;
      }
    };
  }, [isReady, chartHeight, data.length]); // Include data.length to reinit if data is cleared

  // Update chart data when data changes (but chart already exists)
  // This handles all updates including real-time price changes
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || data.length === 0) return;
    
    // Check if chart is still valid (not disposed)
    if (!chartRef.current || !containerRef.current) return;
    
    const dataToDisplay = data.length > 200 ? data.slice(-200) : data;
    
    try {
      // Update candlestick series with latest data
      if (candlestickSeriesRef.current && chartRef.current) {
        candlestickSeriesRef.current.setData(dataToDisplay);
      }
      
      // Adjust visible range to show recent data (last 60 bars for optimal visibility)
      if (chartRef.current) {
        try {
          const barsToShow = Math.min(60, data.length);
          if (barsToShow > 0 && data.length >= barsToShow) {
            const visibleRange = {
              from: data[data.length - barsToShow].time,
              to: data[data.length - 1].time,
            };
            chartRef.current.timeScale().setVisibleRange(visibleRange);
          } else if (data.length > 0) {
            chartRef.current.timeScale().fitContent();
          }
        } catch (error) {
          // Time scale might be disposed, ignore
        }
      }
    } catch (error) {
      // Chart might be disposed, check and handle gracefully
      if (error.message && error.message.includes('disposed')) {
        // Chart was disposed, clear refs
        chartRef.current = null;
        candlestickSeriesRef.current = null;
      } else {
        console.error('Error updating chart data:', error);
      }
    }
  }, [data]); // Update whenever data changes (including real-time updates)

  // Update height function - memoized to prevent recreation
  const updateHeight = useCallback(() => {
    if (!containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newHeight = Math.max(400, containerRect.height);
    const newWidth = containerRect.width || containerRef.current.clientWidth || 0;
    const shouldBeReady = newHeight > 0 && newWidth > 0;
    
    // Only update if values actually changed to prevent infinite loops
    setChartHeight(prevHeight => {
      if (Math.abs(prevHeight - newHeight) > 1) { // Only update if difference is significant
        return newHeight;
      }
      return prevHeight;
    });
    
    setIsReady(prevReady => {
      if (prevReady !== shouldBeReady) {
        return shouldBeReady;
      }
      return prevReady;
    });
    
    if (chartRef.current) {
      chartRef.current.applyOptions({ 
        height: newHeight,
        width: newWidth 
      });
      chartRef.current.timeScale().fitContent();
    }
  }, []);

  // Debounce updateHeight to prevent too many calls
  const debouncedUpdateHeight = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(updateHeight, 100);
  }, [updateHeight]);

  // Main effect
  useEffect(() => {
    if (!isOpen) {
      // Only update state if values are changing to prevent unnecessary re-renders
      setIsReady(prev => prev ? false : prev);
      setData(prev => prev.length > 0 ? [] : prev);
      setCurrentBar(null);
      setStatus(prev => prev !== 'Disconnected' ? 'Disconnected' : prev);
      setIsLoading(prev => !prev ? true : prev);
      barFeedFailedRef.current = false;
      barsInfoRef.current = null;
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      return;
    }

    const timer = setTimeout(updateHeight, 100);
    window.addEventListener('resize', debouncedUpdateHeight);

    let resizeObserver;
    if (containerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(debouncedUpdateHeight);
      resizeObserver.observe(containerRef.current);
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWS();
    }

    return () => {
      clearTimeout(timer);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      window.removeEventListener('resize', debouncedUpdateHeight);
      if (resizeObserver && containerRef.current) resizeObserver.unobserve(containerRef.current);
    };
  }, [isOpen, connectWS, updateHeight, debouncedUpdateHeight]);

  // Symbol change effect
  useEffect(() => {
    if (!isOpen) return;
    
    // Only fetch new data if WebSocket is connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setData([]);
      setIsLoading(true);
      barsInfoRef.current = null;
      barFeedFailedRef.current = false; // Reset on symbol change
      fetchBarsInfo();
    }
    // If not connected, wait for connection - it will fetch data after login
  }, [symbol, isOpen, fetchBarsInfo]);

  const displayName = typeof symbol === 'string' ? symbol.split('_')[0] : symbol?.SymbolName || 'N/A';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2">
      <div className="bg-gray-800 rounded-lg w-full max-w-7xl h-[95vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-semibold text-white">{displayName}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div ref={containerRef} className="flex-1 overflow-hidden min-h-0 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10 rounded">
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
          )}
          {!isReady && !isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">No data available</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChartModal;