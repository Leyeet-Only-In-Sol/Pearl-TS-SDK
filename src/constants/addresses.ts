/**
 * Sui DLMM Protocol Contract Addresses
 * Update these with your actual deployed contract addresses
 */

export interface NetworkAddresses {
  PACKAGE_ID: string;
  FACTORY_ID: string;
  UPGRADE_CAP: string;
  TEST_USDC_TREASURY?: string;
}

export const TESTNET_ADDRESSES: NetworkAddresses = {
  // Your deployed testnet addresses
  PACKAGE_ID: "0x6a01a88c704d76ef8b0d4db811dff4dd13104a35e7a125131fa35949d0bc2ada",
  FACTORY_ID: "0x160e34d10029993bccf6853bb5a5140bcac1794b7c2faccc060fb3d5b7167d7f",
  UPGRADE_CAP: "0xfe189ba6983053715ad68254c2a316cfef70f06b442ce54c7f47f3b0fbadecef",
  // Add your TEST_USDC treasury address here when deployed
  TEST_USDC_TREASURY: "0x..." // TODO: Add actual address
};

export const MAINNET_ADDRESSES: NetworkAddresses = {
  // Will be populated when mainnet is deployed
  PACKAGE_ID: "",
  FACTORY_ID: "",
  UPGRADE_CAP: "",
};

export const DEVNET_ADDRESSES: NetworkAddresses = {
  PACKAGE_ID: "",
  FACTORY_ID: "",
  UPGRADE_CAP: "",
};

export type Network = 'testnet' | 'mainnet' | 'devnet';

export function getAddresses(network: Network): NetworkAddresses {
  switch (network) {
    case 'testnet':
      return TESTNET_ADDRESSES;
    case 'mainnet':
      return MAINNET_ADDRESSES;
    case 'devnet':
      return DEVNET_ADDRESSES;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}

// Contract module names
export const MODULES = {
  FACTORY: 'factory',
  DLMM_POOL: 'dlmm_pool', 
  POSITION: 'position',
  POSITION_MANAGER: 'position_manager',
  ROUTER: 'router',
  QUOTER: 'quoter',
  TEST_USDC: 'test_usdc',
} as const;

// Function names for contract calls
export const FUNCTIONS = {
  // Factory functions
  CREATE_POOL: 'create_and_store_pool',
  GET_POOL_ID: 'get_pool_id',
  FIND_BEST_POOL: 'find_best_pool',
  
  // Pool functions
  SWAP: 'swap',
  ADD_LIQUIDITY: 'add_liquidity_to_bin',
  REMOVE_LIQUIDITY: 'remove_liquidity_from_bin',
  GET_POOL_INFO: 'get_pool_info',
  
  // Position functions
  CREATE_POSITION: 'create_position',
  ADD_LIQUIDITY_TO_POSITION: 'add_liquidity_to_position',
  REMOVE_LIQUIDITY_FROM_POSITION: 'remove_liquidity_from_position',
  COLLECT_FEES: 'collect_fees_from_position',
  
  // Position Manager functions
  CREATE_POSITION_SIMPLE: 'create_position_simple',
  COLLECT_ALL_FEES: 'collect_all_fees',
  REMOVE_LIQUIDITY_PERCENTAGE: 'remove_liquidity_percentage',
  
  // Router functions
  SWAP_EXACT_TOKENS_FOR_TOKENS: 'swap_exact_tokens_for_tokens',
  SWAP_EXACT_TOKENS_MULTI_HOP: 'swap_exact_tokens_multi_hop',
  GET_AMOUNTS_OUT: 'get_amounts_out',
  
  // Quoter functions
  GET_QUOTE: 'get_quote',
  GET_AMOUNTS_OUT_QUOTER: 'get_amounts_out',
  
  // Test USDC functions
  MINT_TEST_USDC: 'mint_custom_amount',
  GET_TEST_TOKENS: 'get_test_tokens',
  GET_LIQUIDITY_TOKENS: 'get_liquidity_tokens',
} as const;