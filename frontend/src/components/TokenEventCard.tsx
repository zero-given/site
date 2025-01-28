import { Component, Show, createSignal, onMount } from 'solid-js';
import { Shield, Info, Activity, FileText, Lock, Users, ChevronUp, ChevronDown, Minus } from 'lucide-solid';
import type { Token, TokenCardProps } from '../types';
import { TokenChart } from './TokenLiquidityChart';
import { TrendBadge } from './TrendBadge';

const securityStatus = {
  safe: 'bg-green-100 text-green-800 border border-green-200',
  warning: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  danger: 'bg-red-100 text-red-800 border border-red-200'
} as const;

const SectionHeader: Component<{ 
  icon: any; 
  title: string; 
  onClick?: () => void; 
  isExpanded?: boolean;
  trendDirection?: 'up' | 'down' | 'stagnant';
}> = (props) => (
  <div class="flex items-center gap-2 mb-1 border-b border-gray-700/50 pb-1 cursor-pointer" onClick={props.onClick}>
    {props.icon}
    <h4 class="text-sm fw-600 text-white">{props.title}</h4>
    {props.trendDirection && (
      <div class={`ml-2 w-4 h-4 ${
        props.trendDirection === 'up' ? 'text-green-500' :
        props.trendDirection === 'down' ? 'text-red-500' :
        'text-gray-500'
      }`}>
        {props.trendDirection === 'up' && <ChevronUp size={14} />}
        {props.trendDirection === 'down' && <ChevronDown size={14} />}
        {props.trendDirection === 'stagnant' && <Minus size={14} />}
      </div>
    )}
    {props.onClick && (
      <div class="ml-auto">
        {props.isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>
    )}
  </div>
);

const Field: Component<{ label: string; value: any; truncate?: boolean; important?: boolean }> = (props) => (
  <div class="mb-0.5">
    <span class={`text-2xs fw-500 text-gray-400 ${props.important ? 'text-xs' : ''}`}>{props.label}: </span>
    <span class={`text-2xs text-gray-200 ${props.truncate ? 'truncate block' : ''} ${props.important ? 'text-xs' : ''}`}>
      {props.value === undefined || props.value === null ? 'N/A' : props.value.toString()}
    </span>
  </div>
);

interface TokenHistory {
  timestamp: number;
  hpLiquidity: number;
  gpLiquidity: number;
  totalLiquidity: number;
  holderCount: number;
  lpHolderCount: number;
}

export const TokenEventCard: Component<TokenCardProps> = (props) => {
  const [history, setHistory] = createSignal<TokenHistory[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [chartData, setChartData] = createSignal<TokenHistory[]>([]);
  const [debugInfo, setDebugInfo] = createSignal<string[]>([]);
  const [liquidityTrend, setLiquidityTrend] = createSignal<'up' | 'down' | 'stagnant'>('stagnant');
  const [holdersTrend, setHoldersTrend] = createSignal<'up' | 'down' | 'stagnant'>('stagnant');

  // Add debug logging function
  const addDebug = (message: string) => {
    console.log(`[Chart Debug] ${message}`);
    setDebugInfo(prev => [...prev, `${new Date().toISOString().split('T')[1]}: ${message}`]);
  };

  // Add initial trend calculation
  const calculateInitialTrend = (token: Token) => {
    // Calculate liquidity trend from liq history fields
    const liqTrend: 'up' | 'down' | 'stagnant' = (() => {
      const liqValues = [
        token.liq10, token.liq20, token.liq30, token.liq40, token.liq50,
        token.liq60, token.liq70, token.liq80
      ].filter(v => v !== undefined && v !== null);
      
      if (liqValues.length < 2) return 'stagnant';
      const lastValue = liqValues[liqValues.length - 1];
      const firstValue = liqValues[0];
      const change = lastValue - firstValue;
      return change > 0 ? 'up' : change < 0 ? 'down' : 'stagnant';
    })();

    // Calculate holders trend from holder count
    const holderTrend: 'up' | 'down' | 'stagnant' = (() => {
      const currentHolders = token.gpHolderCount;
      const prevHolders = token.hpHolderCount;
      if (!currentHolders || !prevHolders) return 'stagnant';
      return currentHolders > prevHolders ? 'up' : 
             currentHolders < prevHolders ? 'down' : 'stagnant';
    })();

    return { liqTrend, holderTrend };
  };

  onMount(async () => {
    try {
      // Set initial trends
      const { liqTrend, holderTrend } = calculateInitialTrend(props.token);
      setLiquidityTrend(liqTrend);
      setHoldersTrend(holderTrend);

      addDebug(`Processing history for token: ${props.token.tokenAddress}`);
      
      // Check cache first
      const cachedData = localStorage.getItem(`token_history_${props.token.tokenAddress}`);
      if (cachedData) {
        try {
          const { data, timestamp } = JSON.parse(cachedData);
          // Cache valid for 5 minutes
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            addDebug('Using cached history data');
            setHistory(data);
            setChartData(data);
            setIsLoading(false);
            return;
          }
        } catch (e) {
          addDebug('Error parsing cached data');
        }
      }

      // Fetch new data with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch(
          `/api/tokens/${props.token.tokenAddress}/history?table=true`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const rawText = await response.text();
        addDebug(`API Response status: ${response.status}`);
        
        const data = JSON.parse(rawText);
        addDebug('API data parsed successfully');
        
        // Process the data
        const historyData = data.data || data.history || data;
        if (!historyData || (!Array.isArray(historyData) && typeof historyData !== 'object')) {
          throw new Error('Invalid history data format');
        }

        // Convert to array if it's an object
        const historyArray = Array.isArray(historyData) ? historyData : Object.values(historyData);
        
        // Validate and convert history points
        const validHistoryPoints = historyArray
          .filter(point => {
            const hasTimestamp = typeof point.timestamp === 'number' || typeof point.time === 'number';
            const hasLiquidity = typeof point.liquidity === 'number' || 
                               typeof point.total_liquidity === 'number' || 
                               typeof point.totalLiquidity === 'number';
            const hasHolders = typeof point.holders === 'number' || 
                             typeof point.holder_count === 'number' || 
                             typeof point.holderCount === 'number';

            return point && hasTimestamp && (hasLiquidity || hasHolders);
          })
          .map(point => ({
            timestamp: point.timestamp || point.time,
            totalLiquidity: point.liquidity || point.total_liquidity || point.totalLiquidity || 0,
            holderCount: point.holders || point.holder_count || point.holderCount || 0,
            lpHolderCount: point.lp_holder_count || point.lpHolderCount || 0,
            hpLiquidity: point.hp_liquidity || point.hpLiquidity || 0,
            gpLiquidity: point.gp_liquidity || point.gpLiquidity || 0
          }))
          .sort((a, b) => a.timestamp - b.timestamp);

        if (validHistoryPoints.length === 0) {
          throw new Error('No valid history points found');
        }

        // Cache the processed data
        localStorage.setItem(
          `token_history_${props.token.tokenAddress}`,
          JSON.stringify({
            data: validHistoryPoints,
            timestamp: Date.now()
          })
        );

        setHistory(validHistoryPoints);
        setChartData(validHistoryPoints);
        setError(null);

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setError('Request timed out');
        } else {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
          setError(errorMessage);
        }
        console.error('[TokenEventCard] Error:', err);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('[TokenEventCard] Error:', err);
    } finally {
      setIsLoading(false);
    }
  });

  const getWarningReasons = () => {
    const reasons = [];
    
    // Contract security warnings
    if (!props.token.gpIsOpenSource) reasons.push('Contract is not open source');
    if (props.token.gpIsProxy) reasons.push('Contract uses proxy pattern');
    if (props.token.gpIsMintable) reasons.push('Token is mintable');
    if (props.token.gpHasProxyCalls) reasons.push('Contract has proxy calls');
    
    // Trading restrictions warnings
    if (props.token.gpCannotBuy) reasons.push('Buying is restricted');
    if (props.token.gpCannotSellAll) reasons.push('Cannot sell all tokens');
    if (props.token.gpTradingCooldown) reasons.push('Trading cooldown enabled');
    if (props.token.gpTransferPausable) reasons.push('Transfers can be paused');
    if (props.token.gpSlippageModifiable) reasons.push('Slippage can be modified');
    if (props.token.gpPersonalSlippageModifiable) reasons.push('Personal slippage can be modified');
    
    // Ownership warnings
    if (props.token.gpHiddenOwner) reasons.push('Hidden owner detected');
    if (props.token.gpCanTakeBackOwnership) reasons.push('Ownership can be taken back');
    if (props.token.gpOwnerChangeBalance) reasons.push('Owner can change balances');
    
    // Tax warnings
    if (props.token.gpBuyTax > 10) reasons.push(`High buy tax: ${props.token.gpBuyTax}%`);
    if (props.token.gpSellTax > 10) reasons.push(`High sell tax: ${props.token.gpSellTax}%`);
    
    // Additional risks
    if (props.token.gpIsAirdropScam) reasons.push('Potential airdrop scam');
    if (props.token.gpHoneypotWithSameCreator) reasons.push('Creator has deployed honeypots');
    if (props.token.gpFakeToken) reasons.push('Potential fake token');
    if (props.token.gpIsBlacklisted) reasons.push('Token is blacklisted');
    
    return reasons;
  };

  const warningReasons = getWarningReasons();

  return (
    <div 
      class={`w-full transition-all duration-200 ${
        props.expanded ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/20'
      } rd-lg border border-gray-700/50 hover:border-gray-600/50 cursor-pointer overflow-hidden`}
      onClick={(e) => props.onToggleExpand(e)}
    >
      <div class={`min-h-[84px] ${props.expanded ? '' : ''} transition-all duration-200`}>
        <Show
          when={props.expanded}
          fallback={
            <div class="p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class={`px-2 py-1 rd-md text-xs ${securityStatus[props.token.riskLevel]}`}>
                    {props.token.riskLevel.toUpperCase()}
                  </span>
                  <div class="flex items-center gap-2">
                    <h3 class="text-base fw-600">{props.token.tokenName}</h3>
                    <div class="flex gap-1">
                      <TrendBadge 
                        trend={liquidityTrend()} 
                        type="Liq"
                        size="sm"
                      />
                      <TrendBadge 
                        trend={holdersTrend()} 
                        type="Holders"
                        size="sm"
                      />
                    </div>
                    <span class="text-sm text-gray-400">{props.token.tokenSymbol}</span>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-sm">
                    {props.token.gpHolderCount.toLocaleString()} holders
                  </span>
                  <span class="text-sm">
                    ${props.token.hpLiquidityAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          }
        >
          <div class="p-6 flex flex-col gap-6">
            {/* Expanded content */}
            <div class="flex flex-col gap-6">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <span class={`px-3 py-1.5 rd-md text-sm ${securityStatus[props.token.riskLevel]}`}>
                    {props.token.riskLevel.toUpperCase()}
                  </span>
                  <div>
                    <div class="flex items-center gap-2">
                      <h2 class="text-xl fw-600">{props.token.tokenName}</h2>
                      <div class="flex gap-1">
                        <TrendBadge 
                          trend={liquidityTrend()} 
                          type="Liq"
                        />
                        <TrendBadge 
                          trend={holdersTrend()} 
                          type="Holders"
                        />
                      </div>
                    </div>
                    <div class="flex items-center gap-2 text-gray-400">
                      <span>{props.token.tokenSymbol}</span>
                      <span>•</span>
                      <span>{props.token.tokenAgeHours.toFixed(1)}h old</span>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-6">
                  <div class="text-right">
                    <div class="text-sm text-gray-400">Holders</div>
                    <div class="text-lg fw-600">{props.token.gpHolderCount.toLocaleString()}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm text-gray-400">Liquidity</div>
                    <div class="text-lg fw-600">
                      ${props.token.hpLiquidityAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Warning Reasons */}
              <Show when={getWarningReasons().length > 0}>
                <div class="bg-orange-100/10 p-4 rd">
                  <div class="flex items-center gap-2 mb-2">
                    <Info size={16} class="text-orange-400" />
                    <h3 class="text-base fw-600 text-orange-400">Warning Reasons</h3>
                  </div>
                  <ul class="list-disc list-inside space-y-1">
                    {getWarningReasons().map(reason => (
                      <li class="text-orange-200 text-sm">{reason}</li>
                    ))}
                  </ul>
                </div>
              </Show>

              {/* Trading Info */}
              <div>
                <SectionHeader icon={<Activity size={16} class="text-blue-400" />} title="Trading Information" />
                <div class="grid grid-cols-3 gap-4">
                  <Field label="Buy Tax" value={`${props.token.gpBuyTax}%`} />
                  <Field label="Sell Tax" value={`${props.token.gpSellTax}%`} />
                  <Field label="Transfer Tax" value={`${props.token.hpTransferTax}%`} />
                  <Field label="Buy Gas" value={props.token.hpBuyGasUsed.toLocaleString()} />
                  <Field label="Sell Gas" value={props.token.hpSellGasUsed.toLocaleString()} />
                  <Field label="Total Supply" value={Number(props.token.gpTotalSupply).toLocaleString()} />
                  <Field label="Liquidity Amount" value={`$${props.token.hpLiquidityAmount.toLocaleString()}`} />
                  <Field label="Pair Token0" value={props.token.hpPairToken0Symbol || 'N/A'} />
                  <Field label="Pair Token1" value={props.token.hpPairToken1Symbol || 'N/A'} />
                  <Field label="Pair Reserves0" value={props.token.hpPairReserves0} />
                  <Field label="Pair Reserves1" value={props.token.hpPairReserves1} />
                  <Field label="Pair Liquidity" value={`$${props.token.hpPairLiquidity.toLocaleString()}`} />
                </div>
              </div>

              {/* Contract Info */}
              <div>
                <SectionHeader icon={<FileText size={16} class="text-purple-400" />} title="Contract Information" />
                <div class="grid grid-cols-2 gap-4">
                  <div class="col-span-2">
                    <Field label="Token Address" value={props.token.tokenAddress} truncate />
                    <Field label="Pair Address" value={props.token.pairAddress} truncate />
                    <Field label="Creator" value={props.token.gpCreatorAddress} truncate />
                    <Field label="Owner" value={props.token.gpOwnerAddress || 'No owner'} truncate />
                    <Field label="Deployer" value={props.token.hpDeployerAddress || 'N/A'} truncate />
                  </div>
                  <Field label="Age" value={`${props.token.tokenAgeHours.toFixed(1)} hours`} />
                  <Field label="Decimals" value={props.token.tokenDecimals} />
                  <Field label="Creation Time" value={new Date(Number(props.token.hpCreationTime) * 1000).toLocaleString()} />
                  <Field label="Is Open Source" value={props.token.gpIsOpenSource ? 'Yes' : 'No'} />
                  <Field label="Is Proxy" value={props.token.gpIsProxy ? 'Yes' : 'No'} />
                  <Field label="Has Proxy Calls" value={props.token.gpHasProxyCalls ? 'Yes' : 'No'} />
                  <Field label="Is Mintable" value={props.token.gpIsMintable ? 'Yes' : 'No'} />
                  <Field label="Can Be Minted" value={props.token.gpCanBeMinted ? 'Yes' : 'No'} />
                  <Field label="Self Destruct" value={props.token.gpSelfDestruct ? 'Yes' : 'No'} />
                  <Field label="External Call" value={props.token.gpExternalCall ? 'Yes' : 'No'} />
                </div>
              </div>

              {/* Security Settings */}
              <div>
                <SectionHeader icon={<Shield size={16} class="text-green-400" />} title="Security Settings" />
                <div class="grid grid-cols-2 gap-4">
                  <Field label="Anti-Whale Modifiable" value={props.token.gpAntiWhaleModifiable ? 'Yes' : 'No'} />
                  <Field label="Cannot Buy" value={props.token.gpCannotBuy ? 'Yes' : 'No'} />
                  <Field label="Cannot Sell All" value={props.token.gpCannotSellAll ? 'Yes' : 'No'} />
                  <Field label="Slippage Modifiable" value={props.token.gpSlippageModifiable ? 'Yes' : 'No'} />
                  <Field label="Personal Slippage Modifiable" value={props.token.gpPersonalSlippageModifiable ? 'Yes' : 'No'} />
                  <Field label="Trading Cooldown" value={props.token.gpTradingCooldown ? 'Yes' : 'No'} />
                </div>
              </div>

              {/* Holder Information */}
              <div>
                <SectionHeader icon={<Users size={16} class="text-indigo-400" />} title="Holder Information" />
                <div class="grid grid-cols-2 gap-4">
                  <Field label="Total Holders" value={props.token.gpHolderCount.toLocaleString()} />
                  <Field label="LP Holders" value={props.token.gpLpHolderCount.toLocaleString()} />
                  <Field label="Creator Balance" value={`${(Number(props.token.gpCreatorPercent) * 100).toFixed(2)}%`} />
                  <Field label="Owner Balance" value={`${(Number(props.token.gpOwnerPercent) * 100).toFixed(2)}%`} />
                  <Field label="Creator Balance Raw" value={props.token.gpCreatorBalance} />
                  <Field label="Owner Balance Raw" value={props.token.gpOwnerBalance} />
                  <Field label="LP Total Supply" value={props.token.gpLpTotalSupply} />
                  <Field label="Total Scans" value={props.token.totalScans} />
                  <Field label="Honeypot Failures" value={props.token.honeypotFailures} />
                </div>
              </div>

              {/* Additional Information */}
              <div>
                <SectionHeader icon={<Info size={16} class="text-yellow-400" />} title="Additional Information" />
                <div class="grid grid-cols-2 gap-4">
                  <Field label="Status" value={props.token.status || 'N/A'} />
                  <Field label="Last Error" value={props.token.lastError || 'None'} />
                  <Show when={props.token.gpTrustList}>
                    <div class="col-span-2">
                      <Field label="Trust List" value={props.token.gpTrustList} />
                    </div>
                  </Show>
                  <Show when={props.token.gpOtherPotentialRisks}>
                    <div class="col-span-2">
                      <Field label="Other Potential Risks" value={props.token.gpOtherPotentialRisks} />
                    </div>
                  </Show>
                  <Show when={props.token.gpHolders}>
                    <div class="col-span-2">
                      <Field label="Holders" value={props.token.gpHolders} />
                    </div>
                  </Show>
                  <Show when={props.token.gpLpHolders}>
                    <div class="col-span-2">
                      <Field label="LP Holders" value={props.token.gpLpHolders} />
                    </div>
                  </Show>
                  <Show when={props.token.gpDexInfo}>
                    <div class="col-span-2">
                      <Field label="DEX Info" value={props.token.gpDexInfo} />
                    </div>
                  </Show>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div class="space-y-4 mt-6">
              {/* Liquidity History */}
              <div>
                <SectionHeader 
                  icon={<Activity size={16} class="text-blue-400" />} 
                  title={`Liquidity History (${history().length} points)`}
                  trendDirection={liquidityTrend()}
                />
                <Show 
                  when={!isLoading()} 
                  fallback={
                    <div class="w-full h-[200px] bg-gray-800/20 rd-lg animate-pulse" />
                  }
                >
                  <Show 
                    when={!error() && history().length > 0} 
                    fallback={
                      <div class="w-full h-[200px] bg-black/20 rd flex items-center justify-center text-gray-400">
                        {error() || 'No data available'}
                      </div>
                    }
                  >
                    <TokenChart 
                      token={props.token} 
                      history={history()} 
                      type="liquidity"
                      onTrendUpdate={setLiquidityTrend}
                    />
                  </Show>
                </Show>
              </div>

              {/* Holders History */}
              <div>
                <SectionHeader 
                  icon={<Users size={16} class="text-purple-400" />} 
                  title={`Holders History (${history().length} points)`}
                  trendDirection={holdersTrend()}
                />
                <Show 
                  when={!isLoading()} 
                  fallback={
                    <div class="w-full h-[200px] bg-gray-800/20 rd-lg animate-pulse" />
                  }
                >
                  <Show 
                    when={!error() && history().length > 0} 
                    fallback={
                      <div class="w-full h-[200px] bg-black/20 rd flex items-center justify-center text-gray-400">
                        {error() || 'No data available'}
                      </div>
                    }
                  >
                    <TokenChart 
                      token={props.token} 
                      history={history()} 
                      type="holders"
                      onTrendUpdate={setHoldersTrend}
                    />
                  </Show>
                </Show>
              </div>

              {/* Debug Info */}
              <Show when={debugInfo().length > 0}>
                <div class="bg-black/20 p-4 rd">
                  <SectionHeader 
                    icon={<Info size={16} class="text-gray-400" />} 
                    title="Debug Info:" 
                  />
                  <div class="text-xs text-gray-400 font-mono whitespace-pre-wrap">
                    {debugInfo().join('\n')}
                  </div>
                </div>
              </Show>
            </div>

            {/* Liquidity History Table */}
            <div class="space-y-2 mt-6">
              <div class="bg-black/20 p-4 rd">
                {isLoading() ? (
                  <div class="text-gray-400">Loading history...</div>
                ) : error() ? (
                  <div class="text-red-400">{error()}</div>
                ) : history().length === 0 ? (
                  <div class="text-gray-400">No history available</div>
                ) : (
                  <div>
                    <table class="w-full">
                      <thead class="sticky top-0 bg-black/80">
                        <tr class="text-gray-400 text-xs">
                          <th class="text-left py-2 px-2">Time</th>
                          <th class="text-right py-2 px-2">Liquidity</th>
                          <th class="text-right py-2 px-2">Holders</th>
                          <th class="text-right py-2 px-2">LP Holders</th>
                        </tr>
                      </thead>
                      <tbody class="text-xs">
                        {history().map((record) => (
                          <tr class="text-white border-t border-gray-800">
                            <td class="py-2 px-2">{new Date(record.timestamp).toLocaleString()}</td>
                            <td class="text-right py-2 px-2">${record.totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td class="text-right py-2 px-2">{record.holderCount.toLocaleString()}</td>
                            <td class="text-right py-2 px-2">{record.lpHolderCount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
