import { Component, createSignal, createMemo, onMount, createEffect, onCleanup } from 'solid-js';
import { createVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/solid-virtual';
import { TokenEventCard } from './TokenEventCard';
import { Layout, List } from 'lucide-solid';
import { TrendBadge } from './TrendBadge';
import type { Token, FilterState, ThemeColors } from '../types';

interface TokenEventsListProps {
  tokens: Token[];
  onColorsChange: (colors: ThemeColors) => void;
}

type SortField = 'age' | 'holders' | 'liquidity' | 'safetyScore';

const STORAGE_KEY = 'tokenListFilters';

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

  // Save histories to cache whenever they change
  createEffect(() => {
    const histories = tokenHistories();
    const cacheData = {
      timestamp: Date.now(),
      data: Object.fromEntries(histories)
    };
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(cacheData));
  });

  // Add function to fetch history
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

  // Modify CompactRow to use the fetched history
  const CompactRow: Component<{ token: Token }> = (props) => {
    const history = () => tokenHistories().get(props.token.tokenAddress) || [];
    
    return (
      <div class={`w-full bg-black/40 backdrop-blur-sm rd-lg border border-gray-700/50 hover:border-gray-600/50 transition-all duration-200 p-4 grid grid-cols-12 gap-4 items-center text-white mb-6`}>
        <div class="col-span-2">
          <div class="flex flex-col">
            <div class="flex items-center gap-1 mb-1">
              <div class="fw-600 truncate">{props.token.tokenName}</div>
              <div class="flex shrink-0">
                <TrendBadge 
                  trend={calculateTrend(history(), 'liquidity')} 
                  type="Liq" 
                />
                <TrendBadge 
                  trend={calculateTrend(history(), 'holders')} 
                  type="Holders"
                />
              </div>
            </div>
            <div class="text-sm text-gray-400 truncate">{props.token.tokenSymbol}</div>
          </div>
        </div>
        <div class="col-span-2 truncate text-sm">
          <div class="text-gray-400">Address:</div>
          <div>{props.token.tokenAddress.slice(0, 8)}...{props.token.tokenAddress.slice(-6)}</div>
        </div>
        <div class="col-span-1 text-sm">
          <div class="text-gray-400">Age:</div>
          <div>{props.token.tokenAgeHours.toFixed(1)}h</div>
        </div>
        <div class="col-span-1 text-sm">
          <div class="text-gray-400">Liquidity:</div>
          <div>${props.token.hpLiquidityAmount.toLocaleString()}</div>
        </div>
        <div class="col-span-1 text-sm">
          <div class="text-gray-400">Holders:</div>
          <div>{props.token.gpHolderCount.toLocaleString()}</div>
        </div>
        <div class="col-span-1 text-sm">
          <div class="text-gray-400">Buy Tax:</div>
          <div>{props.token.gpBuyTax}%</div>
        </div>
        <div class="col-span-1 text-sm">
          <div class="text-gray-400">Sell Tax:</div>
          <div>{props.token.gpSellTax}%</div>
        </div>
        <div class="col-span-2">
          <div class={`text-center px-3 py-1 rd-full text-sm fw-600 ${
            props.token.riskLevel === 'safe' ? 'bg-green-100 text-green-800 border border-green-200' :
            props.token.riskLevel === 'warning' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
            'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {props.token.hpIsHoneypot ? 'HONEYPOT' : props.token.riskLevel.toUpperCase()}
          </div>
        </div>
        <div class="col-span-1">
          <button 
            class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rd text-sm text-white transition-colors"
            onClick={() => toggleTokenExpansion(props.token.tokenAddress)}
          >
            Expand
          </button>
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
    
    // Use same threshold as chart
    const threshold = 0.01 * yMean;
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

  return (
    <div class="flex flex-col h-screen">
      {/* Filters Container */}
      <div class="sticky top-0 z-50 bg-gradient-to-b from-black/95 to-black/90 backdrop-blur-xl border-b border-gray-800">
        <div class="max-w-[1820px] mx-auto px-6 py-4">
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
            </div>
            <div class="flex gap-8 text-white/90">
              <span>Total tokens: {props.tokens.length}</span>
              <span>Filtered: {filteredTokens().length}</span>
              <span>Expanded: {expandedTokens().size}</span>
            </div>
          </div>

          {/* Filters Grid */}
          <div class="grid grid-cols-12 gap-4">
            {/* Search Input - Spans 3 columns */}
            <div class="col-span-3">
              <input
                type="text"
                placeholder="Search tokens..."
                class="w-full px-3 py-2 bg-gray-800/50 rd border border-gray-700 text-white"
                value={filters().searchQuery}
                onInput={(e) => updateFilters(f => ({ ...f, searchQuery: e.currentTarget.value }))}
              />
            </div>

            {/* Sort Dropdown - Spans 3 columns */}
            <div class="col-span-3">
              <select
                class="w-full px-3 py-2 bg-gray-800/50 rd border border-gray-700 text-white"
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

            {/* Risk Level Filters - Spans 4 columns */}
            <div class="col-span-4 flex items-center gap-4">
              <div class="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="hideHoneypots"
                  checked={filters().hideHoneypots}
                  onChange={(e) => updateFilters(f => ({ ...f, hideHoneypots: e.currentTarget.checked }))}
                />
                <label for="hideHoneypots" class="text-white/90">Hide Honeypots</label>
              </div>

              <div class="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="hideWarning"
                  checked={filters().hideWarning}
                  onChange={(e) => updateFilters(f => ({ ...f, hideWarning: e.currentTarget.checked }))}
                />
                <label for="hideWarning" class="text-white/90">Hide Warning</label>
              </div>

              <div class="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="hideDanger"
                  checked={filters().hideDanger}
                  onChange={(e) => updateFilters(f => ({ ...f, hideDanger: e.currentTarget.checked }))}
                />
                <label for="hideDanger" class="text-white/90">Hide Danger</label>
              </div>
            </div>

            {/* Min Filters and View Toggle - Spans 2 columns */}
            <div class="col-span-2 flex items-center justify-end gap-4">
              <div class="flex items-center gap-2">
                <span class="text-white/60 text-xs whitespace-nowrap">Min:</span>
                <input
                  type="number"
                  placeholder="Holders"
                  class="w-20 px-2 py-1 bg-gray-800/50 rd border border-gray-700 text-white text-sm"
                  value={filters().minHolders}
                  onInput={(e) => updateFilters(f => ({ ...f, minHolders: parseInt(e.currentTarget.value) || 0 }))}
                />
                <input
                  type="number"
                  placeholder="Liq($)"
                  class="w-20 px-2 py-1 bg-gray-800/50 rd border border-gray-700 text-white text-sm"
                  value={filters().minLiquidity}
                  onInput={(e) => updateFilters(f => ({ ...f, minLiquidity: parseInt(e.currentTarget.value) || 0 }))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* List Container - Flexbox Layout */}
      <div 
        ref={scrollContainerRef}
        class="flex-1 overflow-auto"
      >
        <div class="max-w-[1400px] mx-auto px-4 py-4">
          {/* Stack tokens vertically with margins */}
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
                  <div 
                    class={`w-full bg-black/20 backdrop-blur-sm rd-lg border border-gray-700/50 
                      ${isExpanded ? 'shadow-xl ring-1 ring-gray-700/50' : 'hover:border-gray-600/50'}`}
                  >
                    <TokenEventCard
                      token={token}
                      expanded={isExpanded}
                      onToggleExpand={(e) => handleTokenClick(token.tokenAddress, e)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
