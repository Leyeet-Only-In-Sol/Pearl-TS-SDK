/**
 * Test Setup - Configure environment and utilities for SDK testing
 * Fixed version with proper custom matcher types
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Extend Jest matchers for better assertions
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidSuiAddress(): R;
      toBeValidCoinType(): R;
      toHaveValidTransactionDigest(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidSuiAddress(received: string) {
    const isValid = /^0x[a-fA-F0-9]{64}$/.test(received) || /^0x[a-fA-F0-9]+$/.test(received);
    return {
      message: () => `expected ${received} to be a valid Sui address`,
      pass: isValid,
    };
  },
  
  toBeValidCoinType(received: string) {
    const isValid = /^0x[a-fA-F0-9]+::[a-zA-Z_][a-zA-Z0-9_]*::[a-zA-Z_][a-zA-Z0-9_]*$/.test(received);
    return {
      message: () => `expected ${received} to be a valid coin type`,
      pass: isValid,
    };
  },
  
  toHaveValidTransactionDigest(received: string) {
    const isValid = /^[a-zA-Z0-9]{44}$/.test(received);
    return {
      message: () => `expected ${received} to be a valid transaction digest`,
      pass: isValid,
    };
  },
});

// Global test timeout
jest.setTimeout(30000);

// Console log filtering for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  // Reduce noise in test output
  console.log = (...args) => {
    const message = args[0];
    if (typeof message === 'string' && !message.includes('Error')) {
      // Only show important logs
      if (message.includes('✅') || message.includes('❌') || message.includes('🧪')) {
        originalConsoleLog(...args);
      }
    }
  };
  
  console.warn = (...args) => {
    // Show warnings in tests
    originalConsoleWarn(...args);
  };
  
  console.error = (...args) => {
    // Always show errors
    originalConsoleError(...args);
  };
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});