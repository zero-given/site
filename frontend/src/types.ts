import { Component } from 'solid-js';

export interface Token {
  // Basic token info
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenAgeHours: number;
  pairAddress: string;
  scanTimestamp: string;

  // Honeypot detection
  hpSimulationSuccess: boolean;
  hpIsHoneypot: boolean;
  hpHoneypotReason: string;
  hpBuyTax: number;
  hpSellTax: number;
  hpTransferTax: number;
  hpBuyGasUsed: number;
  hpSellGasUsed: number;
  hpLiquidityAmount: number;
  hpPairReserves0: string;
  hpPairReserves1: string;
  hpCreationTime: string;
  hpHolderCount: number;
  hpPairToken0Symbol: string;
  hpPairToken1Symbol: string;
  hpPairLiquidity: number;
  hpDeployerAddress: string;

  // GoPlus security analysis
  gpIsOpenSource: boolean;
  gpIsProxy: boolean;
  gpIsMintable: boolean;
  gpCanBeMinted: boolean;
  gpOwnerAddress: string;
  gpCreatorAddress: string;
  gpHasProxyCalls: boolean;
  gpCanTakeBackOwnership: boolean;
  gpOwnerChangeBalance: boolean;
  gpHiddenOwner: boolean;
  gpSelfDestruct: boolean;
  gpExternalCall: boolean;
  gpBuyTax: number;
  gpSellTax: number;
  gpIsAntiWhale: boolean;
  gpAntiWhaleModifiable: boolean;
  gpCannotBuy: boolean;
  gpCannotSellAll: boolean;
  gpSlippageModifiable: boolean;
  gpPersonalSlippageModifiable: boolean;
  gpTradingCooldown: boolean;
  gpIsBlacklisted: boolean;
  gpIsWhitelisted: boolean;
  gpIsInDex: boolean;
  gpTransferPausable: boolean;
  gpTotalSupply: string;
  gpHolderCount: number;
  gpOwnerPercent: number;
  gpOwnerBalance: string;
  gpCreatorPercent: number;
  gpCreatorBalance: string;
  gpLpHolderCount: number;
  gpLpTotalSupply: string;
  gpIsTrueToken: boolean;
  gpIsAirdropScam: boolean;
  gpHoneypotWithSameCreator: boolean;
  gpFakeToken: boolean;
  gpNote?: string;
  gpTrustList?: string;
  gpOtherPotentialRisks?: string;
  gpHolders?: string;
  gpLpHolders?: string;
  gpDexInfo?: string;
  gpLiquidity?: number;

  // Additional fields
  totalScans: number;
  honeypotFailures: number;
  status?: string;
  lastError?: string;
  riskLevel: 'safe' | 'warning' | 'danger';

  // Liquidity history
  liq10: number;
  liq20: number;
  liq30: number;
  liq40: number;
  liq50: number;
  liq60: number;
  liq70: number;
  liq80: number;
  liq90: number;
  liq100: number;
  liq110: number;
  liq120: number;
  liq130: number;
  liq140: number;
  liq150: number;
  liq160: number;
  liq170: number;
  liq180: number;
  liq190: number;
  liq200: number;

  history?: TokenHistory[];
}

export interface TokenHistory {
  timestamp: number;
  totalLiquidity: number;
  holderCount: number;
  lpHolderCount: number;
}

export type RiskLevel = 'safe' | 'warning' | 'danger';

export interface FilterState {
  minHolders: number;
  minLiquidity: number;
  hideHoneypots: boolean;
  showOnlyHoneypots: boolean;
  hideDanger: boolean;
  hideWarning: boolean;
  showOnlySafe: boolean;
  searchQuery: string;
  sortBy: SortField;
  sortDirection: SortDirection;
  maxRecords: number;
  hideStagnantHolders: boolean;
  hideStagnantLiquidity: boolean;
  stagnantRecordCount: number;
}

export type SortField = 
  | 'age' | 'age_asc'
  | 'holders' | 'holders_asc'
  | 'liquidity' | 'liquidity_asc'
  | 'safetyScore';
export type SortDirection = 'asc' | 'desc';

export interface PerformanceMetrics {
  lastRenderTime: number;
  averageRenderTime: number;
  totalRenders: number;
  fps: number;
  memory: number;
}

// Component Props Types
export interface TokenCardProps {
  token: Token;
  expanded: boolean;
  onToggleExpand: (e: MouseEvent) => void;
  style?: { [key: string]: string | number };
}

export interface SectionHeaderProps {
  icon: Component;
  title: string;
}

export interface TokenEventsListProps {
  tokens: Token[];
  onColorsChange: (colors: ThemeColors) => void;
}

export interface ThemeColors {
  gradientColor1: string;
  gradientColor2: string;
  bgGradientColor1: string;
  bgGradientColor2: string;
}

// WebSocket Types
export interface WSMessage {
  type: 'TOKEN_UPDATE' | 'BATCH_UPDATE' | 'HEARTBEAT' | 'NEW_TOKEN' | 'CONNECTED';
  data?: Token | Token[] | null;
  token?: any;  // For NEW_TOKEN messages
  timestamp: number;
}

// Search Index Configuration
export interface SearchConfig {
  document: {
    id: string;
    index: string[];
    store?: string[];
  };
}

export type TrendDirection = 'up' | 'down' | 'stagnant';

export interface ChartProps {
  token: Token;
  history: TokenHistory[];
  type: 'liquidity' | 'holders';
  onTrendUpdate?: (direction: TrendDirection) => void;
}
