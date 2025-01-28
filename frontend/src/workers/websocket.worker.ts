import { compress, decompress } from 'lz-string';
import type { Token, WSMessage, RiskLevel } from '../types';

const HEARTBEAT_INTERVAL = 15000;
let ws: WebSocket | null = null;
let heartbeatTimer: number | null = null;

// Token processing queue
let tokenQueue: Token[] = [];
const BATCH_SIZE = 50;  // Increased batch size
let processingInterval: number | null = null;

// Initialize WebSocket connection
function initWebSocket(url: string) {
  try {
    console.log('WebSocket Worker: Initializing connection to', url);
    
    // Clear existing state
    tokenQueue = [];
    if (processingInterval) {
      clearInterval(processingInterval);
    }
    
    // Validate URL
    if (!url) {
      throw new Error('WebSocket URL is not defined');
    }
    
    // Close existing connection if any
    if (ws) {
      ws.close();
      ws = null;
    }
    
    ws = new WebSocket(url);
    
    ws.onopen = () => {
      console.log('WebSocket Worker: Connection established');
      postMessage({ type: 'CONNECTION_STATUS', data: { connected: true } });
      startHeartbeat();
      
      // Start token processing interval
      processingInterval = self.setInterval(() => {
        if (tokenQueue.length > 0) {
          processBatch();
        }
      }, 100); // Process every 100ms if there are tokens
      
      // Request initial tokens
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'REQUEST_INITIAL_TOKENS' }));
      }
    };
    
    ws.onclose = (event) => {
      console.log('WebSocket Worker: Connection closed', event.code, event.reason);
      postMessage({ type: 'CONNECTION_STATUS', data: { connected: false } });
      stopHeartbeat();
      
      // Clear processing interval
      if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
      }
      
      // Clear token queue
      tokenQueue = [];
      
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          console.log('WebSocket Worker: Attempting to reconnect...');
          initWebSocket(url);
        }
      }, 5000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket Worker: Error occurred:', error);
      const errorMessage = isError(error) ? error.toString() : 'Unknown error occurred';
      postMessage({ type: 'CONNECTION_STATUS', data: { connected: false, error: errorMessage } });
    };
    
    ws.onmessage = async (event) => {
      try {
        let message: WSMessage;
        try {
          // Try to parse as regular JSON first
          message = JSON.parse(event.data);
          console.log('WebSocket Worker: Received message:', message.type, message);
        } catch {
          try {
            // If that fails, try decompressing
            const decompressed = decompress(event.data);
            if (!decompressed) {
              throw new Error('Failed to decompress message');
            }
            message = JSON.parse(decompressed);
            console.log('WebSocket Worker: Received compressed message:', message.type, message);
          } catch (error) {
            console.error('WebSocket Worker: Failed to parse message:', error);
            return;
          }
        }
        
        switch (message.type) {
          case 'CONNECTED':
            console.log('WebSocket Worker: Connection confirmed by server');
            self.postMessage({ type: 'CONNECTION_STATUS', data: { connected: true } });
            break;
            
          case 'NEW_TOKEN':
            if (message.token) {
              console.log('WebSocket Worker: Processing new token:', message.token);
              const processedToken = processToken(message.token);
              console.log('WebSocket Worker: Processed token:', processedToken);
              tokenQueue.push(processedToken);
            }
            break;
            
          case 'BATCH_UPDATE':
            if (Array.isArray(message.data)) {
              console.log('WebSocket Worker: Processing batch of tokens:', message.data.length);
              message.data.forEach(token => {
                const processedToken = processToken(token);
                tokenQueue.push(processedToken);
              });
              console.log('WebSocket Worker: Queue size after batch:', tokenQueue.length);
            }
            break;
            
          case 'HEARTBEAT':
            ws?.send(JSON.stringify({ type: 'HEARTBEAT_ACK' }));
            break;
        }
      } catch (error) {
        console.error('WebSocket Worker: Error processing message:', error);
      }
    };
  } catch (error) {
    console.error('WebSocket Worker: Error initializing connection:', error);
    postMessage({ type: 'CONNECTION_STATUS', data: { connected: false, error: error.toString() } });
  }
}

