import { Component, createSignal } from 'solid-js';
import { ChevronDown, ChevronUp } from 'lucide-solid';
import type { PerformanceMetrics } from '../types';

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
}

export const LiveStatusBar: Component<LiveStatusBarProps> = (props) => {
  const [isExpanded, setIsExpanded] = createSignal(false);

  return (
    <div class="absolute top-0 left-0 right-0 z-[100] bg-black/20 backdrop-blur-sm text-white p-2 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-800">
      <div class="w-full max-w-[1820px] mx-auto flex flex-col md:flex-row justify-between items-start md:items-center">
        <div class="flex items-center space-x-4 mb-2 md:mb-0">
          <div class="flex items-center space-x-2">
            <div class={`w-2 h-2 rd-full ${props.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span class="text-sm">
              {props.isConnected ? 'Connected' : 'Disconnected'}
              {props.isLoading && ' (Loading...)'}
            </span>
          </div>
          {props.error && (
            <div class="text-sm text-red-400">
              Error: {props.error}
            </div>
          )}
          
          {/* Token Stats */}
          <div class="flex items-center gap-4 text-sm text-gray-400">
            <span>Total: {props.totalTokens}</span>
            <span>Filtered: {props.filteredTokens}</span>
            <span>Expanded: {props.expandedTokens}</span>
          </div>
        </div>
        
        <div class="flex flex-wrap items-center gap-4 text-sm text-gray-400">
          <button 
            onClick={() => setIsExpanded(prev => !prev)}
            class="flex items-center gap-1 hover:text-gray-200 transition-colors"
            title={isExpanded() ? 'Hide metrics' : 'Show metrics'}
          >
            <span>Metrics</span>
            {isExpanded() ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {isExpanded() && (
            <>
              <div class="hidden md:block">FPS: {props.metrics.fps.toFixed(1)}</div>
              <div class="hidden md:block">Memory: {props.metrics.memory.toFixed(1)} MB</div>
              <div class="hidden md:block">Render Time: {props.metrics.lastRenderTime.toFixed(1)}ms</div>
            </>
          )}

          <div class="flex items-center space-x-2">
            <label for="bgColorPicker" class="cursor-pointer">BG:</label>
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
  );
};
