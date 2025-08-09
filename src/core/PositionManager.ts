/**
 * PositionManager - Handles liquidity position operations
 * Manages position creation, modification, fee collection, and analytics
 */

import { SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MODULES, FUNCTIONS } from '../constants/addresses';
import { 
  Position, 
  PositionCreationParams,
  PositionCreationResult,
  SimplePositionParams,
  BinPosition,
  PositionMetrics,
  PositionAnalytics,
  PositionRebalanceParams,
  PositionModification,
  PositionFilters,
  PositionSortOptions,
  PositionRecommendation,
  PositionValidation,
  FeeEarning,
  PerformancePoint,
  PositionStrategy
} from '../types/positions/position';
import { Pool } from '../types/pools/pool';

export interface PositionOperationOptions {
  deadline?: number; // Unix timestamp
  gasLimit?: number; // Gas limit override
  autoCollectFees?: boolean; // Auto-collect fees before operations
}

export interface PositionDiscoveryResult {
  positions: Position[];
  totalCount: number;
  hasMore: boolean;
}

export interface FeeCollectionResult {
  feeA: string;
  feeB: string;
  transactionDigest: string;
  success: boolean;
  error?: string;
}

export interface PositionModificationResult {
  newLiquidityA: string;
  newLiquidityB: string;
  sharesChanged: string;
  transactionDigest: string;
  success: boolean;
  error?: string;
}

export class PositionManager {
  private positionCache = new Map<string, Position>();
  private readonly CACHE_TTL = 30000; // 30 seconds cache

  constructor(
    private suiClient: SuiClient,
    private packageId: string,
    private factoryId: string
  ) {}

  // ==================== POSITION CREATION ====================

