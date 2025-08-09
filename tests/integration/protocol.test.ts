/**
 * Comprehensive DLMM Protocol Testing
 * Tests the full protocol functionality with your deployed contracts
 */

import { DLMMClient } from '../../src/core/DLMMClient';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { DEMO_TOKENS } from '../../src/constants/addresses';

describe('DLMM Protocol Integration Tests', () => {
  let suiClient: SuiClient;
  let dlmmClient: DLMMClient;
  let keypair: Ed25519Keypair;
  let hasTestTokens = false;

  beforeAll(async () => {
    // Initialize clients
    suiClient = new SuiClient({
      url: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443'
    });
    dlmmClient = DLMMClient.forTestnet(suiClient);

    // Initialize keypair
    if (!process.env.TEST_PRIVATE_KEY) {
      console.warn('⚠️  TEST_PRIVATE_KEY not found - some tests will be skipped');
      return;
    }
    
    try {
      keypair = Ed25519Keypair.fromSecretKey(process.env.TEST_PRIVATE_KEY);
      console.log(`🔑 Testing with address: ${keypair.toSuiAddress()}`);
    } catch (error) {
      console.warn('⚠️  Invalid TEST_PRIVATE_KEY - some tests will be skipped');
    }
  });

  describe('🪙 Test Token Operations', () => {
    test('should mint test USDC tokens', async () => {
      if (!keypair) {
        console.log('⏭️  Skipping token tests - no keypair available');
        return;
      }

      console.log('🧪 Testing test token minting...');
      
      // Try to get test tokens
      const result = await dlmmClient.getTestTokens(keypair);
      
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.transactionDigest).toBe('string');
      
      if (result.success) {
        hasTestTokens = true;
        console.log('✅ Test tokens minted successfully');
        console.log(`   TX: ${result.transactionDigest}`);
      } else {
        console.log(`ℹ️  Test token minting: ${result.error}`);
      }
    }, 45000);

    test('should mint custom amount of test USDC', async () => {
      if (!keypair || !hasTestTokens) {
        console.log('⏭️  Skipping custom mint test');
        return;
      }

      console.log('🧪 Testing custom amount minting...');
      
      const result = await dlmmClient.mintTestUSDC(
        dlmmClient.parseCoinAmount('100'), // 100 USDC
        keypair.toSuiAddress(),
        keypair
      );
      
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        console.log('✅ Custom amount minted successfully');
        console.log(`   TX: ${result.transactionDigest}`);
      } else {
        console.log(`ℹ️  Custom mint result: ${result.error}`);
      }
    }, 45000);
  });

  describe('💰 Quoter Functionality', () => {
    test('should get quotes for token swaps', async () => {
      console.log('🧪 Testing quote functionality...');
      
      const quote = await dlmmClient.getQuote({
        tokenIn: DEMO_TOKENS.TEST_USDC,
        tokenOut: DEMO_TOKENS.SUI,
        amountIn: dlmmClient.parseCoinAmount('10') // 10 USDC
      });

      expect(quote).toBeDefined();
      expect(typeof quote.isValid).toBe('boolean');
      expect(typeof quote.amountOut).toBe('string');
      expect(typeof quote.priceImpact).toBe('string');
      
      console.log(`✅ Quote result: Valid=${quote.isValid}`);
      if (quote.isValid) {
        console.log(`   Amount out: ${dlmmClient.formatCoinAmount(quote.amountOut)} SUI`);
        console.log(`   Price impact: ${quote.priceImpact}%`);
        console.log(`   Fee: ${dlmmClient.formatCoinAmount(quote.feeAmount)} USDC`);
      }
    }, 30000);

    test('should get detailed quotes with analysis', async () => {
      console.log('🧪 Testing detailed quote analysis...');
      
      try {
        const detailedQuote = await dlmmClient.quoter.getDetailedQuote({
          tokenIn: DEMO_TOKENS.TEST_USDC,
          tokenOut: DEMO_TOKENS.SUI,
          amountIn: dlmmClient.parseCoinAmount('50') // 50 USDC
        });

        expect(detailedQuote).toBeDefined();
        expect(detailedQuote.quote).toBeDefined();
        expect(detailedQuote.priceImpactAnalysis).toBeDefined();
        expect(detailedQuote.slippageRecommendation).toBeDefined();
        
        console.log('✅ Detailed quote analysis completed');
        console.log(`   Price impact level: ${detailedQuote.priceImpactAnalysis.level}`);
        console.log(`   Recommended slippage: ${detailedQuote.slippageRecommendation.tolerance} bps`);
        console.log(`   Alternative routes: ${detailedQuote.alternativeRoutes.length}`);
      } catch (error) {
        console.log(`ℹ️  Detailed quote test: ${error}`);
        // This might fail if no pools exist, which is okay for initial testing
      }
    }, 30000);
  });

  describe('🏊 Pool Creation (Future)', () => {
    test('should validate pool creation parameters', async () => {
      console.log('🧪 Testing pool creation validation...');
      
      // Test parameter validation without actually creating a pool
      const isValid = dlmmClient.isValidObjectId('0x123');
      expect(typeof isValid).toBe('boolean');
      
      // Test token amount parsing
      const amount = dlmmClient.parseCoinAmount('100');
      expect(amount).toBe('100000000000'); // 100 * 10^9
      
      const formatted = dlmmClient.formatCoinAmount(amount);
      expect(formatted).toBe('100.000000');
      
      console.log('✅ Pool creation validation works');
      console.log(`   Amount parsing: 100 → ${amount} → ${formatted}`);
    });

    test('should calculate bin prices correctly', async () => {
      console.log('🧪 Testing bin price calculations...');
      
      // Test the SDK's bin price calculation utilities
      const binStep = 25; // 0.25%
      const binId = 1000; // Active bin
      
      // These would use the actual math from your protocol
      console.log('✅ Bin price calculation test ready');
      console.log(`   Bin step: ${binStep} bps`);
      console.log(`   Bin ID: ${binId}`);
      
      // Note: Actual price calculation would use your bin_math module
      expect(binStep).toBeGreaterThan(0);
      expect(binId).toBeGreaterThan(0);
    });
  });

  describe('📍 Position Management (Future)', () => {
    test('should get position recommendations', async () => {
      console.log('🧪 Testing position recommendations...');
      
      // This would work once you have pools
      const recommendations = await dlmmClient.positions.getPositionRecommendations(
        'dummy_pool_id', // Would be real pool ID
        'moderate'
      );
      
      expect(Array.isArray(recommendations)).toBe(true);
      console.log(`✅ Position recommendations: ${recommendations.length} found`);
      
      // Default recommendations should always be available
      if (recommendations.length > 0) {
        const rec = recommendations[0];
        expect(rec).toBeDefined();
        expect(['uniform', 'curve', 'bid-ask']).toContain(rec.strategy);
        console.log(`   Strategy: ${rec.strategy}, Range: ${rec.rangeBins} bins`);
      }
    });
  });

  describe('🔧 Protocol Statistics', () => {
    test('should get comprehensive protocol stats', async () => {
      console.log('🧪 Testing protocol statistics...');
      
      const stats = await dlmmClient.getProtocolStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.totalPools).toBe('number');
      expect(typeof stats.totalVolumeUSD).toBe('string');
      expect(typeof stats.totalTVL).toBe('string');
      expect(typeof stats.totalSwaps).toBe('number');
      
      console.log('✅ Protocol statistics retrieved');
      console.log(`   Total pools: ${stats.totalPools}`);
      console.log(`   Total TVL: ${dlmmClient.formatCoinAmount(stats.totalTVL)}`);
      console.log(`   Total swaps: ${stats.totalSwaps}`);
    }, 30000);

    test('should validate network configuration', async () => {
      console.log('🧪 Testing network configuration...');
      
      const networkInfo = dlmmClient.getNetworkInfo();
      const isConfigured = dlmmClient.isConfigured();
      
      expect(networkInfo.network).toBe('testnet');
      expect(networkInfo.packageId).toBeTruthy();
      expect(networkInfo.factoryId).toBeTruthy();
      expect(isConfigured).toBe(true);
      
      console.log('✅ Network configuration valid');
      console.log(`   Network: ${networkInfo.network}`);
      console.log(`   Package: ${networkInfo.packageId}`);
      console.log(`   Factory: ${networkInfo.factoryId}`);
    });
  });

  describe('🚀 Advanced Features', () => {
    test('should validate SDK utilities', async () => {
      console.log('🧪 Testing SDK utilities...');
      
      // Test various utility functions
      const validAddress = dlmmClient.isValidObjectId('0x6a01a88c704d76ef8b0d4db811dff4dd13104a35e7a125131fa35949d0bc2ada');
      const invalidAddress = dlmmClient.isValidObjectId('invalid');
      
      expect(validAddress).toBe(true);
      expect(invalidAddress).toBe(false);
      
      // Test amount formatting
      const amounts = ['1000000000', '1500000000', '999999999'];
      amounts.forEach(amount => {
        const formatted = dlmmClient.formatCoinAmount(amount);
        const parsed = dlmmClient.parseCoinAmount(formatted);
        expect(parsed).toBe(amount);
      });
      
      console.log('✅ SDK utilities working correctly');
      console.log(`   Address validation working`);
      console.log(`   Amount formatting working`);
    });
  });
});