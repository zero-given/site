import { Component, createSignal, createEffect, onCleanup, Show } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { TokenEventsList } from './components/TokenEventsList';
import { LiveStatusBar } from './components/LiveStatusBar';
import type { Token, PerformanceMetrics, ThemeColors, WSMessage } from './types';
import FlexSearch from 'flexsearch';

// Initialize WebSocket worker
const wsWorker = new Worker(
  new URL('./workers/websocket.worker.ts', import.meta.url),
  { type: 'module' }
);

const DEFAULT_BG_COLOR = '#1a1a1a';
const BG_COLOR_STORAGE_KEY = 'app_bg_color';

const App: Component = () => {
  // State management using solid-js primitives
  const [tokens, setTokens] = createStore<{ items: Record<string, Token> }>({ items: {} });
  const [isConnected, setIsConnected] = createSignal(false);
  const [connectionError, setConnectionError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [hasReceivedInitialTokens, setHasReceivedInitialTokens] = createSignal(false);
  
  // Load saved background color or use default
  const [bgColor, setBgColor] = createSignal(localStorage.getItem(BG_COLOR_STORAGE_KEY) || DEFAULT_BG_COLOR);

  // Save background color to localStorage when it changes
  createEffect(() => {
    const color = bgColor();
    localStorage.setItem(BG_COLOR_STORAGE_KEY, color);
  });

  const resetBgColor = () => {
    setBgColor(DEFAULT_BG_COLOR);
  };

  // Performance metrics state
  const [performanceMetrics, setPerformanceMetrics] = createSignal<PerformanceMetrics>({
    lastRenderTime: 0,
    averageRenderTime: 0,
    totalRenders: 0,
    fps: 60,
    memory: 0
  });
  
  // Theme state
  const [colors, setColors] = createSignal<ThemeColors>({
    gradientColor1: '#9333ea',
    gradientColor2: '#ec4899',
    bgGradientColor1: '#111827',
    bgGradientColor2: '#374151'
  });
  
  // Initialize search index
  const searchIndex = new FlexSearch.Document({
    document: {
      id: 'tokenAddress',
      index: ['tokenName', 'tokenSymbol', 'tokenAddress'],
      store: true
    }
  });
  
  // WebSocket worker message handling
  createEffect(() => {
    wsWorker.onmessage = (event) => {
      const { type, data } = event.data || {};
      console.log('App: Received message from worker:', type, data);
      
      switch (type) {
        case 'CONNECTION_STATUS':
          if (data) {
            console.log('App: Connection status update:', data);
            const wasConnected = isConnected();
            setIsConnected(data.connected);
            setConnectionError(data.error || null);
            
            // Only clear tokens if we were previously connected and lost connection
            if (wasConnected && !data.connected) {
              console.log('App: Lost connection, clearing tokens');
              setTokens({ items: {} });
              setIsLoading(true);
              setHasReceivedInitialTokens(false);
            }
            
            // If we just connected, request initial tokens
            if (!wasConnected && data.connected) {
              console.log('App: Connected, requesting initial tokens');
              wsWorker.postMessage({
                type: 'REQUEST_INITIAL_TOKENS'
              });
            }
          }
          break;
          
        case 'BATCH_PROCESSED':
          if (data && Array.isArray(data)) {
            console.log('App: Processing batch of tokens:', data.length);
            
            setTokens(
              produce((state) => {
                data.forEach((token: Token) => {
                  // Calculate risk level
                  let riskLevel: 'safe' | 'warning' | 'danger' = 'safe';
                  
                  if (token.hpIsHoneypot) {
                    riskLevel = 'danger';
                  } else if (
                    token.gpCanTakeBackOwnership ||
                    token.gpHiddenOwner ||
                    token.gpOwnerChangeBalance ||
                    token.gpIsAirdropScam ||
                    token.gpHoneypotWithSameCreator ||
                    token.gpFakeToken ||
                    !token.gpIsOpenSource
                  ) {
                    riskLevel = 'danger';
                  } else if (
                    token.gpIsProxy ||
                    token.gpIsMintable ||
                    token.gpSlippageModifiable ||
                    token.gpPersonalSlippageModifiable ||
                    token.gpCannotSellAll ||
                    token.gpTradingCooldown ||
                    token.gpTransferPausable ||
                    (token.gpBuyTax > 10 || token.gpSellTax > 10)
                  ) {
                    riskLevel = 'warning';
                  }

                  const processedToken = {
                    ...token,
                    riskLevel
                  };
                  
                  // Store token with calculated risk level
                  state.items[token.tokenAddress] = processedToken;
                  console.log('App: Added token:', token.tokenAddress, token.tokenName);
                });
                
                console.log('App: Total tokens after batch:', Object.keys(state.items).length);
              })
            );
            
            // Mark as having received initial tokens and not loading
            if (!hasReceivedInitialTokens()) {
              console.log('App: Received initial tokens');
              setHasReceivedInitialTokens(true);
            }
            setIsLoading(false);
          }
          break;
      }
    };
    
    // Initialize WebSocket connection
    console.log('App: Initializing WebSocket connection');
    wsWorker.postMessage({
      type: 'INIT',
      payload: { url: import.meta.env.VITE_WS_URL }
    });
  });
  
  // Cleanup
  onCleanup(() => {
    wsWorker.postMessage({ type: 'CLOSE' });
  });
  
  return (
    <div 
      class="min-h-screen flex flex-col overflow-hidden"
      style={{
        'background-color': bgColor(),
        'background-attachment': 'fixed'
      }}
    >
      <LiveStatusBar
        isConnected={isConnected()}
        isLoading={isLoading()}
        error={connectionError()}
        metrics={performanceMetrics()}
        onBgColorChange={setBgColor}
        onResetBgColor={resetBgColor}
        currentBgColor={bgColor()}
      />
      
      <main class="flex-1 overflow-auto relative w-full pt-[56px]">
        <Show
          when={!isLoading() && hasReceivedInitialTokens()}
          fallback={
            <div class="flex items-center justify-center h-[50vh]">
              <div class="text-white text-xl">Loading tokens...</div>
            </div>
          }
        >
          <TokenEventsList
            tokens={Object.values(tokens.items)}
            onColorsChange={setColors}
          />
        </Show>
      </main>
      
      {/* Debug panel in development */}
      {import.meta.env.DEV && (
        <div class="fixed bottom-4 right-4 bg-black/80 text-white p-4 rd-lg text-sm font-mono z-50">
          <h3 class="fw-700 mb-2">Performance Metrics</h3>
          <div>FPS: {performanceMetrics().fps.toFixed(1)}</div>
          <div>Memory: {performanceMetrics().memory.toFixed(1)} MB</div>
          <div>Tokens: {Object.keys(tokens.items).length}</div>
          <div>Connection: {isConnected() ? 'Connected' : 'Disconnected'}</div>
          <div>Initial Tokens: {hasReceivedInitialTokens() ? 'Yes' : 'No'}</div>
          <Show when={connectionError()}>
            <div class="text-red-400 mt-2">Error: {connectionError()}</div>
          </Show>
        </div>
      )}
    </div>
  );
};

export default App;
