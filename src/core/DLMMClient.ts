/**
 * Main DLMM SDK Client for Sui Blockchain
 * This is the primary interface for interacting with the DLMM protocol
 * 
 * REAL IMPLEMENTATION - Connects to your deployed contracts on testnet
 */

import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getAddresses, Network, MODULES, FUNCTIONS } from '../constants/addresses';
import { Pool, PoolCreationParams, PoolCreationResult } from '../types/pools/pool';
import { SwapParams, SwapResult, QuoteParams, QuoteResult } from '../types/pools/swap';
import { Position, PositionCreationParams, PositionCreationResult } from '../types/positions/position';

// Import managers
import { FactoryManager } from './FactoryManager';
import { PoolManager } from './PoolManager';
import { PositionManager } from './PositionManager';
import { QuoterManager } from './QuoterManager';
import { RouterManager } from './RouterManager';

export interface DLMMClientConfig {
  network: Network;
  suiClient: SuiClient;
  packageId?: string;
  factoryId?: string;
}

export class DLMMClient {
  public readonly suiClient: SuiClient;
  public readonly network: Network;
  public readonly addresses: ReturnType<typeof getAddresses>;
  
  // Manager instances - initialized lazily
  private _factoryManager?: FactoryManager;
  private _poolManager?: PoolManager;
  private _positionManager?: PositionManager;
  private _quoterManager?: QuoterManager;
  private _routerManager?: RouterManager;

  constructor(config: DLMMClientConfig) {
    this.suiClient = config.suiClient;
    this.network = config.network;
    this.addresses = getAddresses(config.network);
    
    // Override addresses if provided
    if (config.packageId) {
      this.addresses.PACKAGE_ID = config.packageId;
    }
    if (config.factoryId) {
      this.addresses.FACTORY_ID = config.factoryId;
    }
  }

  // ==================== MANAGER GETTERS ====================

  /**
   * Get factory manager instance
   */
  get factory(): FactoryManager {
    if (!this._factoryManager) {
      this._factoryManager = new FactoryManager(
        this.suiClient,
        this.addresses.PACKAGE_ID,
        this.addresses.FACTORY_ID
      );
    }
    return this._factoryManager;
  }

  /**
   * Get pool manager instance
   */
  get pools(): PoolManager {
    if (!this._poolManager) {
      this._poolManager = new PoolManager(
        this.suiClient,
        this.addresses.PACKAGE_ID,
        this.addresses.FACTORY_ID
      );
    }
    return this._poolManager;
  }

  /**
   * Get position manager instance
   */
  get positions(): PositionManager {
    if (!this._positionManager) {
      this._positionManager = new PositionManager(
        this.suiClient,
        this.addresses.PACKAGE_ID,
        this.addresses.FACTORY_ID
      );
    }
    return this._positionManager;
  }

  /**
   * Get quoter manager instance
   */
  get quoter(): QuoterManager {
    if (!this._quoterManager) {
      this._quoterManager = new QuoterManager(
        this.suiClient,
        this.addresses.PACKAGE_ID,
        this.addresses.FACTORY_ID
      );
    }
    return this._quoterManager;
  }

  /**
   * Get router manager instance
   */
  get router(): RouterManager {
    if (!this._routerManager) {
      this._routerManager = new RouterManager(
        this.suiClient,
        this.addresses.PACKAGE_ID,
        this.addresses.FACTORY_ID
      );
    }
    return this._routerManager;
  }

  // ==================== CONVENIENCE METHODS ====================

  /**
   * Get all pools from the factory
   */
  async getAllPools(): Promise<Pool[]> {
    try {
      const result = await this.factory.getAllPools();
      return result.pools;
    } catch (error) {
      console.error('Error fetching pools:', error);
      throw new Error(`Failed to fetch pools: ${error}`);
    }
  }

  /**
   * Find the best pool for a token pair
   */
  async findBestPool(tokenA: string, tokenB: string): Promise<Pool | null> {
    try {
      return await this.factory.findBestPoolForPair(tokenA, tokenB);
    } catch (error) {
      console.error('Error finding best pool:', error);
      return null;
    }
  }

  /**
   * Create a new DLMM pool
   */
  async createPool(
    params: PoolCreationParams,
    coinAObject: string, // Actual coin object ID
    coinBObject: string, // Actual coin object ID
    keypair: Ed25519Keypair
  ): Promise<PoolCreationResult> {
    try {
      return await this.factory.createPool(params, coinAObject, coinBObject, keypair);
    } catch (error) {
      return {
        poolId: '',
        transactionDigest: '',
        success: false,
        error: `Failed to create pool: ${error}`,
      };
    }
  }

