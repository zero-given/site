import { Component, Show, createSignal, onMount } from 'solid-js';
import { Shield, Info, Activity, FileText, Lock, Users, ChevronUp, ChevronDown, Minus } from 'lucide-solid';
import type { Token, TokenHistory } from '../types';
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
  <div class="mb-3 flex items-center gap-2">
    <span class="text-sm fw-500 text-gray-400 whitespace-nowrap">{props.label}: </span>
    <span class={`text-sm text-gray-200 ${props.truncate ? 'truncate' : ''}`}>
      {props.label === "Token Address" ? (
        <a 
          href={`https://www.dextools.io/app/en/ether/pair-explorer/${props.value}`}
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-400 hover:text-blue-300 hover:underline"
        >
          {props.value}
        </a>
      ) : props.value === undefined || props.value === null ? 'N/A' : props.value.toString()}
    </span>
  </div>
);

interface TokenCardProps {
  token: Token;
  expanded: boolean;
  onToggleExpand: (e: MouseEvent) => void;
  trends?: {
    liquidity: 'up' | 'down' | 'stagnant';
    holders: 'up' | 'down' | 'stagnant';
  };
  dynamicScaling?: boolean;
}

export const TokenEventCard: Component<TokenCardProps> = (props) => {
  const [history, setHistory] = createSignal<TokenHistory[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [chartData, setChartData] = createSignal<TokenHistory[]>([]);
  const [debugInfo, setDebugInfo] = createSignal<string[]>([]);
  const [isAdditionalInfoExpanded, setIsAdditionalInfoExpanded] = createSignal(false);
  const [isTableExpanded, setIsTableExpanded] = createSignal(false);
  const [isHistoryTableExpanded, setIsHistoryTableExpanded] = createSignal(false);

  // Add debug logging function
  const addDebug = (message: string) => {
    console.log(`[Chart Debug] ${message}`);
    setDebugInfo(prev => [...prev, `${new Date().toISOString().split('T')[1]}: ${message}`]);
  };

  onMount(async () => {
    try {
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
      class={`w-full transition-all duration-200 relative bg-black/20 backdrop-blur-sm rd-lg border border-gray-700/50 hover:border-gray-600/50 overflow-hidden`}
    >
      <div class={`min-h-[84px] ${props.expanded ? '' : ''} transition-all duration-200`}>
        <Show
          when={props.expanded}
          fallback={
            <div class="p-4 cursor-pointer" onClick={(e) => props.onToggleExpand(e)}>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class={`px-2 py-1 rd-md text-xs ${securityStatus[props.token.riskLevel]}`}>
                    {props.token.riskLevel.toUpperCase()}
                  </span>
                  <div class="flex items-center gap-2">
                    <h3 class="text-sm fw-600">{props.token.tokenName}</h3>
                    <span class="text-xs text-gray-400">{props.token.tokenSymbol}</span>
                    <div class="flex gap-1">
                      <TrendBadge 
                        trend={props.trends?.liquidity || 'stagnant'} 
                        type="Liq"
                        size="sm"
                      />
                      <TrendBadge 
                        trend={props.trends?.holders || 'stagnant'} 
                        type="Holders"
                        size="sm"
                      />
                      <span class={`px-2 py-0.5 rd text-2xs ${
                        props.token.gpOwnerAddress === '0x0000000000000000000000000000000000000000' 
                          ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                          : 'bg-red-500/20 text-red-300 border border-red-500/30'
                      }`}>
                        {props.token.gpOwnerAddress === '0x0000000000000000000000000000000000000000' ? 'RENOUNCED' : 'NOT RENOUNCED'}
                      </span>
                      {(() => {
                        try {
                          const lpHolders = JSON.parse(props.token.gpLpHolders || '[]');
                          const lockedLp = lpHolders.find((holder: any) => holder.is_locked);
                          if (lockedLp) {
                            return (
                              <span class="px-2 py-0.5 rd text-2xs bg-green-500/20 text-green-300 border border-green-500/30">
                                LOCKED {(Number(lockedLp.percent) * 100).toFixed(2)}%
                              </span>
                            );
                          }
                          return (
                            <span class="px-2 py-0.5 rd text-2xs bg-red-500/20 text-red-300 border border-red-500/30">
                              UNLOCKED
                            </span>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
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
          <div class="flex">
            {/* Vertical Collapse Button Section */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                props.onToggleExpand(e);
              }}
              class="w-16 hover:bg-white/20 transition-colors text-yellow-200 fw-600 text-sm cursor-pointer border-r border-yellow-500/20 flex items-center justify-center"
            >
              <div class="rotate-90 tracking-wider">COLLAPSE</div>
            </button>

            <div class="flex-1 p-6 flex flex-col gap-6">
              {/* Expanded content */}
              <div class="flex flex-col gap-6">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class={`px-2 py-1 rd-md text-xs ${securityStatus[props.token.riskLevel]}`}>
                      {props.token.riskLevel.toUpperCase()}
                    </span>
                    <div class="flex items-center gap-2">
                      <h3 class="text-sm fw-600">{props.token.tokenName}</h3>
                      <span class="text-xs text-gray-400">{props.token.tokenSymbol}</span>
                      <div class="flex gap-1">
                        <TrendBadge 
                          trend={props.trends?.liquidity || 'stagnant'} 
                          type="Liq"
                          size="sm"
                        />
                        <TrendBadge 
                          trend={props.trends?.holders || 'stagnant'} 
                          type="Holders"
                          size="sm"
                        />
                        <span class={`px-2 py-0.5 rd text-2xs ${
                          props.token.gpOwnerAddress === '0x0000000000000000000000000000000000000000' 
                            ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                        }`}>
                          {props.token.gpOwnerAddress === '0x0000000000000000000000000000000000000000' ? 'RENOUNCED' : 'NOT RENOUNCED'}
                        </span>
                        {(() => {
                          try {
                            const lpHolders = JSON.parse(props.token.gpLpHolders || '[]');
                            const lockedLp = lpHolders.find((holder: any) => holder.is_locked);
                            if (lockedLp) {
                              return (
                                <span class="px-2 py-0.5 rd text-2xs bg-green-500/20 text-green-300 border border-green-500/30">
                                  LOCKED {(Number(lockedLp.percent) * 100).toFixed(2)}%
                                </span>
                              );
                            }
                            return (
                              <span class="px-2 py-0.5 rd text-2xs bg-red-500/20 text-red-300 border border-red-500/30">
                                UNLOCKED
                              </span>
                            );
                          } catch {
                            return null;
                          }
                        })()}
                      </div>
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
                
                {/* Warning Reasons */}
                <Show when={getWarningReasons().length > 0}>
                  <div class="bg-orange-100/10 p-4 rd">
                    <div class="flex items-center gap-2 mb-2">
                      <Info size={16} class="text-orange-400" />
                      <h3 class="text-sm fw-600 text-orange-400">Warning Reasons</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1">
                      {getWarningReasons().map(reason => (
                        <li class="text-orange-200 text-sm">{reason}</li>
                      ))}
                    </ul>
                  </div>
                </Show>

                {/* Critical Information Section */}
                <div>
                  <SectionHeader
                    icon={<Info size={14} class="text-blue-400" />}
                    title="Critical Information"
                  />
                  <div class="grid grid-cols-2 gap-x-8 p-4">
                    <div class="space-y-3">
                      <Field label="Token Name" value={props.token.tokenName} important={true} />
                      <Field label="Token Address" value={props.token.tokenAddress} truncate={true} important={true} />
                      <Field label="Token Age" value={`${props.token.tokenAgeHours.toFixed(1)} hours`} important={true} />
                    </div>
                    <div class="space-y-3">
                      <Field 
                        label="Liquidity (honeypot.is)" 
                        value={`$${props.token.hpLiquidityAmount.toLocaleString()}`} 
                        important={true} 
                      />
                      <Field 
                        label="Liquidity (go plus)" 
                        value={`$${(() => {
                          try {
                            const dexInfo = JSON.parse(props.token.gpDexInfo || '[]');
                            const liquidity = dexInfo[0]?.liquidity ? Number(dexInfo[0].liquidity) * 2 : 'N/A';
                            return typeof liquidity === 'number' ? liquidity.toLocaleString() : liquidity;
                          } catch {
                            return 'N/A';
                          }
                        })()}`}
                        important={true} 
                      />
                      <Field 
                        label="Ownership Renounced" 
                        value={props.token.gpOwnerAddress === '0x0000000000000000000000000000000000000000' ? 'Yes' : 'No'} 
                        important={true} 
                      />
                    </div>
                  </div>
                </div>

                {/* Liquidity Information */}
                <div>
                  <SectionHeader icon={<Lock size={16} class="text-blue-400" />} title="Liquidity Information" />
                  <div class="grid grid-cols-2 gap-4 p-4">
                    {/* DEX Information */}
                    <div>
                      <h5 class="text-xs fw-600 text-gray-400 uppercase mb-3">DEX Information</h5>
                      {(() => {
                        try {
                          const dexInfo = JSON.parse(props.token.gpDexInfo || '[]');
                          return dexInfo.map((dex: any) => (
                            <div class="mb-2">
                              <Field 
                                label={dex.name} 
                                value={`$${Number(dex.liquidity).toLocaleString()}`} 
                              />
                              <div class="text-xs text-gray-400 ml-4">
                                Type: {dex.liquidity_type}
                                <br />
                                Pair: {dex.pair}
                              </div>
                            </div>
                          ));
                        } catch {
                          return <Field label="DEX Info" value="N/A" />;
                        }
                      })()}
                    </div>

                    {/* LP Holder Information */}
                    <div>
                      <h5 class="text-xs fw-600 text-gray-400 uppercase mb-3">LP Holders</h5>
                      {(() => {
                        try {
                          const lpHolders = JSON.parse(props.token.gpLpHolders || '[]');
                          const totalLocked = lpHolders.reduce((acc: number, holder: any) => 
                            acc + (holder.is_locked ? Number(holder.percent) * 100 : 0), 0
                          );

                          return (
                            <>
                              <div class={`mb-3 text-sm fw-600 ${
                                totalLocked > 90 ? 'text-green-400' :
                                totalLocked > 50 ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>
                                Total Locked: {totalLocked.toFixed(2)}%
                              </div>
                              {lpHolders.map((holder: any) => (
                                <div class="mb-2 text-sm">
                                  <div class="flex items-center gap-2">
                                    <span class="text-gray-200 break-all">
                                      {holder.tag || holder.address}
                                    </span>
                                    <div class="flex gap-1 shrink-0">
                                      {holder.is_locked && (
                                        <span class="px-1.5 py-0.5 text-xs bg-green-500/20 text-green-300 border border-green-500/30 rd">
                                          Locked
                                        </span>
                                      )}
                                      {holder.address === props.token.gpOwnerAddress && (
                                        <span class="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 rd">
                                          Owner
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div class="text-xs text-gray-400 ml-4">
                                    Balance: {(Number(holder.percent) * 100).toFixed(2)}%
                                    {holder.is_contract === 1 && ' (Contract)'}
                                  </div>
                                </div>
                              ))}
                            </>
                          );
                        } catch {
                          return <Field label="LP Holders" value="N/A" />;
                        }
                      })()}
                    </div>
                  </div>
                </div>

                {/* Settings Box */}
                <div>
                  <SectionHeader
                    icon={<Shield size={14} class="text-purple-400" />}
                    title="Token Settings"
                  />
                  <div class="grid grid-cols-3 gap-6 p-4">
                    {/* Token Info */}
                    <div class="space-y-2">
                      <h5 class="text-xs fw-600 text-gray-400 uppercase mb-3">Token Info</h5>
                      <Field label="Buy Tax" value={`${props.token.gpBuyTax}%`} />
                      <Field label="Sell Tax" value={`${props.token.gpSellTax}%`} />
                      <Field label="Transfer Tax" value={`${props.token.hpTransferTax}%`} />
                    </div>

                    {/* Gas Info */}
                    <div class="space-y-2">
                      <h5 class="text-xs fw-600 text-gray-400 uppercase mb-3">Gas Info</h5>
                      <Field label="Buy Gas" value={props.token.hpBuyGasUsed.toLocaleString()} />
                      <Field label="Sell Gas" value={props.token.hpSellGasUsed.toLocaleString()} />
                      <Field label="Total Supply" value={Number(props.token.gpTotalSupply).toLocaleString()} />
                    </div>

                    {/* Pair Info */}
                    <div class="space-y-2">
                      <h5 class="text-xs fw-600 text-gray-400 uppercase mb-3">Pair Info</h5>
                      <Field label="Pair Token0" value={props.token.hpPairToken0Symbol || 'N/A'} />
                      <Field label="Pair Token1" value={props.token.hpPairToken1Symbol || 'N/A'} />
                      <Field label="Pair Liquidity" value={`$${props.token.hpPairLiquidity.toLocaleString()}`} />
                    </div>
                  </div>
                </div>

                {/* Trading Info */}
                <div>
                  <SectionHeader icon={<Activity size={16} class="text-blue-400" />} title="Trading Information" />
                  <div class="grid grid-cols-3 gap-4 p-4">
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
                  <div class="grid grid-cols-2 gap-4 p-4">
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
                  <div class="grid grid-cols-2 gap-4 p-4">
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
                  <SectionHeader 
                    icon={<Info size={16} class="text-yellow-400" />} 
                    title="Additional Information" 
                    onClick={() => setIsAdditionalInfoExpanded(!isAdditionalInfoExpanded())}
                    isExpanded={isAdditionalInfoExpanded()}
                  />
                  <Show when={isAdditionalInfoExpanded()}>
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
                  </Show>
                </div>
              </div>

              {/* Charts Section */}
              <div class="space-y-4 mt-6">
                {/* Liquidity History */}
                <div>
                  <SectionHeader 
                    icon={<Activity size={16} class="text-blue-400" />} 
                    title={`Liquidity History (${history().length} points)`}
                    trendDirection={props.trends?.liquidity || 'stagnant'}
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
                        dynamicScaling={props.dynamicScaling}
                        onTrendUpdate={(trend) => {
                          console.debug('[Chart] Liquidity trend update:', trend);
                        }}
                      />
                    </Show>
                  </Show>
                </div>

                {/* Holders History */}
                <div>
                  <SectionHeader 
                    icon={<Users size={16} class="text-purple-400" />} 
                    title={`Holders History (${history().length} points)`}
                    trendDirection={props.trends?.holders || 'stagnant'}
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
                        dynamicScaling={props.dynamicScaling}
                        onTrendUpdate={(trend) => {
                          console.debug('[Chart] Holders trend update:', trend);
                        }}
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
                    <div class="text-sm text-gray-400 font-mono whitespace-pre-wrap">
                      {debugInfo().join('\n')}
                    </div>
                  </div>
                </Show>
              </div>

              {/* Liquidity History Table */}
              <div class="space-y-2 mt-6">
                <SectionHeader 
                  icon={<Activity size={16} class="text-blue-400" />} 
                  title="History Table"
                  onClick={() => setIsHistoryTableExpanded(!isHistoryTableExpanded())}
                  isExpanded={isHistoryTableExpanded()}
                />
                <Show when={isHistoryTableExpanded()}>
                  <div class="bg-black/20 p-4 rd">
                    {isLoading() ? (
                      <div class="text-sm text-gray-400">Loading history...</div>
                    ) : error() ? (
                      <div class="text-sm text-red-400">{error()}</div>
                    ) : history().length === 0 ? (
                      <div class="text-sm text-gray-400">No history available</div>
                    ) : (
                      <div>
                        <table class="w-full">
                          <thead class="sticky top-0 bg-black/80">
                            <tr class="text-gray-400 text-sm">
                              <th class="text-left py-2 px-2">Time</th>
                              <th class="text-right py-2 px-2">Liquidity</th>
                              <th class="text-right py-2 px-2">Holders</th>
                              <th class="text-right py-2 px-2">LP Holders</th>
                            </tr>
                          </thead>
                          <tbody class="text-sm">
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
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
