import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { TrendingUp } from 'lucide-react';
import logo from '../assets/logo.svg';

const SplashScreen = ({ onFinish }) => {
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    // Simulate loading progress
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          setTimeout(() => onFinish(), 500);
          return 100;
        }
        return prev + 2;
      });
    }, 50);

    return () => clearInterval(progressInterval);
  }, [onFinish]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-dark-gradient relative overflow-hidden">
      {/* Animated background elements */}
      {/* <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-green-500/10 rounded-full animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full animate-pulse delay-500"></div>
      </div> */}

      {/* Logo Container with animation */}
      <div className="relative z-10 mb-8">
        <div className="w-24 h-24 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center mb-6 shadow-2xl border border-white/20">
          <img 
            src={logo} 
            alt="TradeStocko Logo" 
            className="w-20 h-20 rounded-lg object-contain"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          {/* Fallback if logo is not found */}
          <div className="w-20 h-20 bg-blue-600 rounded-lg flex items-center justify-center hidden">
            <TrendingUp className="w-10 h-10 text-white" />
          </div>
        </div>
        
     
      </div>
      
      {/* App Title with gradient text */}
      <div className="relative z-10 text-center mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent mb-2">
          TradeStocko
        </h1>
        <p className="text-gray-300 text-sm">Professional Trading Platform</p>
      </div>
      
      {/* Loading progress bar */}
      <div className="relative z-10 w-64 h-2 bg-white/20 rounded-full overflow-hidden mb-8">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${loadingProgress}%` }}
        ></div>
      </div>
      
      {/* Loading percentage */}
      <div className="relative z-10 text-white/80 text-sm font-mono">
        {loadingProgress}%
      </div>
      

    </div>
  );
};

SplashScreen.propTypes = {
  onFinish: PropTypes.func.isRequired,
};

export default SplashScreen;
