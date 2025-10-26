// Performance Monitoring Script
// This script helps identify slow API calls without breaking functionality

(function() {
    'use strict';
    
    // Store original jQuery ajax method
    var originalAjax = $.ajax;
    
    // Performance data storage
    window.performanceData = {
        slowCalls: [],
        failedCalls: [],
        totalCalls: 0
    };
    
    // Override jQuery ajax to add monitoring
    $.ajax = function(options) {
        var startTime = performance.now();
        window.performanceData.totalCalls++;
        
        // Add default timeout if not specified
        if (!options.timeout) {
            options.timeout = 10000; // 10 seconds default timeout
        }
        
        // Add error handling
        var originalError = options.error || function() {};
        options.error = function(xhr, status, error) {
            var duration = performance.now() - startTime;
            var callInfo = {
                url: options.url,
                method: options.type || 'GET',
                duration: Math.round(duration),
                status: xhr.status,
                error: error,
                timestamp: new Date().toISOString()
            };
            
            window.performanceData.failedCalls.push(callInfo);
            console.warn('Failed API Call:', callInfo);
            
            // Call original error handler
            originalError.apply(this, arguments);
        };
        
        // Add success monitoring
        var originalSuccess = options.success || function() {};
        options.success = function(data, status, xhr) {
            var duration = performance.now() - startTime;
            
            // Log slow calls (> 3 seconds)
            if (duration > 3000) {
                var callInfo = {
                    url: options.url,
                    method: options.type || 'GET',
                    duration: Math.round(duration),
                    status: xhr.status,
                    timestamp: new Date().toISOString()
                };
                
                window.performanceData.slowCalls.push(callInfo);
                console.warn('Slow API Call (>3s):', callInfo);
            }
            
            // Call original success handler
            originalSuccess.apply(this, arguments);
        };
        
        // Call original ajax
        return originalAjax.call(this, options);
    };
    
    // Function to get performance report
    window.getPerformanceReport = function() {
        var report = {
            totalCalls: window.performanceData.totalCalls,
            slowCalls: window.performanceData.slowCalls.length,
            failedCalls: window.performanceData.failedCalls.length,
            slowestCalls: window.performanceData.slowCalls.sort(function(a, b) {
                return b.duration - a.duration;
            }).slice(0, 10),
            failedCallDetails: window.performanceData.failedCalls
        };
        
        console.log('Performance Report:', report);
        return report;
    };
    
    // Auto-generate report every 30 seconds
    setInterval(function() {
        if (window.performanceData.totalCalls > 0) {
            var report = window.getPerformanceReport();
            if (report.slowCalls > 0 || report.failedCalls > 0) {
                console.log('Performance Issues Detected:', {
                    slowCalls: report.slowCalls,
                    failedCalls: report.failedCalls,
                    totalCalls: report.totalCalls
                });
            }
        }
    }, 30000);
    
    console.log('Performance Monitor initialized. Call getPerformanceReport() to see results.');
})();



