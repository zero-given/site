import { Component } from 'solid-js';
import { Shield, Lock, Key, Info } from 'lucide-solid';
import type { Token } from '../types';
import { TrendBadge } from './TrendBadge';

interface TokenTileCardProps {
  token: Token;
  onClick: (e: MouseEvent) => void;
  trends?: {
    liquidity: 'up' | 'down' | 'stagnant';
    holders: 'up' | 'down' | 'stagnant';
  };
}

const securityStatus = {
  safe: 'bg-green-100 text-green-800 border border-green-200',
  warning: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  danger: 'bg-red-100 text-red-800 border border-red-200'
} as const;

export const TokenTileCard: Component<TokenTileCardProps> = (props) => {
  const formatNumber = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const getLiquidityInfo = () => {
    try {
      const lpHolders = JSON.parse(props.token.gpLpHolders || '[]');
      const dexInfo = JSON.parse(props.token.gpDexInfo || '[]');
      
      return {
        lpHolders,
        dexInfo,
        totalLocked: lpHolders.reduce((acc: number, holder: any) => 
          acc + (holder.is_locked ? Number(holder.percent) * 100 : 0), 0
        ),
        totalLiquidity: dexInfo[0]?.liquidity || 0
      };
    } catch {
      return { lpHolders: [], dexInfo: [], totalLocked: 0, totalLiquidity: 0 };
    }
  };

  const liquidityInfo = getLiquidityInfo();

  return (
    <div 
      onClick={props.onClick}
      class="w-full h-full bg-black/20 hover:bg-black/40 backdrop-blur-sm rd-lg border border-gray-700/50 hover:border-gray-600/50 overflow-hidden cursor-pointer transition-all duration-200"
    >
      <div class="p-4">
        {/* Header with risk level and age */}
        <div class="flex items-center justify-between mb-3">
          <span class={`px-2 py-1 rd-md text-xs ${securityStatus[props.token.riskLevel]}`}>
            {props.token.hpIsHoneypot ? 'HONEYPOT' : props.token.riskLevel.toUpperCase()}
          </span>
          <span class="px-2 py-1 rd text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/30">
            {(() => {
              const totalMinutes = Math.round(props.token.tokenAgeHours * 60);
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              if (hours > 0) {
                return `${hours}h ${minutes}m`;
              }
              return `${minutes}m`;
            })()}
          </span>
        </div>

        {/* Token name and symbol */}
        <div class="mb-3">
          <h3 class="text-lg fw-600 text-white truncate" title={props.token.tokenName}>
            {props.token.tokenName}
          </h3>
          <p class="text-sm text-gray-400 truncate" title={props.token.tokenAddress}>
            {props.token.tokenSymbol} • {props.token.tokenAddress.slice(0, 8)}...{props.token.tokenAddress.slice(-6)}
          </p>
        </div>

        {/* Key metrics in 4 columns */}
        <div class="grid grid-cols-4 gap-4 text-sm">
          {/* Column 1: Holders and Liquidity */}
          <div class="space-y-2">
            <div>
              <p class="text-gray-400">Holders</p>
              <p class="text-white fw-600">{formatNumber(props.token.gpHolderCount)}</p>
            </div>
            <div>
              <p class="text-gray-400">Liquidity</p>
              <p class="text-white fw-600">${formatNumber(props.token.hpLiquidityAmount)}</p>
            </div>
          </div>

          {/* Column 2: Renounced and Liquidity Locked */}
          <div class="space-y-2">
            <div>
              <p class="text-gray-400">Ownership</p>
              <p class={`text-white fw-600 flex items-center gap-1 px-2 py-0.5 rd text-sm ${
                props.token.gpOwnerAddress === '0x0000000000000000000000000000000000000000'
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}>
                <Key size={14} />
                {props.token.gpOwnerAddress === '0x0000000000000000000000000000000000000000' ? 'Renounced' : 'Owned'}
              </p>
            </div>
            <div>
              <p class="text-gray-400">LP Locked</p>
              <p class="text-white fw-600 flex items-center gap-1">
                <Lock size={14} />
                {(() => {
                  try {
                    const lpHolders = JSON.parse(props.token.gpLpHolders || '[]');
                    const totalLocked = lpHolders.reduce((acc: number, holder: any) => 
                      acc + (holder.is_locked ? Number(holder.percent) * 100 : 0), 0
                    );
                    return `${totalLocked.toFixed(2)}%`;
                  } catch {
                    return 'N/A';
                  }
                })()}
              </p>
            </div>
          </div>

          {/* Column 3: Buy and Sell Tax */}
          <div class="space-y-2">
            <div>
              <p class="text-gray-400">Buy Tax</p>
              <p class="text-white fw-600">{props.token.gpBuyTax}%</p>
            </div>
            <div>
              <p class="text-gray-400">Sell Tax</p>
              <p class="text-white fw-600">{props.token.gpSellTax}%</p>
            </div>
          </div>

          {/* Column 4: Trend Badges */}
          <div class="flex flex-col justify-center items-end gap-2">
            <TrendBadge 
              trend={props.trends?.liquidity || 'stagnant'} 
              type="Liq" 
            />
            <TrendBadge 
              trend={props.trends?.holders || 'stagnant'} 
              type="Holders" 
            />
          </div>
        </div>

        {/* New Liquidity Information Section */}
        <div class="mt-4 pt-4 border-t border-gray-700/50">
          <div class="flex items-center gap-2 mb-2">
            <Info size={14} class="text-blue-400" />
            <h4 class="text-sm fw-600 text-white">Liquidity Information</h4>
          </div>
          
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-gray-400 mb-1">DEX Liquidity</p>
              <div class="space-y-1">
                {liquidityInfo.dexInfo.map((dex: any) => (
                  <p class="text-white">
                    {dex.name}: ${Number(dex.liquidity).toLocaleString()}
                  </p>
                ))}
              </div>
            </div>
            
            <div>
              <p class="text-gray-400 mb-1">LP Status</p>
              <div class="space-y-1">
                <p class={`text-sm ${
                  liquidityInfo.totalLocked > 90 
                    ? 'text-green-400' 
                    : liquidityInfo.totalLocked > 50 
                    ? 'text-yellow-400' 
                    : 'text-red-400'
                }`}>
                  {liquidityInfo.totalLocked.toFixed(2)}% Locked
                </p>
                {liquidityInfo.lpHolders.slice(0, 2).map((holder: any) => (
                  <p class="text-gray-300 text-xs">
                    {holder.tag || holder.address.slice(0, 6)}...{holder.address.slice(-4)}: 
                    {' '}{(Number(holder.percent) * 100).toFixed(2)}%
                    {holder.is_locked && ' 🔒'}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 
