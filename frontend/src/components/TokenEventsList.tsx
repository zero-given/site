import { Component, createSignal, createMemo, onMount, createEffect, onCleanup } from 'solid-js';
import { createVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/solid-virtual';
import { TokenEventCard } from './TokenEventCard';
import { TokenTileCard } from './TokenTileCard';
import { Layout, List, LineChart, Activity, LayoutGrid } from 'lucide-solid';
import { TrendBadge } from './TrendBadge';
import type { Token, FilterState, ThemeColors } from '../types';

interface TokenEventsListProps {
  tokens: Token[];
  onColorsChange: (colors: ThemeColors) => void;
}

type SortField = 'age' | 'holders' | 'liquidity' | 'safetyScore';

const STORAGE_KEY = 'tokenListFilters';
const DYNAMIC_SCALING_KEY = 'chartDynamicScaling';

const getRiskScore = (token: Token): number => {
  switch (token.riskLevel) {
    case 'safe':
      return 2;
    case 'warning':
      return 1;
    case 'danger':
      return 0;
    default:
      return 0;
  }
};

export const TokenEventsList: Component<TokenEventsListProps> = (props) => {
  // Performance metrics
  const [fps, setFps] = createSignal(60);
  const [memory, setMemory] = createSignal(0);
  const [isConnected, setIsConnected] = createSignal(true);
  const [debugLogs, setDebugLogs] = createSignal<string[]>([]);

  // Add debug logging function
  const logDebug = (message: string) => {
    console.log(message);
    setDebugLogs(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  // Update performance metrics
  let lastTime = performance.now();
  let frame = 0;

  const updateMetrics = () => {
    const now = performance.now();
    frame++;
    
    if (now >= lastTime + 1000) {
      setFps(Math.round((frame * 1000) / (now - lastTime)));
      // Safely handle memory metrics
      const memoryInfo = (performance as any).memory;
      if (memoryInfo) {
        setMemory(Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024 * 100) / 100);
      }
      frame = 0;
      lastTime = now;
    }
    
    requestAnimationFrame(updateMetrics);
  };

  onMount(() => {
    updateMetrics();
  });

  const [expandedTokens, setExpandedTokens] = createSignal<Set<string>>(new Set());
  
  const toggleTokenExpansion = (tokenAddress: string) => {
    setExpandedTokens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tokenAddress)) {
        newSet.delete(tokenAddress);
      } else {
        newSet.add(tokenAddress);
      }
      return newSet;
    });
  };

  // Load saved filters from localStorage or use defaults
  const getSavedFilters = (): FilterState => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved filters:', e);
      }
    }
    return {
      minHolders: 0,
      minLiquidity: 0,
      hideHoneypots: false,
      showOnlyHoneypots: false,
      hideDanger: false,
      hideWarning: false,
      showOnlySafe: false,
      hideNotRenounced: false,
      hideUnlockedLiquidity: false,
      searchQuery: '',
      sortBy: 'age',
      sortDirection: 'desc',
      maxRecords: 50,
      hideStagnantHolders: false,
      hideStagnantLiquidity: false,
      stagnantRecordCount: 10
    };
  };

  const [filters, setFilters] = createSignal<FilterState>(getSavedFilters());

  // Memoized filtered and sorted tokens
  const filteredTokens = createMemo(() => {
    logDebug('TokenEventsList: Filtering tokens: ' + props.tokens.length);
    let result = [...props.tokens];
    const currentFilters = filters();

    // Apply filters
    result = result.filter(token => {
      if (currentFilters.hideHoneypots && token.hpIsHoneypot) return false;
      if (currentFilters.showOnlyHoneypots && !token.hpIsHoneypot) return false;
      if (currentFilters.hideDanger && token.riskLevel === 'danger') return false;
      if (currentFilters.hideWarning && token.riskLevel === 'warning') return false;
      if (currentFilters.showOnlySafe && token.riskLevel !== 'safe') return false;
      
      // New filters for ownership and liquidity
      if (currentFilters.hideNotRenounced && token.gpOwnerAddress !== '0x0000000000000000000000000000000000000000') return false;
      if (currentFilters.hideUnlockedLiquidity) {
        try {
          const lpHolders = JSON.parse(token.gpLpHolders || '[]');
          const totalLocked = lpHolders.reduce((acc: number, holder: any) => 
            acc + (holder.is_locked ? Number(holder.percent) * 100 : 0), 0
          );
          if (totalLocked < 90) return false;
        } catch {
          return false;
        }
      }
      
      // Apply min holders filter
      if (currentFilters.minHolders > 0 && token.gpHolderCount < currentFilters.minHolders) {
        logDebug(`Token ${token.tokenSymbol} filtered out by min holders (${token.gpHolderCount} < ${currentFilters.minHolders})`);
        return false;
      }
      
      // Apply min liquidity filter
      if (currentFilters.minLiquidity > 0 && token.hpLiquidityAmount < currentFilters.minLiquidity) {
        logDebug(`Token ${token.tokenSymbol} filtered out by min liquidity ($${token.hpLiquidityAmount} < $${currentFilters.minLiquidity})`);
        return false;
      }
      
      // Search query
      if (currentFilters.searchQuery) {
        const query = currentFilters.searchQuery.toLowerCase();
        const matches = (
          token.tokenName.toLowerCase().includes(query) ||
          token.tokenSymbol.toLowerCase().includes(query) ||
          token.tokenAddress.toLowerCase().includes(query)
        );
        if (!matches) {
          logDebug(`Token ${token.tokenSymbol} filtered out by search query "${currentFilters.searchQuery}"`);
        }
        return matches;
      }
      
      return true;
    });

    // Apply sorting
    result.sort((a, b) => {
      const sortBy = currentFilters.sortBy;
      let direction = -1; // Default to descending
      let field: SortField = 'age'; // Default field

      // Check if it's an ascending sort
      if (sortBy.endsWith('_asc')) {
        direction = 1;
        field = sortBy.replace('_asc', '') as SortField;
      } else {
        field = sortBy as SortField;
      }
      
      switch (field) {
        case 'age':
          return (b.tokenAgeHours - a.tokenAgeHours) * direction;
        case 'holders':
          return (a.gpHolderCount - b.gpHolderCount) * direction;
        case 'liquidity':
          return (a.hpLiquidityAmount - b.hpLiquidityAmount) * direction;
        case 'safetyScore':
          const scoreA = getRiskScore(a);
          const scoreB = getRiskScore(b);
          return (scoreA - scoreB) * direction;
        default:
          return 0;
      }
    });

    logDebug('TokenEventsList: Filtered tokens: ' + result.length);
    return result.slice(0, currentFilters.maxRecords);
  });

  // Remove virtualizerKey and forceUpdateKey signals
  const [measuredHeights, setMeasuredHeights] = createSignal<Map<number, number>>(new Map());

  // Add ref for scroll container and item measurements
  let scrollContainerRef: HTMLDivElement | undefined;
  const itemRefs = new Map<number, HTMLDivElement>();

  // Constants for card heights
  const COLLAPSED_HEIGHT = 42;
  const EXPANDED_HEIGHT = 800;

  const estimateSize = (index: number) => {
    const token = filteredTokens()[index];
    if (!token) return COLLAPSED_HEIGHT;
    
    // Check if we have a measured height for this item
    const measuredHeight = measuredHeights().get(index);
    if (measuredHeight) {
      return measuredHeight;
    }
    
    // Fallback to estimated height
    return expandedTokens().has(token.tokenAddress) ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  };

  // Update virtualizer creation to be more efficient
  const virtualizer = createMemo(() => {
    const tokens = filteredTokens();
    
    return createVirtualizer({
      count: tokens.length,
      getScrollElement: () => scrollContainerRef ?? null,
      estimateSize,
      overscan: 5,
      scrollMargin: 200,
      initialOffset: scrollContainerRef?.scrollTop || 0,
    });
  });

  // Add effect to handle item measurements and resizing
  createEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      let needsRemeasure = false;
      const newHeights = new Map(measuredHeights());

      for (const entry of entries) {
        const index = parseInt(entry.target.getAttribute('data-index') || '-1', 10);
        if (index >= 0) {
          const currentHeight = entry.target.getBoundingClientRect().height;
          const prevHeight = newHeights.get(index);
          
          if (prevHeight !== currentHeight) {
            newHeights.set(index, currentHeight);
            itemRefs.set(index, entry.target as HTMLDivElement);
            needsRemeasure = true;
          }
        }
      }

      if (needsRemeasure) {
        // Store current scroll position
        const currentScroll = scrollContainerRef?.scrollTop || 0;
        
        // Update measured heights and trigger remeasure
        setMeasuredHeights(newHeights);
        virtualizer().measure();
        
        // Restore scroll position after a short delay
        requestAnimationFrame(() => {
          if (scrollContainerRef) {
            scrollContainerRef.scrollTop = currentScroll;
          }
        });
      }
    });

    // Observe all virtual items
    const items = virtualizer().getVirtualItems();
    items.forEach(virtualItem => {
      const element = document.querySelector(`[data-index="${virtualItem.index}"]`);
      if (element) {
        resizeObserver.observe(element);
      }
    });

    onCleanup(() => resizeObserver.disconnect());
  });

  // Handle token click with logging
  const handleTokenClick = (tokenAddress: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const token = filteredTokens().find(t => t.tokenAddress === tokenAddress);
    if (token) {
      logDebug(`Token clicked: ${token.tokenSymbol} (${tokenAddress})`);
    }
    
    // Store current scroll position
    const currentScroll = scrollContainerRef?.scrollTop || 0;
    
    // Toggle expansion
    toggleTokenExpansion(tokenAddress);
    
    // Find the index before measuring
    const index = filteredTokens().findIndex(t => t.tokenAddress === tokenAddress);
    
    // Clear measured height for this item to force recalculation
    const newHeights = new Map(measuredHeights());
    newHeights.delete(index);
    setMeasuredHeights(newHeights);
    
    // Measure without recreating the virtualizer
    virtualizer().measure();
    
    // Scroll to the clicked token after a short delay
    if (index >= 0) {
      requestAnimationFrame(() => {
        virtualizer().scrollToIndex(index, {
          align: 'start',
          behavior: 'smooth'
        });
        logDebug(`Scrolled to token: ${tokenAddress} at index ${index}`);
      });
    }
  };

  // Save filters whenever they change
  const updateFilters = (newFilters: FilterState | ((prev: FilterState) => FilterState)) => {
    setFilters(prev => {
      const updated = typeof newFilters === 'function' ? newFilters(prev) : newFilters;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      
      // Force scroll to top for filter changes
      if (scrollContainerRef) {
        scrollContainerRef.scrollTop = 0;
      }
      
      // Clear all measured heights when filters change
      setMeasuredHeights(new Map());
      
      return updated;
    });
  };

  // Add effect to handle window resize
  createEffect(() => {
    const handleResize = () => {
      // Store current scroll position
      const currentScroll = scrollContainerRef?.scrollTop || 0;
      
      // Clear all measured heights on resize
      setMeasuredHeights(new Map());
      
      // Measure without recreating the virtualizer
      virtualizer().measure();
      
      // Restore scroll position after resize
      requestAnimationFrame(() => {
        if (scrollContainerRef) {
          scrollContainerRef.scrollTop = currentScroll;
        }
      });
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  // Add history storage with localStorage caching
  const HISTORY_CACHE_KEY = 'tokenHistoryCache';
  const HISTORY_CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds

  const loadCachedHistories = () => {
    try {
      const cached = localStorage.getItem(HISTORY_CACHE_KEY);
      if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < HISTORY_CACHE_EXPIRY) {
          return new Map(Object.entries(data));
        }
      }
    } catch (err) {
      console.error('[TokenEventsList] Error loading cached histories:', err);
    }
    return new Map();
  };

  const [tokenHistories, setTokenHistories] = createSignal<Map<string, any[]>>(loadCachedHistories());
  // Add new signals for trend storage
  const [tokenTrends, setTokenTrends] = createSignal<Map<string, { liquidity: 'up' | 'down' | 'stagnant', holders: 'up' | 'down' | 'stagnant' }>>(new Map());

  // Move trend calculation to a separate function that will be called once per token
  const updateTokenTrends = (tokenAddress: string, history: any[]) => {
    const liquidityTrend = calculateTrend(history, 'liquidity');
    const holdersTrend = calculateTrend(history, 'holders');
    
    setTokenTrends(prev => {
      const next = new Map(prev);
      next.set(tokenAddress, { liquidity: liquidityTrend, holders: holdersTrend });
      return next;
    });
  };

  // Modify the history fetch to calculate trends when history is updated
  const fetchTokenHistory = async (tokenAddress: string) => {
    try {
      const response = await fetch(`/api/tokens/${tokenAddress}/history`);
      const data = await response.json();
      
      if (!data.history || !Array.isArray(data.history)) {
        throw new Error('Invalid history data received');
      }

      setTokenHistories(prev => {
        const next = new Map(prev);
        next.set(tokenAddress, data.history);
        return next;
      });

      // Calculate trends once when history is fetched
      updateTokenTrends(tokenAddress, data.history);
    } catch (err) {
      console.error('[TokenEventsList] Error fetching token history:', err);
    }
  };

  // Add effect to fetch history for visible tokens
  createEffect(() => {
    const visibleTokens = virtualizer().getVirtualItems().map(row => filteredTokens()[row.index]);
    const uniqueTokens = new Set(visibleTokens.map(token => token?.tokenAddress));
    
    // Only fetch for tokens we don't have history for
    Array.from(uniqueTokens).forEach(tokenAddress => {
      if (tokenAddress && !tokenHistories().has(tokenAddress)) {
        fetchTokenHistory(tokenAddress);
      }
    });
  });

  // Modify CompactRow to use the stored trends instead of calculating them
  const CompactRow: Component<{ token: Token }> = (props) => {
    const trends = () => tokenTrends().get(props.token.tokenAddress) || { liquidity: 'stagnant', holders: 'stagnant' };
    
    return (
      <div 
        onClick={(e) => handleTokenClick(props.token.tokenAddress, e)}
        class="w-full bg-black/20 backdrop-blur-sm rd-lg border border-gray-700/50 hover:border-gray-600/50 transition-all duration-200 p-4 grid grid-cols-12 gap-4 items-center text-white cursor-pointer"
      >
        {/* Name and Symbol */}
        <div class="col-span-2">
          <div class="flex flex-col">
            <div class="fw-600 truncate">{props.token.tokenName}</div>
            <div class="text-sm text-gray-400 truncate">{props.token.tokenSymbol}</div>
          </div>
        </div>

        {/* Status Badges and Trends */}
        <div class="col-span-3 flex items-center">
          {/* Fixed width container for ownership badge */}
          <div class="w-28 flex justify-center">
            <div class={`shrink-0 px-2 py-0.5 rd text-xs ${
              props.token.gpOwnerAddress === '0x0000000000000000000000000000000000000000'
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>
              {props.token.gpOwnerAddress === '0x0000000000000000000000000000000000000000' ? 'Renounced' : 'Owned'}
            </div>
          </div>

          {/* Fixed width container for liquidity lock badge */}
          <div class="w-36 flex justify-center">
            <div class={`shrink-0 px-2 py-0.5 rd text-xs min-w-[120px] whitespace-nowrap text-center ${(() => {
              try {
                const lpHolders = JSON.parse(props.token.gpLpHolders || '[]');
                const totalLocked = lpHolders.reduce((acc: number, holder: any) => 
                  acc + (holder.is_locked ? Number(holder.percent) * 100 : 0), 0
                );
                return totalLocked > 90 
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border border-red-500/30';
              } catch {
                return 'bg-red-500/20 text-red-300 border border-red-500/30';
              }
            })()}`}>
              {(() => {
                try {
                  const lpHolders = JSON.parse(props.token.gpLpHolders || '[]');
                  const totalLocked = lpHolders.reduce((acc: number, holder: any) => 
                    acc + (holder.is_locked ? Number(holder.percent) * 100 : 0), 0
                  );
                  return `${totalLocked.toFixed(1)}% Locked`;
                } catch {
                  return 'Not Locked';
                }
              })()}
            </div>
          </div>

          {/* Fixed width container for trend badges */}
          <div class="flex-1 flex justify-end pr-2">
            <div class="flex shrink-0 items-center gap-1">
              <TrendBadge 
                trend={trends().liquidity} 
                type="Liq" 
              />
              <TrendBadge 
                trend={trends().holders} 
                type="Holders" 
              />
            </div>
          </div>
        </div>

        {/* Age */}
        <div class="col-span-1 flex flex-col">
          <div class="text-xs text-gray-400">Age</div>
          <div class="px-2 py-0.5 rd text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 inline-block mt-1">
            {(() => {
              const totalMinutes = Math.round(props.token.tokenAgeHours * 60);
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              if (hours > 0) {
                return `${hours}h ${minutes}m`;
              }
              return `${minutes}m`;
            })()}
          </div>
        </div>

        {/* Other Info */}
        <div class="col-span-1 flex flex-col">
          <div class="text-xs text-gray-400">Liquidity</div>
          <div class="text-sm mt-1">${props.token.hpLiquidityAmount.toLocaleString()}</div>
        </div>
        <div class="col-span-1 flex flex-col">
          <div class="text-xs text-gray-400">Holders</div>
          <div class="text-sm mt-1">{props.token.gpHolderCount.toLocaleString()}</div>
        </div>
        <div class="col-span-1 flex flex-col">
          <div class="text-xs text-gray-400">Buy Tax</div>
          <div class="text-sm mt-1">{props.token.gpBuyTax}%</div>
        </div>
        <div class="col-span-1 flex flex-col">
          <div class="text-xs text-gray-400">Sell Tax</div>
          <div class="text-sm mt-1">{props.token.gpSellTax}%</div>
        </div>

        {/* Risk Level */}
        <div class="col-span-2 flex justify-end">
          <div class={`text-center px-3 py-1 rd-full text-xs fw-600 w-28 ${
            props.token.riskLevel === 'safe' ? 'bg-green-100 text-green-800 border border-green-200' :
            props.token.riskLevel === 'warning' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
            'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {props.token.hpIsHoneypot ? 'HONEYPOT' : props.token.riskLevel.toUpperCase()}
          </div>
        </div>
      </div>
    );
  };

  // Search function
  const searchToken = (token: Token, query: string) => {
    query = query.toLowerCase();
    return (
      token.tokenName.toLowerCase().includes(query) ||
      token.tokenSymbol.toLowerCase().includes(query) ||
      token.tokenAddress.toLowerCase().includes(query)
    );
  };

  const calculateTrend = (history: any[], type: 'liquidity' | 'holders') => {
    // Early return if no history or not enough data points
    if (!history?.length || history.length < 2) {
      console.debug(`[Trend ${type}] Not enough data points:`, history?.length);
      return 'stagnant';
    }
    
    // Sort history by timestamp to ensure correct trend calculation
    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
    
    // Get the values we want to analyze
    const data = sortedHistory.map(record => ({
      x: new Date(record.timestamp),
      y: type === 'liquidity' ? record.totalLiquidity : record.holderCount
    }));

    // Calculate trend line
    const xPoints = data.map((_, i) => i);
    const yPoints = data.map(d => d.y);
    const xMean = xPoints.reduce((a, b) => a + b, 0) / xPoints.length;
    const yMean = yPoints.reduce((a, b) => a + b, 0) / yPoints.length;
    
    const slope = xPoints.reduce((acc, x, i) => {
      return acc + (x - xMean) * (yPoints[i] - yMean);
    }, 0) / xPoints.reduce((acc, x) => acc + Math.pow(x - xMean, 2), 0);
    
    // Use same threshold as chart (0.05)
    const threshold = 0.05;
    const result = Math.abs(slope) < threshold ? 'stagnant' : slope > 0 ? 'up' : 'down';
    
    console.debug(`[Trend ${type}] Calculation:`, {
      dataPoints: data.length,
      firstValue: yPoints[0],
      lastValue: yPoints[yPoints.length - 1],
      slope,
      threshold,
      result
    });
    
    return result;
  };

  // Calculate positions for all tokens
  const calculatePositions = () => {
    const positions = new Map<string, number>();
    let currentPosition = 0;
    
    filteredTokens().forEach((token, index) => {
      positions.set(token.tokenAddress, currentPosition);
      currentPosition += expandedTokens().has(token.tokenAddress) ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
    });
    
    return positions;
  };

  // Memoize positions to prevent unnecessary recalculations
  const tokenPositions = createMemo(calculatePositions);

  // Total height of the list
  const totalHeight = createMemo(() => {
    let height = 0;
    filteredTokens().forEach(token => {
      height += expandedTokens().has(token.tokenAddress) ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
    });
    return height;
  });

  // Add download logs button
  const downloadLogs = () => {
    const text = debugLogs().join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `token-list-debug-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Add dynamic scaling state
  const [isDynamicScaling, setIsDynamicScaling] = createSignal(localStorage.getItem(DYNAMIC_SCALING_KEY) === 'true');

  // Save dynamic scaling state when it changes
  createEffect(() => {
    localStorage.setItem(DYNAMIC_SCALING_KEY, isDynamicScaling().toString());
  });

  const [viewMode, setViewMode] = createSignal<'list' | 'grid'>('list');

  return (
    <div class="min-h-full">
      <div class="sticky top-0 z-50 bg-black/20 backdrop-blur-sm border-b border-gray-800">
        <div class="max-w-[1820px] mx-auto px-6 py-4">
          {/* Top row with main controls */}
          <div class="mb-4 flex justify-between items-center">
            <div class="flex items-center gap-4">
              <div class="text-white text-lg fw-600">Token List</div>
              <button
                class="flex items-center gap-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 rd text-white/90 transition-colors text-sm"
                onClick={(e) => {
                  e.preventDefault();
                  const currentTokens = filteredTokens();
                  setExpandedTokens(prev => {
                    const hasExpanded = currentTokens.some(token => prev.has(token.tokenAddress));
                    return hasExpanded ? new Set<string>() : new Set(currentTokens.map(token => token.tokenAddress));
                  });
                }}
              >
                {expandedTokens().size > 0 ? (
                  <>
                    <List size={16} />
                    <span>Collapse All</span>
                  </>
                ) : (
                  <>
                    <Layout size={16} />
                    <span>Expand All</span>
                  </>
                )}
              </button>
              <button
                onClick={downloadLogs}
                class="px-3 py-1 bg-gray-800/50 hover:bg-gray-700/50 rd text-white/90 transition-colors text-sm"
                title="Download debug logs"
              >
                Download Logs
              </button>
              <button
                class={`flex items-center gap-2 px-4 py-2 rd text-white/90 transition-colors text-sm ${
                  isDynamicScaling() ? 'bg-blue-600/50 hover:bg-blue-500/50' : 'bg-gray-800/50 hover:bg-gray-700/50'
                }`}
                onClick={() => setIsDynamicScaling(prev => !prev)}
                title="Toggle dynamic chart scaling"
              >
                <Activity size={16} />
                <span>Dynamic Scaling: {isDynamicScaling() ? 'On' : 'Off'}</span>
              </button>
              <input
                type="text"
                placeholder="Search tokens..."
                class="max-w-[240px] px-3 py-2 bg-gray-800/50 rd border border-gray-700 text-white"
                value={filters().searchQuery}
                onInput={(e) => updateFilters(f => ({ ...f, searchQuery: e.currentTarget.value }))}
              />
              <select
                class="max-w-[240px] px-3 py-2 bg-gray-800/50 rd border border-gray-700 text-white"
                value={filters().sortBy}
                onChange={(e) => updateFilters(f => ({ ...f, sortBy: e.currentTarget.value as any }))}
              >
                <option value="age">Sort by Age (Newest)</option>
                <option value="age_asc">Sort by Age (Oldest)</option>
                <option value="liquidity">Sort by Liquidity (Highest)</option>
                <option value="liquidity_asc">Sort by Liquidity (Lowest)</option>
                <option value="holders">Sort by Holders (Most)</option>
                <option value="holders_asc">Sort by Holders (Least)</option>
                <option value="safetyScore">Sort by Safety</option>
              </select>
            </div>
            <div class="flex gap-8 text-white/90 items-center">
              <span>Total tokens: {props.tokens.length}</span>
              <span>Filtered: {filteredTokens().length}</span>
              <span>Expanded: {expandedTokens().size}</span>
              <div class="flex items-center gap-2 ml-4">
                <button
                  onClick={() => setViewMode('list')}
                  class={`p-2 rd hover:bg-gray-700/50 ${viewMode() === 'list' ? 'bg-gray-700/50' : ''}`}
                  title="List View"
                >
                  <List size={20} class="text-white" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  class={`p-2 rd hover:bg-gray-700/50 ${viewMode() === 'grid' ? 'bg-gray-700/50' : ''}`}
                  title="Grid View"
                >
                  <LayoutGrid size={20} class="text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom row with filters */}
          <div class="grid grid-cols-12 gap-4">
            {/* Risk Level Filters and Min Filters - Spans 12 columns */}
            <div class="col-span-12 flex items-center gap-3">
              <div class="flex items-center space-x-1.5">
                <input
                  type="checkbox"
                  id="hideHoneypots"
                  checked={filters().hideHoneypots}
                  onChange={(e) => updateFilters(f => ({ ...f, hideHoneypots: e.currentTarget.checked }))}
                />
                <label for="hideHoneypots" class="text-white/90 text-xs">Hide Honeypots</label>
              </div>

              <div class="flex items-center space-x-1.5">
                <input
                  type="checkbox"
                  id="hideWarning"
                  checked={filters().hideWarning}
                  onChange={(e) => updateFilters(f => ({ ...f, hideWarning: e.currentTarget.checked }))}
                />
                <label for="hideWarning" class="text-white/90 text-xs">Hide Warning</label>
              </div>

              <div class="flex items-center space-x-1.5">
                <input
                  type="checkbox"
                  id="hideDanger"
                  checked={filters().hideDanger}
                  onChange={(e) => updateFilters(f => ({ ...f, hideDanger: e.currentTarget.checked }))}
                />
                <label for="hideDanger" class="text-white/90 text-xs">Hide Danger</label>
              </div>

              <div class="flex items-center space-x-1.5">
                <input
                  type="checkbox"
                  id="hideNotRenounced"
                  checked={filters().hideNotRenounced}
                  onChange={(e) => updateFilters(f => ({ ...f, hideNotRenounced: e.currentTarget.checked }))}
                />
                <label for="hideNotRenounced" class="text-white/90 text-xs">Hide Not Renounced</label>
              </div>

              <div class="flex items-center space-x-1.5">
                <input
                  type="checkbox"
                  id="hideUnlockedLiquidity"
                  checked={filters().hideUnlockedLiquidity}
                  onChange={(e) => updateFilters(f => ({ ...f, hideUnlockedLiquidity: e.currentTarget.checked }))}
                />
                <label for="hideUnlockedLiquidity" class="text-white/90 text-xs">Hide Unlocked Liquidity</label>
              </div>

              <div class="h-4 w-px bg-gray-700"></div>

              <div class="flex items-center gap-3">
                <div class="flex items-center gap-1.5">
                  <label for="minHolders" class="text-white/90 text-xs">Min Holders:</label>
                  <input
                    id="minHolders"
                    type="number"
                    placeholder="0"
                    class="w-20 px-2 py-1 bg-gray-800/50 rd border border-gray-700 text-white text-sm"
                    value={filters().minHolders}
                    onInput={(e) => updateFilters(f => ({ ...f, minHolders: parseInt(e.currentTarget.value) || 0 }))}
                  />
                </div>
                <div class="flex items-center gap-1.5">
                  <label for="minLiquidity" class="text-white/90 text-xs">Min Liquidity ($):</label>
                  <input
                    id="minLiquidity"
                    type="number"
                    placeholder="0"
                    class="w-20 px-2 py-1 bg-gray-800/50 rd border border-gray-700 text-white text-sm"
                    value={filters().minLiquidity}
                    onInput={(e) => updateFilters(f => ({ ...f, minLiquidity: parseInt(e.currentTarget.value) || 0 }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* List Container */}
      <div 
        ref={scrollContainerRef}
        class="flex-1 overflow-auto"
      >
        <div class={`mx-auto px-6 pt-6 transition-all duration-300 ${
          viewMode() === 'grid' && expandedTokens().size > 0 
            ? 'max-w-[3600px] w-[90vw]' 
            : 'max-w-[1820px]'
        }`}>
          {viewMode() === 'list' ? (
            // List View
            <div class="flex flex-col gap-4">
              {filteredTokens().map((token, index) => {
                const isExpanded = expandedTokens().has(token.tokenAddress);
                
                return (
                  <div
                    data-index={index}
                    data-token={token.tokenAddress}
                    class={`w-full transition-all duration-300 ease-in-out ${
                      isExpanded ? 'relative z-10' : 'z-0'
                    }`}
                  >
                    {isExpanded ? (
                      <TokenEventCard
                        token={token}
                        expanded={true}
                        onToggleExpand={(e) => handleTokenClick(token.tokenAddress, e)}
                        trends={tokenTrends().get(token.tokenAddress)}
                        dynamicScaling={isDynamicScaling()}
                      />
                    ) : (
                      <CompactRow token={token} />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Grid View
            <div class="relative">
              {expandedTokens().size > 0 ? (
                // Show expanded card in full width container
                <div class="w-full">
                  {filteredTokens().map((token, index) => {
                    const isExpanded = expandedTokens().has(token.tokenAddress);
                    return isExpanded ? (
                      <div 
                        data-index={index}
                        data-token={token.tokenAddress}
                        class="w-full transition-all duration-300"
                      >
                        <TokenEventCard
                          token={token}
                          expanded={true}
                          onToggleExpand={(e) => handleTokenClick(token.tokenAddress, e)}
                          trends={tokenTrends().get(token.tokenAddress)}
                          dynamicScaling={isDynamicScaling()}
                        />
                      </div>
                    ) : null;
                  })}
                </div>
              ) : (
                // Show grid of tiles
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredTokens().map((token, index) => (
                    <div
                      data-index={index}
                      data-token={token.tokenAddress}
                    >
                      <TokenTileCard
                        token={token}
                        onClick={(e) => handleTokenClick(token.tokenAddress, e)}
                        trends={tokenTrends().get(token.tokenAddress)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
