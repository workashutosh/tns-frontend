import React, { useState, useEffect } from 'react';
import { Search, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { tradingAPI } from '../services/api';
import toast from 'react-hot-toast';

const MarketWatch = ({ user }) => {
  const [activeExchange, setActiveExchange] = useState('MCX');
  const [searchQuery, setSearchQuery] = useState('');
  const [marketData, setMarketData] = useState({});
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [loading, setLoading] = useState(false);

  const exchanges = [
    { id: 'MCX', name: 'MCX Futures' },
    { id: 'NSE', name: 'NSE Futures' },
    { id: 'CDS', name: 'OPTION' }
  ];

  useEffect(() => {
    if (user?.UserId) {
      fetchMarketData();
      fetchSelectedTokens();
    }
  }, [user, activeExchange]);

  const fetchMarketData = async () => {
    setLoading(true);
    try {
      // Fetch symbols for the active exchange
      const response = await tradingAPI.getSymbols(activeExchange, searchQuery || 'null');
      setMarketData(response);
    } catch (error) {
      console.error('Error fetching market data:', error);
      toast.error('Failed to fetch market data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSelectedTokens = async () => {
    try {
      const response = await tradingAPI.getSelectedTokens(user.UserId, activeExchange.toLowerCase());
      setSelectedSymbols(response);
    } catch (error) {
      console.error('Error fetching selected tokens:', error);
    }
  };

  const handleSymbolToggle = async (token, symbolName, lotSize) => {
    try {
      if (selectedSymbols.some(s => s.SymbolToken === token)) {
        // Remove symbol
        await tradingAPI.deleteToken(token, user.UserId);
        setSelectedSymbols(prev => prev.filter(s => s.SymbolToken !== token));
        toast.success('Symbol removed from watchlist');
      } else {
        // Add symbol
        await tradingAPI.saveToken(symbolName, token, user.UserId, activeExchange, lotSize);
        await fetchSelectedTokens();
        toast.success('Symbol added to watchlist');
      }
    } catch (error) {
      console.error('Error toggling symbol:', error);
      toast.error('Failed to update watchlist');
    }
  };

  const renderMarketCard = (symbol) => {
    const isSelected = selectedSymbols.some(s => s.SymbolToken === symbol.instrument_token);
    const changeColor = parseFloat(symbol.change || 0) >= 0 ? 'text-green-600' : 'text-red-600';
    
    return (
      <div key={symbol.instrument_token} className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 mb-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">{symbol.name}</h3>
            <p className="text-sm text-gray-600">{symbol.tradingsymbol}</p>
            <p className="text-xs text-gray-500">{symbol.expiry}</p>
          </div>
          <button
            onClick={() => handleSymbolToggle(symbol.instrument_token, symbol.tradingsymbol, symbol.lot_size)}
            className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
              isSelected 
                ? 'bg-blue-600 border-blue-600 text-white' 
                : 'border-gray-300 hover:border-blue-500'
            }`}
          >
            {isSelected && <div className="w-2 h-2 bg-white rounded-full"></div>}
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Bid</p>
            <p className="font-semibold text-gray-900" id={`bid${symbol.instrument_token}`}>
              {symbol.last_price || '0'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Ask</p>
            <p className="font-semibold text-gray-900" id={`ask${symbol.instrument_token}`}>
              {symbol.last_price || '0'}
            </p>
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500">Change</p>
              <p className={`font-medium ${changeColor}`} id={`chg${symbol.instrument_token}`}>
                {symbol.change || '0.00'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">LTP</p>
              <p className="font-medium text-gray-900" id={`ltp${symbol.instrument_token}`}>
                {symbol.last_price || '0'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Lot Size</p>
              <p className="font-medium text-gray-900">{symbol.lot_size}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-gray-900">MarketWatch</h1>
            <button className="p-2 bg-blue-600 text-white rounded-lg">
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Exchange Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex">
          {exchanges.map((exchange) => (
            <button
              key={exchange.id}
              onClick={() => setActiveExchange(exchange.id)}
              className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeExchange === exchange.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {exchange.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white px-6 py-4 border-b border-gray-200">
        <div className="flex items-center bg-gray-50 rounded-lg px-4 py-3">
          <input
            type="text"
            placeholder="Search Symbol"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-gray-700"
          />
          <Search className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Market Data */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div>
            {marketData && Array.isArray(marketData) ? (
              marketData.map(renderMarketCard)
            ) : (
              <div className="text-center py-12">
                <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No market data available</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketWatch;
