/**
 * FactoryManager - Handles all factory-related operations
 * Manages pool discovery, creation, and factory state queries
 */

import { SuiClient, SuiObjectResponse, PaginatedObjectsResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/bcs';
import { MODULES, FUNCTIONS } from '../constants/addresses';
import { 
  Pool, 
  PoolCreationParams, 
  PoolCreationResult, 
  PoolDiscoveryResult,
  PoolFilters,
  PoolSortOptions,
  TokenInfo 
} from '../types/pools/pool';

export interface FactoryInfo {
  poolCount: number;
  protocolFeeRate: number;
  admin: string;
  allowedBinSteps: number[];
  totalVolume: string;
  totalFees: string;
}

export class FactoryManager {
  constructor(
    private suiClient: SuiClient,
    private packageId: string,
    private factoryId: string
  ) {}

  // ==================== FACTORY STATE QUERIES ====================

  /**
   * Get factory information and statistics
   */
  async getFactoryInfo(): Promise<FactoryInfo> {
    try {
      const response = await this.suiClient.getObject({
        id: this.factoryId,
        options: {
          showContent: true,
          showType: true,
        }
      });

      if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
        throw new Error('Factory object not found');
      }

      const fields = (response.data.content as any).fields;
      
      return {
        poolCount: parseInt(fields.pool_count || '0'),
        protocolFeeRate: parseInt(fields.protocol_fee_rate || '300'),
        admin: fields.admin || '',
        allowedBinSteps: this.parseAllowedBinSteps(fields.allowed_bin_steps),
        totalVolume: '0', // Will be calculated from pool aggregation
        totalFees: '0', // Will be calculated from pool aggregation
      };
    } catch (error) {
      console.error('Error fetching factory info:', error);
      throw new Error(`Failed to fetch factory info: ${error}`);
    }
  }

  /**
   * Get all pools created by the factory
   */
  async getAllPools(
    filters?: PoolFilters,
    sortOptions?: PoolSortOptions
  ): Promise<PoolDiscoveryResult> {
    try {
      // Query all pool objects from the factory
      const pools = await this.discoverPoolsFromFactory();
      
      // Apply filters
      let filteredPools = pools;
      if (filters) {
        filteredPools = this.applyPoolFilters(pools, filters);
      }

      // Apply sorting
      if (sortOptions) {
        filteredPools = this.sortPools(filteredPools, sortOptions);
      }

      return {
        pools: filteredPools,
        totalCount: filteredPools.length,
        hasMore: false, // For now, we fetch all pools
      };
    } catch (error) {
      console.error('Error fetching pools:', error);
      throw new Error(`Failed to fetch pools: ${error}`);
    }
  }

  /**
   * Find the best pool for a specific token pair
   */
  async findBestPoolForPair(
    tokenA: string,
    tokenB: string,
    preferredBinStep?: number
  ): Promise<Pool | null> {
    try {
      // Use the contract's find_best_pool function
      const txb = new Transaction();
      
      txb.moveCall({
        target: `${this.packageId}::${MODULES.FACTORY}::${FUNCTIONS.FIND_BEST_POOL}`,
        typeArguments: [tokenA, tokenB],
        arguments: [
          txb.object(this.factoryId),
        ],
      });

      const result = await this.suiClient.devInspectTransactionBlock({
        transactionBlock: txb,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      if (result.results?.[0]?.returnValues?.[0]) {
        const poolIdBytes = result.results[0].returnValues[0][0];
        const poolId = this.bytesToObjectId(poolIdBytes);
        
        if (poolId && poolId !== '0x0') {
          return await this.getPoolById(poolId);
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding best pool:', error);
      return null;
    }
  }

  /**
   * Get specific pool by ID
   */
  async getPoolById(poolId: string): Promise<Pool | null> {
    try {
      const response = await this.suiClient.getObject({
        id: poolId,
        options: {
          showContent: true,
          showType: true,
        }
      });

      if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
        return null;
      }

      return this.parsePoolFromObject(response);
    } catch (error) {
      console.error('Error fetching pool by ID:', error);
      return null;
    }
  }

  /**
   * Check if a pool exists for specific token pair and bin step
   */
  async poolExists(tokenA: string, tokenB: string, binStep: number): Promise<boolean> {
    try {
      const txb = new Transaction();
      
      txb.moveCall({
        target: `${this.packageId}::${MODULES.FACTORY}::pool_exists`,
        typeArguments: [tokenA, tokenB],
        arguments: [
          txb.object(this.factoryId),
          txb.pure.u16(binStep),
        ],
      });

      const result = await this.suiClient.devInspectTransactionBlock({
        transactionBlock: txb,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      if (result.results?.[0]?.returnValues?.[0]) {
        const returnValue = result.results[0].returnValues[0][0];
        return Array.isArray(returnValue) ? returnValue[0] === 1 : returnValue === 1;
      }

      return false;
    } catch (error) {
      console.error('Error checking pool existence:', error);
      return false;
    }
  }

  // ==================== POOL CREATION ====================

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
      // Validate parameters
      const validation = this.validatePoolCreationParams(params);
      if (!validation.isValid) {
        return {
          poolId: '',
          transactionDigest: '',
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
        };
      }

      const txb = new Transaction();
      
      // Create the pool
      txb.moveCall({
        target: `${this.packageId}::${MODULES.FACTORY}::${FUNCTIONS.CREATE_POOL}`,
        typeArguments: [params.tokenA, params.tokenB],
        arguments: [
          txb.object(this.factoryId),
          txb.pure.u16(params.binStep),
          txb.pure.u128(params.initialPrice),
          txb.pure.u32(params.initialBinId),
          txb.object(coinAObject),
          txb.object(coinBObject),
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

      // Extract pool ID from events or object changes
      const poolId = this.extractPoolIdFromResult(result);

      return {
        poolId: poolId || '',
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

  /**
   * Get pool creation recommendations based on token pair
   */
  async getPoolCreationRecommendations(
    tokenA: string,
    tokenB: string
  ): Promise<{
    recommendedBinStep: number;
    estimatedGas: number;
    existingPools: Pool[];
    warnings: string[];
  }> {
    try {
      // Get existing pools for this pair
      const allPools = await this.getAllPools({
        tokenA,
        tokenB,
      });

      // Determine recommended bin step based on token types
      const recommendedBinStep = this.calculateRecommendedBinStep(tokenA, tokenB);

      // Check for potential issues
      const warnings: string[] = [];
      if (allPools.pools.length > 0) {
        warnings.push('Pools already exist for this token pair');
      }

      return {
        recommendedBinStep,
        estimatedGas: 500000, // Estimated gas for pool creation
        existingPools: allPools.pools,
        warnings,
      };
    } catch (error) {
      console.error('Error getting pool recommendations:', error);
      throw new Error(`Failed to get recommendations: ${error}`);
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Discover pools from factory using dynamic object fields
   */
  private async discoverPoolsFromFactory(): Promise<Pool[]> {
    try {
      // Get all dynamic object fields (pools) from the factory
      const response = await this.suiClient.getDynamicFields({
        parentId: this.factoryId,
      });

      const pools: Pool[] = [];
      
      for (const field of response.data) {
        try {
          const poolResponse = await this.suiClient.getObject({
            id: field.objectId,
            options: {
              showContent: true,
              showType: true,
            }
          });

          if (poolResponse.data) {
            const pool = this.parsePoolFromObject(poolResponse);
            if (pool) {
              pools.push(pool);
            }
          }
        } catch (error) {
          console.warn(`Failed to parse pool ${field.objectId}:`, error);
        }
      }

      return pools;
    } catch (error) {
      console.error('Error discovering pools:', error);
      return [];
    }
  }

  /**
   * Parse pool object from Sui response
   */
  private parsePoolFromObject(response: SuiObjectResponse): Pool | null {
    try {
      if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
        return null;
      }

      const content = response.data.content as any;
      const fields = content.fields;

      // Extract token types from the object type
      const typeMatch = content.type.match(/<([^,]+),\s*([^>]+)>/);
      const tokenA = typeMatch?.[1] || '';
      const tokenB = typeMatch?.[2] || '';

      return {
        id: response.data.objectId,
        tokenA: this.parseTokenInfo(tokenA),
        tokenB: this.parseTokenInfo(tokenB),
        binStep: parseInt(fields.bin_step || '25'),
        reserveA: fields.reserves_a || '0',
        reserveB: fields.reserves_b || '0',
        activeBinId: parseInt(fields.active_bin_id || '1000'),
        totalSwaps: fields.total_swaps || '0',
        totalVolumeA: fields.total_volume_a || '0',
        totalVolumeB: fields.total_volume_b || '0',
        isActive: fields.is_active || true,
        currentPrice: '0', // Will be calculated
        createdAt: fields.created_at || '0',
        lastUpdated: Date.now().toString(),
      };
    } catch (error) {
      console.error('Error parsing pool object:', error);
      return null;
    }
  }

  /**
   * Parse token info from coin type string
   */
  private parseTokenInfo(coinType: string): TokenInfo {
    // Extract token info from coin type
    const parts = coinType.split('::');
    const symbol = parts[parts.length - 1] || 'UNKNOWN';
    
    return {
      coinType,
      symbol: symbol.toUpperCase(),
      decimals: 9, // Default, should be fetched from coin metadata
      name: symbol,
    };
  }

  /**
   * Apply filters to pool list
   */
  private applyPoolFilters(pools: Pool[], filters: PoolFilters): Pool[] {
    return pools.filter(pool => {
      if (filters.tokenA && 
          pool.tokenA.coinType !== filters.tokenA && 
          pool.tokenB.coinType !== filters.tokenA) {
        return false;
      }
      
      if (filters.tokenB && 
          pool.tokenA.coinType !== filters.tokenB && 
          pool.tokenB.coinType !== filters.tokenB) {
        return false;
      }

      if (filters.binSteps && !filters.binSteps.includes(pool.binStep)) {
        return false;
      }

      if (filters.isActive !== undefined && pool.isActive !== filters.isActive) {
        return false;
      }

      if (filters.minTvl) {
        const tvl = (parseInt(pool.reserveA) + parseInt(pool.reserveB)).toString();
        if (parseInt(tvl) < parseInt(filters.minTvl)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Sort pools based on options
   */
  private sortPools(pools: Pool[], options: PoolSortOptions): Pool[] {
    return pools.sort((a, b) => {
      let comparison = 0;
      
      switch (options.sortBy) {
        case 'tvl':
          const tvlA = parseInt(a.reserveA) + parseInt(a.reserveB);
          const tvlB = parseInt(b.reserveA) + parseInt(b.reserveB);
          comparison = tvlA - tvlB;
          break;
        case 'volume24h':
          comparison = parseInt(a.totalVolumeA) - parseInt(b.totalVolumeA);
          break;
        case 'createdAt':
          comparison = parseInt(a.createdAt) - parseInt(b.createdAt);
          break;
        default:
          comparison = 0;
      }

      return options.sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Validate pool creation parameters
   */
  private validatePoolCreationParams(params: PoolCreationParams) {
    const errors: string[] = [];
    
    if (!params.tokenA || !params.tokenB) {
      errors.push('Both token types must be specified');
    }
    
    if (params.tokenA === params.tokenB) {
      errors.push('Token A and Token B must be different');
    }
    
    if (params.binStep <= 0 || params.binStep > 10000) {
      errors.push('Bin step must be between 1 and 10000');
    }
    
    if (parseInt(params.initialPrice) <= 0) {
      errors.push('Initial price must be greater than 0');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate recommended bin step for token pair
   */
  private calculateRecommendedBinStep(tokenA: string, tokenB: string): number {
    // Check if it's a stablecoin pair
    const isStablePair = this.isStablecoinPair(tokenA, tokenB);
    
    if (isStablePair) {
      return 10; // 0.1% for stable pairs
    } else {
      return 25; // 0.25% for volatile pairs
    }
  }

  /**
   * Check if token pair consists of stablecoins
   */
  private isStablecoinPair(tokenA: string, tokenB: string): boolean {
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD'];
    
    const symbolA = tokenA.split('::').pop()?.toUpperCase() || '';
    const symbolB = tokenB.split('::').pop()?.toUpperCase() || '';
    
    return stablecoins.includes(symbolA) && stablecoins.includes(symbolB);
  }

  /**
   * Parse allowed bin steps from factory response
   */
  private parseAllowedBinSteps(binStepsField: any): number[] {
    try {
      if (Array.isArray(binStepsField)) {
        return binStepsField.map(step => parseInt(step));
      }
      return [1, 5, 10, 25, 50, 100, 200, 500, 1000]; // Default allowed steps
    } catch (error) {
      return [1, 5, 10, 25, 50, 100, 200, 500, 1000];
    }
  }

  /**
   * Convert bytes to Sui object ID
   */
  private bytesToObjectId(bytes: number[]): string {
    try {
      return '0x' + Buffer.from(bytes).toString('hex');
    } catch (error) {
      return '';
    }
  }

  /**
   * Extract pool ID from transaction result
   */
  private extractPoolIdFromResult(result: any): string | null {
    try {
      // Look for pool creation event
      if (result.events) {
        for (const event of result.events) {
          if (event.type.includes('PoolCreatedInFactory')) {
            return event.parsedJson?.pool_id || null;
          }
        }
      }

      // Look for created objects
      if (result.objectChanges) {
        for (const change of result.objectChanges) {
          if (change.type === 'created' && change.objectType?.includes('DLMMPool')) {
            return change.objectId;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error extracting pool ID:', error);
      return null;
    }
  }
}