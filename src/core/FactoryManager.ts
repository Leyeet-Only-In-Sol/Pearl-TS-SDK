/**
 * FactoryManager - Handles all factory-related operations
 * REAL IMPLEMENTATION - Connects to your deployed factory contract
 * Updated to match your actual contract structure from sui_dlmm::factory
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
   * Get factory information and statistics - REAL CONTRACT INTEGRATION
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
   * Get all pools created by the factory - REAL CONTRACT INTEGRATION
   */
  async getAllPools(
    filters?: PoolFilters,
    sortOptions?: PoolSortOptions
  ): Promise<PoolDiscoveryResult> {
    try {
      // Query all pool objects from the factory using dynamic fields
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
   * Find the best pool for a specific token pair - REAL CONTRACT INTEGRATION
   */
  async findBestPoolForPair(
    tokenA: string,
    tokenB: string,
    preferredBinStep?: number
  ): Promise<Pool | null> {
    try {
      // Try preferred bin step first if provided
      if (preferredBinStep) {
        const poolId = await this.getPoolIdForPair(tokenA, tokenB, preferredBinStep);
        if (poolId) {
          const pool = await this.getPoolById(poolId);
          if (pool) return pool;
        }
      }

      // Try all available bin steps to find the best pool
      const allowedBinSteps = [1, 5, 10, 25, 50, 100, 200, 500, 1000];
      let bestPool: Pool | null = null;
      let bestScore = 0;

      for (const binStep of allowedBinSteps) {
        try {
          const poolId = await this.getPoolIdForPair(tokenA, tokenB, binStep);
          if (!poolId) continue;

          const pool = await this.getPoolById(poolId);
          if (!pool || !pool.isActive) continue;

          // Calculate pool score based on liquidity and activity
          const score = this.calculatePoolScore(pool);
          if (score > bestScore) {
            bestScore = score;
            bestPool = pool;
          }
        } catch (error) {
          console.warn(`Error checking pool for bin step ${binStep}:`, error);
        }
      }

      return bestPool;
    } catch (error) {
      console.error('Error finding best pool:', error);
      return null;
    }
  }

  /**
   * Get pool ID for specific token pair and bin step - REAL CONTRACT INTEGRATION
   * Uses the actual contract function from your deployed code
   */
  async getPoolIdForPair(
    tokenA: string,
    tokenB: string,
    binStep: number
  ): Promise<string | null> {
    try {
      const txb = new Transaction();
      
      txb.moveCall({
        target: `${this.packageId}::${MODULES.FACTORY}::${FUNCTIONS.GET_POOL_ID}`,
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
        const optionBytes = result.results[0].returnValues[0][0];
        // Parse Option<ID> from Move - if Some, extract the ID
        if (Array.isArray(optionBytes) && optionBytes.length > 0) {
          // Option<T> is encoded as [0] for None or [1, ...bytes] for Some(T)
          if (optionBytes[0] === 1 && optionBytes.length > 1) {
            return this.bytesToObjectId(optionBytes.slice(1));
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting pool ID:', error);
      return null;
    }
  }

  /**
   * Get specific pool by ID - REAL CONTRACT INTEGRATION
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
   * Check if a pool exists for specific token pair and bin step - REAL CONTRACT INTEGRATION
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
   * Create a new DLMM pool - REAL CONTRACT INTEGRATION
   * Uses your actual factory::create_and_store_pool function
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
          error: `Validation failed: ${validation.errors.join(', ')}`
        };
      }

      const txb = new Transaction();
      
      // Create the pool using the actual factory contract
      // This matches your factory::create_and_store_pool function
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
      const success = result.effects?.status?.status === 'success';

      return {
        poolId: poolId || '',
        transactionDigest: result.digest,
        success,
        error: !success ? (result.effects?.status?.error || 'Unknown error') : undefined
      };
    } catch (error) {
      return {
        poolId: '',
        transactionDigest: '',
        success: false,
        error: `Failed to create pool: ${error}`
      };
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Discover pools from factory using dynamic object fields - REAL IMPLEMENTATION
   * This works with your factory's storage structure where pools are stored as dynamic fields
   */
  private async discoverPoolsFromFactory(): Promise<Pool[]> {
    try {
      // Get all dynamic object fields (pools) from the factory
      const response = await this.suiClient.getDynamicFields({
        parentId: this.factoryId,
      });

      const pools: Pool[] = [];
      
      // Process each dynamic field to extract pool data
      for (const field of response.data) {
        try {
          // Get the pool wrapper object (PoolWrapper<CoinA, CoinB>)
          const poolResponse = await this.suiClient.getObject({
            id: field.objectId,
            options: {
              showContent: true,
              showType: true,
            }
          });

          if (poolResponse.data?.content && poolResponse.data.content.dataType === 'moveObject') {
            // Extract the actual pool from the wrapper
            const wrapperFields = (poolResponse.data.content as any).fields;
            if (wrapperFields.pool) {
              // Get the nested pool object
              const poolFields = wrapperFields.pool.fields;
              if (poolFields) {
                const pool = this.parsePoolFromWrapperFields(poolResponse, poolFields);
                if (pool) {
                  pools.push(pool);
                }
              }
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
   * Parse pool object from Sui response - REAL IMPLEMENTATION
   * This handles your actual DLMMPool struct
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
        isActive: fields.is_active !== false,
        currentPrice: this.calculateCurrentPrice(parseInt(fields.active_bin_id || '1000'), parseInt(fields.bin_step || '25')),
        createdAt: fields.created_at || '0',
        lastUpdated: Date.now().toString(),
      };
    } catch (error) {
      console.error('Error parsing pool object:', error);
      return null;
    }
  }

  /**
   * Parse pool from wrapper fields (for factory discovery)
   */
  private parsePoolFromWrapperFields(response: SuiObjectResponse, poolFields: any): Pool | null {
    try {
      const content = response.data!.content as any;
      
      // Extract token types from the wrapper type
      const typeMatch = content.type.match(/<([^,]+),\s*([^>]+)>/);
      const tokenA = typeMatch?.[1] || '';
      const tokenB = typeMatch?.[2] || '';

      return {
        id: poolFields.id?.id || response.data!.objectId,
        tokenA: this.parseTokenInfo(tokenA),
        tokenB: this.parseTokenInfo(tokenB),
        binStep: parseInt(poolFields.bin_step || '25'),
        reserveA: poolFields.reserves_a || '0',
        reserveB: poolFields.reserves_b || '0',
        activeBinId: parseInt(poolFields.active_bin_id || '1000'),
        totalSwaps: poolFields.total_swaps || '0',
        totalVolumeA: poolFields.total_volume_a || '0',
        totalVolumeB: poolFields.total_volume_b || '0',
        isActive: poolFields.is_active !== false,
        currentPrice: this.calculateCurrentPrice(parseInt(poolFields.active_bin_id || '1000'), parseInt(poolFields.bin_step || '25')),
        createdAt: poolFields.created_at || '0',
        lastUpdated: Date.now().toString(),
      };
    } catch (error) {
      console.error('Error parsing pool from wrapper:', error);
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
   * Calculate current price from active bin ID and bin step
   * This matches your bin_math::calculate_bin_price function
   */
  private calculateCurrentPrice(activeBinId: number, binStep: number): string {
    // Price formula: (1 + binStep/10000)^binId
    const base = 1 + binStep / 10000;
    const price = Math.pow(base, activeBinId);
    return (price * Math.pow(2, 64)).toString(); // Scale by 2^64
  }

  /**
   * Calculate pool quality score for ranking
   */
  private calculatePoolScore(pool: Pool): number {
    const reserveA = parseInt(pool.reserveA);
    const reserveB = parseInt(pool.reserveB);
    const totalLiquidity = reserveA + reserveB;
    const totalSwaps = parseInt(pool.totalSwaps);
    
    // Score based on liquidity and activity
    const liquidityScore = totalLiquidity / 1000; // Scale down
    const activityScore = totalSwaps * 10;
    
    return liquidityScore + activityScore;
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
   * Extract pool ID from transaction result - REAL IMPLEMENTATION
   * Looks for the PoolCreatedInFactory event from your contract
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

      // Look for created objects (PoolWrapper)
      if (result.objectChanges) {
        for (const change of result.objectChanges) {
          if (change.type === 'created' && change.objectType?.includes('PoolWrapper')) {
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

  // ==================== PUBLIC UTILITIES ====================

  /**
   * Get all pools for a specific token pair
   */
  async getPoolsForTokenPair(tokenA: string, tokenB: string): Promise<Pool[]> {
    try {
      const allPools = await this.getAllPools({
        tokenA,
        tokenB,
      });
      return allPools.pools;
    } catch (error) {
      console.error('Error getting pools for token pair:', error);
      return [];
    }
  }

  /**
   * Get pool statistics aggregated from all pools
   */
  async getAggregatedPoolStats(): Promise<{
    totalPools: number;
    totalTVL: string;
    totalVolume: string;
    totalSwaps: number;
    avgAPR: number;
  }> {
    try {
      const allPools = await this.getAllPools();
      let totalTVL = 0;
      let totalVolume = 0;
      let totalSwaps = 0;

      for (const pool of allPools.pools) {
        totalTVL += parseInt(pool.reserveA) + parseInt(pool.reserveB);
        totalVolume += parseInt(pool.totalVolumeA) + parseInt(pool.totalVolumeB);
        totalSwaps += parseInt(pool.totalSwaps);
      }

      // Calculate average APR (simplified)
      const avgAPR = allPools.pools.length > 0 ? 
        (totalVolume / totalTVL) * 0.0025 * 365 * 100 : 0; // Rough estimation

      return {
        totalPools: allPools.pools.length,
        totalTVL: totalTVL.toString(),
        totalVolume: totalVolume.toString(),
        totalSwaps,
        avgAPR
      };
    } catch (error) {
      console.error('Error getting aggregated stats:', error);
      return {
        totalPools: 0,
        totalTVL: '0',
        totalVolume: '0',
        totalSwaps: 0,
        avgAPR: 0
      };
    }
  }
}