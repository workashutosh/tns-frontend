import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Clock, AlertCircle } from 'lucide-react';
import { tradingAPI } from '../services/api';

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
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load user balance and active orders when modal opens
  useEffect(() => {
    if (isOpen && user?.UserId) {
      loadUserBalance();
      loadActiveOrders();
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
    }
  }, [isOpen]);

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

  const loadActiveOrders = async () => {
    try {
      const orders = await tradingAPI.getConsolidatedTrades(user.UserId);
      setActiveOrders(orders);
    } catch (error) {
      console.error('Error loading active orders:', error);
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
    if (!symbol) {
      setError('No symbol selected');
      return false;
    }

    const lotSize = parseInt(orderData.lotSize) || 0;
    if (!orderData.lotSize || lotSize < 1) {
      setError('Lot size must be at least 1');
      return false;
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
    if (!symbol || !orderData.lotSize) return 0;
    
    const lotSize = parseInt(orderData.lotSize) || 0;
    if (lotSize < 1) return 0;
    
    const price = activeTab === 'market' 
      ? (orderData.orderType === 'BUY' ? symbol.buy : symbol.sell)
      : parseFloat(orderData.price) || 0;
    
    // Use the same margin calculation logic as placeOrder
    let marginvalue = 0;
    const exchtype = symbol.ExchangeType || 'MCX';
    
    // Get exposure margins from localStorage
    const Intraday_Exposure_Margin_MCX = localStorage.getItem("Intraday_Exposure_Margin_MCX");
    const Intraday_Exposure_Margin_Equity = localStorage.getItem("Intraday_Exposure_Margin_Equity");
    const Intraday_Exposure_Margin_CDS = localStorage.getItem("Intraday_Exposure_Margin_CDS");
    
    // Get exposure types
    const MCX_Exposure_Type = localStorage.getItem("Mcx_Exposure_Type");
    const NSE_Exposure_Type = localStorage.getItem("NSE_Exposure_Type");
    const CDS_Exposure_Type = localStorage.getItem("CDS_Exposure_Type");
    
    if (exchtype === 'MCX') {
      if (MCX_Exposure_Type && MCX_Exposure_Type.includes("per_lot")) {
        const symbolname = symbol.SymbolName;
        const symarr = symbolname.split("_");
        const similersym = symarr[0]?.toString().trim();
        const Intraday_Exposure = localStorage.getItem("MCX_Exposure_Lot_wise_" + similersym + "_Intraday");
        marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure || 0);
      } else {
        const finallotsize = (parseInt(lotSize) * parseInt(symbol.Lotsize || 1));
        marginvalue = (parseInt(price) * finallotsize) / parseInt(Intraday_Exposure_Margin_MCX || 10);
      }
    } else if (exchtype === 'NSE') {
      if (NSE_Exposure_Type === "per_lot") {
        marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure_Margin_Equity || 0);
      } else {
        const finallotsize = (parseInt(lotSize) * parseInt(symbol.Lotsize || 1));
        marginvalue = (parseInt(price) * finallotsize) / parseInt(Intraday_Exposure_Margin_Equity || 10);
      }
    } else {
      if (CDS_Exposure_Type === "per_lot") {
        marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure_Margin_CDS || 0);
      } else {
        const finallotsize = (parseInt(lotSize) * parseInt(symbol.Lotsize || 1));
        marginvalue = (parseInt(price) * finallotsize) / parseInt(Intraday_Exposure_Margin_CDS || 10);
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

  const placeOrder = async () => {
    if (!validateOrder()) return;

    setOrderLoading(true);
    setError('');
    setSuccess('');

    try {
      const lotSize = parseInt(orderData.lotSize) || 1;
      
      // Calculate margin exactly like original CSHTML implementation
      let marginvalue = 0;
      let holdmarginvalue = 0;
      let finallotsize = 0;
      
      const exchtype = symbol.ExchangeType || 'MCX';
      const orderprice = activeTab === 'market' ? 
        (orderData.orderType === 'BUY' ? symbol.buy : symbol.sell) : 
        parseFloat(orderData.price);
      
      // Get exposure margins from localStorage (exactly like original)
      const Intraday_Exposure_Margin_MCX = localStorage.getItem("Intraday_Exposure_Margin_MCX");
      const Holding_Exposure_Margin_MCX = localStorage.getItem("Holding_Exposure_Margin_MCX");
      const Intraday_Exposure_Margin_Equity = localStorage.getItem("Intraday_Exposure_Margin_Equity");
      const Holding_Exposure_Margin_Equity = localStorage.getItem("Holding_Exposure_Margin_Equity");
      const Intraday_Exposure_Margin_CDS = localStorage.getItem("Intraday_Exposure_Margin_CDS");
      const Holding_Exposure_Margin_CDS = localStorage.getItem("Holding_Exposure_Margin_CDS");
      
      // Get exposure types
      const MCX_Exposure_Type = localStorage.getItem("Mcx_Exposure_Type");
      const NSE_Exposure_Type = localStorage.getItem("NSE_Exposure_Type");
      const CDS_Exposure_Type = localStorage.getItem("CDS_Exposure_Type");
      
      // Margin calculation logic exactly like original
      if (exchtype === 'MCX') {
        if (MCX_Exposure_Type && MCX_Exposure_Type.includes("per_lot")) {
          // Per lot calculation
          const symbolname = symbol.SymbolName;
          const symarr = symbolname.split("_");
          const similersym = symarr[0]?.toString().trim();
          const Intraday_Exposure = localStorage.getItem("MCX_Exposure_Lot_wise_" + similersym + "_Intraday");
          const Intraday_hold_Exposure = localStorage.getItem("MCX_Exposure_Lot_wise_" + similersym + "_Holding");
          marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure || 0);
          holdmarginvalue = parseInt(lotSize) * parseInt(Intraday_hold_Exposure || 0);
        } else {
          // Percentage calculation
          finallotsize = (parseInt(lotSize) * parseInt(symbol.Lotsize || 1));
          marginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Intraday_Exposure_Margin_MCX || 10);
          holdmarginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Holding_Exposure_Margin_MCX || 10);
        }
      } else if (exchtype === 'NSE') {
        if (NSE_Exposure_Type === "per_lot") {
          marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure_Margin_Equity || 0);
          holdmarginvalue = parseInt(lotSize) * parseInt(Holding_Exposure_Margin_Equity || 0);
        } else {
          finallotsize = (parseInt(lotSize) * parseInt(symbol.Lotsize || 1));
          marginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Intraday_Exposure_Margin_Equity || 10);
          holdmarginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Holding_Exposure_Margin_Equity || 10);
        }
      } else {
        // CDS/OPT
        if (CDS_Exposure_Type === "per_lot") {
          marginvalue = parseInt(lotSize) * parseInt(Intraday_Exposure_Margin_CDS || 0);
          holdmarginvalue = parseInt(lotSize) * parseInt(Holding_Exposure_Margin_CDS || 0);
        } else {
          finallotsize = (parseInt(lotSize) * parseInt(symbol.Lotsize || 1));
          marginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Intraday_Exposure_Margin_CDS || 10);
          holdmarginvalue = (parseInt(orderprice) * finallotsize) / parseInt(Holding_Exposure_Margin_CDS || 10);
        }
      }
      
      // Prepare order payload exactly like the original
      const orderPayload = {
        Id: '',
        OrderDate: '',
        OrderTime: '',
        actualLot: symbol.Lotsize || 1,
        selectedlotsize: lotSize,
        OrderNo: '',
        UserId: localStorage.getItem("userid") || user.UserId,
        UserName: localStorage.getItem("ClientName") || user.UserName || user.UserId,
        OrderCategory: orderData.orderType,
        OrderType: activeTab === 'market' ? 'Market' : 'Limit',
        ScriptName: symbol.SymbolName,
        TokenNo: symbol.SymbolToken,
        ActionType: activeTab === 'market' ? 
          (orderData.orderType === 'BUY' ? 'Bought By Trader' : 'Sold By Trader') : 
          'Order Placed @@',
        OrderPrice: orderprice,
        Lot: lotSize,
        MarginUsed: Math.round(marginvalue),
        HoldingMarginReq: Math.round(holdmarginvalue),
        OrderStatus: activeTab === 'market' ? 'Active' : 'Pending',
        SymbolType: exchtype === 'CDS' ? 'OPT' : exchtype
      };

      // Step 1: Check before trade (exactly like original)
      console.log('Checking before trade with payload:', orderPayload);
      const canTrade = await tradingAPI.checkBeforeTrade(orderPayload);
      console.log('Check before trade response:', canTrade);
      
      if (canTrade !== 'true') {
        setError(canTrade);
        return;
      }

      // Step 2: Save the order (exactly like original)
      console.log('Saving order with payload:', orderPayload);
      const saveResponse = await tradingAPI.saveOrders(orderPayload);
      console.log('Save order response:', saveResponse);
      
      setSuccess(`Order placed successfully!`);

      // Step 3: Create SL/TP if provided (exactly like original)
      if (orderData.stopLoss || orderData.takeProfit) {
        await createSLTPForNewOrder(
          symbol.SymbolToken,
          symbol.SymbolName,
          orderData.orderType,
          orderData.stopLoss,
          orderData.takeProfit
        );
      }

      // Call callback to refresh data
      if (onOrderPlaced) {
        onOrderPlaced();
      }

      // Close modal after 2 seconds
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
    } finally {
      setOrderLoading(false);
    }
  };

  const getCurrentPrice = () => {
    if (!symbol) return 0;
    return orderData.orderType === 'BUY' ? symbol.buy : symbol.sell;
  };

  const formatPrice = (price) => {
    return parseFloat(price || 0).toFixed(2);
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

        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <div className="p-2 bg-gray-600">
            <div className="text-xs text-gray-300 mb-1">Active Orders:</div>
            <div className="text-xs text-white">
              {activeOrders.map((order, index) => (
                <div key={index} className="flex justify-between">
                  <span>{order.ScriptName?.split('_')[0]}</span>
                  <span className={order.OrderCategory === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                    {order.OrderCategory} {order.Lot}@{order.OrderPrice}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Symbol Info */}
        <div className="p-2 text-center border-b border-gray-700">
          <h4 className="text-white font-semibold text-sm">
            {symbol?.SymbolName?.split('_')[0] || 'N/A'}
          </h4>
          <p className="text-gray-400 text-xs">
            Lot Size: {symbol?.Lotsize || 1} • Exchange: {symbol?.ExchangeType || 'MCX'}
          </p>
          <div className="mt-1">
            <button
              onClick={() => window.open(`#chart-${symbol?.SymbolToken}`, '_blank')}
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              📈 Open Chart
            </button>
          </div>
        </div>

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
              min="1"
              max="999"
              value={orderData.lotSize}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || value === '0') {
                  handleInputChange('lotSize', '');
                } else {
                  handleInputChange('lotSize', parseInt(value) || '');
                }
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
                Price
              </label>
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

          {/* Order Buttons */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => handleInputChange('orderType', 'SELL')}
              className={`py-2 px-2 rounded text-xs font-medium transition-colors ${
                orderData.orderType === 'SELL'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <TrendingDown className="w-3 h-3 inline mr-1" />
              Sell @ ₹{formatPrice(orderData.orderType === 'SELL' ? getCurrentPrice() : orderData.price)}
            </button>
            <button
              onClick={() => handleInputChange('orderType', 'BUY')}
              className={`py-2 px-2 rounded text-xs font-medium transition-colors ${
                orderData.orderType === 'BUY'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <TrendingUp className="w-3 h-3 inline mr-1" />
              Buy @ ₹{formatPrice(orderData.orderType === 'BUY' ? getCurrentPrice() : orderData.price)}
            </button>
          </div>

          {/* Place Order Button */}
          <button
            onClick={placeOrder}
            disabled={orderLoading || loading}
            className="w-full py-2 px-3 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {orderLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1"></div>
                Placing Order...
              </div>
            ) : (
              `Place ${orderData.orderType} Order`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderModal;
