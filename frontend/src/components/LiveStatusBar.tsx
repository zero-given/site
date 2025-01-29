import { Component } from 'solid-js';
import type { PerformanceMetrics } from '../types';

interface LiveStatusBarProps {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  metrics: PerformanceMetrics;
  onBgColorChange: (color: string) => void;
  onResetBgColor: () => void;
  currentBgColor: string;
}

export const LiveStatusBar: Component<LiveStatusBarProps> = (props) => {
  return (
    <div class="absolute top-0 left-0 right-0 z-[100] bg-black/80 backdrop-blur-sm text-white p-2 flex justify-between items-center border-b border-gray-800">
      <div class="flex items-center space-x-4">
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
      </div>
      
      <div class="flex items-center space-x-4 text-sm text-gray-400">
        <div>FPS: {props.metrics.fps.toFixed(1)}</div>
        <div>Memory: {props.metrics.memory.toFixed(1)} MB</div>
        <div>Render Time: {props.metrics.lastRenderTime.toFixed(1)}ms</div>
        <div class="flex items-center space-x-2">
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
  );
};
