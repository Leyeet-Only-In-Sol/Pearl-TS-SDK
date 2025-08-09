/**
 * Swap-related type definitions for Sui DLMM Protocol
 * Fixed version with proper optional property handling
 */

export interface SwapParams {
  poolId: string;
  tokenIn: string; // Coin type
  tokenOut: string; // Coin type
  amountIn: string;
  amountOutMin: string;
  recipient?: string;
  deadline?: number; // Unix timestamp
}

// FIXED: Proper optional handling
export interface SwapResult {
  amountIn: string;
  amountOut: string;
  feeAmount: string;
  protocolFee: string;
  binsCrossed: number;
  finalBinId: number;
  priceImpact: string; // As percentage
  transactionDigest: string;
  success: boolean;
  error?: string | undefined; // Explicitly allow undefined
}

export interface QuoteParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  poolId?: string; // Optional - will find best pool if not provided
}

export interface QuoteResult {
  amountOut: string;
  amountIn: string;
  priceImpact: string;
  feeAmount: string;
  gasEstimate: string;
  poolId: string;
  route: SwapRoute;
  isValid: boolean;
  slippageTolerance: number; // Recommended slippage in basis points
}

export interface SwapRoute {
  hops: RouteHop[];
  totalFee: string;
  estimatedGas: string;
  priceImpact: string;
  routeType: 'direct' | 'multi-hop';
}

export interface RouteHop {
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  binStep: number;
  expectedAmountIn: string;
  expectedAmountOut: string;
  expectedFee: string;
  priceImpact: string;
}

export interface MultiHopSwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin: string;
  route: SwapRoute;
  recipient?: string;
  deadline?: number;
}

export interface SwapHistory {
  swaps: SwapTransaction[];
  totalCount: number;
  hasMore: boolean;
}

export interface SwapTransaction {
  id: string;
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  feeAmount: string;
  priceImpact: string;
  binsCrossed: number;
  user: string;
  timestamp: string;
  transactionDigest: string;
}

// Slippage settings
export interface SlippageConfig {
  tolerance: number; // Basis points (100 = 1%)
  autoSlippage: boolean;
  maxSlippage: number; // Maximum allowed slippage
}

// Price impact warnings
export interface PriceImpactWarning {
  level: 'low' | 'medium' | 'high' | 'extreme';
  percentage: string;
  message: string;
  shouldWarn: boolean;
}

// Swap validation
export interface SwapValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  priceImpactWarning?: PriceImpactWarning;
}

// Real-time quote
export interface RealTimeQuote {
  quote: QuoteResult;
  lastUpdated: string;
  isStale: boolean;
  refreshInterval: number; // milliseconds
}