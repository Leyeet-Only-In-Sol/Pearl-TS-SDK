/**
 * RouterManager - Handles multi-hop routing and complex swap operations
 * Manages optimal route finding, execution, and transaction building
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MODULES, FUNCTIONS } from '../constants/addresses';
import { 
  SwapParams, 
  SwapResult, 
  MultiHopSwapParams,
  QuoteResult,
  SwapRoute,
  RouteHop
} from '../types/pools/swap';

export interface RouterOptions {
  maxHops?: number; // Maximum hops allowed (default: 3)
  deadline?: number; // Transaction deadline in milliseconds
  gasLimit?: number; // Custom gas limit
  recipient?: string; // Custom recipient address
}

export interface RouterStats {
  totalSwaps: number;
  totalVolume: string;
  successRate: number;
  averageGasUsed: number;
}

export interface OptimalRouteParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  maxSlippage?: number; // Basis points
  preferredRouteType?: 'fastest' | 'cheapest' | 'best_price';
}

export class RouterManager {
  private routerObjectId: string;
  private swapHistory: Map<string, SwapResult[]> = new Map();

  constructor(
    private suiClient: SuiClient,
    private packageId: string,
    private factoryId: string,
    routerObjectId?: string
  ) {
    // Router object ID would be provided or discovered
    this.routerObjectId = routerObjectId || '';
  }

  // ==================== CORE ROUTING FUNCTIONS ====================

  /**
   * Execute exact input swap using optimal routing
   */
  async swapExactTokensForTokens(
    params: SwapParams,
    coinInObject: string, // Actual coin object ID
    keypair: Ed25519Keypair,
    options: RouterOptions = {}
  ): Promise<SwapResult> {
    try {
      const {
        deadline = Date.now() + 300000, // 5 minutes default
        gasLimit,
        recipient = keypair.toSuiAddress()
      } = options;

      const txb = new Transaction();
      
      if (gasLimit) {
        txb.setGasBudget(gasLimit);
      }

      // Use router for swap execution
      txb.moveCall({
        target: `${this.packageId}::${MODULES.ROUTER}::${FUNCTIONS.SWAP_EXACT_TOKENS_FOR_TOKENS}`,
        typeArguments: [params.tokenIn, params.tokenOut],
        arguments: [
          txb.object(this.routerObjectId),
          txb.object(this.factoryId),
          txb.object(coinInObject),
          txb.pure.u64(params.amountOutMin),
          txb.pure.address(recipient),
          txb.pure.u64(deadline),
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

      const swapResult = this.parseSwapResult(result, params);
      this.recordSwapHistory(keypair.toSuiAddress(), swapResult);

      return swapResult;
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
        error: `Router swap failed: ${error}`
      };
    }
  }

  /**
   * Execute multi-hop swap through multiple pools
   */
  async swapExactTokensMultiHop(
    params: MultiHopSwapParams,
    coinInObject: string,
    keypair: Ed25519Keypair,
    options: RouterOptions = {}
  ): Promise<SwapResult> {
    try {
      if (params.route.hops.length === 0) {
        throw new Error('Route must have at least one hop');
      }

      const {
        deadline = Date.now() + 300000,
        gasLimit,
        recipient = keypair.toSuiAddress()
      } = options;

      const txb = new Transaction();
      
      if (gasLimit) {
        txb.setGasBudget(gasLimit);
      }

      // Handle different hop counts
      if (params.route.hops.length === 1) {
        // Single hop - use direct swap
        return await this.swapExactTokensForTokens({
          poolId: params.route.hops[0]!.poolId,
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          amountOutMin: params.amountOutMin
        }, coinInObject, keypair, options);
      } else if (params.route.hops.length === 2) {
        // Two-hop swap
        const firstHop = params.route.hops[0]!;
        const secondHop = params.route.hops[1]!;
        
        txb.moveCall({
          target: `${this.packageId}::${MODULES.ROUTER}::${FUNCTIONS.SWAP_EXACT_TOKENS_MULTI_HOP}`,
          typeArguments: [params.tokenIn, firstHop.tokenOut, params.tokenOut],
          arguments: [
            txb.object(this.routerObjectId),
            txb.object(this.factoryId),
            txb.object(coinInObject),
            txb.pure.u64(params.amountOutMin),
            txb.pure.address(recipient),
            txb.pure.u64(deadline),
            txb.object('0x6'), // Clock object
          ],
        });
      } else {
        throw new Error('Multi-hop routing with more than 2 hops not yet implemented');
      }

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      const swapResult = this.parseSwapResult(result, {
        poolId: params.route.hops[0]?.poolId || '',
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOutMin: params.amountOutMin
      });

      this.recordSwapHistory(keypair.toSuiAddress(), swapResult);
      return swapResult;
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
        error: `Multi-hop swap failed: ${error}`
      };
    }
  }

  // ==================== ROUTE OPTIMIZATION ====================

  /**
   * Find optimal route for token swap
   */
  async findOptimalRoute(params: OptimalRouteParams): Promise<QuoteResult | null> {
    try {
      // Use the quoter to find the best route
      const txb = new Transaction();
      
      txb.moveCall({
        target: `${this.packageId}::${MODULES.QUOTER}::find_best_path`,
        typeArguments: [params.tokenIn, params.tokenOut],
        arguments: [
          txb.object(this.factoryId),
        ],
      });

      const result = await this.suiClient.devInspectTransactionBlock({
        transactionBlock: txb,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      return this.parseOptimalRouteResult(result, params);
    } catch (error) {
      console.error('Error finding optimal route:', error);
      return null;
    }
  }

  /**
   * Compare multiple routes and select the best one
   */
  async compareRoutes(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<{
    directRoute?: QuoteResult | undefined;
    multiHopRoutes: QuoteResult[];
    bestRoute: QuoteResult | null;
  }> {
    const routes: QuoteResult[] = [];
    let directRoute: QuoteResult | undefined;

    try {
      // Try direct route first
      const directQuote = await this.getDirectRouteQuote(tokenIn, tokenOut, amountIn);
      if (directQuote?.isValid) {
        directRoute = directQuote;
        routes.push(directQuote);
      }

      // Try multi-hop routes through common intermediates
      const multiHopQuotes = await this.getMultiHopQuotes(tokenIn, tokenOut, amountIn);
      routes.push(...multiHopQuotes);

      // Select best route based on output and fees
      const bestRoute = this.selectBestRoute(routes);

      return {
        directRoute,
        multiHopRoutes: multiHopQuotes,
        bestRoute
      };
    } catch (error) {
      console.error('Error comparing routes:', error);
      return {
        multiHopRoutes: [],
        bestRoute: null
      };
    }
  }

  // ==================== LIQUIDITY OPERATIONS ====================

  /**
   * Add liquidity using router (finds optimal distribution)
   */
  async addLiquidity(
    tokenA: string,
    tokenB: string,
    binStep: number,
    binId: number,
    coinAObject: string,
    coinBObject: string,
    keypair: Ed25519Keypair,
    options: RouterOptions = {}
  ): Promise<{ success: boolean; sharesIssued: string; transactionDigest: string; error?: string | undefined }> {
    try {
      const {
        deadline = Date.now() + 300000,
        gasLimit
      } = options;

      const txb = new Transaction();
      
      if (gasLimit) {
        txb.setGasBudget(gasLimit);
      }

      txb.moveCall({
        target: `${this.packageId}::${MODULES.ROUTER}::add_liquidity_entry`,
        typeArguments: [tokenA, tokenB],
        arguments: [
          txb.object(this.routerObjectId),
          txb.object(this.factoryId),
          txb.object(coinAObject),
          txb.object(coinBObject),
          txb.pure.u16(binStep),
          txb.pure.u32(binId),
          txb.object('0x6'), // Clock object
        ],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      return {
        success: result.effects?.status?.status === 'success',
        sharesIssued: '0', // Extract from events
        transactionDigest: result.digest,
        error: result.effects?.status?.status === 'failure' ? 
          (result.effects?.status?.error || 'Unknown error') : undefined
      };
    } catch (error) {
      return {
        success: false,
        sharesIssued: '0',
        transactionDigest: '',
        error: `Add liquidity failed: ${error}`
      };
    }
  }

  // ==================== ROUTER STATISTICS ====================

  /**
   * Get router statistics
   */
  async getRouterStats(): Promise<RouterStats> {
    try {
      const txb = new Transaction();
      
      txb.moveCall({
        target: `${this.packageId}::${MODULES.ROUTER}::get_router_stats`,
        arguments: [
          txb.object(this.routerObjectId),
        ],
      });

      const result = await this.suiClient.devInspectTransactionBlock({
        transactionBlock: txb,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      return this.parseRouterStats(result);
    } catch (error) {
      console.error('Error getting router stats:', error);
      return {
        totalSwaps: 0,
        totalVolume: '0',
        successRate: 0,
        averageGasUsed: 0
      };
    }
  }

  /**
   * Get user's swap history
   */
  getUserSwapHistory(userAddress: string): SwapResult[] {
    return this.swapHistory.get(userAddress) || [];
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Get direct route quote between two tokens
   */
  private async getDirectRouteQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<QuoteResult | null> {
    try {
      const txb = new Transaction();
      
      txb.moveCall({
        target: `${this.packageId}::${MODULES.QUOTER}::${FUNCTIONS.GET_QUOTE}`,
        typeArguments: [tokenIn, tokenOut],
        arguments: [
          txb.object(this.factoryId),
          txb.pure.u64(amountIn),
          txb.object('0x6'), // Clock object
        ],
      });

      const result = await this.suiClient.devInspectTransactionBlock({
        transactionBlock: txb,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      return this.parseQuoteResult(result, tokenIn, tokenOut, amountIn);
    } catch (error) {
      console.error('Error getting direct route quote:', error);
      return null;
    }
  }

  /**
   * Get multi-hop quotes through intermediate tokens
   */
  private async getMultiHopQuotes(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<QuoteResult[]> {
    const quotes: QuoteResult[] = [];
    
    // Common intermediate tokens for routing
    const intermediateTokens = [
      `${this.packageId}::test_usdc::TEST_USDC`,
      // Add more common tokens based on your protocol
    ];

    for (const intermediate of intermediateTokens) {
      if (intermediate === tokenIn || intermediate === tokenOut) continue;

      try {
        // First hop: tokenIn -> intermediate
        const firstHop = await this.getDirectRouteQuote(tokenIn, intermediate, amountIn);
        if (!firstHop?.isValid || parseInt(firstHop.amountOut) === 0) continue;

        // Second hop: intermediate -> tokenOut
        const secondHop = await this.getDirectRouteQuote(intermediate, tokenOut, firstHop.amountOut);
        if (!secondHop?.isValid || parseInt(secondHop.amountOut) === 0) continue;

        // Combine hops into single quote
        const combinedQuote = this.combineQuotes(firstHop, secondHop, tokenIn, tokenOut, amountIn);
        quotes.push(combinedQuote);
      } catch (error) {
        console.warn(`Multi-hop through ${intermediate} failed:`, error);
      }
    }

    return quotes.sort((a, b) => parseInt(b.amountOut) - parseInt(a.amountOut));
  }

  /**
   * Combine two quotes into a multi-hop quote
   */
  private combineQuotes(
    firstHop: QuoteResult,
    secondHop: QuoteResult,
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): QuoteResult {
    const totalFee = (parseInt(firstHop.feeAmount) + parseInt(secondHop.feeAmount)).toString();
    const totalGas = (parseInt(firstHop.gasEstimate) + parseInt(secondHop.gasEstimate)).toString();
    const totalPriceImpact = (parseFloat(firstHop.priceImpact) + parseFloat(secondHop.priceImpact)).toString();

    const route: SwapRoute = {
      hops: [
        ...firstHop.route.hops,
        ...secondHop.route.hops
      ],
      totalFee,
      estimatedGas: totalGas,
      priceImpact: totalPriceImpact,
      routeType: 'multi-hop'
    };

    return {
      amountOut: secondHop.amountOut,
      amountIn,
      priceImpact: totalPriceImpact,
      feeAmount: totalFee,
      gasEstimate: totalGas,
      poolId: '', // Multi-hop doesn't have single pool
      route,
      isValid: true,
      slippageTolerance: Math.max(firstHop.slippageTolerance, secondHop.slippageTolerance)
    };
  }

  /**
   * Select best route from available options
   */
  private selectBestRoute(routes: QuoteResult[]): QuoteResult | null {
    if (routes.length === 0) return null;

    return routes.reduce((best, current) => {
      // Score based on output amount, fees, and gas
      const bestScore = this.calculateRouteScore(best);
      const currentScore = this.calculateRouteScore(current);
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Calculate route quality score
   */
  private calculateRouteScore(quote: QuoteResult): number {
    const amountOut = parseInt(quote.amountOut);
    const fees = parseInt(quote.feeAmount);
    const gas = parseInt(quote.gasEstimate) * 0.001; // Weight gas less
    const priceImpact = parseFloat(quote.priceImpact) * 100; // Penalize high impact

    return amountOut - fees - gas - priceImpact;
  }

  /**
   * Parse swap result from transaction
   */
  private parseSwapResult(result: any, params: SwapParams): SwapResult {
    try {
      let amountOut = '0';
      let feeAmount = '0';
      let binsCrossed = 1;
      let finalBinId = 1000;

      // Extract from events
      if (result.events) {
        for (const event of result.events) {
          if (event.type.includes('SwapExecuted')) {
            const eventData = event.parsedJson;
            amountOut = eventData?.amount_out || '0';
            feeAmount = eventData?.fee_paid || '0';
            binsCrossed = eventData?.bins_crossed || 1;
            finalBinId = eventData?.final_bin_id || 1000;
            break;
          }
        }
      }

      const priceImpact = this.calculatePriceImpact(params.amountIn, amountOut);

      return {
        amountIn: params.amountIn,
        amountOut,
        feeAmount,
        protocolFee: (parseInt(feeAmount) * 0.3).toString(),
        binsCrossed,
        finalBinId,
        priceImpact,
        transactionDigest: result.digest,
        success: result.effects?.status?.status === 'success',
        error: result.effects?.status?.status === 'failure' ? 
          (result.effects?.status?.error || 'Unknown error') : undefined
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
        transactionDigest: result.digest || '',
        success: false,
        error: `Failed to parse result: ${error}`
      };
    }
  }

  /**
   * Parse quote result from contract response
   */
  private parseQuoteResult(
    result: any,
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): QuoteResult | null {
    try {
      if (result.results?.[0]?.returnValues) {
        const values = result.results[0].returnValues;
        
        const amountOut = values[0] || '0';
        const priceImpact = values[2] || '0';
        const feeAmount = values[3] || '0';
        const gasEstimate = values[4] || '150000';

        const route: SwapRoute = {
          hops: [{
            poolId: '', // Would be extracted from contract
            tokenIn,
            tokenOut,
            binStep: 25,
            expectedAmountIn: amountIn,
            expectedAmountOut: amountOut,
            expectedFee: feeAmount,
            priceImpact: priceImpact.toString()
          }],
          totalFee: feeAmount,
          estimatedGas: gasEstimate,
          priceImpact: priceImpact.toString(),
          routeType: 'direct'
        };

        return {
          amountOut,
          amountIn,
          priceImpact: priceImpact.toString(),
          feeAmount,
          gasEstimate,
          poolId: '',
          route,
          isValid: parseInt(amountOut) > 0,
          slippageTolerance: 50
        };
      }
      return null;
    } catch (error) {
      console.error('Error parsing quote result:', error);
      return null;
    }
  }

  /**
   * Parse optimal route result
   */
  private parseOptimalRouteResult(result: any, params: OptimalRouteParams): QuoteResult | null {
    // Implementation would parse the contract's route finding result
    return this.parseQuoteResult(result, params.tokenIn, params.tokenOut, params.amountIn);
  }

  /**
   * Parse router statistics
   */
  private parseRouterStats(result: any): RouterStats {
    try {
      if (result.results?.[0]?.returnValues) {
        const values = result.results[0].returnValues;
        return {
          totalSwaps: parseInt(values[0] || '0'),
          totalVolume: values[1] || '0',
          successRate: parseFloat(values[2] || '0'),
          averageGasUsed: parseInt(values[3] || '0')
        };
      }
    } catch (error) {
      console.error('Error parsing router stats:', error);
    }

    return {
      totalSwaps: 0,
      totalVolume: '0',
      successRate: 0,
      averageGasUsed: 0
    };
  }

  /**
   * Calculate price impact
   */
  private calculatePriceImpact(amountIn: string, amountOut: string): string {
    const input = parseInt(amountIn);
    const output = parseInt(amountOut);
    
    if (input === 0 || output === 0) return '0';
    
    // Simplified calculation
    const impact = Math.abs(1 - (output / input)) * 100;
    return Math.min(impact, 50).toFixed(2);
  }

  /**
   * Record swap in history
   */
  private recordSwapHistory(userAddress: string, swapResult: SwapResult): void {
    if (!this.swapHistory.has(userAddress)) {
      this.swapHistory.set(userAddress, []);
    }
    
    const history = this.swapHistory.get(userAddress)!;
    history.unshift(swapResult);
    
    // Keep only last 50 swaps per user
    if (history.length > 50) {
      history.splice(50);
    }
  }

  // ==================== PUBLIC UTILITIES ====================

  /**
   * Set router object ID
   */
  setRouterObjectId(routerObjectId: string): void {
    this.routerObjectId = routerObjectId;
  }

  /**
   * Get router object ID
   */
  getRouterObjectId(): string {
    return this.routerObjectId;
  }

  /**
   * Clear swap history
   */
  clearSwapHistory(): void {
    this.swapHistory.clear();
  }

  /**
   * Check if router is properly configured
   */
  isConfigured(): boolean {
    return !!(this.routerObjectId && this.packageId && this.factoryId);
  }
}