  /**
   * Create a new liquidity position with advanced parameters
   */
  async createPosition(
    params: PositionCreationParams,
    coinAObject: string, // Actual coin object ID
    coinBObject: string, // Actual coin object ID
    keypair: Ed25519Keypair,
    options: PositionOperationOptions = {}
  ): Promise<PositionCreationResult> {
    try {
      // Validate position parameters
      const validation = await this.validatePositionCreation(params);
      if (!validation.isValid) {
        return {
          positionId: '',
          transactionDigest: '',
          sharesIssued: '0',
          actualAmountA: '0',
          actualAmountB: '0',
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`
        };
      }

      const txb = new Transaction();
      
      if (options.gasLimit) {
        txb.setGasBudget(options.gasLimit);
      }

      // Get pool reference for position creation
      const pool = txb.object(params.poolId);

      // Create position configuration
      const configObject = this.createPositionConfig(
        txb,
        params.lowerBinId,
        params.upperBinId,
        params.strategy,
        params.customWeights
      );

      // Create position using contract
      txb.moveCall({
        target: `${this.packageId}::${MODULES.POSITION}::${FUNCTIONS.CREATE_POSITION}`,
        typeArguments: [params.tokenA, params.tokenB],
        arguments: [
          pool,
          configObject,
          txb.object(coinAObject),
          txb.object(coinBObject),
          txb.object('0x6'), // Clock object
        ],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      return this.parsePositionCreationResult(result, params);
    } catch (error) {
      return {
        positionId: '',
        transactionDigest: '',
        sharesIssued: '0',
        actualAmountA: '0',
        actualAmountB: '0',
        success: false,
        error: `Position creation failed: ${error}`
      };
    }
  }

  /**
   * Create a simple position using position manager
   */
  async createSimplePosition(
    params: SimplePositionParams,
    coinAObject: string,
    coinBObject: string,
    keypair: Ed25519Keypair,
    options: PositionOperationOptions = {}
  ): Promise<PositionCreationResult> {
    try {
      const txb = new Transaction();
      
      if (options.gasLimit) {
        txb.setGasBudget(options.gasLimit);
      }

      // Use the simplified position manager interface
      txb.moveCall({
        target: `${this.packageId}::${MODULES.POSITION_MANAGER}::${FUNCTIONS.CREATE_POSITION_SIMPLE}`,
        typeArguments: [params.tokenA, params.tokenB],
        arguments: [
          txb.object(params.poolId),
          txb.object(coinAObject),
          txb.object(coinBObject),
          txb.pure.u32(params.rangeBins),
          txb.pure.u8(this.strategyToNumber(params.strategy)),
          txb.object('0x6'), // Clock object
        ],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      const creationParams: PositionCreationParams = {
        poolId: params.poolId,
        tokenA: params.tokenA,
        tokenB: params.tokenB,
        amountA: params.amountA,
        amountB: params.amountB,
        lowerBinId: 1000 - params.rangeBins, // Approximate
        upperBinId: 1000 + params.rangeBins, // Approximate
        strategy: params.strategy
      };

      return this.parsePositionCreationResult(result, creationParams);
    } catch (error) {
      return {
        positionId: '',
        transactionDigest: '',
        sharesIssued: '0',
        actualAmountA: '0',
        actualAmountB: '0',
        success: false,
        error: `Simple position creation failed: ${error}`
      };
    }
  }

  /**
   * Get position recommendations based on pool state
   */
  async getPositionRecommendations(
    poolId: string,
    userRiskProfile: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
  ): Promise<PositionRecommendation[]> {
    try {
      // This would call the contract's recommendation system
      const txb = new Transaction();
      
      txb.moveCall({
        target: `${this.packageId}::${MODULES.POSITION_MANAGER}::recommend_position_params`,
        typeArguments: ['TokenA', 'TokenB'], // Would be extracted from pool
        arguments: [
          txb.object(poolId),
          txb.pure.u8(this.riskProfileToNumber(userRiskProfile)),
        ],
      });

      const result = await this.suiClient.devInspectTransactionBlock({
        transactionBlock: txb,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      return this.parsePositionRecommendations(result, userRiskProfile);
    } catch (error) {
      console.error('Error getting position recommendations:', error);
      return this.getDefaultRecommendations(userRiskProfile);
    }
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Add liquidity to existing position
   */
  async addLiquidityToPosition(
    positionId: string,
    coinAObject: string,
    coinBObject: string,
    keypair: Ed25519Keypair,
    options: PositionOperationOptions = {}
  ): Promise<PositionModificationResult> {
    try {
      const txb = new Transaction();
      
      if (options.gasLimit) {
        txb.setGasBudget(options.gasLimit);
      }

      // Collect fees first if requested
      if (options.autoCollectFees) {
        await this.buildFeeCollection(txb, positionId);
      }

      // Add liquidity to position
      txb.moveCall({
        target: `${this.packageId}::${MODULES.POSITION}::${FUNCTIONS.ADD_LIQUIDITY_TO_POSITION}`,
        typeArguments: ['TokenA', 'TokenB'], // Would be extracted from position
        arguments: [
          txb.object(positionId),
          txb.object('pool_id'), // Would be extracted from position
          txb.object(coinAObject),
          txb.object(coinBObject),
          txb.object('0x6'), // Clock object
        ],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      return this.parsePositionModificationResult(result, 'add_liquidity');
    } catch (error) {
      return {
        newLiquidityA: '0',
        newLiquidityB: '0',
        sharesChanged: '0',
        transactionDigest: '',
        success: false,
        error: `Add liquidity failed: ${error}`
      };
    }
  }

  /**
   * Remove liquidity from position (by percentage)
   */
  async removeLiquidityFromPosition(
    positionId: string,
    percentage: number, // 1-100
    keypair: Ed25519Keypair,
    options: PositionOperationOptions = {}
  ): Promise<PositionModificationResult> {
    try {
      if (percentage <= 0 || percentage > 100) {
        throw new Error('Percentage must be between 1 and 100');
      }

      const txb = new Transaction();
      
      if (options.gasLimit) {
        txb.setGasBudget(options.gasLimit);
      }

      // Collect fees first if requested
      if (options.autoCollectFees) {
        await this.buildFeeCollection(txb, positionId);
      }

      // Remove liquidity from position
      txb.moveCall({
        target: `${this.packageId}::${MODULES.POSITION}::${FUNCTIONS.REMOVE_LIQUIDITY_FROM_POSITION}`,
        typeArguments: ['TokenA', 'TokenB'], // Would be extracted from position
        arguments: [
          txb.object(positionId),
          txb.object('pool_id'), // Would be extracted from position
          txb.pure.u8(percentage),
          txb.object('0x6'), // Clock object
        ],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      return this.parsePositionModificationResult(result, 'remove_liquidity');
    } catch (error) {
      return {
        newLiquidityA: '0',
        newLiquidityB: '0',
        sharesChanged: '0',
        transactionDigest: '',
        success: false,
        error: `Remove liquidity failed: ${error}`
      };
    }
  }

  /**
   * Collect fees from position
   */
  async collectFeesFromPosition(
    positionId: string,
    keypair: Ed25519Keypair,
    options: PositionOperationOptions = {}
  ): Promise<FeeCollectionResult> {
    try {
      const txb = new Transaction();
      
      if (options.gasLimit) {
        txb.setGasBudget(options.gasLimit);
      }

      // Collect fees using position manager
      txb.moveCall({
        target: `${this.packageId}::${MODULES.POSITION_MANAGER}::${FUNCTIONS.COLLECT_ALL_FEES}`,
        typeArguments: ['TokenA', 'TokenB'], // Would be extracted from position
        arguments: [
          txb.object(positionId),
          txb.object('pool_id'), // Would be extracted from position
          txb.object('0x6'), // Clock object
        ],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      return this.parseFeeCollectionResult(result);
    } catch (error) {
      return {
        feeA: '0',
        feeB: '0',
        transactionDigest: '',
        success: false,
        error: `Fee collection failed: ${error}`
      };
    }
  }

  /**
   * Rebalance position strategy
   */
  async rebalancePosition(
    positionId: string,
    rebalanceParams: PositionRebalanceParams,
    keypair: Ed25519Keypair,
    options: PositionOperationOptions = {}
  ): Promise<PositionModificationResult> {
    try {
      const txb = new Transaction();
      
      if (options.gasLimit) {
        txb.setGasBudget(options.gasLimit);
      }

      // Collect fees first
      if (options.autoCollectFees) {
        await this.buildFeeCollection(txb, positionId);
      }

      // Rebalance position
      txb.moveCall({
        target: `${this.packageId}::${MODULES.POSITION}::rebalance_position`,
        typeArguments: ['TokenA', 'TokenB'], // Would be extracted from position
        arguments: [
          txb.object(positionId),
          txb.object('pool_id'), // Would be extracted from position
          txb.object('0x6'), // Clock object
        ],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      return this.parsePositionModificationResult(result, 'rebalance');
    } catch (error) {
      return {
        newLiquidityA: '0',
        newLiquidityB: '0',
        sharesChanged: '0',
        transactionDigest: '',
        success: false,
        error: `Rebalance failed: ${error}`
      };
    }
  }

  // ==================== POSITION QUERIES ====================

  /**
   * Get position details by ID
   */
  async getPosition(positionId: string): Promise<Position | null> {
    try {
      // Check cache first
      const cached = this.getCachedPosition(positionId);
      if (cached) return cached;

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

      const position = this.parsePositionFromResponse(response);
      if (position) {
        this.cachePosition(position);
      }

      return position;
    } catch (error) {
      console.error('Error fetching position:', error);
      return null;
    }
  }

  /**
   * Get positions by owner
   */
  async getPositionsByOwner(
    owner: string,
    filters?: PositionFilters,
    sortOptions?: PositionSortOptions
  ): Promise<PositionDiscoveryResult> {
    try {
      // This would typically use an indexer or query dynamic objects
      // For now, simplified implementation
      const allPositions = await this.discoverUserPositions(owner);
      
      let filteredPositions = allPositions;
      
      // Apply filters
      if (filters) {
        filteredPositions = this.applyPositionFilters(allPositions, filters);
      }

      // Apply sorting
      if (sortOptions) {
        filteredPositions = this.sortPositions(filteredPositions, sortOptions);
      }

      return {
        positions: filteredPositions,
        totalCount: filteredPositions.length,
        hasMore: false
      };
    } catch (error) {
      console.error('Error fetching positions by owner:', error);
      return {
        positions: [],
        totalCount: 0,
        hasMore: false
      };
    }
  }

  /**
   * Get position metrics and analytics
   */
  async getPositionAnalytics(
    positionId: string,
    poolData?: Pool
  ): Promise<PositionAnalytics | null> {
    try {
      const position = await this.getPosition(positionId);
      if (!position) return null;

      const metrics = await this.calculatePositionMetrics(position, poolData);
      const binPositions = await this.getPositionBinDetails(positionId);
      const feeHistory = await this.getPositionFeeHistory(positionId);
      const performanceHistory = await this.getPositionPerformanceHistory(positionId);

      return {
        position,
        metrics,
        binPositions,
        feeHistory,
        performanceHistory
      };
    } catch (error) {
      console.error('Error getting position analytics:', error);
      return null;
    }
  }

  /**
   * Calculate position metrics
   */
  async calculatePositionMetrics(
    position: Position,
    poolData?: Pool
  ): Promise<PositionMetrics> {
    try {
      // Get pool data if not provided
      let pool = poolData;
      if (!pool) {
        // Would fetch pool data
        pool = {
          id: position.poolId,
          activeBinId: 1000,
          isActive: true
        } as Pool;
      }

      // Calculate if position is in range
      const inRange = pool.activeBinId >= position.lowerBinId && 
                     pool.activeBinId <= position.upperBinId;

      // Calculate utilization (percentage of bins with liquidity)
      const totalBins = position.upperBinId - position.lowerBinId + 1;
      const activeBins = 1; // Would count actual bins with liquidity
      const utilization = (activeBins / totalBins) * 100;

      // Calculate fees earned
      const totalFeesEarned = {
        tokenA: position.unclaimedFeesA,
        tokenB: position.unclaimedFeesB
      };

      // Calculate impermanent loss (simplified)
      const impermanentLoss = {
        percentage: 0, // Would calculate based on price changes
        valueA: '0',
        valueB: '0'
      };

      // Calculate ROI and APR (simplified)
      const roi = 0; // Would calculate based on current value vs initial
      const apr = 0; // Would calculate based on fees earned over time

      return {
        utilization,
        inRange,
        totalFeesEarned,
        impermanentLoss,
        roi,
        apr
      };
    } catch (error) {
      console.error('Error calculating position metrics:', error);
      return {
        utilization: 0,
        inRange: false,
        totalFeesEarned: { tokenA: '0', tokenB: '0' },
        impermanentLoss: { percentage: 0, valueA: '0', valueB: '0' },
        roi: 0,
        apr: 0
      };
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Create position configuration object
   */
  private createPositionConfig(
    txb: Transaction,
    lowerBinId: number,
    upperBinId: number,
    strategy: PositionStrategy,
    customWeights?: number[]
  ): any {
    return txb.moveCall({
      target: `${this.packageId}::${MODULES.POSITION}::create_position_config`,
      arguments: [
        txb.pure.u32(lowerBinId),
        txb.pure.u32(upperBinId),
        txb.pure.u8(this.strategyToNumber(strategy)),
        txb.pure.vector('u64', customWeights || []),
      ],
    });
  }

  /**
   * Build fee collection transaction
   */
  private async buildFeeCollection(txb: Transaction, positionId: string): Promise<void> {
    txb.moveCall({
      target: `${this.packageId}::${MODULES.POSITION}::${FUNCTIONS.COLLECT_FEES}`,
      typeArguments: ['TokenA', 'TokenB'], // Would be extracted from position
      arguments: [
        txb.object(positionId),
        txb.object('pool_id'), // Would be extracted from position
        txb.object('0x6'), // Clock object
      ],
    });
  }

  /**
   * Convert strategy string to number
   */
  private strategyToNumber(strategy: PositionStrategy): number {
    switch (strategy) {
      case 'uniform': return 0;
      case 'curve': return 1;
      case 'bid-ask': return 2;
      default: return 0;
    }
  }

  /**
   * Convert risk profile to number
   */
  private riskProfileToNumber(profile: string): number {
    switch (profile) {
      case 'conservative': return 0;
      case 'moderate': return 1;
      case 'aggressive': return 2;
      default: return 1;
    }
  }

  /**
   * Parse position creation result from transaction
   */
  private parsePositionCreationResult(
    result: any,
    params: PositionCreationParams
  ): PositionCreationResult {
    try {
      let positionId = '';
      let sharesIssued = '0';

      // Extract position ID from object changes
      if (result.objectChanges) {
        for (const change of result.objectChanges) {
          if (change.type === 'created' && change.objectType?.includes('Position')) {
            positionId = change.objectId;
            break;
          }
        }
      }

      // Extract shares from events
      if (result.events) {
        for (const event of result.events) {
          if (event.type.includes('PositionCreated')) {
            const eventData = event.parsedJson;
            sharesIssued = eventData?.shares_minted || '0';
            break;
          }
        }
      }

      return {
        positionId,
        transactionDigest: result.digest,
        sharesIssued,
        actualAmountA: params.amountA,
        actualAmountB: params.amountB,
        success: result.effects?.status?.status === 'success',
        error: result.effects?.status?.status === 'failure' ? 
          (result.effects?.status?.error || 'Unknown error') : undefined
      };
    } catch (error) {
      return {
        positionId: '',
        transactionDigest: result.digest || '',
        sharesIssued: '0',
        actualAmountA: '0',
        actualAmountB: '0',
        success: false,
        error: `Failed to parse position creation result: ${error}`
      };
    }
  }

  /**
   * Parse position modification result
   */
  private parsePositionModificationResult(
    result: any,
    operationType: string
  ): PositionModificationResult {
    try {
      let newLiquidityA = '0';
      let newLiquidityB = '0';
      let sharesChanged = '0';

      if (result.events) {
        for (const event of result.events) {
          if (event.type.includes('LiquidityAdded') || 
              event.type.includes('LiquidityRemoved') ||
              event.type.includes('PositionRebalanced')) {
            const eventData = event.parsedJson;
            newLiquidityA = eventData?.amount_a || '0';
            newLiquidityB = eventData?.amount_b || '0';
            sharesChanged = eventData?.shares_minted || eventData?.shares_burned || '0';
            break;
          }
        }
      }

      return {
        newLiquidityA,
        newLiquidityB,
        sharesChanged,
        transactionDigest: result.digest,
        success: result.effects?.status?.status === 'success',
        error: result.effects?.status?.status === 'failure' ? 
          (result.effects?.status?.error || 'Unknown error') : undefined
      };
    } catch (error) {
      return {
        newLiquidityA: '0',
        newLiquidityB: '0',
        sharesChanged: '0',
        transactionDigest: result.digest || '',
        success: false,
        error: `Failed to parse modification result: ${error}`
      };
    }
  }

  /**
   * Parse fee collection result
   */
  private parseFeeCollectionResult(result: any): FeeCollectionResult {
    try {
      let feeA = '0';
      let feeB = '0';

      if (result.events) {
        for (const event of result.events) {
          if (event.type.includes('FeesCollected')) {
            const eventData = event.parsedJson;
            feeA = eventData?.fee_a || '0';
            feeB = eventData?.fee_b || '0';
            break;
          }
        }
      }

      return {
        feeA,
        feeB,
        transactionDigest: result.digest,
        success: result.effects?.status?.status === 'success',
        error: result.effects?.status?.status === 'failure' ? 
          (result.effects?.status?.error || 'Unknown error') : undefined
      };
    } catch (error) {
      return {
        feeA: '0',
        feeB: '0',
        transactionDigest: result.digest || '',
        success: false,
        error: `Failed to parse fee collection result: ${error}`
      };
    }
  }

  /**
   * Parse position from Sui object response
   */
  private parsePositionFromResponse(response: SuiObjectResponse): Position | null {
    try {
      if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
        return null;
      }

      const content = response.data.content as any;
      const fields = content.fields;

      return {
        id: response.data.objectId,
        poolId: fields.pool_id || '',
        owner: fields.owner || '',
        lowerBinId: parseInt(fields.lower_bin_id || '0'),
        upperBinId: parseInt(fields.upper_bin_id || '0'),
        strategy: this.numberToStrategy(parseInt(fields.strategy_type || '0')),
        totalLiquidityA: fields.total_liquidity_a || '0',
        totalLiquidityB: fields.total_liquidity_b || '0',
        unclaimedFeesA: fields.unclaimed_fees_a || '0',
        unclaimedFeesB: fields.unclaimed_fees_b || '0',
        createdAt: fields.created_at || '0',
        lastRebalance: fields.last_rebalance || '0',
        isActive: fields.is_active !== false
      };
    } catch (error) {
      console.error('Error parsing position:', error);
      return null;
    }
  }

  /**
   * Convert number to strategy
   */
  private numberToStrategy(num: number): PositionStrategy {
    switch (num) {
      case 0: return 'uniform';
      case 1: return 'curve';
      case 2: return 'bid-ask';
      default: return 'uniform';
    }
  }

  /**
   * Parse position recommendations from contract response
   */
  private parsePositionRecommendations(
    result: any,
    riskProfile: string
  ): PositionRecommendation[] {
    try {
      if (result.results?.[0]?.returnValues) {
        const values = result.results[0].returnValues;
        const rangeBins = values[0] || 10;
        const strategy = this.numberToStrategy(values[1] || 0);
        
        return [{
          strategy,
          rangeBins,
          reasoning: `Optimized for ${riskProfile} risk profile`,
          expectedApr: 15, // Would be calculated
          riskLevel: riskProfile as any,
          capitalEfficiency: 85 // Would be calculated
        }];
      }

      return this.getDefaultRecommendations(riskProfile);
    } catch (error) {
      return this.getDefaultRecommendations(riskProfile);
    }
  }

  /**
   * Get default position recommendations
   */
  private getDefaultRecommendations(riskProfile: string): PositionRecommendation[] {
    switch (riskProfile) {
      case 'conservative':
        return [{
          strategy: 'uniform',
          rangeBins: 20,
          reasoning: 'Wide range for stable returns with lower risk',
          expectedApr: 8,
          riskLevel: 'low',
          capitalEfficiency: 60
        }];
      case 'aggressive':
        return [{
          strategy: 'curve',
          rangeBins: 5,
          reasoning: 'Concentrated liquidity for maximum returns',
          expectedApr: 25,
          riskLevel: 'high',
          capitalEfficiency: 95
        }];
      default: // moderate
        return [{
          strategy: 'curve',
          rangeBins: 10,
          reasoning: 'Balanced approach with good returns and manageable risk',
          expectedApr: 15,
          riskLevel: 'medium',
          capitalEfficiency: 80
        }];
    }
  }

  /**
   * Validate position creation parameters
   */
  private async validatePositionCreation(params: PositionCreationParams): Promise<PositionValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic validation
      if (params.lowerBinId >= params.upperBinId) {
        errors.push('Lower bin ID must be less than upper bin ID');
      }

      if (parseInt(params.amountA) <= 0 && parseInt(params.amountB) <= 0) {
        errors.push('At least one token amount must be greater than 0');
      }

      if (params.tokenA === params.tokenB) {
        errors.push('Token A and Token B must be different');
      }

      // Range validation
      const range = params.upperBinId - params.lowerBinId;
      if (range > 1000) {
        warnings.push('Very wide range may result in low capital efficiency');
      } else if (range < 3) {
        warnings.push('Very narrow range increases risk of going out of range');
      }

      // Strategy validation
      if (params.strategy === 'curve' && range > 50) {
        warnings.push('Curve strategy is more effective with narrower ranges');
      }

      const recommendations = this.getDefaultRecommendations('moderate');

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        recommendations
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error}`],
        warnings,
        recommendations: []
      };
    }
  }

