# Sui DLMM SDK

[![npm version](https://img.shields.io/npm/v/sui-dlmm-sdk.svg)](https://www.npmjs.com/package/sui-dlmm-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/github/actions/workflow/status/your-org/sui-dlmm-sdk/ci.yml?branch=main)](https://github.com/your-org/sui-dlmm-sdk/actions)
[![Coverage](https://img.shields.io/codecov/c/github/your-org/sui-dlmm-sdk)](https://codecov.io/gh/your-org/sui-dlmm-sdk)
[![Documentation](https://img.shields.io/badge/docs-available-brightgreen.svg)](https://docs.sui-dlmm.io)

> ⚠️ **MAINTENANCE NOTICE**: This SDK is currently under active maintenance and development. While functional on testnet, please use with caution in production environments. Breaking changes may occur between versions until v1.0 stable release.

A comprehensive TypeScript SDK for interacting with the **Sui Dynamic Liquidity Market Maker (DLMM) Protocol**. Experience zero-slippage trading, dynamic fees, and superior capital efficiency with this production-ready SDK.

## 🌟 Features

- **🔄 Zero-Slippage Trading** - Trade within discrete price bins with no slippage
- **📈 Dynamic Fee System** - Fees automatically adjust to market volatility  
- **🎯 Multi-Strategy Positions** - Uniform, Curve, and Bid-Ask liquidity strategies
- **🛣️ Multi-Hop Routing** - Intelligent route optimization across multiple pools
- **💹 Real-Time Quotation** - Get accurate quotes with price impact analysis
- **🔐 Type-Safe** - Full TypeScript support with comprehensive type definitions
- **🧪 Battle-Tested** - Extensive test coverage with real contract integration
- **⚡ Production Ready** - Used with actual deployed contracts on Sui testnet

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Installation

```bash
npm install sui-dlmm-sdk @mysten/sui
```

```bash
yarn add sui-dlmm-sdk @mysten/sui
```

```bash
pnpm add sui-dlmm-sdk @mysten/sui
```

### Peer Dependencies

```bash
npm install @mysten/sui @mysten/enoki
```

## ⚡ Quick Start

### Basic Setup

```typescript
import { DLMMClient, createTestnetClient } from 'sui-dlmm-sdk';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Initialize Sui client
const suiClient = new SuiClient({
  url: 'https://fullnode.testnet.sui.io:443'
});

// Create DLMM client for testnet
const dlmmClient = createTestnetClient(suiClient);

// Or create with custom configuration
const customClient = DLMMClient.withConfig({
  network: 'testnet',
  suiClient,
  packageId: 'YOUR_PACKAGE_ID',
  factoryId: 'YOUR_FACTORY_ID'
});
```

### Get a Quote

```typescript
// Get the best quote for a token swap
const quote = await dlmmClient.getQuote({
  tokenIn: '0x...::test_usdc::TEST_USDC',
  tokenOut: '0x2::sui::SUI',
  amountIn: '1000000000' // 1 USDC (9 decimals)
});

console.log(`Output: ${dlmmClient.formatCoinAmount(quote.amountOut)} SUI`);
console.log(`Price Impact: ${quote.priceImpact}%`);
console.log(`Fee: ${dlmmClient.formatCoinAmount(quote.feeAmount)} USDC`);
```

### Execute a Swap

```typescript
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Setup your keypair
const keypair = Ed25519Keypair.fromSecretKey('YOUR_PRIVATE_KEY');

// Execute the swap
const swapResult = await dlmmClient.executeSwap(
  {
    poolId: quote.poolId,
    tokenIn: '0x...::test_usdc::TEST_USDC',
    tokenOut: '0x2::sui::SUI',
    amountIn: '1000000000',
    amountOutMin: quote.amountOut // Use quote for minimum output
  },
  'COIN_OBJECT_ID', // Your actual USDC coin object ID
  keypair
);

if (swapResult.success) {
  console.log(`Swap successful! TX: ${swapResult.transactionDigest}`);
  console.log(`Received: ${dlmmClient.formatCoinAmount(swapResult.amountOut)} SUI`);
} else {
  console.error(`Swap failed: ${swapResult.error}`);
}
```

### Create a Liquidity Position

```typescript
// Create a simple position around current price
const positionResult = await dlmmClient.createPosition(
  {
    poolId: 'POOL_ID',
    tokenA: '0x...::test_usdc::TEST_USDC',
    tokenB: '0x2::sui::SUI',
    amountA: '1000000000', // 1 USDC
    amountB: '500000000',  // 0.5 SUI
    lowerBinId: 950,       // 5% below current
    upperBinId: 1050,      // 5% above current
    strategy: 'uniform'    // Equal distribution
  },
  'USDC_COIN_OBJECT_ID',
  'SUI_COIN_OBJECT_ID',
  keypair
);

if (positionResult.success) {
  console.log(`Position created! ID: ${positionResult.positionId}`);
}
```

## 🧠 Core Concepts

### Dynamic Liquidity Market Maker (DLMM)

DLMM uses discrete price bins with a constant sum formula: **P × x + y = L**

- **P**: Fixed bin price
- **x**: Token X reserves in bin  
- **y**: Token Y reserves in bin
- **L**: Total liquidity value in bin

This enables **zero-slippage trading** within individual bins.

### Bin Steps and Pricing

```typescript
// Calculate bin price
import { calculateBinPrice, getBinIdFromPrice } from 'sui-dlmm-sdk';

const price = calculateBinPrice(1000, 25); // Bin ID 1000, 0.25% step
const binId = getBinIdFromPrice(price, 25); // Reverse calculation
```

### Position Strategies

1. **Uniform**: Equal weight across all bins in range
2. **Curve**: Normal distribution centered on current price  
3. **Bid-Ask**: 40% at edges, 20% in middle bins

```typescript
// Get strategy recommendations based on risk profile
const recommendations = await dlmmClient.positions.getPositionRecommendations(
  poolId,
  'moderate' // 'conservative', 'moderate', 'aggressive'
);
```

## 📚 API Reference

### DLMMClient

Main entry point for all SDK functionality.

#### Factory Operations

```typescript
// Get all pools
const pools = await dlmmClient.getAllPools();

// Find best pool for token pair
const bestPool = await dlmmClient.findBestPool(tokenA, tokenB);

// Create new pool
const poolResult = await dlmmClient.createPool(params, coinA, coinB, keypair);
```

#### Pool Management

```typescript
// Get pool details
const pool = await dlmmClient.pools.getPoolDetails(poolId);

// Get bin information
const binInfo = await dlmmClient.pools.getBinInfo(poolId, binId);

// Add liquidity to specific bin
const result = await dlmmClient.pools.addLiquidityToBin(params, keypair);
```

#### Position Management

```typescript
// Create position
const position = await dlmmClient.positions.createPosition(params, coinA, coinB, keypair);

// Add liquidity to existing position
const addResult = await dlmmClient.positions.addLiquidityToPosition(
  positionId, coinA, coinB, keypair
);

// Collect fees
const fees = await dlmmClient.positions.collectFeesFromPosition(positionId, keypair);

// Remove liquidity (by percentage)
const removeResult = await dlmmClient.positions.removeLiquidityFromPosition(
  positionId, 50, keypair // Remove 50%
);
```

#### Quotation & Routing

```typescript
// Get best quote
const quote = await dlmmClient.quoter.getBestQuote(params);

// Compare multiple routes
const routes = await dlmmClient.quoter.getMultiRouteQuotes(params);

// Analyze price impact
const analysis = await dlmmClient.quoter.analyzePriceImpact(quote);

// Calculate optimal slippage
const slippage = dlmmClient.quoter.calculateOptimalSlippage(quote);
```

### Utility Functions

```typescript
import { 
  formatTokenAmount, 
  parseTokenAmount,
  calculateSlippageAmount,
  isPriceImpactAcceptable,
  estimateDeadline
} from 'sui-dlmm-sdk';

// Format amounts for display
const formatted = formatTokenAmount('1000000000', 9); // "1.000000"

// Parse user input to contract units
const parsed = parseTokenAmount('1.5', 9); // "1500000000"

// Calculate slippage protection
const minOutput = calculateSlippageAmount(quote.amountOut, 50, true); // 0.5% slippage

// Check if price impact is acceptable
const isOk = isPriceImpactAcceptable(quote.priceImpact, 500); // 5% max

// Set transaction deadline
const deadline = estimateDeadline(5); // 5 minutes from now
```

## 🎯 Examples

### Advanced Multi-Hop Routing

```typescript
// Get detailed quote with multiple route options
const detailedQuote = await dlmmClient.quoter.getDetailedQuote({
  tokenIn: 'TOKEN_A',
  tokenOut: 'TOKEN_C', // No direct pool exists
  amountIn: '1000000000'
});

console.log('Best route:', detailedQuote.quote.route.routeType);
console.log('Price impact:', detailedQuote.priceImpactAnalysis.level);
console.log('Recommended slippage:', detailedQuote.slippageRecommendation.tolerance);

// Execute multi-hop swap
if (detailedQuote.quote.route.routeType === 'multi-hop') {
  const swapResult = await dlmmClient.router.swapExactTokensMultiHop(
    {
      tokenIn: 'TOKEN_A',
      tokenOut: 'TOKEN_C',
      amountIn: '1000000000',
      amountOutMin: detailedQuote.quote.amountOut,
      route: detailedQuote.quote.route
    },
    coinObjectId,
    keypair
  );
}
```

### Position Analytics

```typescript
// Get comprehensive position analytics
const analytics = await dlmmClient.positions.getPositionAnalytics(positionId);

console.log('Position metrics:');
console.log(`- Utilization: ${analytics.metrics.utilization}%`);
console.log(`- In range: ${analytics.metrics.inRange}`);
console.log(`- ROI: ${analytics.metrics.roi}%`);
console.log(`- APR: ${analytics.metrics.apr}%`);

// Check if position needs rebalancing
const needsRebalance = await dlmmClient.positions.shouldRebalancePosition(positionId);

if (needsRebalance) {
  const rebalanceResult = await dlmmClient.positions.rebalancePosition(
    positionId,
    { newStrategy: 'curve' }, // Switch to curve strategy
    keypair
  );
}
```

### Pool Discovery and Analysis

```typescript
// Find pools with filters
const activePools = await dlmmClient.factory.getAllPools(
  {
    isActive: true,
    minTvl: '1000000000000', // Minimum $1000 TVL
    binSteps: [25, 50] // Only 0.25% and 0.5% fee tiers
  },
  {
    sortBy: 'tvl',
    sortOrder: 'desc'
  }
);

// Get aggregated statistics
const stats = await dlmmClient.factory.getAggregatedPoolStats();
console.log(`Total pools: ${stats.totalPools}`);
console.log(`Total TVL: $${dlmmClient.formatCoinAmount(stats.totalTVL)}`);
console.log(`Average APR: ${stats.avgAPR.toFixed(2)}%`);
```

### Test Token Management (Testnet Only)

```typescript
// Get test USDC tokens for testing
const mintResult = await dlmmClient.getTestTokens(keypair);

if (mintResult.success) {
  console.log('Test tokens minted successfully!');
} else {
  console.error('Failed to mint test tokens:', mintResult.error);
}

// Mint custom amount
const customMint = await dlmmClient.mintTestUSDC(
  '10000000000', // 10 USDC
  keypair.toSuiAddress(),
  keypair
);
```

## 🧪 Testing

### Setup Test Environment

1. Copy environment configuration:
```bash
cp .env.example .env
```

2. Configure your test environment:
```bash
# .env
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
TEST_PRIVATE_KEY=your_test_private_key_here
ENABLE_INTEGRATION_TESTS=true
```

### Run Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration  
npm run test:testnet

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Categories

- **Unit Tests**: Core functionality and utilities
- **Integration Tests**: Real contract interaction on testnet
- **Protocol Tests**: End-to-end workflows and complex scenarios

## 🛠️ Development

### Prerequisites

- Node.js 18+
- TypeScript 5.9+
- A Sui wallet with testnet SUI for testing

### Build from Source

```bash
git clone https://github.com/your-org/sui-dlmm-sdk.git
cd sui-dlmm-sdk
npm install
npm run build
```

### Development Commands

```bash
npm run dev          # Development build with watch
npm run build        # Production build
npm run type-check   # TypeScript type checking
npm run lint         # ESLint
npm run clean        # Clean build artifacts
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow the existing code style (ESLint + Prettier)
- Add tests for new functionality
- Update documentation as needed

## 📖 Documentation

- [Full API Documentation](https://docs.sui-dlmm.io)
- [Protocol Overview](https://docs.sui-dlmm.io/protocol)
- [Integration Examples](https://docs.sui-dlmm.io/examples)
- [Migration Guide](https://docs.sui-dlmm.io/migration)

## 🚨 Important Notes

### Testnet vs Mainnet

- **Testnet**: Fully functional, use for development and testing
- **Mainnet**: Will be available after security audits complete

### Gas Considerations

- Set appropriate gas budgets for complex operations
- Position creation: ~200k gas units
- Multi-hop swaps: ~500k gas units
- Fee collection: ~50k gas units

### Security Best Practices

- Never expose private keys in code
- Always validate transaction results
- Use slippage protection for swaps
- Monitor gas usage in production
- Test thoroughly on testnet first

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🗺️ Roadmap

- [ ] **v1.0 Stable Release** - Production-ready with complete feature set
- [ ] **Advanced Analytics** - Built-in performance monitoring
- [ ] **Flash Loan Integration** - Capital-efficient arbitrage
- [ ] **MEV Protection** - Advanced transaction ordering
- [ ] **Cross-Chain Bridge** - Multi-chain liquidity

## 🏆 Acknowledgments

- [Sui Foundation](https://sui.io) for the incredible blockchain platform
- [Meteora](https://meteora.ag) for DLMM inspiration and research
- [Trader Joe](https://traderjoexyz.com) for the original Liquidity Book implementation
- All contributors and community members

---

**Built with ❤️ for the Sui ecosystem**