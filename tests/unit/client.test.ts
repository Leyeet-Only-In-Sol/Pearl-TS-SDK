/**
 * DLMMClient Unit Tests
 * Tests the main SDK client functionality
 */

import { DLMMClient } from '../../src/core/DLMMClient';
import { SuiClient } from '@mysten/sui/client';
import { TESTNET_ADDRESSES } from '../../src/constants/addresses';

describe('DLMMClient', () => {
  let suiClient: SuiClient;
  let dlmmClient: DLMMClient;

  beforeAll(() => {
    suiClient = new SuiClient({
      url: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443'
    });
  });

  beforeEach(() => {
    dlmmClient = DLMMClient.forTestnet(suiClient);
  });

  describe('initialization', () => {
    test('should create testnet client with correct configuration', () => {
      expect(dlmmClient).toBeDefined();
      expect(dlmmClient.network).toBe('testnet');
      expect(dlmmClient.addresses.PACKAGE_ID).toBe(TESTNET_ADDRESSES.PACKAGE_ID);
      expect(dlmmClient.addresses.FACTORY_ID).toBe(TESTNET_ADDRESSES.FACTORY_ID);
    });

    test('should create mainnet client', () => {
      const mainnetClient = DLMMClient.forMainnet(suiClient);
      expect(mainnetClient.network).toBe('mainnet');
    });

    test('should create custom client', () => {
      const customClient = DLMMClient.withConfig({
        network: 'testnet',
        suiClient,
        packageId: '0x123',
        factoryId: '0x456'
      });
      expect(customClient.addresses.PACKAGE_ID).toBe('0x123');
      expect(customClient.addresses.FACTORY_ID).toBe('0x456');
    });
  });

  describe('configuration', () => {
    test('should be properly configured', () => {
      expect(dlmmClient.isConfigured()).toBe(true);
    });

    test('should return network info', () => {
      const info = dlmmClient.getNetworkInfo();
      expect(info.network).toBe('testnet');
      expect(info.packageId).toBe(TESTNET_ADDRESSES.PACKAGE_ID);
      expect(info.factoryId).toBe(TESTNET_ADDRESSES.FACTORY_ID);
    });
  });

  describe('manager access', () => {
    test('should provide factory manager', () => {
      expect(dlmmClient.factory).toBeDefined();
    });

    test('should provide pool manager', () => {
      expect(dlmmClient.pools).toBeDefined();
    });

    test('should provide position manager', () => {
      expect(dlmmClient.positions).toBeDefined();
    });

    test('should provide quoter manager', () => {
      expect(dlmmClient.quoter).toBeDefined();
    });

    test('should provide router manager', () => {
      expect(dlmmClient.router).toBeDefined();
    });
  });

  describe('utility functions', () => {
    test('should validate Sui object IDs', () => {
      expect(dlmmClient.isValidObjectId('0x123')).toBe(true);
      expect(dlmmClient.isValidObjectId('0x6a01a88c704d76ef8b0d4db811dff4dd13104a35e7a125131fa35949d0bc2ada')).toBe(true);
      expect(dlmmClient.isValidObjectId('invalid')).toBe(false);
      expect(dlmmClient.isValidObjectId('')).toBe(false);
    });

    test('should format coin amounts', () => {
      expect(dlmmClient.formatCoinAmount('1000000000')).toBe('1.000000');
      expect(dlmmClient.formatCoinAmount('1500000000')).toBe('1.500000');
      expect(dlmmClient.formatCoinAmount('0')).toBe('0.000000');
    });

    test('should parse coin amounts', () => {
      expect(dlmmClient.parseCoinAmount('1')).toBe('1000000000');
      expect(dlmmClient.parseCoinAmount('1.5')).toBe('1500000000');
      expect(dlmmClient.parseCoinAmount('0.000001')).toBe('1000');
    });
  });
});