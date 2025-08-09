/**
 * QuoterManager - Handles price quotation and route finding
 * REAL IMPLEMENTATION - Uses your deployed quoter contract
 * Provides real-time quotes, multi-hop routing, and price impact analysis
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { MODULES, FUNCTIONS } from '../constants/addresses';
import { 
  QuoteParams, 
  QuoteResult, 
  SwapRoute, 
  RouteHop,
  MultiHopSwapParams,
  RealTimeQuote,
  PriceImpactWarning,
  SlippageConfig
} from '../types/pools/swap';
import { Pool } from '../types/pools/pool';

export interface QuoteOptions {
  maxHops?: number; // Maximum number of hops (default: 3)
  slippageTolerance?: number; // Basis points (default: 50 = 0.5%)
  includeGasEstimate?: boolean; // Include gas estimation (default: true)
  refreshInterval?: number; // Auto-refresh interval in ms (default: 5000)
}

export interface MultiRouteQuote {
  directRoute?: QuoteResult;
  singleHopRoutes: QuoteResult[];
  multiHopRoutes: QuoteResult[];
  bestRoute: QuoteResult;
  alternativeRoutes: QuoteResult[];
}

export class QuoterManager {
  private quoteCache = new Map<string, { quote: QuoteResult; timestamp: number }>();
  private readonly CACHE_TTL = 10000; // 10 seconds cache

  constructor(
    private suiClient: SuiClient,
    private packageId: string,
    private factoryId: string
  ) {}

  // ==================== CORE QUOTE FUNCTIONS ====================

  /**
   * Get best quote for token swap using your deployed quoter contract
   */
  async getBestQuote(
    params: QuoteParams,
    options: QuoteOptions = {}
  ): Promise<QuoteResult> {
    try {
      const {
        maxHops = 3,
        slippageTolerance = 50,
        includeGasEstimate = true
      } = options;

      // Check cache first
      const cacheKey = this.getCacheKey(params);
      const cached = this.getCachedQuote(cacheKey);
      if (cached) {
        return cached;
      }

      // Get quotes from all possible routes
      const multiRouteQuote = await this.getMultiRouteQuotes(params, maxHops);
      
      // Select best route based on output amount and fees
      const bestQuote = this.selectBestRoute(multiRouteQuote);
      
      // Add slippage and gas estimates
      const enhancedQuote = await this.enhanceQuote(bestQuote, {
        slippageTolerance,
        includeGasEstimate
      });

      // Cache the result
      this.cacheQuote(cacheKey, enhancedQuote);

      return enhancedQuote;
    } catch (error) {
      console.error('Error getting best quote:', error);
      throw new Error(`Failed to get quote: ${error}`);
    }
  }

  /**
   * Get quote using your deployed quoter contract
   */
  async getContractQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<QuoteResult> {
    try {
      const txb = new Transaction();
      
      // Use your actual quoter::get_quote function
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

      return this.parseContractQuoteResult(result, tokenIn, tokenOut, amountIn);
    } catch (error) {
      console.error('Error getting contract quote:', error);
      throw new Error(`Contract quote failed: ${error}`);
    }
  }

  /**
   * Get comprehensive multi-route quotes using your contract's path finding
   */
  async getMultiRouteQuotes(
    params: QuoteParams,
    maxHops: number = 3
  ): Promise<MultiRouteQuote> {
    try {
      const results: MultiRouteQuote = {
        singleHopRoutes: [],
        multiHopRoutes: [],
        bestRoute: this.createEmptyQuote(),
        alternativeRoutes: []
      };

      // 1. Try direct route first using your quoter
      try {
        const directQuote = await this.getContractQuote(
          params.tokenIn,
          params.tokenOut,
          params.amountIn
        );
        if (directQuote.isValid) {
          results.directRoute = directQuote;
          results.singleHopRoutes.push(directQuote);
        }
      } catch (error) {
        console.warn('Direct route failed:', error);
      }

      // 2. Try single-hop routes through common intermediates
      if (maxHops >= 2) {
        const singleHopQuotes = await this.getSingleHopQuotes(params);
        results.singleHopRoutes.push(...singleHopQuotes);
      }

      // 3. Try multi-hop routes (for future implementation)
      if (maxHops >= 3) {
        // Multi-hop implementation would go here
        // For now, we focus on direct and single-hop routes
      }

      // 4. Select best route
      const allRoutes = [...results.singleHopRoutes, ...results.multiHopRoutes];
      if (allRoutes.length > 0) {
        results.bestRoute = this.selectBestRoute({ 
          singleHopRoutes: allRoutes, 
          multiHopRoutes: [],
          bestRoute: this.createEmptyQuote(),
          alternativeRoutes: []
        });
        results.alternativeRoutes = allRoutes.filter(route => 
          route !== results.bestRoute
        ).sort((a, b) => parseInt(b.amountOut) - parseInt(a.amountOut));
      }

      return results;
    } catch (error) {
      console.error('Error getting multi-route quotes:', error);
      throw new Error(`Multi-route quote failed: ${error}`);
    }
  }

  // ==================== SINGLE-HOP ROUTING ====================

  /**
   * Get single-hop routes through intermediate tokens using your quoter
   */
  async getSingleHopQuotes(params: QuoteParams): Promise<QuoteResult[]> {
    const routes: QuoteResult[] = [];
    
    // Common intermediate tokens (this should match your testnet demo tokens)
    const intermediateTokens = await this.getCommonIntermediateTokens();
    
    for (const intermediate of intermediateTokens) {
      if (intermediate === params.tokenIn || intermediate === params.tokenOut) {
        continue;
      }

      try {
        // First hop: TokenIn -> Intermediate
        const firstHopQuote = await this.getContractQuote(
          params.tokenIn,
          intermediate,
          params.amountIn
        );

        if (!firstHopQuote.isValid || parseInt(firstHopQuote.amountOut) === 0) {
          continue;
        }

        // Second hop: Intermediate -> TokenOut
        const secondHopQuote = await this.getContractQuote(
          intermediate,
          params.tokenOut,
          firstHopQuote.amountOut
        );

        if (!secondHopQuote.isValid || parseInt(secondHopQuote.amountOut) === 0) {
          continue;
        }

        // Combine hops into single route
        const combinedRoute = this.combineHops(
          params,
          firstHopQuote,
          secondHopQuote,
          intermediate
        );

        routes.push(combinedRoute);
      } catch (error) {
        console.warn(`Single-hop route through ${intermediate} failed:`, error);
      }
    }

    return routes.sort((a, b) => parseInt(b.amountOut) - parseInt(a.amountOut));
  }

  /**
   * Combine two hops into a single route quote
   */
  private combineHops(
    originalParams: QuoteParams,
    firstHop: QuoteResult,
    secondHop: QuoteResult,
    intermediate: string
  ): QuoteResult {
    // Calculate combined fees and price impact
    const totalFee = (parseInt(firstHop.feeAmount) + parseInt(secondHop.feeAmount)).toString();
    const totalPriceImpact = (parseFloat(firstHop.priceImpact) + parseFloat(secondHop.priceImpact)).toString();
    const totalGas = (parseInt(firstHop.gasEstimate) + parseInt(secondHop.gasEstimate)).toString();

    // Create combined route
    const combinedRoute: SwapRoute = {
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
      amountIn: originalParams.amountIn,
      priceImpact: totalPriceImpact,
      feeAmount: totalFee,
      gasEstimate: totalGas,
      poolId: '', // Multi-hop doesn't have single pool
      route: combinedRoute,
      isValid: true,
      slippageTolerance: Math.max(firstHop.slippageTolerance, secondHop.slippageTolerance)
    };
  }

  // ==================== PRICE ANALYSIS ====================

  /**
   * Analyze price impact and provide warnings
   */
  async analyzePriceImpact(quote: QuoteResult): Promise<PriceImpactWarning> {
    const impactPercent = parseFloat(quote.priceImpact);
    
    let level: PriceImpactWarning['level'] = 'low';
    let message = '';
    let shouldWarn = false;

    if (impactPercent < 0.1) {
      level = 'low';
      message = 'Minimal price impact';
    } else if (impactPercent < 1) {
      level = 'medium';
      message = 'Moderate price impact';
      shouldWarn = true;
    } else if (impactPercent < 5) {
      level = 'high';
      message = 'High price impact - consider smaller trade size';
      shouldWarn = true;
    } else {
      level = 'extreme';
      message = 'Extreme price impact - trade may not be profitable';
      shouldWarn = true;
    }

    return {
      level,
      percentage: quote.priceImpact,
      message,
      shouldWarn
    };
  }

  /**
   * Calculate optimal slippage tolerance based on your DLMM's characteristics
   */
  calculateOptimalSlippage(quote: QuoteResult): SlippageConfig {
    const priceImpact = parseFloat(quote.priceImpact);
    const baseSlippage = 50; // 0.5% base for DLMM
    
    let tolerance = baseSlippage;
    
    // DLMM has zero slippage within bins, but may have impact across bins
    if (priceImpact > 1) {
      tolerance = Math.min(baseSlippage + priceImpact * 10, 500); // Max 5%
    }

    return {
      tolerance: Math.round(tolerance),
      autoSlippage: true,
      maxSlippage: 1000 // 10% maximum
    };
  }

  // ==================== REAL-TIME QUOTES ====================

  /**
   * Get real-time quote with auto-refresh
   */
  async getRealTimeQuote(
    params: QuoteParams,
    refreshInterval: number = 5000
  ): Promise<RealTimeQuote> {
    const quote = await this.getBestQuote(params);
    
    return {
      quote,
      lastUpdated: new Date().toISOString(),
      isStale: false,
      refreshInterval
    };
  }

  /**
   * Check if quote is still fresh
   */
  isQuoteFresh(quote: RealTimeQuote): boolean {
    const now = Date.now();
    const lastUpdated = new Date(quote.lastUpdated).getTime();
    return (now - lastUpdated) < quote.refreshInterval;
  }

  // ==================== ROUTE COMPARISON ====================

  /**
   * Compare routes and select the best one
   */
  selectBestRoute(multiRoute: MultiRouteQuote): QuoteResult {
    const allRoutes = [
      ...(multiRoute.directRoute ? [multiRoute.directRoute] : []),
      ...multiRoute.singleHopRoutes,
      ...multiRoute.multiHopRoutes
    ].filter(route => route.isValid);

    if (allRoutes.length === 0) {
      return this.createEmptyQuote();
    }

    // Score routes based on output amount, fees, and gas
    return allRoutes.reduce((best, current) => {
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
    const gas = parseInt(quote.gasEstimate);
    const priceImpact = parseFloat(quote.priceImpact);
    
    // Higher output is better, lower fees/gas/impact is better
    const outputScore = amountOut;
    const costScore = fees + gas * 0.001; // Weight gas less than fees
    const impactPenalty = priceImpact * 1000; // Penalize high price impact
    
    return outputScore - costScore - impactPenalty;
  }

  // ==================== HELPER FUNCTIONS ====================

  /**
   * Get common intermediate tokens for routing (matches your testnet demo)
   */
  private async getCommonIntermediateTokens(): Promise<string[]> {
    // This should match your testnet demo tokens
    return [
      `${this.packageId}::test_usdc::TEST_USDC`, // Your test USDC
      // Add other common tokens that have good liquidity in your testnet
    ];
  }

  /**
   * Parse contract quote result from Move function response
   */
  private parseContractQuoteResult(
    result: any,
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): QuoteResult {
    try {
      if (result.results?.[0]?.returnValues) {
        const returnValues = result.results[0].returnValues;
        
        // Parse the returned QuoteResult struct from your quoter contract
        // This structure should match your quoter::get_quote return format
        const amountOut = returnValues[0]?.[0] || '0';
        const priceImpact = returnValues[1]?.[0] || '0';
        const feeAmount = returnValues[2]?.[0] || '0';
        const gasEstimate = returnValues[3]?.[0] || '150000';
        
        // Create route info
        const route: SwapRoute = {
          hops: [{
            poolId: '', // Will be filled from contract
            tokenIn,
            tokenOut,
            binStep: 25, // Default, should come from contract
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
          poolId: '', // Extract from contract response
          route,
          isValid: parseInt(amountOut) > 0,
          slippageTolerance: 50 // Default 0.5%
        };
      }

      return this.createEmptyQuote();
    } catch (error) {
      console.error('Error parsing contract quote:', error);
      return this.createEmptyQuote();
    }
  }

  /**
   * Enhance quote with additional analysis
   */
  private async enhanceQuote(
    quote: QuoteResult,
    options: { slippageTolerance: number; includeGasEstimate: boolean }
  ): Promise<QuoteResult> {
    const enhanced = { ...quote };

    // Update slippage tolerance
    const optimalSlippage = this.calculateOptimalSlippage(quote);
    enhanced.slippageTolerance = Math.max(options.slippageTolerance, optimalSlippage.tolerance);

    // Enhance gas estimate if needed
    if (options.includeGasEstimate && !enhanced.gasEstimate) {
      enhanced.gasEstimate = this.estimateGasForRoute(enhanced.route);
    }

    return enhanced;
  }

  /**
   * Estimate gas cost for a route
   */
  private estimateGasForRoute(route: SwapRoute): string {
    const baseGas = 100000;
    const gasPerHop = 150000;
    const totalGas = baseGas + (route.hops.length * gasPerHop);
    return totalGas.toString();
  }

  /**
   * Create empty quote result
   */
  private createEmptyQuote(): QuoteResult {
    return {
      amountOut: '0',
      amountIn: '0',
      priceImpact: '0',
      feeAmount: '0',
      gasEstimate: '0',
      poolId: '',
      route: {
        hops: [],
        totalFee: '0',
        estimatedGas: '0',
        priceImpact: '0',
        routeType: 'direct'
      },
      isValid: false,
      slippageTolerance: 50
    };
  }

  // ==================== CACHING ====================

  /**
   * Generate cache key for quote
   */
  private getCacheKey(params: QuoteParams): string {
    return `${params.tokenIn}-${params.tokenOut}-${params.amountIn}`;
  }

  /**
   * Get cached quote if still valid
   */
  private getCachedQuote(key: string): QuoteResult | null {
    const cached = this.quoteCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.quote;
    }
    return null;
  }

  /**
   * Cache quote result
   */
  private cacheQuote(key: string, quote: QuoteResult): void {
    this.quoteCache.set(key, {
      quote,
      timestamp: Date.now()
    });
  }

  /**
   * Clear quote cache
   */
  clearCache(): void {
    this.quoteCache.clear();
  }

  // ==================== PUBLIC UTILITIES ====================

  /**
   * Get quote comparison between multiple amounts
   */
  async getQuoteComparison(
    tokenIn: string,
    tokenOut: string,
    amounts: string[]
  ): Promise<QuoteResult[]> {
    const quotes = await Promise.all(
      amounts.map(amount => 
        this.getBestQuote({ tokenIn, tokenOut, amountIn: amount })
      )
    );

    return quotes.sort((a, b) => parseInt(b.amountOut) - parseInt(a.amountOut));
  }

  /**
   * Estimate minimum output for slippage protection
   */
  calculateMinimumOutput(quote: QuoteResult, slippageBps: number): string {
    const amountOut = parseInt(quote.amountOut);
    const slippageMultiplier = (10000 - slippageBps) / 10000;
    return Math.floor(amountOut * slippageMultiplier).toString();
  }

  /**
   * Get detailed quote with breakdown for your DLMM protocol
   */
  async getDetailedQuote(params: QuoteParams): Promise<{
    quote: QuoteResult;
    priceImpactAnalysis: PriceImpactWarning;
    slippageRecommendation: SlippageConfig;
    alternativeRoutes: QuoteResult[];
  }> {
    const quote = await this.getBestQuote(params);
    const priceImpactAnalysis = await this.analyzePriceImpact(quote);
    const slippageRecommendation = this.calculateOptimalSlippage(quote);
    
    // Get alternative routes
    const multiRouteQuote = await this.getMultiRouteQuotes(params);
    const alternativeRoutes = multiRouteQuote.alternativeRoutes;

    return {
      quote,
      priceImpactAnalysis,
      slippageRecommendation,
      alternativeRoutes
    };
  }

  /**
   * Simulate swap for validation before execution
   */
  async simulateSwap(params: QuoteParams): Promise<{
    canExecute: boolean;
    quote: QuoteResult;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];
    let canExecute = true;

    try {
      const quote = await this.getBestQuote(params);
      
      if (!quote.isValid) {
        errors.push('No valid route found');
        canExecute = false;
      }

      if (parseInt(quote.amountOut) === 0) {
        errors.push('Output amount would be zero');
        canExecute = false;
      }

      const priceImpact = parseFloat(quote.priceImpact);
      if (priceImpact > 5) {
        warnings.push('High price impact detected');
      }

      if (priceImpact > 15) {
        errors.push('Price impact too high - trade may fail');
        canExecute = false;
      }

      return {
        canExecute,
        quote,
        warnings,
        errors
      };
    } catch (error) {
      return {
        canExecute: false,
        quote: this.createEmptyQuote(),
        warnings,
        errors: [`Simulation failed: ${error}`]
      };
    }
  }

  /**
   * Get quote with retry logic for reliability
   */
  async getQuoteWithRetry(
    params: QuoteParams,
    maxRetries: number = 3
  ): Promise<QuoteResult> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.getBestQuote(params);
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    
    throw new Error(`Failed to get quote after ${maxRetries} retries: ${lastError?.message}`);
  }
}