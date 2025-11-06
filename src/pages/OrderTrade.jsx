import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowLeft, AlertCircle } from 'lucide-react';
import { tradingAPI } from '../services/api';

// Load Lightweight Charts from CDN once (standalone exposes window.LightweightCharts)
function useLightweightCharts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.LightweightCharts) { setReady(true); return; }
    const scriptId = 'lw-charts-standalone';
    if (document.getElementById(scriptId)) return;
    const s = document.createElement('script');
    s.id = scriptId;
    s.src = 'https://unpkg.com/lightweight-charts@4.2.1/dist/lightweight-charts.standalone.production.js';
    s.async = true;
    s.onload = () => setReady(true);
    s.onerror = () => console.error('Failed to load lightweight-charts');
    document.body.appendChild(s);
  }, []);
  return ready && !!window.LightweightCharts;
}

const floorToMinute = (tsSec) => tsSec - (tsSec % 60);

export default function OrderTrade() {
  const navigate = useNavigate();
  const { token } = useParams();
  const location = useLocation();
  const initialSymbol = location.state?.symbol || null;

  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : { UserId: 'demo123', Refid: 'ref123' };
  });

  const [symbol, setSymbol] = useState(initialSymbol);
  const [userBalance, setUserBalance] = useState({
    ledgerBalance: 0,
    marginAvailable: 0,
    activePL: 0,
    m2m: 0
  });

  const [activeTab, setActiveTab] = useState('market');
  const [orderData, setOrderData] = useState({
    lotSize: 1,
    stopLoss: '',
    takeProfit: '',
    price: '',
    orderType: 'BUY'
  });
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const chartsReady = useLightweightCharts();
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const wsRef = useRef(null);
  const lastBarRef = useRef(null);

  // Initialize symbol if not provided via state
  useEffect(() => {
    if (!symbol && token) {
      const storedScript = localStorage.getItem('selected_script');
      const storedLot = localStorage.getItem('selectedlotsize');
      const exchange = localStorage.getItem('selected_exchange') || 'MCX';
      setSymbol({
        SymbolToken: token,
        SymbolName: storedScript || `TOKEN_${token}`,
        Lotsize: storedLot || 1,
        ExchangeType: exchange,
        buy: 0,
        sell: 0
      });
    }
  }, [symbol, token]);

  // Load user balance on mount
  useEffect(() => {
    const loadBalance = async () => {
      try {
        setLoading(true);
        const balance = await tradingAPI.getLedgerBalance(user.UserId);
        setUserBalance({
          ledgerBalance: balance,
          marginAvailable: balance,
          activePL: 0,
          m2m: balance
        });
      } catch (e) {
        setError('Failed to load account balance');
      } finally {
        setLoading(false);
      }
    };
    if (user?.UserId) loadBalance();
  }, [user?.UserId]);

  // Create chart once library is ready
  useEffect(() => {
    if (!chartsReady || !containerRef.current || chartRef.current) return;
    const { createChart } = window.LightweightCharts;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 260,
      layout: { background: { color: '#0b1220' }, textColor: '#fff' },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } }
    });
    if (!chart || typeof chart.addCandlestickSeries !== 'function') {
      console.error('Chart API not available');
      return;
    }
    const series = chart.addCandlestickSeries();
    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => chart.applyOptions({ width: containerRef.current.clientWidth });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      try { chart.remove(); } catch {}
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartsReady]);

  // Subscribe to WS for this token and build 1m candles
  useEffect(() => {
    if (!symbol?.SymbolToken || !seriesRef.current) return;
    const uri = 'wss://ws.tradewingss.com/api/webapiwebsoc';
    const ws = new WebSocket(uri);
    wsRef.current = ws;

    ws.onopen = () => {
      try { ws.send(symbol.SymbolToken.toString()); } catch {}
    };
    ws.onmessage = (event) => {
      const raw = event.data;
      if (!raw || raw === '' || raw === 'true') return;
      let tick = null;
      try { tick = JSON.parse(raw); } catch {
        // fallback: take first JSON object
        let depth = 0, buf = '';
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (ch === '{') depth++;
          if (depth > 0) buf += ch;
          if (ch === '}') { depth--; if (depth === 0) break; }
        }
        try { tick = buf ? JSON.parse(buf) : null; } catch {}
      }
      if (!tick || tick.instrument_token?.toString() !== symbol.SymbolToken?.toString()) return;

      const price = parseFloat(tick.last_price);
      const tsSec = Math.floor((tick.timestamp || Date.now()) / 1000);
      const bucket = floorToMinute(tsSec);
      if (!lastBarRef.current || lastBarRef.current.time !== bucket) {
        const newBar = { time: bucket, open: price, high: price, low: price, close: price };
        lastBarRef.current = newBar;
        seriesRef.current.update(newBar);
      } else {
        const bar = lastBarRef.current;
        bar.high = Math.max(bar.high, price);
        bar.low = Math.min(bar.low, price);
        bar.close = price;
        seriesRef.current.update(bar);
      }
    };
    ws.onclose = () => { wsRef.current = null; };
    ws.onerror = () => {};

    return () => { try { ws.close(); } catch {} };
  }, [symbol?.SymbolToken, chartsReady]);

  const handleInputChange = (field, value) => {
    setOrderData(prev => ({ ...prev, [field]: value }));
    setError('');
    setSuccess('');
  };

  const formatPrice = (p) => parseFloat(p || 0).toFixed(2);
  const getCurrentPrice = () => {
    if (!symbol) return 0;
    return orderData.orderType === 'BUY' ? symbol.buy : symbol.sell;
  };

  const calculateMargin = () => {
    if (!symbol || !orderData.lotSize) return 0;
    const lotSize = parseInt(orderData.lotSize) || 0;
    if (lotSize < 1) return 0;
    const price = activeTab === 'market' ? (orderData.orderType === 'BUY' ? symbol?.buy : symbol?.sell) : parseFloat(orderData.price) || 0;
    let marginvalue = 0;
    const exchtype = symbol?.ExchangeType || 'MCX';
    const Intraday_Exposure_Margin_MCX = localStorage.getItem('Intraday_Exposure_Margin_MCX');
    const Intraday_Exposure_Margin_Equity = localStorage.getItem('Intraday_Exposure_Margin_Equity');
    const Intraday_Exposure_Margin_CDS = localStorage.getItem('Intraday_Exposure_Margin_CDS');
    const MCX_Exposure_Type = localStorage.getItem('Mcx_Exposure_Type');
    const NSE_Exposure_Type = localStorage.getItem('NSE_Exposure_Type');
    const CDS_Exposure_Type = localStorage.getItem('CDS_Exposure_Type');
    if (exchtype === 'MCX') {
      if (MCX_Exposure_Type && MCX_Exposure_Type.includes('per_lot')) {
        const symarr = (symbol.SymbolName || '').split('_');
        const similersym = symarr[0]?.toString().trim();
        const Intraday_Exposure = localStorage.getItem('MCX_Exposure_Lot_wise_' + similersym + '_Intraday');
        marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure || 0);
      } else {
        const finallotsize = (parseInt(lotSize) * parseInt(symbol?.Lotsize || 1));
        marginvalue = (parseInt(price) * finallotsize) / parseInt(Intraday_Exposure_Margin_MCX || 10);
      }
    } else if (exchtype === 'NSE') {
      if (NSE_Exposure_Type === 'per_lot') {
        marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure_Margin_Equity || 0);
      } else {
        const finallotsize = (parseInt(lotSize) * parseInt(symbol?.Lotsize || 1));
        marginvalue = (parseInt(price) * finallotsize) / parseInt(Intraday_Exposure_Margin_Equity || 10);
      }
    } else {
      if (CDS_Exposure_Type === 'per_lot') {
        marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure_Margin_CDS || 0);
      } else {
        const finallotsize = (parseInt(lotSize) * parseInt(symbol?.Lotsize || 1));
        marginvalue = (parseInt(price) * finallotsize) / parseInt(Intraday_Exposure_Margin_CDS || 10);
      }
    }
    return marginvalue;
  };

  const placeOrder = async () => {
    if (!symbol) { setError('No symbol selected'); return; }
    const lotSize = parseInt(orderData.lotSize) || 0;
    if (lotSize < 1) { setError('Lot size must be at least 1'); return; }
    if (activeTab === 'limit' && !orderData.price) { setError('Price is required for limit orders'); return; }

    setOrderLoading(true);
    setError('');
    setSuccess('');
    try {
      let marginvalue = 0; let holdmarginvalue = 0; let finallotsize = 0;
      const exchtype = symbol.ExchangeType || 'MCX';
      const orderprice = activeTab === 'market' ? (orderData.orderType === 'BUY' ? symbol.buy : symbol.sell) : parseFloat(orderData.price);
      const Intraday_Exposure_Margin_MCX = localStorage.getItem('Intraday_Exposure_Margin_MCX');
      const Holding_Exposure_Margin_MCX = localStorage.getItem('Holding_Exposure_Margin_MCX');
      const Intraday_Exposure_Margin_Equity = localStorage.getItem('Intraday_Exposure_Margin_Equity');
      const Holding_Exposure_Margin_Equity = localStorage.getItem('Holding_Exposure_Margin_Equity');
      const Intraday_Exposure_Margin_CDS = localStorage.getItem('Intraday_Exposure_Margin_CDS');
      const Holding_Exposure_Margin_CDS = localStorage.getItem('Holding_Exposure_Margin_CDS');
      const MCX_Exposure_Type = localStorage.getItem('Mcx_Exposure_Type');
      const NSE_Exposure_Type = localStorage.getItem('NSE_Exposure_Type');
      const CDS_Exposure_Type = localStorage.getItem('CDS_Exposure_Type');

      if (exchtype === 'MCX') {
        if (MCX_Exposure_Type && MCX_Exposure_Type.includes('per_lot')) {
          const symarr = (symbol.SymbolName || '').split('_');
          const similersym = symarr[0]?.toString().trim();
          const Intraday_Exposure = localStorage.getItem('MCX_Exposure_Lot_wise_' + similersym + '_Intraday');
          const Intraday_hold_Exposure = localStorage.getItem('MCX_Exposure_Lot_wise_' + similersym + '_Holding');
          marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure || 0);
          holdmarginvalue = parseInt(lotSize) * parseInt(Intraday_hold_Exposure || 0);
        } else {
          finallotsize = (parseInt(lotSize) * parseInt(symbol.Lotsize || 1));
          marginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Intraday_Exposure_Margin_MCX || 10);
          holdmarginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Holding_Exposure_Margin_MCX || 10);
        }
      } else if (exchtype === 'NSE') {
        if (NSE_Exposure_Type === 'per_lot') {
          marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure_Margin_Equity || 0);
          holdmarginvalue = parseInt(lotSize) * parseInt(Holding_Exposure_Margin_Equity || 0);
        } else {
          finallotsize = (parseInt(lotSize) * parseInt(symbol.Lotsize || 1));
          marginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Intraday_Exposure_Margin_Equity || 10);
          holdmarginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Holding_Exposure_Margin_Equity || 10);
        }
      } else {
        if (CDS_Exposure_Type === 'per_lot') {
          marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure_Margin_CDS || 0);
          holdmarginvalue = parseInt(lotSize) * parseInt(Holding_Exposure_Margin_CDS || 0);
        } else {
          finallotsize = (parseInt(lotSize) * parseInt(symbol.Lotsize || 1));
          marginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Intraday_Exposure_Margin_CDS || 10);
          holdmarginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Holding_Exposure_Margin_CDS || 10);
        }
      }

      const marginAvailable = parseFloat(userBalance.marginAvailable || 0);
      if (parseInt(marginvalue) > parseInt(marginAvailable)) {
        setError('Insufficient margin available. Please reduce lot size.');
        setOrderLoading(false);
        return;
      }

      let isstoplossorder = '';
      if (activeTab === 'order') {
        const bid = symbol.sell || 0; const ask = symbol.buy || 0;
        if (orderData.orderType === 'SELL') {
          isstoplossorder = parseFloat(orderprice) > parseFloat(bid) ? 'false' : 'true';
        } else {
          isstoplossorder = parseFloat(orderprice) > parseFloat(ask) ? 'true' : 'false';
        }
      }

      const actualLotSize = localStorage.getItem('SymbolLotSize') || symbol.Lotsize || 1;
      const orderPayload = {
        Id: '', OrderDate: '', OrderTime: '', actualLot: actualLotSize.toString(), selectedlotsize: (parseInt(orderData.lotSize)||1).toString(), OrderNo: '',
        UserId: localStorage.getItem('userid') || user.UserId,
        UserName: localStorage.getItem('ClientName') || user.UserName || user.UserId,
        OrderCategory: orderData.orderType,
        OrderType: activeTab === 'market' ? 'Market' : (isstoplossorder === 'true' ? 'S/L' : 'Limit'),
        ScriptName: symbol.SymbolName,
        TokenNo: symbol.SymbolToken,
        ActionType: activeTab === 'market' ? (orderData.orderType === 'BUY' ? 'Bought By Trader' : 'Sold By Trader') : 'Order Placed @@',
        OrderPrice: orderprice.toString(),
        Lot: (parseInt(orderData.lotSize)||1).toString(),
        MarginUsed: Math.round(marginvalue).toString(),
        HoldingMarginReq: Math.round(holdmarginvalue).toString(),
        OrderStatus: activeTab === 'market' ? 'Active' : 'Pending',
        SymbolType: symbol.ExchangeType === 'CDS' ? 'OPT' : (symbol.ExchangeType || 'MCX'),
        isstoplossorder: activeTab === 'order' ? isstoplossorder : '',
        isedit: 'false'
      };

      let canTrade;
      if (activeTab === 'order') {
        canTrade = await tradingAPI.checkBeforeTradeForPending(orderPayload);
      } else {
        canTrade = await tradingAPI.checkBeforeTrade(orderPayload);
      }
      if (canTrade !== 'true' && canTrade !== true) {
        setError(canTrade || 'Order validation failed');
        setOrderLoading(false);
        return;
      }

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
        actualLot: orderPayload.actualLot
      };

      const saveResponse = await tradingAPI.saveOrderByUser(savePayload);
      if (!saveResponse && saveResponse !== 'true') {
        setError('Failed to save order. Please try again.');
        setOrderLoading(false);
        return;
      }

      setSuccess('Order placed successfully!');
      setOrderLoading(false);
    } catch (e) {
      setError(e?.response?.data || e?.message || 'Failed to place order');
      setOrderLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-800">
        <button onClick={() => navigate(-1)} className="text-gray-300 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="font-semibold">
          {symbol?.SymbolName?.split('_')[0] || 'Place Order'}
        </div>
        <div className="ml-auto text-sm text-gray-400">Token: {token}</div>
      </div>

      {/* Chart */}
      <div className="px-3 pt-3">
        <div ref={containerRef} style={{ width: '100%', height: 260 }} />
        {!chartsReady && (
          <div className="text-xs text-gray-400 mt-1">Loading chart...</div>
        )}
      </div>

      {/* Account summary */}
      <div className="px-3 py-2 grid grid-cols-2 gap-2 text-xs bg-gray-800 border-t border-b border-gray-800 mt-3">
        <div className="text-center">
          <div className="text-gray-300">Ledger Balance</div>
          <div className="text-white font-semibold">₹{formatPrice(userBalance.ledgerBalance)}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-300">Margin Available</div>
          <div className="text-white font-semibold">₹{formatPrice(userBalance.marginAvailable)}</div>
        </div>
      </div>

      {/* Order form */}
      <div className="p-3 flex-1 overflow-y-auto">
        <div className="flex border-b border-gray-700 mb-3">
          <button
            onClick={() => setActiveTab('market')}
            className={`flex-1 py-2 px-2 text-xs font-medium ${activeTab === 'market' ? 'text-white bg-gray-700 border-b-2 border-blue-500' : 'text-gray-400'}`}
          >
            Market
          </button>
          <button
            onClick={() => setActiveTab('limit')}
            className={`flex-1 py-2 px-2 text-xs font-medium ${activeTab === 'limit' ? 'text-white bg-gray-700 border-b-2 border-blue-500' : 'text-gray-400'}`}
          >
            Limit
          </button>
        </div>

        <div className="mb-2">
          <label className="block text-gray-300 text-xs font-medium mb-1">Lot Size</label>
          <input
            type="number"
            min="1"
            max="999"
            value={orderData.lotSize}
            onChange={(e) => {
              const v = e.target.value; if (v === '' || v === '0') handleInputChange('lotSize',''); else handleInputChange('lotSize', parseInt(v)||'');
            }}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="text-gray-400 text-xs mt-1">Margin Required: ₹{formatPrice(calculateMargin())}</div>
        </div>

        {activeTab === 'limit' && (
          <div className="mb-2">
            <label className="block text-gray-300 text-xs font-medium mb-1">Price</label>
            <input
              type="number"
              step="0.01"
              value={orderData.price}
              onChange={(e) => handleInputChange('price', e.target.value)}
              placeholder="Enter price"
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-gray-300 text-xs font-medium mb-1">Stop Loss (Optional)</label>
            <input type="number" step="0.01" value={orderData.stopLoss} onChange={(e)=>handleInputChange('stopLoss', e.target.value)} placeholder="SL" className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-gray-300 text-xs font-medium mb-1">Take Profit (Optional)</label>
            <input type="number" step="0.01" value={orderData.takeProfit} onChange={(e)=>handleInputChange('takeProfit', e.target.value)} placeholder="TP" className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>

        {error && (
          <div className="mb-2 p-2 bg-red-900 border border-red-600 rounded flex items-center">
            <AlertCircle className="w-4 h-4 text-red-400 mr-1" />
            <span className="text-red-400 text-xs">{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-2 p-2 bg-green-900 border border-green-600 rounded text-green-400 text-xs">{success}</div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={() => handleInputChange('orderType','SELL')} className={`py-2 px-2 rounded text-xs font-medium ${orderData.orderType==='SELL'?'bg-red-600 text-white':'bg-gray-700 text-gray-300'}`}>
            <TrendingDown className="w-3 h-3 inline mr-1" />
            Sell @ ₹{formatPrice(orderData.orderType==='SELL'? getCurrentPrice(): orderData.price)}
          </button>
          <button onClick={() => handleInputChange('orderType','BUY')} className={`py-2 px-2 rounded text-xs font-medium ${orderData.orderType==='BUY'?'bg-green-600 text-white':'bg-gray-700 text-gray-300'}`}>
            <TrendingUp className="w-3 h-3 inline mr-1" />
            Buy @ ₹{formatPrice(orderData.orderType==='BUY'? getCurrentPrice(): orderData.price)}
          </button>
        </div>

        <button onClick={placeOrder} disabled={orderLoading || loading} className="w-full py-2 px-3 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {orderLoading ? 'Placing Order...' : `Place ${orderData.orderType} Order`}
        </button>
      </div>
    </div>
  );
}


