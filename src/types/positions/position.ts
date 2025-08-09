/**
 * Position-related type definitions for Sui DLMM Protocol
 */

export interface Position {
  id: string;
  poolId: string;
  owner: string;
  lowerBinId: number;
  upperBinId: number;
  strategy: PositionStrategy;
  totalLiquidityA: string;
  totalLiquidityB: string;
  unclaimedFeesA: string;
  unclaimedFeesB: string;
  createdAt: string;
  lastRebalance: string;
  isActive: boolean;
}

export type PositionStrategy = 'uniform' | 'curve' | 'bid-ask';

export interface PositionCreationParams {
  poolId: string;
  tokenA: string; // Coin type
  tokenB: string; // Coin type
  amountA: string;
  amountB: string;
  lowerBinId: number;
  upperBinId: number;
  strategy: PositionStrategy;
  customWeights?: number[]; // Optional custom distribution weights
}

export interface SimplePositionParams {
  poolId: string;
  tokenA: string;
  tokenB: string;
  amountA: string;
  amountB: string;
  rangeBins: number; // Number of bins on each side of active bin
  strategy: PositionStrategy;
}

export interface BinPosition {
  binId: number;
  shares: string;
  liquidityA: string;
  liquidityB: string;
  weight: number;
  feeGrowthInsideLastA: string;
  feeGrowthInsideLastB: string;
  unclaimedFeesA: string;
  unclaimedFeesB: string;
}

export interface PositionMetrics {
  utilization: number; // Percentage of bins with liquidity
  inRange: boolean; // Is position in range of current active bin
  totalFeesEarned: {
    tokenA: string;
    tokenB: string;
  };
  impermanentLoss: {
    percentage: number;
    valueA: string;
    valueB: string;
  };
  roi: number; // Return on investment percentage
  apr: number; // Annual percentage rate
}

export interface PositionAnalytics {
  position: Position;
  metrics: PositionMetrics;
  binPositions: BinPosition[];
  feeHistory: FeeEarning[];
  performanceHistory: PerformancePoint[];
}

export interface FeeEarning {
  timestamp: string;
  feeA: string;
  feeB: string;
  binId: number;
  transactionDigest: string;
}

export interface PerformancePoint {
  timestamp: string;
  totalValueA: string;
  totalValueB: string;
  unclaimedFeesA: string;
  unclaimedFeesB: string;
  roi: number;
  apr: number;
}

export interface PositionRebalanceParams {
  positionId: string;
  newStrategy?: PositionStrategy;
  newRange?: {
    lowerBinId: number;
    upperBinId: number;
  };
  autoRebalance?: boolean;
}

export interface PositionModification {
  type: 'add_liquidity' | 'remove_liquidity' | 'collect_fees' | 'rebalance';
  amountA?: string;
  amountB?: string;
  percentage?: number; // For partial removal
  timestamp: string;
  transactionDigest: string;
}

// Position filters and sorting
export interface PositionFilters {
  owner?: string;
  poolId?: string;
  strategy?: PositionStrategy[];
  isActive?: boolean;
  minLiquidity?: string;
  maxLiquidity?: string;
  inRange?: boolean;
}

export interface PositionSortOptions {
  sortBy: 'createdAt' | 'totalLiquidity' | 'fees' | 'roi' | 'apr';
  sortOrder: 'asc' | 'desc';
}

// Position recommendations
export interface PositionRecommendation {
  strategy: PositionStrategy;
  rangeBins: number;
  reasoning: string;
  expectedApr: number;
  riskLevel: 'low' | 'medium' | 'high';
  capitalEfficiency: number;
}

// Position validation
export interface PositionValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: PositionRecommendation[];
}

// Position creation result
export interface PositionCreationResult {
  positionId: string;
  transactionDigest: string;
  sharesIssued: string;
  actualAmountA: string;
  actualAmountB: string;
  success: boolean;
  error?: string;
}