// Process batch of tokens
function processBatch() {
  if (tokenQueue.length === 0) return;
  
  const batch = tokenQueue.splice(0, BATCH_SIZE);
  console.log('WebSocket Worker: Processing batch of', batch.length, 'tokens');
  
  // Send the processed batch to the main thread
  self.postMessage({
    type: 'BATCH_PROCESSED',
    data: batch
  });
  
  console.log('WebSocket Worker: Remaining tokens in queue:', tokenQueue.length);
}

// Heartbeat management
function startHeartbeat() {
  heartbeatTimer = self.setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(compress(JSON.stringify({ type: 'HEARTBEAT' })));
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// Calculate risk level based on token properties
const calculateRiskLevel = (token: any): 'safe' | 'warning' | 'danger' => {
  // High risk indicators
  if (
    token.hpIsHoneypot ||
    token.gpIsBlacklisted ||
    token.gpSelfDestruct ||
    token.gpHiddenOwner ||
    token.gpCanTakeBackOwnership ||
    token.gpIsAirdropScam ||
    token.gpFakeToken
  ) {
    return 'danger';
  }

  // Medium risk indicators
  if (
    token.gpSlippageModifiable ||
    token.gpPersonalSlippageModifiable ||
    token.gpAntiWhaleModifiable ||
    token.gpCannotSellAll ||
    token.gpCannotBuy ||
    (token.gpBuyTax && token.gpBuyTax > 10) ||
    (token.gpSellTax && token.gpSellTax > 10)
  ) {
    return 'warning';
  }

  return 'safe';
};

// Process token data
const processToken = (tokenData: any) => {
  const processed = {
    tokenAddress: tokenData.token_address,
    tokenName: tokenData.token_name,
    tokenSymbol: tokenData.token_symbol,
    tokenDecimals: tokenData.token_decimals,
    tokenAgeHours: tokenData.token_age_hours,
    pairAddress: tokenData.pair_address,
    scanTimestamp: tokenData.scan_timestamp,
    
    // Honeypot detection
    hpSimulationSuccess: Boolean(tokenData.hp_simulation_success),
    hpIsHoneypot: Boolean(tokenData.hp_is_honeypot),
    hpHoneypotReason: tokenData.hp_honeypot_reason,
    hpBuyTax: tokenData.hp_buy_tax,
    hpSellTax: tokenData.hp_sell_tax,
    hpTransferTax: tokenData.hp_transfer_tax,
    hpBuyGasUsed: tokenData.hp_buy_gas_used,
    hpSellGasUsed: tokenData.hp_sell_gas_used,
    hpLiquidityAmount: tokenData.hp_liquidity_amount,
    hpPairReserves0: tokenData.hp_pair_reserves0,
    hpPairReserves1: tokenData.hp_pair_reserves1,
    hpCreationTime: tokenData.hp_creation_time,
    hpHolderCount: tokenData.hp_holder_count,
    hpPairToken0Symbol: tokenData.hp_pair_token0_symbol,
    hpPairToken1Symbol: tokenData.hp_pair_token1_symbol,
    hpPairLiquidity: tokenData.hp_pair_liquidity,
    hpDeployerAddress: tokenData.hp_deployer_address || '',
    
    // GoPlus security analysis
    gpIsOpenSource: Boolean(tokenData.gp_is_open_source),
    gpIsProxy: Boolean(tokenData.gp_is_proxy),
    gpIsMintable: Boolean(tokenData.gp_is_mintable),
    gpCanBeMinted: Boolean(tokenData.gp_can_be_minted),
    gpOwnerAddress: tokenData.gp_owner_address,
    gpCreatorAddress: tokenData.gp_creator_address,
    gpHasProxyCalls: Boolean(tokenData.gp_has_proxy_calls),
    gpCanTakeBackOwnership: Boolean(tokenData.gp_can_take_back_ownership),
    gpOwnerChangeBalance: Boolean(tokenData.gp_owner_change_balance),
    gpHiddenOwner: Boolean(tokenData.gp_hidden_owner),
    gpSelfDestruct: Boolean(tokenData.gp_selfdestruct),
    gpExternalCall: Boolean(tokenData.gp_external_call),
    gpBuyTax: tokenData.gp_buy_tax,
    gpSellTax: tokenData.gp_sell_tax,
    gpIsAntiWhale: Boolean(tokenData.gp_is_anti_whale),
    gpAntiWhaleModifiable: Boolean(tokenData.gp_anti_whale_modifiable),
    gpCannotBuy: Boolean(tokenData.gp_cannot_buy),
    gpCannotSellAll: Boolean(tokenData.gp_cannot_sell_all),
    gpSlippageModifiable: Boolean(tokenData.gp_slippage_modifiable),
    gpPersonalSlippageModifiable: Boolean(tokenData.gp_personal_slippage_modifiable),
    gpTradingCooldown: Boolean(tokenData.gp_trading_cooldown),
    gpIsBlacklisted: Boolean(tokenData.gp_is_blacklisted),
    gpIsWhitelisted: Boolean(tokenData.gp_is_whitelisted),
    gpIsInDex: Boolean(tokenData.gp_is_in_dex),
    gpTransferPausable: Boolean(tokenData.gp_transfer_pausable),
    gpTotalSupply: tokenData.gp_total_supply,
    gpHolderCount: tokenData.gp_holder_count,
    gpOwnerPercent: tokenData.gp_owner_percent,
    gpOwnerBalance: tokenData.gp_owner_balance,
    gpCreatorPercent: tokenData.gp_creator_percent,
    gpCreatorBalance: tokenData.gp_creator_balance,
    gpLpHolderCount: tokenData.gp_lp_holder_count,
    gpLpTotalSupply: tokenData.gp_lp_total_supply,
    gpIsTrueToken: Boolean(tokenData.gp_is_true_token),
    gpIsAirdropScam: Boolean(tokenData.gp_is_airdrop_scam),
    gpHoneypotWithSameCreator: Boolean(tokenData.gp_honeypot_with_same_creator),
    gpFakeToken: Boolean(tokenData.gp_fake_token),
    gpNote: tokenData.gp_note,
    gpTrustList: tokenData.gp_trust_list,
    gpOtherPotentialRisks: tokenData.gp_other_potential_risks,
    gpHolders: tokenData.gp_holders,
    gpLpHolders: tokenData.gp_lp_holders,
    gpDexInfo: tokenData.gp_dex_info,
    
    // Additional fields
    totalScans: tokenData.total_scans || 0,
    honeypotFailures: tokenData.honeypot_failures || 0,
    status: tokenData.status,
    lastError: tokenData.last_error,
    
    // Liquidity history
    liq10: tokenData.liq10 || 0,
    liq20: tokenData.liq20 || 0,
    liq30: tokenData.liq30 || 0,
    liq40: tokenData.liq40 || 0,
    liq50: tokenData.liq50 || 0,
    liq60: tokenData.liq60 || 0,
    liq70: tokenData.liq70 || 0,
    liq80: tokenData.liq80 || 0,
    liq90: tokenData.liq90 || 0,
    liq100: tokenData.liq100 || 0,
    liq110: tokenData.liq110 || 0,
    liq120: tokenData.liq120 || 0,
    liq130: tokenData.liq130 || 0,
    liq140: tokenData.liq140 || 0,
    liq150: tokenData.liq150 || 0,
    liq160: tokenData.liq160 || 0,
    liq170: tokenData.liq170 || 0,
    liq180: tokenData.liq180 || 0,
    liq190: tokenData.liq190 || 0,
    liq200: tokenData.liq200 || 0
  };

  // Add risk level
  return {
    ...processed,
    riskLevel: calculateRiskLevel(processed)
  };
};

// Add error type guard
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

// Message handler
self.onmessage = (event) => {
  const { type, payload } = event.data;
  console.log('WebSocket Worker: Received command:', type, payload);
  
  switch (type) {
    case 'INIT':
      initWebSocket(payload.url);
      break;
      
    case 'CLOSE':
      ws?.close();
      break;
  }
};

// Export type for TypeScript
export type {}; 