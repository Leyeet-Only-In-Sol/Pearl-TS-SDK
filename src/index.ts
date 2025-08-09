/**
 * Sui DLMM SDK - Main Entry Point
 * 
 * This SDK provides a comprehensive interface for interacting with the Sui DLMM Protocol.
 * It includes functionality for:
 * - Pool management and discovery
 * - Liquidity position creation and management
 * - Multi-hop routing and swap execution
 * - Real-time price quotation
 * - Factory operations
 * 
 * @version 1.0.0
 * @author Sui DLMM Team
 */

// ==================== CORE MANAGERS ====================

// Main client - import for internal use and re-export
import { DLMMClient, type DLMMClientConfig } from './core/DLMMClient';
export { DLMMClient, type DLMMClientConfig };

// Core managers
export { FactoryManager, type FactoryInfo } from './core/FactoryManager';
export { PoolManager, type PoolOperationOptions, type LiquidityParams, type BinLiquidityResult } from './core/PoolManager';
export { PositionManager, type PositionOperationOptions, type PositionDiscoveryResult, type FeeCollectionResult, type PositionModificationResult } from './core/PositionManager';
export { QuoterManager, type QuoteOptions, type MultiRouteQuote } from './core/QuoterManager';
export { RouterManager, type RouterOptions, type RouterStats, type OptimalRouteParams } from './core/RouterManager';

// ==================== TYPE DEFINITIONS ====================

// Pool types
export type {
  Pool,
  TokenInfo,
  PoolCreationParams,
  PoolCreationResult,
  BinInfo,
  PoolStats,
  PoolFilters,
  PoolSortOptions,
  PoolDiscoveryResult,
  PoolAnalytics,
  PricePoint,
  VolumePoint,
  LiquidityPoint,
  PoolValidation
} from './types/pools/pool';

// Swap types
export type {
  SwapParams,
  SwapResult,
  QuoteParams,
  QuoteResult,
  SwapRoute,
  RouteHop,
  MultiHopSwapParams,
  SwapHistory,
  SwapTransaction,
  SlippageConfig,
  PriceImpactWarning,
  SwapValidation,
  RealTimeQuote
} from './types/pools/swap';

// Position types
export type {
  Position,
  PositionStrategy,
  PositionCreationParams,
  PositionCreationResult,
  SimplePositionParams,
  BinPosition,
  PositionMetrics,
  PositionAnalytics,
  FeeEarning,
  PerformancePoint,
  PositionRebalanceParams,
  PositionModification,
  PositionFilters,
  PositionSortOptions,
  PositionRecommendation,
  PositionValidation
} from './types/positions/position';

// ==================== CONSTANTS & ADDRESSES ====================

export {
  TESTNET_ADDRESSES,
  MAINNET_ADDRESSES,
  DEVNET_ADDRESSES,
  getAddresses,
  MODULES,
  FUNCTIONS,
  type NetworkAddresses,
  type Network
} from './constants/addresses';

// ==================== UTILITY FUNCTIONS ====================

/**
 * Create a DLMM client for testnet with sensible defaults
 */
export function createTestnetClient(suiClient: any) {
  return DLMMClient.forTestnet(suiClient);
}

/**
 * Create a DLMM client for mainnet with sensible defaults
 */
export function createMainnetClient(suiClient: any) {
  return DLMMClient.forMainnet(suiClient);
}

/**
 * Create a DLMM client with custom configuration
 */
export function createCustomClient(config: DLMMClientConfig) {
  return DLMMClient.withConfig(config);
}

// ==================== HELPER UTILITIES ====================

/**
 * Convert basis points to percentage
 */
export function bpsToPercentage(bps: number): number {
  return bps / 100;
}

/**
 * Convert percentage to basis points
 */
export function percentageToBps(percentage: number): number {
  return percentage * 100;
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: string, decimals: number = 9): string {
  const num = parseInt(amount);
  const divisor = Math.pow(10, decimals);
  return (num / divisor).toFixed(6);
}

/**
 * Parse token amount to raw units
 */
export function parseTokenAmount(amount: string, decimals: number = 9): string {
  const num = parseFloat(amount);
  const multiplier = Math.pow(10, decimals);
  return Math.floor(num * multiplier).toString();
}

/**
 * Calculate price from bin ID and bin step
 */
export function calculateBinPrice(binId: number, binStep: number): string {
  // Price formula: (1 + binStep/10000)^binId
  const base = 1 + binStep / 10000;
  const price = Math.pow(base, binId);
  return (price * Math.pow(2, 64)).toString(); // Scale by 2^64
}

