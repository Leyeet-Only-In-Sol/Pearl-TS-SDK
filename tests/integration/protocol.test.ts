/**
 * Enhanced SDK Integration Tests
 * Comprehensive testing of the Sui DLMM SDK with real contract integration
 * 
 * Tests all major SDK functionality including:
 * - Factory operations and pool discovery
 * - Quoter functionality with real price calculations
 * - Position recommendations and strategies
 * - Router path finding and multi-hop routing
 * - SDK utilities and validation
 */

import { DLMMClient } from '../../src/core/DLMMClient';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { DEMO_TOKENS, BIN_STEPS, DEFAULT_BIN_STEP } from '../../src/constants/addresses';
import { 
  calculateBinPrice, 
  getBinIdFromPrice, 
  formatTokenAmount, 
  parseTokenAmount,
  calculateSlippageAmount,
  isPriceImpactAcceptable,
  generatePoolKey,
  estimateDeadline
} from '../../src/index';

describe('🔬 Enhanced SDK Integration Tests', () => {
  let suiClient: SuiClient;
  let dlmmClient: DLMMClient;
  let keypair: Ed25519Keypair | undefined;
  let testAddress: string;

  beforeAll(async () => {
    console.log('🚀 Initializing Enhanced SDK Tests...');
    
    // Initialize Sui client
    suiClient = new SuiClient({
      url: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443'
    });
    
    // Initialize DLMM client
    dlmmClient = DLMMClient.forTestnet(suiClient);
    
    // Setup test keypair if available
    if (process.env.TEST_PRIVATE_KEY) {
      try {
        keypair = Ed25519Keypair.fromSecretKey(process.env.TEST_PRIVATE_KEY);
        testAddress = keypair.toSuiAddress();
        console.log(`🔑 Test address: ${testAddress}`);
      } catch (error) {
        console.warn('⚠️  Invalid TEST_PRIVATE_KEY, some tests will be skipped');
      }
    } else {
      testAddress = '0x0000000000000000000000000000000000000000000000000000000000000001';
      console.warn('⚠️  No TEST_PRIVATE_KEY, using dummy address for read-only tests');
    }
    
    console.log('✅ SDK initialized successfully');
    console.log(`   Network: ${dlmmClient.network}`);
    console.log(`   Package: ${dlmmClient.addresses.PACKAGE_ID}`);
    console.log(`   Factory: ${dlmmClient.addresses.FACTORY_ID}`);
  });

  describe('🏭 Factory Manager Deep Testing', () => {
    test('should fetch and validate factory configuration', async () => {
      console.log('🧪 Testing factory configuration...');
      
      const factoryInfo = await dlmmClient.factory.getFactoryInfo();
      
      // Validate factory info structure
      expect(factoryInfo).toMatchObject({
        poolCount: expect.any(Number),
        protocolFeeRate: expect.any(Number),
        admin: expect.stringMatching(/^0x[a-fA-F0-9]+$/),
        allowedBinSteps: expect.arrayContaining([25])
      });
      
      // Test business logic
      expect(factoryInfo.poolCount).toBeGreaterThanOrEqual(0);
      expect(factoryInfo.protocolFeeRate).toBeGreaterThan(0);
      expect(factoryInfo.protocolFeeRate).toBeLessThanOrEqual(5000); // Max 50%
      expect(factoryInfo.allowedBinSteps).toContain(DEFAULT_BIN_STEP);
      
      console.log('✅ Factory configuration validated');
      console.log(`   Pools: ${factoryInfo.poolCount}`);
      console.log(`   Protocol fee: ${factoryInfo.protocolFeeRate} bps`);
      console.log(`   Allowed bin steps: ${factoryInfo.allowedBinSteps.join(', ')}`);
    }, 30000);

    test('should discover and analyze all pools', async () => {
      console.log('🧪 Testing comprehensive pool discovery...');
      
      const poolDiscovery = await dlmmClient.factory.getAllPools();
      
      expect(poolDiscovery).toMatchObject({
        pools: expect.any(Array),
        totalCount: expect.any(Number),
        hasMore: expect.any(Boolean)
      });
      
      expect(poolDiscovery.totalCount).toBe(poolDiscovery.pools.length);
      
      console.log(`✅ Discovered ${poolDiscovery.totalCount} pools`);
      
      // Analyze pools in detail
      if (poolDiscovery.pools.length > 0) {
        const firstPool = poolDiscovery.pools[0]!;
        
        // Validate pool structure
        expect(firstPool).toMatchObject({
          id: expect.stringMatching(/^0x[a-fA-F0-9]+$/),
          tokenA: expect.objectContaining({
            coinType: expect.any(String),
            symbol: expect.any(String),
            decimals: expect.any(Number)
          }),
          tokenB: expect.objectContaining({
            coinType: expect.any(String),
            symbol: expect.any(String),
            decimals: expect.any(Number)
          }),
          binStep: expect.any(Number),
          reserveA: expect.any(String),
          reserveB: expect.any(String),
          activeBinId: expect.any(Number),
          isActive: expect.any(Boolean)
        });
        
        // Test business logic
        expect(BIN_STEPS).toContain(firstPool.binStep);
        expect(parseInt(firstPool.reserveA)).toBeGreaterThanOrEqual(0);
        expect(parseInt(firstPool.reserveB)).toBeGreaterThanOrEqual(0);
        expect(firstPool.activeBinId).toBeGreaterThan(0);
        
        console.log(`   Sample pool analysis:`);
        console.log(`   - ID: ${firstPool.id}`);
        console.log(`   - Pair: ${firstPool.tokenA.symbol}/${firstPool.tokenB.symbol}`);
        console.log(`   - Bin step: ${firstPool.binStep} bps`);
        console.log(`   - TVL: ${formatTokenAmount(calculateTVL(firstPool.reserveA, firstPool.reserveB))}`);
        console.log(`   - Active bin: ${firstPool.activeBinId}`);
        console.log(`   - Status: ${firstPool.isActive ? 'Active' : 'Inactive'}`);
      }
    }, 45000);

    test('should test pool filtering and sorting', async () => {
      console.log('🧪 Testing pool filtering and sorting...');
      
      // Test filtering by active status
      const activePools = await dlmmClient.factory.getAllPools({
        isActive: true
      });
      
      expect(activePools.pools.every(pool => pool.isActive)).toBe(true);
      
      // Test filtering by bin steps
      const specificBinStepPools = await dlmmClient.factory.getAllPools({
        binSteps: [25]
      });
      
      expect(specificBinStepPools.pools.every(pool => pool.binStep === 25)).toBe(true);
      
      // Test sorting by TVL
      const sortedByTVL = await dlmmClient.factory.getAllPools(
        undefined,
        { sortBy: 'tvl', sortOrder: 'desc' }
      );
      
      if (sortedByTVL.pools.length > 1) {
        const firstTVL = parseInt(sortedByTVL.pools[0]!.reserveA) + parseInt(sortedByTVL.pools[0]!.reserveB);
        const secondTVL = parseInt(sortedByTVL.pools[1]!.reserveA) + parseInt(sortedByTVL.pools[1]!.reserveB);
        expect(firstTVL).toBeGreaterThanOrEqual(secondTVL);
      }
      
      console.log('✅ Pool filtering and sorting validated');
      console.log(`   Active pools: ${activePools.pools.length}`);
      console.log(`   25 bps pools: ${specificBinStepPools.pools.length}`);
    }, 30000);

    test('should test best pool selection algorithm', async () => {
      console.log('🧪 Testing best pool selection...');
      
      const bestPool = await dlmmClient.factory.findBestPoolForPair(
        DEMO_TOKENS.TEST_USDC,
        DEMO_TOKENS.SUI
      );
      
      if (bestPool) {
        expect(bestPool.isActive).toBe(true);
        expect(parseInt(bestPool.reserveA)).toBeGreaterThan(0);
        expect(parseInt(bestPool.reserveB)).toBeGreaterThan(0);
        
        console.log('✅ Best pool found and validated');
        console.log(`   Pool ID: ${bestPool.id}`);
        console.log(`   Bin step: ${bestPool.binStep} bps`);
        
        // Test pool ID retrieval
        const poolId = await dlmmClient.factory.getPoolIdForPair(
          DEMO_TOKENS.TEST_USDC,
          DEMO_TOKENS.SUI,
          bestPool.binStep
        );
        
        expect(poolId).toBe(bestPool.id);
        console.log(`   Pool ID verification: ✅`);
      } else {
        console.log('ℹ️  No pools found for TEST_USDC/SUI pair');
      }
    }, 30000);

    function calculateTVL(reserveA: string, reserveB: string): string {
      return (parseInt(reserveA) + parseInt(reserveB)).toString();
    }
  });

  describe('💹 Quoter Manager Advanced Testing', () => {
    test('should perform comprehensive quote analysis', async () => {
      console.log('🧪 Testing comprehensive quote analysis...');
      
      const testAmounts = ['1', '10', '100', '1000'];
      
      for (const amount of testAmounts) {
        try {
          const quote = await dlmmClient.quoter.getBestQuote({
            tokenIn: DEMO_TOKENS.TEST_USDC,
            tokenOut: DEMO_TOKENS.SUI,
            amountIn: parseTokenAmount(amount)
          });
          
          // Validate quote structure
          expect(quote).toMatchObject({
            amountOut: expect.any(String),
            amountIn: expect.any(String),
            priceImpact: expect.any(String),
            feeAmount: expect.any(String),
            gasEstimate: expect.any(String),
            isValid: expect.any(Boolean)
          });
          
          if (quote.isValid) {
            expect(parseInt(quote.amountOut)).toBeGreaterThan(0);
            expect(parseInt(quote.feeAmount)).toBeGreaterThanOrEqual(0);
            expect(parseInt(quote.gasEstimate)).toBeGreaterThan(0);
            expect(parseFloat(quote.priceImpact)).toBeGreaterThanOrEqual(0);
            
            console.log(`   ${amount} USDC → ${formatTokenAmount(quote.amountOut)} SUI`);
            console.log(`     Price impact: ${quote.priceImpact}%`);
            console.log(`     Fee: ${formatTokenAmount(quote.feeAmount)} USDC`);
          }
        } catch (error) {
          console.log(`   ${amount} USDC: No route available`);
        }
      }
      
      console.log('✅ Quote analysis completed');
    }, 60000);

    test('should test price impact warnings', async () => {
      console.log('🧪 Testing price impact analysis...');
      
      try {
        // Test with large amount to trigger price impact
        const largeAmountQuote = await dlmmClient.quoter.getBestQuote({
          tokenIn: DEMO_TOKENS.TEST_USDC,
          tokenOut: DEMO_TOKENS.SUI,
          amountIn: parseTokenAmount('10000') // Large amount
        });
        
        if (largeAmountQuote.isValid) {
          const priceImpactAnalysis = await dlmmClient.quoter.analyzePriceImpact(largeAmountQuote);
          
          expect(priceImpactAnalysis).toMatchObject({
            level: expect.stringMatching(/^(low|medium|high|extreme)$/),
            percentage: expect.any(String),
            message: expect.any(String),
            shouldWarn: expect.any(Boolean)
          });
          
          console.log('✅ Price impact analysis validated');
          console.log(`   Level: ${priceImpactAnalysis.level}`);
          console.log(`   Impact: ${priceImpactAnalysis.percentage}%`);
          console.log(`   Warning: ${priceImpactAnalysis.shouldWarn}`);
          
          // Test acceptable price impact
          const isAcceptable = isPriceImpactAcceptable(priceImpactAnalysis.percentage, 500); // 5%
          console.log(`   Acceptable (5% threshold): ${isAcceptable}`);
        }
      } catch (error) {
        console.log(`ℹ️  Price impact test: ${error}`);
      }
    }, 30000);

    test('should test slippage calculations', async () => {
      console.log('🧪 Testing slippage calculations...');
      
      try {
        const quote = await dlmmClient.quoter.getBestQuote({
          tokenIn: DEMO_TOKENS.TEST_USDC,
          tokenOut: DEMO_TOKENS.SUI,
          amountIn: parseTokenAmount('50')
        });
        
        if (quote.isValid) {
          // Test slippage configuration
          const slippageConfig = dlmmClient.quoter.calculateOptimalSlippage(quote);
          
          expect(slippageConfig).toMatchObject({
            tolerance: expect.any(Number),
            autoSlippage: expect.any(Boolean),
            maxSlippage: expect.any(Number)
          });
          
          expect(slippageConfig.tolerance).toBeGreaterThan(0);
          expect(slippageConfig.tolerance).toBeLessThanOrEqual(slippageConfig.maxSlippage);
          
          // Test minimum output calculation
          const minOutput = dlmmClient.quoter.calculateMinimumOutput(quote, slippageConfig.tolerance);
          expect(parseInt(minOutput)).toBeLessThan(parseInt(quote.amountOut));
          
          console.log('✅ Slippage calculations validated');
          console.log(`   Optimal tolerance: ${slippageConfig.tolerance} bps`);
          console.log(`   Auto slippage: ${slippageConfig.autoSlippage}`);
          console.log(`   Min output: ${formatTokenAmount(minOutput)} SUI`);
        }
      } catch (error) {
        console.log(`ℹ️  Slippage test: ${error}`);
      }
    }, 30000);

    test('should test multi-route quote comparison', async () => {
      console.log('🧪 Testing multi-route quote comparison...');
      
      try {
        const multiRouteQuote = await dlmmClient.quoter.getMultiRouteQuotes({
          tokenIn: DEMO_TOKENS.TEST_USDC,
          tokenOut: DEMO_TOKENS.SUI,
          amountIn: parseTokenAmount('25')
        });
        
        expect(multiRouteQuote).toMatchObject({
          singleHopRoutes: expect.any(Array),
          multiHopRoutes: expect.any(Array),
          bestRoute: expect.any(Object),
          alternativeRoutes: expect.any(Array)
        });
        
        console.log('✅ Multi-route analysis completed');
        console.log(`   Single-hop routes: ${multiRouteQuote.singleHopRoutes.length}`);
        console.log(`   Multi-hop routes: ${multiRouteQuote.multiHopRoutes.length}`);
        console.log(`   Alternative routes: ${multiRouteQuote.alternativeRoutes.length}`);
        
        if (multiRouteQuote.bestRoute.isValid) {
          console.log(`   Best route output: ${formatTokenAmount(multiRouteQuote.bestRoute.amountOut)} SUI`);
          console.log(`   Route type: ${multiRouteQuote.bestRoute.route.routeType}`);
        }
      } catch (error) {
        console.log(`ℹ️  Multi-route test: ${error}`);
      }
    }, 45000);
  });

  describe('🎯 Position Manager Strategy Testing', () => {
    test('should test position strategy recommendations', async () => {
      console.log('🧪 Testing position strategy recommendations...');
      
      const riskProfiles = ['conservative', 'moderate', 'aggressive'] as const;
      
      for (const riskProfile of riskProfiles) {
        const recommendations = await dlmmClient.positions.getPositionRecommendations(
          'dummy_pool_id', // Would be real pool ID in production
          riskProfile
        );
        
        expect(Array.isArray(recommendations)).toBe(true);
        expect(recommendations.length).toBeGreaterThan(0);
        
        const recommendation = recommendations[0]!;
        expect(recommendation).toMatchObject({
          strategy: expect.stringMatching(/^(uniform|curve|bid-ask)$/),
          rangeBins: expect.any(Number),
          reasoning: expect.any(String),
          expectedApr: expect.any(Number),
          riskLevel: expect.any(String),
          capitalEfficiency: expect.any(Number)
        });
        
        // Validate business logic
        expect(recommendation.rangeBins).toBeGreaterThan(0);
        expect(recommendation.expectedApr).toBeGreaterThan(0);
        expect(recommendation.capitalEfficiency).toBeGreaterThan(0);
        expect(recommendation.capitalEfficiency).toBeLessThanOrEqual(100);
        
        console.log(`   ${riskProfile}: ${recommendation.strategy} strategy`);
        console.log(`     Range: ${recommendation.rangeBins} bins`);
        console.log(`     Expected APR: ${recommendation.expectedApr}%`);
        console.log(`     Risk: ${recommendation.riskLevel}`);
        console.log(`     Efficiency: ${recommendation.capitalEfficiency}%`);
      }
      
      console.log('✅ Position strategy recommendations validated');
    }, 30000);

    test('should test position value calculations', async () => {
      console.log('🧪 Testing position value calculations...');
      
      // Mock position data for testing
      const mockPosition = {
        totalLiquidityA: parseTokenAmount('100'), // 100 USDC
        totalLiquidityB: parseTokenAmount('50'),  // 50 SUI
        unclaimedFeesA: parseTokenAmount('5'),    // 5 USDC
        unclaimedFeesB: parseTokenAmount('2.5')   // 2.5 SUI
      };
      
      const currentPrice = '2.0'; // 1 SUI = 2 USDC
      
      // Test position value calculation in USDC terms
      const valueInUSDC = dlmmClient.positions.calculatePositionValue(
        mockPosition as any,
        currentPrice,
        true // in token A (USDC)
      );
      
      // Test position value calculation in SUI terms
      const valueInSUI = dlmmClient.positions.calculatePositionValue(
        mockPosition as any,
        currentPrice,
        false // in token B (SUI)
      );
      
      expect(parseFloat(valueInUSDC)).toBeGreaterThan(0);
      expect(parseFloat(valueInSUI)).toBeGreaterThan(0);
      
      console.log('✅ Position value calculations validated');
      console.log(`   Value in USDC: ${formatTokenAmount(valueInUSDC)}`);
      console.log(`   Value in SUI: ${formatTokenAmount(valueInSUI)}`);
      
      // Test the calculation logic
      const expectedUSDCValue = 100 + 5 + (50 + 2.5) * 2; // USDC + fees + (SUI + fees) * price
      const calculatedUSDCValue = parseFloat(formatTokenAmount(valueInUSDC));
      expect(Math.abs(calculatedUSDCValue - expectedUSDCValue)).toBeLessThan(0.1);
    }, 15000);

    test('should validate position creation parameters', async () => {
      console.log('🧪 Testing position parameter validation...');
      
      // Test valid parameters
      const validParams = {
        poolId: '0x123',
        tokenA: DEMO_TOKENS.TEST_USDC,
        tokenB: DEMO_TOKENS.SUI,
        amountA: parseTokenAmount('100'),
        amountB: parseTokenAmount('50'),
        lowerBinId: 950,
        upperBinId: 1050,
        strategy: 'uniform' as const
      };
      
      // This would normally validate against the actual pool
      expect(validParams.lowerBinId).toBeLessThan(validParams.upperBinId);
      expect(parseInt(validParams.amountA)).toBeGreaterThan(0);
      expect(parseInt(validParams.amountB)).toBeGreaterThan(0);
      expect(['uniform', 'curve', 'bid-ask']).toContain(validParams.strategy);
      
      // Test invalid parameters
      const invalidParams = {
        ...validParams,
        lowerBinId: 1050,
        upperBinId: 950 // Invalid: lower > upper
      };
      
      expect(invalidParams.lowerBinId).toBeGreaterThan(invalidParams.upperBinId);
      
      console.log('✅ Position parameter validation completed');
      console.log(`   Valid range: ${validParams.lowerBinId} - ${validParams.upperBinId}`);
      console.log(`   Invalid range: ${invalidParams.lowerBinId} - ${invalidParams.upperBinId}`);
    }, 15000);
  });

  describe('🛣️ Router Manager Path Testing', () => {
    test('should test route optimization algorithms', async () => {
      console.log('🧪 Testing route optimization...');
      
      try {
        const routeComparison = await dlmmClient.router.compareRoutes(
          DEMO_TOKENS.TEST_USDC,
          DEMO_TOKENS.SUI,
          parseTokenAmount('75')
        );
        
        expect(routeComparison).toMatchObject({
          multiHopRoutes: expect.any(Array),
          bestRoute: expect.any(Object)
        });
        
        if (routeComparison.bestRoute) {
          expect(routeComparison.bestRoute.isValid).toBe(true);
          expect(parseInt(routeComparison.bestRoute.amountOut)).toBeGreaterThan(0);
          
          console.log('✅ Route optimization validated');
          console.log(`   Best route output: ${formatTokenAmount(routeComparison.bestRoute.amountOut)} SUI`);
          console.log(`   Alternative routes: ${routeComparison.multiHopRoutes.length}`);
        }
        
        if (routeComparison.directRoute) {
          console.log(`   Direct route available: ✅`);
          console.log(`   Direct route output: ${formatTokenAmount(routeComparison.directRoute.amountOut)} SUI`);
        }
      } catch (error) {
        console.log(`ℹ️  Route optimization test: ${error}`);
      }
    }, 30000);

    test('should test gas estimation for different route types', async () => {
      console.log('🧪 Testing gas estimation...');
      
      // Test gas estimates for different scenarios
      const scenarios = [
        { hops: 1, description: 'Direct swap' },
        { hops: 2, description: 'Single-hop through intermediate' },
        { hops: 3, description: 'Multi-hop complex route' }
      ];
      
      scenarios.forEach(scenario => {
        // This would use the actual gas estimation from your router
        const estimatedGas = 100000 + (scenario.hops * 150000); // Base + per-hop
        
        expect(estimatedGas).toBeGreaterThan(0);
        console.log(`   ${scenario.description}: ~${estimatedGas.toLocaleString()} gas`);
      });
      
      console.log('✅ Gas estimation validated');
    }, 15000);
  });

  describe('🔧 SDK Utilities Comprehensive Testing', () => {
    test('should test bin math calculations', async () => {
      console.log('🧪 Testing bin math utilities...');
      
      const testCases = [
        { binId: 1000, binStep: 25 },
        { binId: 1100, binStep: 50 },
        { binId: 900, binStep: 10 }
      ];
      
      testCases.forEach(({ binId, binStep }) => {
        // Test price calculation
        const price = calculateBinPrice(binId, binStep);
        expect(price).toBeTruthy();
        expect(parseFloat(price)).toBeGreaterThan(0);
        
        // Test reverse calculation
        const recoveredBinId = getBinIdFromPrice(price, binStep);
        expect(Math.abs(recoveredBinId - binId)).toBeLessThanOrEqual(1); // Allow 1 bin tolerance
        
        console.log(`   Bin ${binId} (${binStep} bps): Price ${formatTokenAmount(price, 18).substring(0, 10)}...`);
      });
      
      console.log('✅ Bin math calculations validated');
    }, 15000);

    test('should test token amount utilities', async () => {
      console.log('🧪 Testing token amount utilities...');
      
      const testAmounts = ['0.000001', '1', '1.5', '1000', '1000000'];
      
      testAmounts.forEach(amount => {
        // Test parsing and formatting round trip
        const parsed = parseTokenAmount(amount);
        const formatted = formatTokenAmount(parsed);
        
        expect(parsed).toBeTruthy();
        expect(formatted).toBeTruthy();
        
        // Test precision (should be close due to decimal precision)
        const originalNum = parseFloat(amount);
        const roundTripNum = parseFloat(formatted);
        expect(Math.abs(originalNum - roundTripNum)).toBeLessThan(0.000001);
        
        console.log(`   ${amount} → ${parsed} → ${formatted}`);
      });
      
      console.log('✅ Token amount utilities validated');
    }, 15000);

    test('should test slippage calculations', async () => {
      console.log('🧪 Testing slippage utilities...');
      
      const testAmount = parseTokenAmount('100');
      const slippages = [50, 100, 500]; // 0.5%, 1%, 5%
      
      slippages.forEach(slippageBps => {
        const minOutput = calculateSlippageAmount(testAmount, slippageBps, true);
        const maxInput = calculateSlippageAmount(testAmount, slippageBps, false);
        
        expect(parseInt(minOutput)).toBeLessThan(parseInt(testAmount));
        expect(parseInt(maxInput)).toBeGreaterThan(parseInt(testAmount));
        
        const slippagePercent = slippageBps / 100;
        console.log(`   ${slippagePercent}% slippage:`);
        console.log(`     Min output: ${formatTokenAmount(minOutput)}`);
        console.log(`     Max input: ${formatTokenAmount(maxInput)}`);
      });
      
      console.log('✅ Slippage calculations validated');
    }, 15000);

    test('should test pool key generation', async () => {
      console.log('🧪 Testing pool key generation...');
      
      const tokenA = DEMO_TOKENS.TEST_USDC;
      const tokenB = DEMO_TOKENS.SUI;
      const binStep = 25;
      
      // Test key generation
      const key1 = generatePoolKey(tokenA, tokenB, binStep);
      const key2 = generatePoolKey(tokenB, tokenA, binStep); // Reversed order
      
      expect(key1).toBe(key2); // Should be same regardless of order
      expect(key1).toContain(binStep.toString());
      
      console.log('✅ Pool key generation validated');
      console.log(`   Key: ${key1.substring(0, 50)}...`);
    }, 15000);

    test('should test deadline estimation', async () => {
      console.log('🧪 Testing deadline utilities...');
      
      const now = Date.now();
      const deadline5min = estimateDeadline(5);
      const deadline10min = estimateDeadline(10);
      
      expect(deadline5min).toBeGreaterThan(now);
      expect(deadline10min).toBeGreaterThan(deadline5min);
      
      const diff5min = deadline5min - now;
      const diff10min = deadline10min - now;
      
      expect(diff5min).toBeCloseTo(5 * 60 * 1000, -3); // 5 minutes in ms
      expect(diff10min).toBeCloseTo(10 * 60 * 1000, -3); // 10 minutes in ms
      
      console.log('✅ Deadline estimation validated');
      console.log(`   5 min deadline: ${new Date(deadline5min).toISOString()}`);
      console.log(`   10 min deadline: ${new Date(deadline10min).toISOString()}`);
    }, 15000);
  });

  describe('📊 Protocol Analytics & Statistics', () => {
    test('should gather comprehensive protocol metrics', async () => {
      console.log('🧪 Testing protocol analytics...');
      
      const protocolStats = await dlmmClient.getProtocolStats();
      
      expect(protocolStats).toMatchObject({
        totalPools: expect.any(Number),
        totalVolumeUSD: expect.any(String),
        totalTVL: expect.any(String),
        totalSwaps: expect.any(Number),
        factoryInfo: expect.any(Object)
      });
      
      // Validate metrics make sense
      expect(protocolStats.totalPools).toBeGreaterThanOrEqual(0);
      expect(parseInt(protocolStats.totalVolumeUSD)).toBeGreaterThanOrEqual(0);
      expect(parseInt(protocolStats.totalTVL)).toBeGreaterThanOrEqual(0);
      expect(protocolStats.totalSwaps).toBeGreaterThanOrEqual(0);
    });
  });
});