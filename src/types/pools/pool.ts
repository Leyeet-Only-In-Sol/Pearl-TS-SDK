/**
 * Pool-related type definitions for Sui DLMM Protocol
 * Fixed version with proper optional property handling
 */

export interface Pool {
  id: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  binStep: number;
  reserveA: string;
  reserveB: string;
  activeBinId: number;
  totalSwaps: string;
  totalVolumeA: string;
  totalVolumeB: string;
  isActive: boolean;
  currentPrice: string;
  createdAt: string;
  lastUpdated: string;
}

export interface TokenInfo {
  coinType: string;
  symbol: string;
  decimals: number;
  name?: string;
  iconUrl?: string;
}

export interface PoolCreationParams {
  tokenA: string; // Coin type
  tokenB: string; // Coin type
  binStep: number;
  initialPrice: string;
  initialBinId: number;
  initialLiquidityA: string;
  initialLiquidityB: string;
}

export interface BinInfo {
  binId: number;
  price: string;
  liquidityA: string;
  liquidityB: string;
  totalShares: string;
  feeGrowthA: string;
  feeGrowthB: string;
  isActive: boolean;
}

export interface PoolStats {
  tvl: string; // Total Value Locked
  volume24h: string;
  fees24h: string;
  apr: number; // Annual Percentage Rate
  utilization: number; // Percentage
}

export interface PoolFilters {
  minTvl?: string;
  maxTvl?: string;
  minVolume24h?: string;
  tokenA?: string;
  tokenB?: string;
  binSteps?: number[];
  isActive?: boolean;
}

export interface PoolSortOptions {
  sortBy: 'tvl' | 'volume24h' | 'fees24h' | 'apr' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

// Pool discovery result
export interface PoolDiscoveryResult {
  pools: Pool[];
  totalCount: number;
  hasMore: boolean;
}

// Pool analytics
export interface PoolAnalytics {
  pool: Pool;
  stats: PoolStats;
  priceHistory: PricePoint[];
  volumeHistory: VolumePoint[];
  liquidityHistory: LiquidityPoint[];
  bins: BinInfo[];
}

export interface PricePoint {
  timestamp: string;
  price: string;
  binId: number;
}

export interface VolumePoint {
  timestamp: string;
  volumeA: string;
  volumeB: string;
  swapCount: number;
}

export interface LiquidityPoint {
  timestamp: string;
  liquidityA: string;
  liquidityB: string;
  totalShares: string;
}

// Pool creation result - FIXED: Proper optional handling
export interface PoolCreationResult {
  poolId: string;
  transactionDigest: string;
  success: boolean;
  error?: string | undefined; // Explicitly allow undefined
}

// Pool validation
export interface PoolValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}