/**
 * Get bin ID from price and bin step
 */
export function getBinIdFromPrice(price: string, binStep: number): number {
  const priceNum = parseFloat(price) / Math.pow(2, 64); // Unscale
  const base = 1 + binStep / 10000;
  return Math.round(Math.log(priceNum) / Math.log(base));
}

/**
 * Calculate APR from daily fee rate
 */
export function calculateAPR(dailyFeeRate: number): number {
  return dailyFeeRate * 365 * 100; // Convert to annual percentage
}

/**
 * Calculate position value in USD (simplified)
 */
export function calculatePositionValueUSD(
  amountA: string,
  amountB: string,
  priceA: number,
  priceB: number
): number {
  const valueA = parseInt(amountA) * priceA;
  const valueB = parseInt(amountB) * priceB;
  return valueA + valueB;
}

/**
 * Validate Sui address format
 */
export function isValidSuiAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

/**
 * Validate coin type format
 */
export function isValidCoinType(coinType: string): boolean {
  // Basic validation for coin type format: package::module::type
  return /^0x[a-fA-F0-9]+::[a-zA-Z_][a-zA-Z0-9_]*::[a-zA-Z_][a-zA-Z0-9_]*$/.test(coinType);
}

/**
 * Get token symbol from coin type
 */
export function getTokenSymbol(coinType: string): string {
  const parts = coinType.split('::');
  return parts[parts.length - 1] || 'UNKNOWN';
}

/**
 * Calculate slippage amount
 */
export function calculateSlippageAmount(
  amount: string,
  slippageBps: number,
  isMinimum: boolean = true
): string {
  const amountNum = parseInt(amount);
  const slippageMultiplier = isMinimum 
    ? (10000 - slippageBps) / 10000  // Minimum output
    : (10000 + slippageBps) / 10000; // Maximum input
  
  return Math.floor(amountNum * slippageMultiplier).toString();
}

/**
 * Check if price impact is acceptable
 */
export function isPriceImpactAcceptable(priceImpact: string, maxImpactBps: number = 500): boolean {
  const impact = parseFloat(priceImpact);
  const maxImpact = maxImpactBps / 100; // Convert basis points to percentage
  return impact <= maxImpact;
}

/**
 * Generate pool key from token types
 */
export function generatePoolKey(tokenA: string, tokenB: string, binStep: number): string {
  // Sort tokens to ensure consistent key generation
  const [first, second] = [tokenA, tokenB].sort();
  return `${first}::${second}::${binStep}`;
}

/**
 * Calculate total value locked (TVL)
 */
export function calculateTVL(reserveA: string, reserveB: string): string {
  return (parseInt(reserveA) + parseInt(reserveB)).toString();
}

/**
 * Estimate transaction deadline
 */
export function estimateDeadline(minutesFromNow: number = 5): number {
  return Date.now() + (minutesFromNow * 60 * 1000);
}

// ==================== ERROR HANDLING ====================

/**
 * SDK-specific error class
 */
export class DLMMError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DLMMError';
  }
}

/**
 * Create error for invalid parameters
 */
export function createValidationError(message: string, details?: any): DLMMError {
  return new DLMMError(message, 'VALIDATION_ERROR', details);
}

/**
 * Create error for network issues
 */
export function createNetworkError(message: string, details?: any): DLMMError {
  return new DLMMError(message, 'NETWORK_ERROR', details);
}

/**
 * Create error for contract interaction issues
 */
export function createContractError(message: string, details?: any): DLMMError {
  return new DLMMError(message, 'CONTRACT_ERROR', details);
}

// ==================== VERSION INFO ====================

/**
 * SDK version information
 */
export const SDK_VERSION = '1.0.0';

/**
 * Supported protocol version
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Get SDK information
 */
export function getSDKInfo() {
  return {
    name: 'sui-dlmm-sdk',
    version: SDK_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    description: 'TypeScript SDK for Sui DLMM Protocol',
    features: [
      'Pool Management',
      'Position Creation & Management',
      'Multi-hop Routing',
      'Real-time Quotation',
      'Factory Operations'
    ]
  };
}

// ==================== DEFAULT EXPORTS ====================

/**
 * Default export - DLMMClient for convenience
 */
export { DLMMClient as default };

// ==================== RE-EXPORTS FOR CONVENIENCE ====================

// Re-export common Sui types that users might need
export type { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
export type { Transaction } from '@mysten/sui/transactions';
export type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';