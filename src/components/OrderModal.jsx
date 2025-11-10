import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, TrendingUp, TrendingDown, Clock, AlertCircle } from 'lucide-react';
import { tradingAPI } from '../services/api';
import ChartModal from './ChartModal';

const OrderModal = ({ 
  isOpen, 
  onClose, 
  symbol, 
  user, 
  onOrderPlaced 
}) => {
  const [activeTab, setActiveTab] = useState('market');
  const [orderData, setOrderData] = useState({
    lotSize: 1,
    stopLoss: '',
    takeProfit: '',
    price: '',
    orderType: 'BUY'
  });
  const [userBalance, setUserBalance] = useState({
    ledgerBalance: 0,
    marginAvailable: 0,
    activePL: 0,
    m2m: 0
  });
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [placingOrderType, setPlacingOrderType] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [usdToInrRate, setUsdToInrRate] = useState(88.65);
  const [liveSymbol, setLiveSymbol] = useState(symbol); // Local state for live price updates
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  
  // WebSocket refs for live price updates
  const wsRef = useRef(null);
  const fxWsRef = useRef(null);

  // Use liveSymbol instead of symbol for price calculations
  // Define this before useEffect hooks that use it
  const currentSymbol = liveSymbol || symbol;

  // Update liveSymbol when symbol prop changes
  useEffect(() => {
    setLiveSymbol(symbol);
  }, [symbol]);

  // Fetch USD to INR exchange rate
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data.rates && data.rates.INR) {
          setUsdToInrRate(data.rates.INR);
        }
      } catch (error) {
        console.error('Error fetching exchange rate:', error);
      }
    };
    if (isOpen) {
      fetchExchangeRate();
      const interval = setInterval(fetchExchangeRate, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Load user balance and active orders when modal opens
  useEffect(() => {
    if (isOpen && user?.UserId) {
      loadUserBalance();
    }
  }, [isOpen, user?.UserId]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setOrderData({
        lotSize: 1,
        stopLoss: '',
        takeProfit: '',
        price: '',
        orderType: 'BUY'
      });
      setError('');
      setSuccess('');
      setActiveTab('market');
      setPlacingOrderType(null);
    }
  }, [isOpen]);

  // WebSocket for MCX/NSE symbols
  useEffect(() => {
    if (!isOpen || !currentSymbol?.SymbolToken) return;
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(currentSymbol?.ExchangeType || '');
    if (isFX) return;

    const uri = 'wss://ws.tradewingss.com/api/webapiwebsoc';
    const ws = new WebSocket(uri);
    wsRef.current = ws;

    ws.onopen = () => {
      try { ws.send(currentSymbol.SymbolToken.toString()); } catch {}
    };

    ws.onmessage = (event) => {
      const raw = event.data;
      if (!raw || raw === '' || raw === 'true') return;
      let tick = null;
      try { tick = JSON.parse(raw); } catch {
        let depth = 0, buf = '';
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (ch === '{') depth++;
          if (depth > 0) buf += ch;
          if (ch === '}') { depth--; if (depth === 0) break; }
        }
        try { tick = buf ? JSON.parse(buf) : null; } catch {}
      }
      if (!tick || tick.instrument_token?.toString() !== currentSymbol.SymbolToken?.toString()) return;

      const bid = tick.bid === "0" || tick.bid === 0 ? tick.last_price : tick.bid;
      const ask = tick.ask === "0" || tick.ask === 0 ? tick.last_price : tick.ask;
      
      // Update local symbol state with live prices
      setLiveSymbol(prev => ({
        ...prev,
        buy: parseFloat(ask) || prev?.buy || 0,
        sell: parseFloat(bid) || prev?.sell || 0,
        ltp: parseFloat(tick.last_price) || prev?.ltp || 0
      }));
    };

    ws.onclose = () => { wsRef.current = null; };
    ws.onerror = () => {};

    return () => { try { ws.close(); } catch {} };
  }, [isOpen, currentSymbol?.SymbolToken, currentSymbol?.ExchangeType]);

  // WebSocket for FX symbols (FOREX/CRYPTO/COMMODITY)
  useEffect(() => {
    if (!isOpen || !currentSymbol?.SymbolName) return;
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(currentSymbol?.ExchangeType || '');
    if (!isFX) return;

    const uri = 'wss://www.fxsoc.tradenstocko.com:8001/ws';
    const ws = new WebSocket(uri);
    fxWsRef.current = ws;

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      if (!event.data || event.data === '' || event.data === 'true') return;
      try {
        const tickData = JSON.parse(event.data);
        if (!tickData || tickData.type !== 'tick' || !tickData.data) return;
        
        const { Symbol, BestBid, BestAsk } = tickData.data;
        const symbolName = currentSymbol.SymbolName?.split('_')[0] || currentSymbol.SymbolName;
        
        if (Symbol !== symbolName && Symbol !== currentSymbol.SymbolName) return;

        const bestBidPriceUSD = BestBid?.Price || 0;
        const bestAskPriceUSD = BestAsk?.Price || 0;
        const bestBidPrice = bestBidPriceUSD * usdToInrRate;
        const bestAskPrice = bestAskPriceUSD * usdToInrRate;
        
        // Update local symbol state with live FX prices
        setLiveSymbol(prev => ({
          ...prev,
          buy: bestAskPrice,
          sell: bestBidPrice,
          buyUSD: bestAskPriceUSD,
          sellUSD: bestBidPriceUSD,
          ltp: (bestBidPrice + bestAskPrice) / 2,
          ltpUSD: (bestBidPriceUSD + bestAskPriceUSD) / 2
        }));
      } catch (error) {
        console.error('Error parsing FX WebSocket data:', error);
      }
    };

    ws.onclose = () => { fxWsRef.current = null; };
    ws.onerror = () => {};

    return () => { try { ws.close(); } catch {} };
  }, [isOpen, currentSymbol?.SymbolName, currentSymbol?.ExchangeType, usdToInrRate]);

  const loadUserBalance = async () => {
    try {
      setLoading(true);
      const balance = await tradingAPI.getLedgerBalance(user.UserId);
      setUserBalance({
        ledgerBalance: balance,
        marginAvailable: balance,
        activePL: 0,
        m2m: balance
      });
    } catch (error) {
      console.error('Error loading user balance:', error);
      setError('Failed to load account balance');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setOrderData(prev => ({
      ...prev,
      [field]: value
    }));
    setError('');
    setSuccess('');
  };

  const validateOrder = () => {
    if (!currentSymbol) {
      setError('No symbol selected');
      return false;
    }

    const lotSize = parseFloat(orderData.lotSize) || 0;
    if (!orderData.lotSize || lotSize <= 0) {
      setError('Lot size must be greater than 0');
      return false;
    }

    // Validate lot size limits for CRYPTO, FOREX, COMMODITY
    const exchtype = currentSymbol.ExchangeType || 'MCX';
    if (exchtype === 'CRYPTO') {
      const minLot = parseFloat(localStorage.getItem('MinLotSingleTradeCrypto') || 0);
      const maxLot = parseFloat(localStorage.getItem('MaxLotSingleTradeCrypto') || 0);
      if (minLot > 0 && lotSize < minLot) {
        setError(`Minimum lot size for Crypto is ${minLot}`);
        return false;
      }
      if (maxLot > 0 && lotSize > maxLot) {
        setError(`Maximum lot size for Crypto is ${maxLot}`);
        return false;
      }
    } else if (exchtype === 'FOREX') {
      const minLot = parseFloat(localStorage.getItem('MinLotSingleTradeForex') || 0);
      const maxLot = parseFloat(localStorage.getItem('MaxLotSingleTradeForex') || 0);
      if (minLot > 0 && lotSize < minLot) {
        setError(`Minimum lot size for Forex is ${minLot}`);
        return false;
      }
      if (maxLot > 0 && lotSize > maxLot) {
        setError(`Maximum lot size for Forex is ${maxLot}`);
        return false;
      }
    } else if (exchtype === 'COMMODITY') {
      const minLot = parseFloat(localStorage.getItem('MinLotSingleTradeCommodity') || 0);
      const maxLot = parseFloat(localStorage.getItem('MaxLotSingleTradeCommodity') || 0);
      if (minLot > 0 && lotSize < minLot) {
        setError(`Minimum lot size for Commodity is ${minLot}`);
        return false;
      }
      if (maxLot > 0 && lotSize > maxLot) {
        setError(`Maximum lot size for Commodity is ${maxLot}`);
        return false;
      }
    }

    if (activeTab === 'limit' && !orderData.price) {
      setError('Price is required for limit orders');
      return false;
    }

    if (orderData.stopLoss && parseFloat(orderData.stopLoss) <= 0) {
      setError('Stop loss must be greater than 0');
      return false;
    }

    if (orderData.takeProfit && parseFloat(orderData.takeProfit) <= 0) {
      setError('Take profit must be greater than 0');
      return false;
    }

    return true;
  };

  const calculateMargin = () => {
    if (!currentSymbol || !orderData.lotSize) return 0;
    
    const lotSize = parseFloat(orderData.lotSize) || 0;
    if (lotSize <= 0) return 0;
    
    const exchtype = currentSymbol.ExchangeType || 'MCX';
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
    
    // Get price in INR for margin calculation
    let price;
    if (activeTab === 'market') {
      price = orderData.orderType === 'BUY' ? (currentSymbol.buy || 0) : (currentSymbol.sell || 0);
    } else {
      // Limit order
      if (isFX && orderData.price && currentSymbol.buy && currentSymbol.buyUSD) {
        // Convert USD price to INR using the exchange rate
        const usdToInrRate = currentSymbol.buy / currentSymbol.buyUSD;
        price = parseFloat(orderData.price) * usdToInrRate;
      } else {
        // For non-FX or if conversion data not available, use price as-is (INR)
        price = parseFloat(orderData.price) || 0;
      }
    }
    
    // Use the same margin calculation logic as placeOrder
    let marginvalue = 0;
    
    // Get exposure margins from localStorage
    const Intraday_Exposure_Margin_MCX = localStorage.getItem("Intraday_Exposure_Margin_MCX");
    const Intraday_Exposure_Margin_Equity = localStorage.getItem("Intraday_Exposure_Margin_Equity");
    const Intraday_Exposure_Margin_CDS = localStorage.getItem("Intraday_Exposure_Margin_CDS");
    
    // Get FX-specific margins
    const CryptoIntradayMargin = localStorage.getItem("CryptoIntradayMargin");
    const ForexIntradayMargin = localStorage.getItem("ForexIntradayMargin");
    const CommodityIntradayMargin = localStorage.getItem("CommodityIntradayMargin");
    
    // Get exposure types
    const MCX_Exposure_Type = localStorage.getItem("Mcx_Exposure_Type");
    const NSE_Exposure_Type = localStorage.getItem("NSE_Exposure_Type");
    const CDS_Exposure_Type = localStorage.getItem("CDS_Exposure_Type");
    
    if (exchtype === 'MCX') {
        if (MCX_Exposure_Type && MCX_Exposure_Type.includes("per_lot")) {
          const symbolname = currentSymbol.SymbolName;
          const symarr = symbolname.split("_");
          const similersym = symarr[0]?.toString().trim();
          const Intraday_Exposure = localStorage.getItem("MCX_Exposure_Lot_wise_" + similersym + "_Intraday");
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure || 0);
        } else {
          const finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
          marginvalue = (parseFloat(price) * finallotsize) / parseFloat(Intraday_Exposure_Margin_MCX || 10);
        }
      } else if (exchtype === 'NSE') {
        if (NSE_Exposure_Type === "per_lot") {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_Equity || 0);
        } else {
          const finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
          marginvalue = (parseFloat(price) * finallotsize) / parseFloat(Intraday_Exposure_Margin_Equity || 10);
        }
      } else if (exchtype === 'CRYPTO') {
        // Use CryptoIntradayMargin
        const cryptoMargin = parseFloat(CryptoIntradayMargin || 0);
        const finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as percentage
        if (cryptoMargin > 1000) {
          marginvalue = parseFloat(lotSize) * cryptoMargin;
        } else {
          marginvalue = (parseFloat(price) * finallotsize) / (cryptoMargin || 10);
        }
      } else if (exchtype === 'FOREX') {
        // Use ForexIntradayMargin
        const forexMargin = parseFloat(ForexIntradayMargin || 0);
        const finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as percentage
        if (forexMargin > 1000) {
          marginvalue = parseFloat(lotSize) * forexMargin;
        } else {
          marginvalue = (parseFloat(price) * finallotsize) / (forexMargin || 10);
        }
      } else if (exchtype === 'COMMODITY') {
        // Use CommodityIntradayMargin
        const commodityMargin = parseFloat(CommodityIntradayMargin || 0);
        const finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as percentage
        if (commodityMargin > 1000) {
          marginvalue = parseFloat(lotSize) * commodityMargin;
        } else {
          marginvalue = (parseFloat(price) * finallotsize) / (commodityMargin || 10);
        }
      } else {
        // CDS/OPT
        if (CDS_Exposure_Type === "per_lot") {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_CDS || 0);
        } else {
          const finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
          marginvalue = (parseFloat(price) * finallotsize) / parseFloat(Intraday_Exposure_Margin_CDS || 10);
        }
      }
    
    return marginvalue;
  };

  const createSLTPForNewOrder = async (token, scriptName, orderCategory, slValue, tpValue) => {
    try {
      // Wait 500ms for backend to save the order (exactly like original)
      setTimeout(async () => {
        try {
          // Fetch active orders to find the newly created one
          const orders = await tradingAPI.getOrders('Active', user.UserId);
          
          // Find the most recent order matching our criteria
          let newOrder = null;
          let latestTime = null;
          
          orders.forEach(order => {
            if (order.TokenNo === token && 
                order.ScriptName === scriptName && 
                order.OrderCategory === orderCategory) {
              
              // Get the order timestamp
              const orderDateTime = new Date(order.OrderDate + " " + order.OrderTimeFull);
              
              // Find the most recent one
              if (!latestTime || orderDateTime > latestTime) {
                latestTime = orderDateTime;
                newOrder = order;
              }
            }
          });
          
          // If we found the order, create SL/TP
          if (newOrder && newOrder.Id) {
            const sltpData = {
              TradeId: newOrder.Id,
              SL: slValue || "0",
              TP: tpValue || "0"
            };
            
            await tradingAPI.saveSLTP(sltpData.TradeId, sltpData.SL, sltpData.TP);
            console.log("SL/TP created successfully");
          } else {
            console.log("Could not find newly created order");
          }
        } catch (error) {
          console.error("Failed to create SL/TP:", error);
        }
      }, 500); // Wait 500ms for order to be saved
    } catch (error) {
      console.error('Error creating SL/TP:', error);
    }
  };

  const placeOrder = async (orderTypeOverride = null) => {
    // Use override if provided, otherwise use current orderData.orderType
    const orderType = orderTypeOverride || orderData.orderType;
    
    // Temporarily set orderType if override is provided
    if (orderTypeOverride) {
      setOrderData(prev => ({ ...prev, orderType: orderTypeOverride }));
    }
    
    // Validate with the orderType we're using
    if (!symbol) {
      setError('No symbol selected');
      return;
    }

    const lotSize = parseFloat(orderData.lotSize) || 0;
    if (!orderData.lotSize || lotSize <= 0) {
      setError('Lot size must be greater than 0');
      return;
    }

    if (activeTab === 'limit' && !orderData.price) {
      setError('Price is required for limit orders');
      return;
    }

    if (orderData.stopLoss && parseFloat(orderData.stopLoss) <= 0) {
      setError('Stop loss must be greater than 0');
      return;
    }

    if (orderData.takeProfit && parseFloat(orderData.takeProfit) <= 0) {
      setError('Take profit must be greater than 0');
      return;
    }

    setOrderLoading(true);
    setPlacingOrderType(orderType);
    setError('');
    setSuccess('');

    try {
      const lotSize = parseFloat(orderData.lotSize) || 1;
      
      // Calculate margin exactly like original CSHTML implementation
      let marginvalue = 0;
      let holdmarginvalue = 0;
      let finallotsize = 0;
      
      const exchtype = currentSymbol.ExchangeType || 'MCX';
      const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
      
      // For market orders, use INR prices directly
      // For limit orders with FX symbols, convert USD input to INR
      let orderprice;
      if (activeTab === 'market') {
        orderprice = orderType === 'BUY' ? (currentSymbol.buy || 0) : (currentSymbol.sell || 0);
      } else {
        // Limit order
        if (isFX && orderData.price && currentSymbol.buy && currentSymbol.buyUSD) {
          // Convert USD price to INR using the exchange rate
          const usdToInrRate = currentSymbol.buy / currentSymbol.buyUSD;
          orderprice = parseFloat(orderData.price) * usdToInrRate;
        } else {
          // For non-FX or if conversion data not available, use price as-is (INR)
          orderprice = parseFloat(orderData.price);
        }
      }
      
      // Get exposure margins from localStorage (exactly like original)
      const Intraday_Exposure_Margin_MCX = localStorage.getItem("Intraday_Exposure_Margin_MCX");
      const Holding_Exposure_Margin_MCX = localStorage.getItem("Holding_Exposure_Margin_MCX");
      const Intraday_Exposure_Margin_Equity = localStorage.getItem("Intraday_Exposure_Margin_Equity");
      const Holding_Exposure_Margin_Equity = localStorage.getItem("Holding_Exposure_Margin_Equity");
      const Intraday_Exposure_Margin_CDS = localStorage.getItem("Intraday_Exposure_Margin_CDS");
      const Holding_Exposure_Margin_CDS = localStorage.getItem("Holding_Exposure_Margin_CDS");
      
      // Get FX-specific margins
      const CryptoIntradayMargin = localStorage.getItem("CryptoIntradayMargin");
      const ForexIntradayMargin = localStorage.getItem("ForexIntradayMargin");
      const CommodityIntradayMargin = localStorage.getItem("CommodityIntradayMargin");
      
      // Get exposure types
      const MCX_Exposure_Type = localStorage.getItem("Mcx_Exposure_Type");
      const NSE_Exposure_Type = localStorage.getItem("NSE_Exposure_Type");
      const CDS_Exposure_Type = localStorage.getItem("CDS_Exposure_Type");
      
      // Margin calculation logic exactly like original
      if (exchtype === 'MCX') {
        if (MCX_Exposure_Type && MCX_Exposure_Type.includes("per_lot")) {
          // Per lot calculation
          const symbolname = currentSymbol.SymbolName;
          const symarr = symbolname.split("_");
          const similersym = symarr[0]?.toString().trim();
          const Intraday_Exposure = localStorage.getItem("MCX_Exposure_Lot_wise_" + similersym + "_Intraday");
          const Intraday_hold_Exposure = localStorage.getItem("MCX_Exposure_Lot_wise_" + similersym + "_Holding");
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure || 0);
          holdmarginvalue = parseFloat(lotSize) * parseFloat(Intraday_hold_Exposure || 0);
        } else {
          // Percentage calculation
          finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
          marginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Intraday_Exposure_Margin_MCX || 10);
          holdmarginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Holding_Exposure_Margin_MCX || 10);
        }
      } else if (exchtype === 'NSE') {
        if (NSE_Exposure_Type === "per_lot") {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_Equity || 0);
          holdmarginvalue = parseFloat(lotSize) * parseFloat(Holding_Exposure_Margin_Equity || 0);
        } else {
          finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
          marginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Intraday_Exposure_Margin_Equity || 10);
          holdmarginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Holding_Exposure_Margin_Equity || 10);
        }
      } else if (exchtype === 'CRYPTO') {
        // Use CryptoIntradayMargin
        const cryptoMargin = parseFloat(CryptoIntradayMargin || 0);
        finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as percentage
        if (cryptoMargin > 1000) {
          marginvalue = parseFloat(lotSize) * cryptoMargin;
          holdmarginvalue = parseFloat(lotSize) * cryptoMargin; // Using same for holding
        } else {
          marginvalue = (parseFloat(orderprice) * finallotsize) / (cryptoMargin || 10);
          holdmarginvalue = (parseFloat(orderprice) * finallotsize) / (cryptoMargin || 10); // Using same for holding
        }
      } else if (exchtype === 'FOREX') {
        // Use ForexIntradayMargin
        const forexMargin = parseFloat(ForexIntradayMargin || 0);
        finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as percentage
        if (forexMargin > 1000) {
          marginvalue = parseFloat(lotSize) * forexMargin;
          holdmarginvalue = parseFloat(lotSize) * forexMargin; // Using same for holding
        } else {
          marginvalue = (parseFloat(orderprice) * finallotsize) / (forexMargin || 10);
          holdmarginvalue = (parseFloat(orderprice) * finallotsize) / (forexMargin || 10); // Using same for holding
        }
      } else if (exchtype === 'COMMODITY') {
        // Use CommodityIntradayMargin
        const commodityMargin = parseFloat(CommodityIntradayMargin || 0);
        finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as percentage
        if (commodityMargin > 1000) {
          marginvalue = parseFloat(lotSize) * commodityMargin;
          holdmarginvalue = parseFloat(lotSize) * commodityMargin; // Using same for holding
        } else {
          marginvalue = (parseFloat(orderprice) * finallotsize) / (commodityMargin || 10);
          holdmarginvalue = (parseFloat(orderprice) * finallotsize) / (commodityMargin || 10); // Using same for holding
        }
      } else {
        // CDS/OPT
        if (CDS_Exposure_Type === "per_lot") {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_CDS || 0);
          holdmarginvalue = parseFloat(lotSize) * parseFloat(Holding_Exposure_Margin_CDS || 0);
        } else {
          finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
          marginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Intraday_Exposure_Margin_CDS || 10);
          holdmarginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Holding_Exposure_Margin_CDS || 10);
        }
      }
      
      // Get current date and time exactly like the original
      const now = new Date();
      const orderDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const orderTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
      
      // Determine if it's a stop loss order (for pending orders)
      let isstoplossorder = "";
      if (activeTab === 'order') {
        const bid = currentSymbol.sell || 0;
        const ask = currentSymbol.buy || 0;
        if (orderType === "SELL") {
          if (parseFloat(orderprice) > parseFloat(bid)) {
            isstoplossorder = "false";
          } else {
            isstoplossorder = "true";
          }
        } else {
          if (parseFloat(orderprice) > parseFloat(ask)) {
            isstoplossorder = "true";
          } else {
            isstoplossorder = "false";
          }
        }
      }
      
      // Get the symbol lot size from localStorage (exactly like original)
      const actualLotSize = localStorage.getItem("SymbolLotSize") || currentSymbol.Lotsize || 1;
      
      // Prepare order payload EXACTLY like the original
      const orderPayload = {
        Id: '',
        OrderDate: '',
        OrderTime: '',
        actualLot: actualLotSize.toString(),
        selectedlotsize: lotSize.toString(),
        OrderNo: '',
        UserId: localStorage.getItem("userid") || user.UserId,
        UserName: localStorage.getItem("ClientName") || user.UserName || user.UserId,
        OrderCategory: orderType,
        OrderType: activeTab === 'market' ? 'Market' : (isstoplossorder === "true" ? 'S/L' : 'Limit'),
        ScriptName: currentSymbol.SymbolName,
        TokenNo: currentSymbol.SymbolToken,
        ActionType: activeTab === 'market' ? 
          (orderType === 'BUY' ? 'Bought By Trader' : 'Sold By Trader') : 
          'Order Placed @@',
        OrderPrice: orderprice.toString(),
        Lot: lotSize.toString(),
        MarginUsed: Math.round(parseFloat(marginvalue)).toString(),
        HoldingMarginReq: Math.round(parseFloat(holdmarginvalue)).toString(),
        OrderStatus: activeTab === 'market' ? 'Active' : 'Pending',
        SymbolType: exchtype === 'CDS' ? 'OPT' : exchtype,
        isstoplossorder: activeTab === 'order' ? isstoplossorder : "",
        isedit: 'false'
      };

      // CRITICAL CHECK 3: Check margin available (exactly like original)
      const marginAvailable = parseFloat(userBalance.marginAvailable || 0);
      if (parseFloat(marginvalue) > parseFloat(marginAvailable)) {
        setError('Insufficient margin available. Please reduce lot size.');
        setOrderLoading(false);
        setPlacingOrderType(null);
        return;
      }

      // Step 1: Check before trade (exactly like original)
      console.log('Checking before trade with payload:', orderPayload);
      let canTrade;
      if (activeTab === 'order') {
        canTrade = await tradingAPI.checkBeforeTradeForPending(orderPayload);
      } else {
        canTrade = await tradingAPI.checkBeforeTrade(orderPayload);
      }
      console.log('Check before trade response:', canTrade);
      
      if (canTrade !== 'true' && canTrade !== true) {
        setError(canTrade || 'Order validation failed');
        setOrderLoading(false);
        setPlacingOrderType(null);
        return;
      }

      // Step 2: Save the order using simplified payload
      console.log('Saving order with payload:', orderPayload);
      
      // Prepare simplified payload for saveorderbyuser endpoint
      const savePayload = {
        UserId: orderPayload.UserId,
        UserName: orderPayload.UserName,
        OrderCategory: orderPayload.OrderCategory,
        OrderType: orderPayload.OrderType,
        ScriptName: orderPayload.ScriptName,
        TokenNo: orderPayload.TokenNo,
        OrderPrice: orderPayload.OrderPrice,
        Lot: orderPayload.Lot,
        selectedlotsize: orderPayload.selectedlotsize,
        OrderStatus: orderPayload.OrderStatus,
        SymbolType: orderPayload.SymbolType,
        actualLot: orderPayload.actualLot,
        HoldingMarginReq: orderPayload.HoldingMarginReq,
        MarginUsed: orderPayload.HoldingMarginReq
      };
      
      console.log('Saving with simplified payload:', savePayload);
      const saveResponse = await tradingAPI.saveOrderByUser(savePayload);
      console.log('Save order response:', saveResponse);
      
      // Verify response
      if (!saveResponse && saveResponse !== 'true') {
        setError('Failed to save order. Please try again.');
        setOrderLoading(false);
        setPlacingOrderType(null);
        return;
      }

      // Step 3: Create SL/TP if provided (exactly like original)
      if ((orderData.stopLoss || orderData.takeProfit) && activeTab === 'market') {
        // For market orders, create SL/TP immediately
        try {
          await createSLTPForNewOrder(
            currentSymbol.SymbolToken,
            currentSymbol.SymbolName,
            orderType,
            orderData.stopLoss,
            orderData.takeProfit
          );
        } catch (error) {
          console.error('Error creating SL/TP:', error);
          // Don't fail the order if SL/TP fails
        }
      }

      // Format price for display in success message
      let displayPrice = '';
      const isFXSymbol = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
      
      if (isFXSymbol && activeTab === 'market') {
        // For FX market orders, show USD price (without $ sign, as per user preference)
        if (orderType === 'BUY') {
          displayPrice = currentSymbol.buyUSD ? formatFXPrice(currentSymbol.buyUSD) : formatPrice(orderprice);
        } else {
          displayPrice = currentSymbol.sellUSD ? formatFXPrice(currentSymbol.sellUSD) : formatPrice(orderprice);
        }
      } else if (isFXSymbol && activeTab === 'limit') {
        // For FX limit orders, show the USD price user entered
        displayPrice = formatFXPrice(parseFloat(orderData.price || 0));
      } else {
        // For non-FX, show INR price
        displayPrice = `₹${formatPrice(orderprice)}`;
      }
      
      // Show success message with order details
      setSuccess(`${orderType} order placed successfully! ${lotSize} lot(s) @ ${displayPrice}`);
      setOrderLoading(false);
      setPlacingOrderType(null);
      
      // Call callback to refresh data
      if (onOrderPlaced) {
        onOrderPlaced();
      }

      // Close modal after showing success
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Error placing order:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response,
        data: error.response?.data,
        status: error.response?.status
      });
      
      let errorMessage = 'Failed to place order';
      if (error.response?.data) {
        errorMessage = error.response.data;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setOrderLoading(false);
      setPlacingOrderType(null);
    }
  };

  const formatPrice = (price) => {
    return parseFloat(price || 0).toFixed(2);
  };

  // Check if symbol is from FX tabs (Crypto/Forex/Commodity)
  const isFXSymbol = () => {
    if (!currentSymbol) return false;
    const exchtype = currentSymbol.ExchangeType || '';
    return ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
  };

  // Format FX price to 5 decimal places
  const formatFXPrice = (price) => {
    if (!price || price === 0) return '0.00000';
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return '0.00000';
    return numPrice.toFixed(5);
  };

  // Get USD price for display (for FX symbols)
  const getBuyPriceUSD = () => {
    if (!currentSymbol) return 0;
    if (activeTab === 'market') {
      return currentSymbol.buyUSD || currentSymbol.buy || 0;
    }
    // For limit orders, show the USD price user entered
    return parseFloat(orderData.price || 0);
  };

  const getSellPriceUSD = () => {
    if (!currentSymbol) return 0;
    if (activeTab === 'market') {
      return currentSymbol.sellUSD || currentSymbol.sell || 0;
    }
    // For limit orders, show the USD price user entered
    return parseFloat(orderData.price || 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2">
      <div className="bg-gray-800 rounded-lg w-full max-w-sm max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Place Order</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Balance */}
        <div className="p-2 bg-gray-700">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-center">
              <div className="text-gray-300">Ledger Balance</div>
              <div className="text-white font-semibold">₹{formatPrice(userBalance.ledgerBalance)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-300">Margin Available</div>
              <div className="text-white font-semibold">₹{formatPrice(userBalance.marginAvailable)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-300">Active P/L</div>
              <div className={`font-semibold ${userBalance.activePL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ₹{formatPrice(userBalance.activePL)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-300">M2M (Equity)</div>
              <div className={`font-semibold ${userBalance.m2m >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ₹{formatPrice(userBalance.m2m)}
              </div>
            </div>
          </div>
        </div>

        {/* Symbol Info */}
        <div className="p-2 text-center border-b border-gray-700">
          <h4 className="text-white font-semibold text-sm">
            {currentSymbol?.SymbolName?.split('_')[0] || 'N/A'}
          </h4>
          <p className="text-gray-400 text-xs">
            Lot Size: {currentSymbol?.Lotsize || 1} • Exchange: {currentSymbol?.ExchangeType || 'MCX'}
          </p>
          {['CRYPTO', 'FOREX', 'COMMODITY'].includes(currentSymbol?.ExchangeType || '') && (
            <div className="mt-1">
              <div className="flex items-center justify-center">
                <button
                  onClick={() => setIsChartModalOpen(true)}
                  className="text-blue-400 hover:text-blue-300 text-xs"
                >
                  📈 Open Chart
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Market Data */}
        {currentSymbol && (
          <div className="p-2 bg-gray-700 border-b border-gray-700">
            <div className={`grid gap-2 text-xs ${isFXSymbol() ? 'grid-cols-3' : 'grid-cols-3'}`}>
              {/* Row 1 */}
              <div>
                <div className="text-gray-400">Bid</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? formatFXPrice(currentSymbol.sellUSD || currentSymbol.sell || 0) : `₹${formatPrice(currentSymbol.sell || 0)}`}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Ask</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? formatFXPrice(currentSymbol.buyUSD || currentSymbol.buy || 0) : `₹${formatPrice(currentSymbol.buy || 0)}`}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Ltp</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? formatFXPrice(currentSymbol.ltpUSD || currentSymbol.ltp || 0) : `₹${formatPrice(currentSymbol.ltp || 0)}`}
                </div>
              </div>
              
              {/* Row 2 - High, Low, and conditional fields */}
              <div>
                <div className="text-gray-400">High</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? (() => {
                    // Convert INR to USD for FX symbols
                    const highINR = currentSymbol.high || 0;
                    const ltpINR = currentSymbol.ltp || 0;
                    const ltpUSD = currentSymbol.ltpUSD || 0;
                    const highUSD = (ltpINR > 0 && ltpUSD > 0) ? (highINR * (ltpUSD / ltpINR)) : 0;
                    return formatFXPrice(highUSD);
                  })() : `₹${formatPrice(currentSymbol.high || 0)}`}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Low</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? (() => {
                    // Convert INR to USD for FX symbols
                    const lowINR = currentSymbol.low || 0;
                    const ltpINR = currentSymbol.ltp || 0;
                    const ltpUSD = currentSymbol.ltpUSD || 0;
                    const lowUSD = (ltpINR > 0 && ltpUSD > 0) ? (lowINR * (ltpUSD / ltpINR)) : 0;
                    return formatFXPrice(lowUSD);
                  })() : `₹${formatPrice(currentSymbol.low || 0)}`}
                </div>
              </div>
              {!isFXSymbol() && (
                <>
                  <div>
                    <div className="text-gray-400">Open</div>
                    <div className="text-white font-medium">₹{formatPrice(currentSymbol.open || 0)}</div>
                  </div>
                  
                  {/* Row 3 - Only for non-FX symbols */}
                  <div>
                    <div className="text-gray-400">Close</div>
                    <div className="text-white font-medium">₹{formatPrice(currentSymbol.close || 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">OL</div>
                    <div className="text-white font-medium">{currentSymbol.oi || currentSymbol.ol || 0}</div>
                  </div>
                </>
              )}
              
              {/* Lot Size (replaces Volume) */}
              <div>
                <div className="text-gray-400">Lot Size</div>
                <div className="text-white font-medium">{currentSymbol.Lotsize || currentSymbol.lot_size || 1}</div>
              </div>
              
              {/* Row 4 - Change */}
              <div className="col-span-3">
                <div className="text-gray-400">Change</div>
                <div className={`font-medium ${(currentSymbol.chg || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(currentSymbol.chg || 0) >= 0 ? '+' : ''}{isFXSymbol() ? formatFXPrice(currentSymbol.chg || 0) : `₹${formatPrice(currentSymbol.chg || 0)}`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order Type Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('market')}
            className={`flex-1 py-2 px-2 text-xs font-medium transition-colors ${
              activeTab === 'market'
                ? 'text-white bg-gray-700 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <TrendingUp className="w-3 h-3 inline mr-1" />
            Market
          </button>
          <button
            onClick={() => setActiveTab('limit')}
            className={`flex-1 py-2 px-2 text-xs font-medium transition-colors ${
              activeTab === 'limit'
                ? 'text-white bg-gray-700 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Clock className="w-3 h-3 inline mr-1" />
            Limit
          </button>
        </div>

        {/* Order Form */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* Lot Size */}
          <div className="mb-2">
            <label className="block text-gray-300 text-xs font-medium mb-1">
              Lot Size
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max="999"
              value={orderData.lotSize}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty string for clearing
                if (value === '') {
                  handleInputChange('lotSize', '');
                  return;
                }
                
                // Allow decimal values starting with 0 (e.g., 0.1, 0.05, 0.01)
                // Allow partial decimal input like "0." or "0.0" while typing
                if (value === '0.' || value.startsWith('0.')) {
                  handleInputChange('lotSize', value);
                  return;
                }
                
                // Allow standalone "0" temporarily so user can type "0." or "0.1"
                if (value === '0') {
                  handleInputChange('lotSize', value);
                  return;
                }
                
                // Parse the value to check if it's valid
                const numValue = parseFloat(value);
                
                // Allow valid positive numbers (including decimals like 0.1, 0.05)
                if (!isNaN(numValue) && numValue > 0) {
                  handleInputChange('lotSize', value);
                } 
                // Allow negative sign for potential negative input (though we'll validate later)
                else if (value === '-') {
                  handleInputChange('lotSize', value);
                }
                // For any other invalid input, don't update
              }}
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="text-gray-400 text-xs mt-1">
              Margin Required: ₹{formatPrice(calculateMargin())}
            </div>
          </div>

          {/* Price (for limit orders) */}
          {activeTab === 'limit' && (
            <div className="mb-2">
              <label className="block text-gray-300 text-xs font-medium mb-1">
                Price {isFXSymbol() ? '(USD)' : '(INR)'}
              </label>
              <input
                type="number"
                step="0.01"
                value={orderData.price}
                onChange={(e) => handleInputChange('price', e.target.value)}
                placeholder={isFXSymbol() ? "Enter price in USD" : "Enter price"}
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {isFXSymbol() && orderData.price && currentSymbol?.buy && currentSymbol?.buyUSD && (
                <div className="text-gray-400 text-xs mt-1">
                  ≈ ₹{formatPrice((parseFloat(orderData.price) * (currentSymbol.buy / currentSymbol.buyUSD)))}
                </div>
              )}
            </div>
          )}

          {/* Stop Loss & Take Profit */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-gray-300 text-xs font-medium mb-1">
                Stop Loss (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={orderData.stopLoss}
                onChange={(e) => handleInputChange('stopLoss', e.target.value)}
                placeholder="SL"
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-xs font-medium mb-1">
                Take Profit (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={orderData.takeProfit}
                onChange={(e) => handleInputChange('takeProfit', e.target.value)}
                placeholder="TP"
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-2 p-2 bg-red-900 border border-red-600 rounded flex items-center">
              <AlertCircle className="w-4 h-4 text-red-400 mr-1" />
              <span className="text-red-400 text-xs">{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-2 p-2 bg-green-900 border border-green-600 rounded flex items-center">
              <TrendingUp className="w-4 h-4 text-green-400 mr-1" />
              <span className="text-green-400 text-xs">{success}</span>
            </div>
          )}

          {/* Order Buttons - Direct Place Order */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => placeOrder('SELL')}
              disabled={orderLoading || loading}
              className="py-3 px-3 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-red-600/50 flex items-center justify-center gap-2"
            >
              {orderLoading && placingOrderType === 'SELL' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Placing...</span>
                </>
              ) : (
                <>
                  <TrendingDown className="w-4 h-4" />
                  <div className="text-center">
                    <div className="text-xs opacity-90 mb-0.5">SELL</div>
                    {isFXSymbol() ? (
                      <div className="text-base font-bold">
                        {formatFXPrice(getSellPriceUSD())}
                      </div>
                    ) : (
                      <div className="text-base font-bold">
                        ₹{formatPrice(activeTab === 'market' ? (currentSymbol?.sell || 0) : (orderData.price || currentSymbol?.sell || 0))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </button>
            <button
              onClick={() => placeOrder('BUY')}
              disabled={orderLoading || loading}
              className="py-3 px-3 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-green-600/50 flex items-center justify-center gap-2"
            >
              {orderLoading && placingOrderType === 'BUY' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Placing...</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4" />
                  <div className="text-center">
                    <div className="text-xs opacity-90 mb-0.5">BUY</div>
                    {isFXSymbol() ? (
                      <div className="text-base font-bold">
                        {formatFXPrice(getBuyPriceUSD())}
                      </div>
                    ) : (
                      <div className="text-base font-bold">
                        ₹{formatPrice(activeTab === 'market' ? (currentSymbol?.buy || 0) : (orderData.price || currentSymbol?.buy || 0))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Chart Modal */}
      <ChartModal
        isOpen={isChartModalOpen}
        onClose={() => setIsChartModalOpen(false)}
        symbol={currentSymbol?.SymbolName || currentSymbol}
      />
    </div>
  );
};

export default OrderModal;