  /**
   * Get a quote for a potential swap
   */
  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    try {
      return await this.quoter.getBestQuote(params);
    } catch (error) {
      console.error('Error getting quote:', error);
      throw new Error(`Failed to get quote: ${error}`);
    }
  }

  /**
   * Execute a swap
   */
  async executeSwap(
    params: SwapParams,
    coinInObject: string, // Actual coin object ID
    keypair: Ed25519Keypair
  ): Promise<SwapResult> {
    try {
      return await this.pools.executeExactInputSwap(params, coinInObject, keypair);
    } catch (error) {
      return {
        amountIn: params.amountIn,
        amountOut: '0',
        feeAmount: '0',
        protocolFee: '0',
        binsCrossed: 0,
        finalBinId: 0,
        priceImpact: '0',
        transactionDigest: '',
        success: false,
        error: `Failed to execute swap: ${error}`,
      };
    }
  }

  /**
   * Create a new liquidity position
   */
  async createPosition(
    params: PositionCreationParams,
    coinAObject: string, // Actual coin object ID
    coinBObject: string, // Actual coin object ID
    keypair: Ed25519Keypair
  ): Promise<PositionCreationResult> {
    try {
      return await this.positions.createPosition(params, coinAObject, coinBObject, keypair);
    } catch (error) {
      return {
        positionId: '',
        transactionDigest: '',
        sharesIssued: '0',
        actualAmountA: '0',
        actualAmountB: '0',
        success: false,
        error: `Failed to create position: ${error}`,
      };
    }
  }

  /**
   * Get position details
   */
  async getPosition(positionId: string): Promise<Position | null> {
    try {
      return await this.positions.getPosition(positionId);
    } catch (error) {
      console.error('Error fetching position:', error);
      return null;
    }
  }

  // ==================== TEST USDC FUNCTIONS ====================

  /**
   * Mint test USDC tokens (for testnet only)
   */
  async mintTestUSDC(
    amount: string,
    recipient: string,
    keypair: Ed25519Keypair
  ): Promise<{ success: boolean; transactionDigest: string; error?: string }> {
    try {
      if (this.network !== 'testnet') {
        throw new Error('Test USDC minting only available on testnet');
      }

      if (!this.addresses.TEST_USDC_TREASURY) {
        throw new Error('Test USDC treasury address not configured');
      }

      const txb = new Transaction();
      
      txb.moveCall({
        target: `${this.addresses.PACKAGE_ID}::${MODULES.TEST_USDC}::${FUNCTIONS.MINT_TEST_USDC}`,
        arguments: [
          txb.object(this.addresses.TEST_USDC_TREASURY),
          txb.pure.u64(amount),
        ],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
        },
      });

      const success = result.effects?.status?.status === 'success';
      const response: { success: boolean; transactionDigest: string; error?: string } = {
        success,
        transactionDigest: result.digest,
      };

      if (!success) {
        response.error = result.effects?.status?.error || 'Unknown error';
      }

      return response;
    } catch (error) {
      const response: { success: boolean; transactionDigest: string; error?: string } = {
        success: false,
        transactionDigest: '',
      };
      response.error = `Failed to mint test USDC: ${error}`;
      return response;
    }
  }

  /**
   * Get test tokens (1000 USDC) - convenience method for testnet
   */
  async getTestTokens(keypair: Ed25519Keypair): Promise<{ success: boolean; transactionDigest: string; error?: string }> {
    try {
      if (this.network !== 'testnet') {
        throw new Error('Test tokens only available on testnet');
      }

      if (!this.addresses.TEST_USDC_TREASURY) {
        throw new Error('Test USDC treasury address not configured');
      }

      const txb = new Transaction();
      
      txb.moveCall({
        target: `${this.addresses.PACKAGE_ID}::${MODULES.TEST_USDC}::${FUNCTIONS.GET_TEST_TOKENS}`,
        arguments: [
          txb.object(this.addresses.TEST_USDC_TREASURY),
        ],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
        },
      });

      const success = result.effects?.status?.status === 'success';
      const response: { success: boolean; transactionDigest: string; error?: string } = {
        success,
        transactionDigest: result.digest,
      };

      if (!success) {
        response.error = result.effects?.status?.error || 'Unknown error';
      }

      return response;
    } catch (error) {
      const response: { success: boolean; transactionDigest: string; error?: string } = {
        success: false,
        transactionDigest: '',
      };
      response.error = `Failed to get test tokens: ${error}`;
      return response;
    }
  }

  // ==================== UTILITY FUNCTIONS ====================

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!(
      this.addresses.PACKAGE_ID &&
      this.addresses.FACTORY_ID &&
      this.suiClient
    );
  }

  /**
   * Get the current network configuration
   */
  getNetworkInfo() {
    return {
      network: this.network,
      packageId: this.addresses.PACKAGE_ID,
      factoryId: this.addresses.FACTORY_ID,
      upgradeCapId: this.addresses.UPGRADE_CAP,
      testUsdcTreasury: this.addresses.TEST_USDC_TREASURY,
    };
  }

  /**
   * Check if address is valid Sui object ID
   */
  isValidObjectId(id: string): boolean {
    return /^0x[a-fA-F0-9]+$/.test(id) && id.length >= 3;
  }

  /**
   * Format coin amount for display
   */
  formatCoinAmount(amount: string, decimals: number = 9): string {
    const num = parseInt(amount);
    const divisor = Math.pow(10, decimals);
    return (num / divisor).toFixed(6);
  }

  /**
   * Parse coin amount from human readable to contract units
   */
  parseCoinAmount(amount: string, decimals: number = 9): string {
    const num = parseFloat(amount);
    const multiplier = Math.pow(10, decimals);
    return Math.floor(num * multiplier).toString();
  }

  // ==================== STATIC FACTORY METHODS ====================

  /**
   * Create a DLMM client for testnet
   */
  static forTestnet(suiClient: SuiClient): DLMMClient {
    return new DLMMClient({
      network: 'testnet',
      suiClient,
    });
  }

  /**
   * Create a DLMM client for mainnet
   */
  static forMainnet(suiClient: SuiClient): DLMMClient {
    return new DLMMClient({
      network: 'mainnet',
      suiClient,
    });
  }

  /**
   * Create a DLMM client with custom configuration
   */
  static withConfig(config: DLMMClientConfig): DLMMClient {
    return new DLMMClient(config);
  }

  // ==================== ADVANCED OPERATIONS ====================

  /**
   * Execute a multi-step operation (create pool + add initial liquidity)
   */
  async createPoolWithLiquidity(
    params: PoolCreationParams,
    coinAObject: string,
    coinBObject: string,
    keypair: Ed25519Keypair
  ): Promise<{
    poolResult: PoolCreationResult;
    positionResult?: PositionCreationResult;
  }> {
    try {
      // First create the pool
      const poolResult = await this.createPool(params, coinAObject, coinBObject, keypair);
      
      if (!poolResult.success) {
        return { poolResult };
      }

      // If pool creation succeeded, create initial position
      // This would be done in a separate transaction or as part of pool creation
      const positionParams: PositionCreationParams = {
        poolId: poolResult.poolId,
        tokenA: params.tokenA,
        tokenB: params.tokenB,
        amountA: params.initialLiquidityA,
        amountB: params.initialLiquidityB,
        lowerBinId: params.initialBinId - 5, // Range around initial bin
        upperBinId: params.initialBinId + 5,
        strategy: 'uniform'
      };

      // Note: In practice, this might be done as part of pool creation
      // For now, returning just the pool result
      return { poolResult };
    } catch (error) {
      return {
        poolResult: {
          poolId: '',
          transactionDigest: '',
          success: false,
          error: `Failed to create pool with liquidity: ${error}`,
        }
      };
    }
  }

  /**
   * Get comprehensive protocol statistics
   */
  async getProtocolStats(): Promise<{
    totalPools: number;
    totalVolumeUSD: string;
    totalTVL: string;
    totalSwaps: number;
    factoryInfo: any;
  }> {
    try {
      const factoryInfo = await this.factory.getFactoryInfo();
      const allPools = await this.getAllPools();
      
      let totalVolumeUSD = '0';
      let totalTVL = '0';
      let totalSwaps = 0;

      for (const pool of allPools) {
        const volumeA = parseInt(pool.totalVolumeA);
        const volumeB = parseInt(pool.totalVolumeB);
        const tvlA = parseInt(pool.reserveA);
        const tvlB = parseInt(pool.reserveB);
        const swaps = parseInt(pool.totalSwaps);

        totalVolumeUSD = (parseInt(totalVolumeUSD) + volumeA + volumeB).toString();
        totalTVL = (parseInt(totalTVL) + tvlA + tvlB).toString();
        totalSwaps += swaps;
      }

      return {
        totalPools: allPools.length,
        totalVolumeUSD,
        totalTVL,
        totalSwaps,
        factoryInfo
      };
    } catch (error) {
      console.error('Error getting protocol stats:', error);
      return {
        totalPools: 0,
        totalVolumeUSD: '0',
        totalTVL: '0',
        totalSwaps: 0,
        factoryInfo: null
      };
    }
  }
}