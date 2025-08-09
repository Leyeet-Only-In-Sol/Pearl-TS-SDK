/**
 * Main DLMM SDK Client for Sui Blockchain
 * This is the primary interface for interacting with the DLMM protocol
 */

import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getAddresses, Network, MODULES } from '../constants/addresses';
import { Pool, PoolCreationParams, PoolCreationResult } from '../types/pools/pool';
import { SwapParams, SwapResult, QuoteParams, QuoteResult } from '../types/pools/swap';
import { Position, PositionCreationParams, PositionCreationResult } from '../types/positions/position';

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
  
  // Manager instances will be initialized lazily
  private _factoryManager?: any;
  private _poolManager?: any;
  private _positionManager?: any;
  private _quoterManager?: any;
  private _routerManager?: any;

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

  // ==================== FACTORY OPERATIONS ====================

  /**
   * Get all pools from the factory
   */
  async getAllPools(): Promise<Pool[]> {
    try {
      // Query all pools from the factory
      const response = await this.suiClient.getObject({
        id: this.addresses.FACTORY_ID,
        options: {
          showContent: true,
          showType: true,
        }
      });

      if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
        throw new Error('Factory object not found or invalid');
      }

      // For now, return empty array - will be implemented when we add FactoryManager
      return [];
    } catch (error) {
      console.error('Error fetching pools:', error);
      throw new Error(`Failed to fetch pools: ${error}`);
    }
  }

  /**
   * Create a new DLMM pool
   */
  async createPool(
    params: PoolCreationParams,
    keypair: Ed25519Keypair
  ): Promise<PoolCreationResult> {
    try {
      const txb = new Transaction();
      
      // Build the create pool transaction
      txb.moveCall({
        target: `${this.addresses.PACKAGE_ID}::${MODULES.FACTORY}::create_and_store_pool`,
        typeArguments: [params.tokenA, params.tokenB],
        arguments: [
          txb.object(this.addresses.FACTORY_ID),
          txb.pure.u16(params.binStep),
          txb.pure.u128(params.initialPrice),
          txb.pure.u32(params.initialBinId),
          // Note: In real implementation, these would be actual coin objects
          txb.pure.u64(params.initialLiquidityA),
          txb.pure.u64(params.initialLiquidityB),
          txb.object('0x6'), // Clock object
        ],
      });

      // Execute transaction
      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      return {
        poolId: '', // Extract from result
        transactionDigest: result.digest,
        success: result.effects?.status?.status === 'success',
        error: result.effects?.status?.status === 'failure' ? 
          (result.effects?.status?.error || 'Unknown error') : undefined,
      };
    } catch (error) {
      return {
        poolId: '',
        transactionDigest: '',
        success: false,
        error: `Failed to create pool: ${error}`,
      };
    }
  }

  // ==================== SWAP OPERATIONS ====================

  /**
   * Get a quote for a potential swap
   */
  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    try {
      // Call the quoter to get swap quote
      const response = await this.suiClient.devInspectTransactionBlock({
        transactionBlock: this.buildQuoteTransaction(params),
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      // Parse the response to extract quote data
      if (response.results?.[0]?.returnValues) {
        // Parse the return values to construct QuoteResult
        return {
          amountOut: '0', // Parse from response
          amountIn: params.amountIn,
          priceImpact: '0', // Parse from response
          feeAmount: '0', // Parse from response
          gasEstimate: '150000', // Estimate
          poolId: params.poolId || '',
          route: {
            hops: [],
            totalFee: '0',
            estimatedGas: '150000',
            priceImpact: '0',
            routeType: 'direct',
          },
          isValid: true,
          slippageTolerance: 50, // 0.5% default
        };
      }

      throw new Error('Invalid quote response');
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
    keypair: Ed25519Keypair
  ): Promise<SwapResult> {
    try {
      const txb = new Transaction();
      
      // Build the swap transaction
      txb.moveCall({
        target: `${this.addresses.PACKAGE_ID}::${MODULES.DLMM_POOL}::swap`,
        typeArguments: [params.tokenIn, params.tokenOut],
        arguments: [
          txb.object(params.poolId),
          // Note: In real implementation, this would be actual coin object
          txb.pure.u64(params.amountIn),
          txb.pure.u64(params.amountOutMin),
          txb.pure.bool(true), // zero_for_one
          txb.object('0x6'), // Clock object
        ],
      });

      // Execute transaction
      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      return {
        amountIn: params.amountIn,
        amountOut: '0', // Extract from result
        feeAmount: '0', // Extract from result
        protocolFee: '0', // Extract from result
        binsCrossed: 1, // Extract from result
        finalBinId: 1000, // Extract from result
        priceImpact: '0', // Extract from result
        transactionDigest: result.digest,
        success: result.effects?.status?.status === 'success',
        error: result.effects?.status?.status === 'failure' ? 
          (result.effects?.status?.error || 'Unknown error') : undefined,
      };
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

  // ==================== POSITION OPERATIONS ====================

  /**
   * Create a new liquidity position
   */
  async createPosition(
    params: PositionCreationParams,
    keypair: Ed25519Keypair
  ): Promise<PositionCreationResult> {
    try {
      const txb = new Transaction();
      
      // Build the create position transaction
      txb.moveCall({
        target: `${this.addresses.PACKAGE_ID}::${MODULES.POSITION_MANAGER}::create_position_simple`,
        typeArguments: [params.tokenA, params.tokenB],
        arguments: [
          txb.object(params.poolId),
          // Note: In real implementation, these would be actual coin objects
          txb.pure.u64(params.amountA),
          txb.pure.u64(params.amountB),
          txb.pure.u32(params.upperBinId - params.lowerBinId), // rangeBins
          txb.pure.u8(this.strategyToNumber(params.strategy)),
          txb.object('0x6'), // Clock object
        ],
      });

      // Execute transaction
      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      return {
        positionId: '', // Extract from result
        transactionDigest: result.digest,
        sharesIssued: '0', // Extract from result
        actualAmountA: params.amountA,
        actualAmountB: params.amountB,
        success: result.effects?.status?.status === 'success',
        error: result.effects?.status?.status === 'failure' ? 
          (result.effects?.status?.error || 'Unknown error') : undefined,
      };
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
      const response = await this.suiClient.getObject({
        id: positionId,
        options: {
          showContent: true,
          showType: true,
        }
      });

      if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
        return null;
      }

      // Parse the position data from the response
      // This would need to be implemented based on the actual Move struct format
      return {
        id: positionId,
        poolId: '', // Extract from response
        owner: '', // Extract from response
        lowerBinId: 0, // Extract from response
        upperBinId: 0, // Extract from response
        strategy: 'uniform', // Extract from response
        totalLiquidityA: '0', // Extract from response
        totalLiquidityB: '0', // Extract from response
        unclaimedFeesA: '0', // Extract from response
        unclaimedFeesB: '0', // Extract from response
        createdAt: '', // Extract from response
        lastRebalance: '', // Extract from response
        isActive: true, // Extract from response
      };
    } catch (error) {
      console.error('Error fetching position:', error);
      return null;
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
    };
  }

  // ==================== PRIVATE HELPER FUNCTIONS ====================

  private buildQuoteTransaction(params: QuoteParams): Transaction {
    const txb = new Transaction();
    
    txb.moveCall({
      target: `${this.addresses.PACKAGE_ID}::${MODULES.QUOTER}::get_quote`,
      typeArguments: [params.tokenIn, params.tokenOut],
      arguments: [
        txb.object(this.addresses.FACTORY_ID),
        txb.pure.u64(params.amountIn),
        txb.object('0x6'), // Clock object
      ],
    });

    return txb;
  }

  private strategyToNumber(strategy: string): number {
    switch (strategy) {
      case 'uniform': return 0;
      case 'curve': return 1;
      case 'bid-ask': return 2;
      default: return 0;
    }
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
}