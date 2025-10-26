import axios from 'axios';

// Base API URL - always use production API
const API_BASE_URL = 'https://www.tradenstocko.com/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any auth tokens here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// API methods
export const authAPI = {
  // Login user
  login: async (username, password, deviceId, refIdByUser, refIdForMatch) => {
    try {
      const response = await api.get('/checklogin/', {
        params: {
          username,
          password,
          deviceid: deviceId,
          refidbyuser: refIdByUser,
          refidformatch: refIdForMatch
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user profile
  getUserProfile: async (userId) => {
    try {
      const response = await api.get('/userprofile/', {
        params: { userid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Refresh user data
  refreshData: async (userId, deviceIp) => {
    try {
      const response = await api.get('/refreshdata/', {
        params: { 
          userid: userId,
          devip: deviceIp 
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Check user count
  getUserCount: async (userId) => {
    try {
      const response = await api.get('/getusercount/', {
        params: { userid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Register user
  register: async (userData) => {
    try {
      const response = await api.post('/Register/', userData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export const tradingAPI = {
  // Get market time
  getMarketTime: async (exchange, refId) => {
    try {
      const response = await api.get('/getmarkettime/', {
        params: {
          Exchange: exchange,
          refid: refId
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get ledger balance
  getLedgerBalance: async (userId) => {
    try {
      const response = await api.get('/getledgerbalance/', {
        params: { uid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get all orders
  getAllOrders: async (userId) => {
    try {
      const response = await api.get('/getallorders/', {
        params: { uid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get orders by status
  getOrders: async (orderStatus, userId) => {
    try {
      const response = await api.get('/getorders/', {
        params: {
          orderstatus: orderStatus,
          uid: userId
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get single market data
  getSingleMarketData: async (token) => {
    try {
      const response = await api.get('/getsinglemarketdata/', {
        params: { token }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get MCX symbols
  getSymbols: async (exchangeType, searchKey, refId) => {
    try {
      const response = await api.get('/getMCXsymbols/', {
        params: {
          extype: exchangeType,
          searchkey: searchKey || 'null',
          refid: refId
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get selected tokens for user
  getSelectedTokens: async (userId, exchange) => {
    try {
      const response = await api.get('/getselectedtoken/', {
        params: {
          cid: userId,
          exch: exchange
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Save token to user's watchlist
  saveToken: async (symbolName, token, userId, exchangeType, lotSize) => {
    try {
      const response = await api.get('/savetoken/', {
        params: {
          symbolname: symbolName,
          token: token,
          userid: userId,
          exchangetype: exchangeType,
          lotsize: lotSize
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete token from user's watchlist
  deleteToken: async (token, userId) => {
    try {
      const response = await api.get('/deletetoken/', {
        params: {
          token: token,
          userid: userId
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get consolidated trades
  getConsolidatedTrades: async (userId) => {
    try {
      const response = await api.get('/getconsolidatedtrade/', {
        params: { uid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Place market order
  placeMarketOrder: async (orderData) => {
    try {
      const response = await api.post('/placeorder/', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Place limit order
  placeLimitOrder: async (orderData) => {
    try {
      const response = await api.post('/placependingorder/', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Cancel order
  cancelOrder: async (orderId, userId) => {
    try {
      const response = await api.get('/cancelorder/', {
        params: {
          orderid: orderId,
          uid: userId
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Modify order
  modifyOrder: async (orderData) => {
    try {
      const response = await api.post('/modifyorder/', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user balance and margin
  getUserBalance: async (userId) => {
    try {
      const response = await api.get('/getuserbalance/', {
        params: { uid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Save SL/TP for order
  saveSLTP: async (tradeId, sl, tp) => {
    try {
      const response = await api.post('/savesltp/', {
        TradeId: tradeId,
        SL: sl || "0",
        TP: tp || "0"
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Check before trade (validation)
  checkBeforeTrade: async (orderData) => {
    try {
      const response = await api.get('/checkbeforetrade/', {
        params: orderData
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Check before trade for pending orders
  checkBeforeTradeForPending: async (orderData) => {
    try {
      const response = await api.get('/checkbeforetradeForPending/', {
        params: orderData
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Save orders
  saveOrders: async (orderData) => {
    try {
      const response = await api.get('/saveorders/', {
        params: orderData
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user closed orders
  getUserClosedOrders: async (userId) => {
    try {
      const response = await api.post('/getuserclosedorders/', null, {
        params: { UserId: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get net P/L
  getNetPL: async (userId) => {
    try {
      const response = await api.post('/getnetpl/', null, {
        params: { UserId: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Close trade from portfolio
  closeTradeFromPortfolio: async (userId, orderCategory, tokenNo, cmpValue) => {
    try {
      const response = await api.get('/closetrade_from_account_portfolio/', {
        params: {
          userid: userId,
          ordercat: orderCategory,
          tokenno: tokenNo,
          cmpval: cmpValue
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Set Stop Loss and Take Profit
  setSLTP: async (orderId, stopLossPrice, takeProfitPrice) => {
    try {
      const response = await api.post('/setsltp/', {
        orderId: orderId,
        stopLossPrice: stopLossPrice,
        takeProfitPrice: takeProfitPrice
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update order (close trade)
  updateOrder: async (lp, brokerage, broughtBy, closedAt, orderNo, uid, orderType, tokenNo) => {
    try {
      const response = await api.get('/updateorder/', {
        params: {
          lp,
          brokerage,
          BroughtBy: broughtBy,
          ClosedAt: closedAt,
          orderno: orderNo,
          uid,
          ordertype: orderType,
          tokenno: tokenNo
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete order (cancel order)
  deleteOrder: async (orderId) => {
    try {
      const response = await api.get('/deleteorder/', {
        params: { orderid: orderId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get SL/TP orders
  getSLTP: async (userId) => {
    try {
      const response = await api.get('/getsltp/', {
        params: { UserId: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete SL/TP order
  deleteSLTP: async (tradeId) => {
    try {
      const response = await api.post('/deletesltp/', {
        TradeId: tradeId
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Cancel all orders by exchange
  cancelAllOrdersByApp: async (userId, symbolType) => {
    try {
      const response = await api.get('/canceleallorderfromapp/', {
        params: { 
          UserId: userId, 
          SymbolType: symbolType 
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Close all trades by app
  closeAllTradesByApp: async (orderData) => {
    try {
      const response = await api.post('/closealltradesbyapp/', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default api;
