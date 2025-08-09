/**
 * Factory Integration Tests
 * Tests actual interaction with your deployed factory contract
 */

import { describe, test, expect, beforeAll } from 'jest';
import { DLMMClient } from '../../src/core/DLMMClient';
import { SuiClient } from '@mysten/sui/client';
import { TESTNET_ADDRESSES, DEMO_TOKENS } from '../../src/constants/addresses';

describe('Factory Integration Tests', () => {
  let suiClient: SuiClient;
  let dlmmClient: DLMMClient;

  beforeAll(() => {
    suiClient = new SuiClient({
      url: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443'
    });
    dlmmClient = DLMMClient.forTestnet(suiClient);
  });

  describe('Factory Contract Integration', () => {
    test('should fetch factory information from deployed contract', async () => {
      console.log('🧪 Testing factory info retrieval...');
      
      const factoryInfo = await dlmmClient.factory.getFactoryInfo();
      
      expect(factoryInfo).toBeDefined();
      expect(factoryInfo.poolCount).toBeGreaterThanOrEqual(0);
      expect(factoryInfo.protocolFeeRate).toBeGreaterThan(0);
      expect(factoryInfo.admin).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(factoryInfo.allowedBinSteps).toContain(25); // Default bin step
      
      console.log('✅ Factory info retrieved successfully');
      console.log(`   - Pool count: ${factoryInfo.poolCount}`);
      console.log(`   - Protocol fee rate: ${factoryInfo.protocolFeeRate} bps`);
      console.log(`   - Admin: ${factoryInfo.admin}`);
    }, 30000);

    test('should discover existing pools from factory', async () => {
      console.log('🧪 Testing pool discovery...');
      
      const pools = await dlmmClient.getAllPools();
      
      expect(Array.isArray(pools)).toBe(true);
      console.log(`✅ Found ${pools.length} pools in factory`);
      
      if (pools.length > 0) {
        const firstPool = pools[0];
        expect(firstPool.id).toBeValidSuiAddress();
        expect(firstPool.tokenA).toBeDefined();
        expect(firstPool.tokenB).toBeDefined();
        expect(firstPool.binStep).toBeGreaterThan(0);
        
        console.log(`   - Sample pool: ${firstPool.id}`);
        console.log(`   - Token pair: ${firstPool.tokenA.symbol}/${firstPool.tokenB.symbol}`);
        console.log(`   - Bin step: ${firstPool.binStep} bps`);
      }
    }, 30000);

    test('should check pool existence for known token pairs', async () => {
      console.log('🧪 Testing pool existence checks...');
      
      // Test with your actual demo tokens
      const poolExists = await dlmmClient.factory.poolExists(
        DEMO_TOKENS.TEST_USDC,
        DEMO_TOKENS.SUI,
        25
      );
      
      console.log(`✅ Pool exists check: ${poolExists}`);
      
      if (poolExists) {
        const poolId = await dlmmClient.factory.getPoolIdForPair(
          DEMO_TOKENS.TEST_USDC,
          DEMO_TOKENS.SUI,
          25
        );
        
        expect(poolId).toBeTruthy();
        console.log(`   - Pool ID: ${poolId}`);
      }
    }, 30000);

    test('should find best pool for token pair', async () => {
      console.log('🧪 Testing best pool finding...');
      
      const bestPool = await dlmmClient.findBestPool(
        DEMO_TOKENS.TEST_USDC,
        DEMO_TOKENS.SUI
      );
      
      if (bestPool) {
        expect(bestPool.id).toBeValidSuiAddress();
        expect(bestPool.isActive).toBe(true);
        
        console.log('✅ Best pool found');
        console.log(`   - Pool ID: ${bestPool.id}`);
        console.log(`   - Bin step: ${bestPool.binStep} bps`);
        console.log(`   - Reserve A: ${dlmmClient.formatCoinAmount(bestPool.reserveA)}`);
        console.log(`   - Reserve B: ${dlmmClient.formatCoinAmount(bestPool.reserveB)}`);
      } else {
        console.log('ℹ️  No pools found for this token pair');
      }
    }, 30000);
  });

  describe('Factory Statistics', () => {
    test('should get aggregated pool statistics', async () => {
      console.log('🧪 Testing pool statistics aggregation...');
      
      const stats = await dlmmClient.factory.getAggregatedPoolStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalPools).toBeGreaterThanOrEqual(0);
      expect(typeof stats.totalTVL).toBe('string');
      expect(typeof stats.totalVolume).toBe('string');
      expect(stats.totalSwaps).toBeGreaterThanOrEqual(0);
      expect(stats.avgAPR).toBeGreaterThanOrEqual(0);
      
      console.log('✅ Pool statistics retrieved');
      console.log(`   - Total pools: ${stats.totalPools}`);
      console.log(`   - Total TVL: ${dlmmClient.formatCoinAmount(stats.totalTVL)}`);
      console.log(`   - Total volume: ${dlmmClient.formatCoinAmount(stats.totalVolume)}`);
      console.log(`   - Total swaps: ${stats.totalSwaps}`);
      console.log(`   - Average APR: ${stats.avgAPR.toFixed(2)}%`);
    }, 30000);
  });
});