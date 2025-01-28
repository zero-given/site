import { Component } from 'solid-js';
import { Layout, List, LineChart, Activity, FileText } from 'lucide-solid';
import type { PerformanceMetrics, FilterState } from '../types';

interface LiveStatusBarProps {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  metrics: PerformanceMetrics;
  onBgColorChange: (color: string) => void;
  onResetBgColor: () => void;
  currentBgColor: string;
  totalTokens: number;
  filteredTokens: number;
  expandedTokens: number;
  onToggleExpandAll: () => void;
  isAnyExpanded: boolean;
  onDownloadLogs: () => void;
  isDynamicScaling: boolean;
  onToggleDynamicScaling: () => void;
  filters: FilterState;
  onUpdateFilters: (filters: FilterState | ((prev: FilterState) => FilterState)) => void;
}

export const LiveStatusBar: Component<LiveStatusBarProps> = (props) => {
  return (
    <div class="sticky top-0 left-0 right-0 z-[100] bg-black/20 backdrop-blur-sm border-b border-gray-700/50">
      {/* Top Row - Performance Metrics */}
      <div class="max-w-[1820px] mx-auto">
        <div class="flex justify-between items-center px-4 py-2 border-b border-gray-700/30">
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              <div class={`w-2 h-2 rd-full ${props.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span class="text-sm text-white">
                {props.isConnected ? 'Connected' : 'Disconnected'}
                {props.isLoading && ' (Loading...)'}
              </span>
            </div>
            {props.error && (
              <div class="text-sm text-red-400">
                Error: {props.error}
              </div>
            )}
          </div>
          
          <div class="flex items-center space-x-6 text-sm text-gray-400">
            <div>FPS: {props.metrics.fps.toFixed(1)}</div>
            <div>Memory: {props.metrics.memory.toFixed(1)} MB</div>
            <div>Render Time: {props.metrics.lastRenderTime.toFixed(1)}ms</div>
            <div class="flex items-center space-x-2 pl-4 border-l border-gray-700/30">
              <label for="bgColorPicker" class="cursor-pointer">BG Color:</label>
              <input
                id="bgColorPicker"
                type="color"
                class="w-6 h-6 rd cursor-pointer bg-transparent"
                value={props.currentBgColor}
                onChange={(e) => props.onBgColorChange(e.currentTarget.value)}
              />
              <button
                onClick={props.onResetBgColor}
                class="ml-1 text-gray-400 hover:text-gray-200 transition-colors"
                title="Reset to default color"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row - Token List Controls */}
      <div class="max-w-[1820px] mx-auto">
        <div class="px-6 py-4 border-b border-gray-700/30">
          <div class="flex items-center justify-between">
            <div class="text-white text-xl fw-600">Token List</div>
            
            <div class="flex items-center gap-8">
              {/* Action Buttons */}
              <div class="flex items-center gap-4">
                <div class="flex items-center gap-3 pr-6 border-r border-gray-700/50">
                  <button
                    class="flex items-center gap-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 rd-lg text-white/90 transition-colors text-sm"
                    onClick={props.onToggleExpandAll}
                  >
                    {props.isAnyExpanded ? (
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
                    onClick={props.onDownloadLogs}
                    class="flex items-center gap-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 rd-lg text-white/90 transition-colors text-sm"
                    title="Download debug logs"
                  >
                    <FileText size={16} />
                    <span>Download Logs</span>
                  </button>
                </div>

                <div class="flex items-center gap-3 pl-6 border-l border-gray-700/50">
                  <button
                    class={`flex items-center gap-2 px-4 py-2 rd-lg text-white/90 transition-colors text-sm ${
                      props.isDynamicScaling ? 'bg-blue-600/50 hover:bg-blue-500/50' : 'bg-gray-800/50 hover:bg-gray-700/50'
                    }`}
                    onClick={props.onToggleDynamicScaling}
                    title="Toggle dynamic chart scaling"
                  >
                    <Activity size={16} />
                    <span>Dynamic Scaling: {props.isDynamicScaling ? 'On' : 'Off'}</span>
                  </button>
                </div>
              </div>

              {/* Stats Section */}
              <div class="flex items-center gap-6 text-sm">
                <div class="flex items-center gap-2">
                  <span class="text-white/60">Total:</span>
                  <span class="font-mono text-white/90 min-w-[3ch] text-right">{props.totalTokens}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-white/60">Filtered:</span>
                  <span class="font-mono text-white/90 min-w-[3ch] text-right">{props.filteredTokens}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-white/60">Expanded:</span>
                  <span class="font-mono text-white/90 min-w-[3ch] text-right">{props.expandedTokens}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row - Filters */}
      <div class="max-w-[1820px] mx-auto">
        <div class="px-6 py-4">
          <div class="grid grid-cols-12 gap-6">
            {/* Search and Sort Section - Spans 6 columns */}
            <div class="col-span-6 flex gap-4">
              <div class="flex-1">
                <input
                  type="text"
                  placeholder="Search tokens..."
                  class="w-full px-4 py-2.5 bg-gray-800/50 rd-lg border border-gray-700 text-white placeholder-gray-400"
                  value={props.filters.searchQuery}
                  onInput={(e) => props.onUpdateFilters(f => ({ ...f, searchQuery: e.currentTarget.value }))}
                />
              </div>
              <div class="flex-1">
                <select
                  class="w-full px-4 py-2.5 bg-gray-800/50 rd-lg border border-gray-700 text-white [&>option]:bg-gray-800"
                  value={props.filters.sortBy}
                  onChange={(e) => props.onUpdateFilters(f => ({ ...f, sortBy: e.currentTarget.value as any }))}
                  style="min-width: max-content;"
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
            </div>

            <div class="col-span-4 flex items-center gap-6 px-6 border-x border-gray-700/50">
              <div class="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="hideHoneypots"
                  checked={props.filters.hideHoneypots}
                  onChange={(e) => props.onUpdateFilters(f => ({ ...f, hideHoneypots: e.currentTarget.checked }))}
                  class="w-4 h-4 rd"
                />
                <label for="hideHoneypots" class="text-white/90 text-sm whitespace-nowrap">Hide Honeypots</label>
              </div>

              <div class="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="hideWarning"
                  checked={props.filters.hideWarning}
                  onChange={(e) => props.onUpdateFilters(f => ({ ...f, hideWarning: e.currentTarget.checked }))}
                  class="w-4 h-4 rd"
                />
                <label for="hideWarning" class="text-white/90 text-sm whitespace-nowrap">Hide Warning</label>
              </div>

              <div class="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="hideDanger"
                  checked={props.filters.hideDanger}
                  onChange={(e) => props.onUpdateFilters(f => ({ ...f, hideDanger: e.currentTarget.checked }))}
                  class="w-4 h-4 rd"
                />
                <label for="hideDanger" class="text-white/90 text-sm whitespace-nowrap">Hide Danger</label>
              </div>
            </div>

            {/* Min Filters - Spans 2 columns */}
            <div class="col-span-2 flex items-center justify-end gap-3">
              <span class="text-white/60 text-sm whitespace-nowrap">Min:</span>
              <input
                type="number"
                placeholder="Holders"
                class="w-24 px-3 py-2 bg-gray-800/50 rd-lg border border-gray-700 text-white text-sm placeholder-gray-400"
                value={props.filters.minHolders}
                onInput={(e) => props.onUpdateFilters(f => ({ ...f, minHolders: parseInt(e.currentTarget.value) || 0 }))}
              />
              <input
                type="number"
                placeholder="Liq($)"
                class="w-24 px-3 py-2 bg-gray-800/50 rd-lg border border-gray-700 text-white text-sm placeholder-gray-400"
                value={props.filters.minLiquidity}
                onInput={(e) => props.onUpdateFilters(f => ({ ...f, minLiquidity: parseInt(e.currentTarget.value) || 0 }))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