  /**
   * Apply filters to position list
   */
  private applyPositionFilters(positions: Position[], filters: PositionFilters): Position[] {
    return positions.filter(position => {
      if (filters.owner && position.owner !== filters.owner) return false;
      if (filters.poolId && position.poolId !== filters.poolId) return false;
      if (filters.strategy && !filters.strategy.includes(position.strategy)) return false;
      if (filters.isActive !== undefined && position.isActive !== filters.isActive) return false;
      
      if (filters.minLiquidity) {
        const totalLiquidity = parseInt(position.totalLiquidityA) + parseInt(position.totalLiquidityB);
        if (totalLiquidity < parseInt(filters.minLiquidity)) return false;
      }
      
      if (filters.maxLiquidity) {
        const totalLiquidity = parseInt(position.totalLiquidityA) + parseInt(position.totalLiquidityB);
        if (totalLiquidity > parseInt(filters.maxLiquidity)) return false;
      }

      return true;
    });
  }

  /**
   * Sort positions based on options
   */
  private sortPositions(positions: Position[], options: PositionSortOptions): Position[] {
    return positions.sort((a, b) => {
      let comparison = 0;
      
      switch (options.sortBy) {
        case 'createdAt':
          comparison = parseInt(a.createdAt) - parseInt(b.createdAt);
          break;
        case 'totalLiquidity':
          const liquidityA = (parseInt(a.totalLiquidityA) + parseInt(a.totalLiquidityB));
          const liquidityB = (parseInt(b.totalLiquidityA) + parseInt(b.totalLiquidityB));
          comparison = liquidityA - liquidityB;
          break;
        case 'fees':
          const feesA = parseInt(a.unclaimedFeesA) + parseInt(a.unclaimedFeesB);
          const feesB = parseInt(b.unclaimedFeesA) + parseInt(b.unclaimedFeesB);
          comparison = feesA - feesB;
          break;
        default:
          comparison = 0;
      }

      return options.sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  // ==================== CACHING METHODS ====================

  /**
   * Cache position data
   */
  private cachePosition(position: Position): void {
    this.positionCache.set(position.id, position);
    
    // Clean old cache entries
    setTimeout(() => {
      this.positionCache.delete(position.id);
    }, this.CACHE_TTL);
  }

  /**
   * Get cached position
   */
  private getCachedPosition(positionId: string): Position | null {
    return this.positionCache.get(positionId) || null;
  }

  /**
   * Clear position cache
   */
  public clearCache(): void {
    this.positionCache.clear();
  }

  // ==================== PLACEHOLDER METHODS FOR FUTURE IMPLEMENTATION ====================

  /**
   * Discover user positions (would use indexer in production)
   */
  private async discoverUserPositions(owner: string): Promise<Position[]> {
    // Placeholder - would query user's owned objects of Position type
    return [];
  }

  /**
   * Get position bin details (would query contract)
   */
  private async getPositionBinDetails(positionId: string): Promise<BinPosition[]> {
    // Placeholder - would call contract to get bin-level position data
    return [];
  }

  /**
   * Get position fee history (would query events)
   */
  private async getPositionFeeHistory(positionId: string): Promise<FeeEarning[]> {
    // Placeholder - would query fee collection events
    return [];
  }

  /**
   * Get position performance history (would calculate from events)
   */
  private async getPositionPerformanceHistory(positionId: string): Promise<PerformancePoint[]> {
    // Placeholder - would track position value over time
    return [];
  }

  // ==================== PUBLIC UTILITIES ====================

  /**
   * Check if position needs rebalancing
   */
  async shouldRebalancePosition(
    positionId: string,
    poolData?: Pool
  ): Promise<boolean> {
    try {
      const position = await this.getPosition(positionId);
      if (!position) return false;

      // Simple check: if active bin is outside position range
      let activeBinId = 1000; // Default
      if (poolData) {
        activeBinId = poolData.activeBinId;
      }

      return activeBinId < position.lowerBinId || activeBinId > position.upperBinId;
    } catch (error) {
      console.error('Error checking rebalance need:', error);
      return false;
    }
  }

  /**
   * Estimate position value in terms of one token
   */
  calculatePositionValue(
    position: Position,
    currentPrice: string,
    inTokenA: boolean = true
  ): string {
    try {
      const liquidityA = parseInt(position.totalLiquidityA);
      const liquidityB = parseInt(position.totalLiquidityB);
      const feesA = parseInt(position.unclaimedFeesA);
      const feesB = parseInt(position.unclaimedFeesB);
      const price = parseFloat(currentPrice);

      if (inTokenA) {
        // Convert everything to token A
        const totalA = liquidityA + feesA;
        const totalBInA = (liquidityB + feesB) * price;
        return (totalA + totalBInA).toString();
      } else {
        // Convert everything to token B
        const totalB = liquidityB + feesB;
        const totalAInB = (liquidityA + feesA) / price;
        return (totalB + totalAInB).toString();
      }
    } catch (error) {
      console.error('Error calculating position value:', error);
      return '0';
    }
  }

  /**
   * Get position summary for dashboard display
   */
  async getPositionSummary(positionId: string): Promise<{
    position: Position;
    metrics: PositionMetrics;
    value: string;
    needsRebalancing: boolean;
  } | null> {
    try {
      const position = await this.getPosition(positionId);
      if (!position) return null;

      const metrics = await this.calculatePositionMetrics(position);
      const value = this.calculatePositionValue(position, '1', true); // Simplified
      const needsRebalancing = await this.shouldRebalancePosition(positionId);

      return {
        position,
        metrics,
        value,
        needsRebalancing
      };
    } catch (error) {
      console.error('Error getting position summary:', error);
      return null;
    }
  }
}