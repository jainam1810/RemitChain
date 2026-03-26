# RemitChain - 

https://universityofexeteruk-my.sharepoint.com/my?csf=1&web=1&e=wLbPKG&id=%2Fpersonal%2Fjv375%5Fexeter%5Fac%5Fuk%2FDocuments%2FSmart%2DContracts%2DGroup%2DPresentation&FolderCTID=0x0120008DEB88210B123A41A525E29332E6D13F

**Decentralized Cross-Border Remittance Platform**

Send money globally using stablecoins. 0.3% fees. Minutes, not days. Sender protection built in.

---

## What is RemitChain?

RemitChain is a smart contract-based remittance platform built on Ethereum that enables low-cost, instant cross-border money transfers using stablecoins as a medium. Instead of sending money through banks (5-7% fees, 3-5 day delays), users deposit USDC into a smart contract, which converts it at live exchange rates via Chainlink oracles and lets the recipient claim the equivalent in their local currency stablecoin.

### Key Highlights

- **0.3% flat fee** vs 6.2% average bank fee
- **Multi-currency support** - USD, GBP, EUR, INR, JPY
- **Two-phase claim** - Claim → Grace Period → Withdraw
- **Sender protection** - 1-minute grace period to reverse wrong transfers
- **Emergency freeze** - Admin can pause all operations if exploit detected
- **Real-time notifications** - Blockchain events notify sender and recipient
- **Live exchange rates** - Chainlink oracle integration
- **Fully on-chain** - Every transaction verifiable on Etherscan

---

## How It Works

```
Step 1: SEND        Alice deposits 100 USDC into the smart contract
                         ↓
Step 2: CLAIM       Bob claims the transfer (grace period starts)
                         ↓
Step 3: GRACE       Alice has 1 minute to REVERSE if sent to wrong address
                         ↓
Step 4: WITHDRAW    Grace expires → Bob withdraws funds to his wallet
```

If Alice sent to the wrong address, she can reverse during the grace period and get her funds back (minus the 0.3% platform fee).

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contract | Solidity 0.8.24 |
| Blockchain | Ethereum (Sepolia Testnet) |
| Oracle | Chainlink Price Feeds (Mock) |
| Framework | Hardhat |
| Frontend | React.js |
| Web3 Library | ethers.js v6 |
| Wallet | MetaMask |
| Deployment | Automated via Hardhat scripts |

---

## Project Structure

```
remitchain/
├── contracts/
│   └── RemitChain.sol          # Main smart contract (includes mocks)
├── scripts/
│   └── deploy.js               # Deployment + auto-setup script
├── frontend/
│   ├── src/
│   │   └── App.js              # React frontend (connected to Sepolia)
│   └── package.json
├── hardhat.config.js            # Hardhat configuration (viaIR + optimizer)
├── .env                         # API keys and private key (DO NOT COMMIT)
└── README.md
```

---

## Smart Contract Architecture

### Contracts

- **RemitChain** - Main contract handling transfers, claims, reversals, withdrawals
- **MockERC20** - Test stablecoins (USDC, GBPT, EURT, INRT, JPYT)
- **MockPriceFeed** - Simulates Chainlink oracle for exchange rates

### Transfer States

```
Pending → Claimed → Completed     (normal flow)
Pending → Claimed → Reversed      (sender reverses during grace)
Pending → Refunded                (sender cancels before claim)
```

### Key Functions

| Function | Who Calls | Description |
|----------|-----------|-------------|
| `initiateTransfer()` | Sender | Deposits USDC, creates transfer |
| `claimTransfer()` | Recipient | Claims transfer, starts grace period |
| `withdrawTransfer()` | Recipient | Withdraws funds after grace expires |
| `reverseTransfer()` | Sender | Reverses during grace period |
| `refundTransfer()` | Sender | Cancels before recipient claims |
| `pauseContract()` | Admin | Emergency freeze |
| `unpauseContract()` | Admin | Resume operations |
| `getQuote()` | Anyone | Preview conversion amount and fee |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [MetaMask](https://metamask.io/) browser extension
- Sepolia testnet ETH (free from [faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia))
- [Alchemy](https://www.alchemy.com/) API key (free)

### 1. Clone and Install

```bash
git clone https://github.com/your-repo/remitchain.git
cd remitchain
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```
ALCHEMY_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=your_metamask_private_key
```

> ⚠️ Never commit your `.env` file or share your private key.

### 3. Compile

```bash
npx hardhat compile
```

### 4. Deploy to Sepolia

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

This will:
- Deploy 5 mock stablecoins (USDC, GBPT, EURT, INRT, JPYT)
- Deploy 4 mock price feeds (USD/GBP, USD/EUR, USD/INR, USD/JPY)
- Deploy the RemitChain contract
- Register all tokens and price feeds automatically
- Pre-fund liquidity for all currencies
- Set grace period to 1 minute

Save the printed contract addresses.

### 5. Setup Frontend

```bash
cd frontend
npm install
npm install ethers@^6.4.0
```

Open `src/App.js` and update the `ADDRESSES` object with your deployed contract addresses.

### 6. Run

```bash
npm start
```

Open `http://localhost:3000` in your browser with MetaMask connected to Sepolia.

---

## Usage Guide

### Sending Money (Alice)

1. Connect MetaMask wallet
2. Click "Get Test USDC" to mint test tokens
3. Select destination currency (GBP, EUR, INR, JPY, or USD)
4. Enter amount and recipient's wallet address
5. Click Send (approve + send = 2 MetaMask confirmations)

### Receiving Money (Bob)

1. Connect MetaMask with recipient account
2. Go to History tab
3. Click "Claim" on the pending transfer
4. Wait for grace period to expire (1 minute)
5. Click "Withdraw" to receive funds in wallet

### Reversing a Transfer (Alice)

1. After Bob claims, Alice has 1 minute to reverse
2. Go to History tab
3. Click "Reverse" (red button with countdown timer)
4. Funds return to Alice minus 0.3% fee

### Emergency Freeze (Admin)

1. Connect with the deployer wallet
2. Click "Freeze" in the Admin panel (top-left)
3. All operations are paused
4. Click "Resume" to unpause

---

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| USDC | `0x...` |
| GBPT | `0x...` |
| EURT | `0x...` |
| INRT | `0x...` |
| JPYT | `0x...` |
| USD/GBP Feed | `0x...` |
| USD/EUR Feed | `0x...` |
| USD/INR Feed | `0x...` |
| USD/JPY Feed | `0x...` |
| RemitChain | `0x...` |

> Replace with your actual deployed addresses.

---

## Security Features

- **Two-Phase Claim** - Funds held in contract during grace period, preventing irreversible wrong-address transfers
- **Sender Reversal** - 1-minute window to reverse after recipient claims
- **Stale Data Protection** - Rejects oracle exchange rates older than 1 hour
- **Emergency Freeze** - Admin can pause all operations instantly
- **Access Control** - Admin-only functions for token/feed management
- **Non-Custodial** - Funds only held during the transfer window

---

## Production Roadmap

| Phase | Description |
|-------|-------------|
| Phase 1 (Current) | Prototype on Sepolia testnet with mock tokens |
| Phase 2 | Deploy on Layer 2 (Arbitrum/Base) for sub-cent gas fees |
| Phase 3 | Multi-sig admin wallet, timelock on admin actions |
| Phase 4 | Security audit, real Chainlink oracle integration |
| Phase 5 | DAO governance, fiat on/off ramp partnerships |

---

## Why Blockchain?

Traditional remittance services charge 5-7% in fees and take 3-5 days because money passes through multiple intermediaries (correspondent banks, clearing houses, FX desks). Each intermediary takes a cut and adds delay.

RemitChain eliminates all intermediaries. A smart contract handles the entire flow - deposit, conversion, and payout - in a single transparent system. The exchange rate comes from decentralized Chainlink oracles, not from a bank's internal FX desk with hidden markups.

The result: **0.3% fees, minutes not days, full transparency.**

---

## Market Opportunity

- **$831B** global remittance market (2025)
- **$48B** lost to fees annually
- **~7%** annual market growth
- **0.3% fee** at 1% market share = **$4.8M annual revenue**

---

## References

1. Solidity Documentation - [docs.soliditylang.org](https://docs.soliditylang.org)
2. Chainlink Price Feeds - [docs.chain.link/data-feeds](https://docs.chain.link/data-feeds)
3. World Bank Remittance Prices Worldwide (2024)
4. Hardhat Framework - [hardhat.org](https://hardhat.org)
5. OpenZeppelin Security Patterns - [docs.openzeppelin.com](https://docs.openzeppelin.com)
6. Ethers.js - [docs.ethers.org](https://docs.ethers.org)
7. MetaMask - [docs.metamask.io](https://docs.metamask.io)
8. ERC-20 Standard - [ethereum.org](https://ethereum.org/en/developers/docs/standards/tokens/erc-20/)

---

## License

MIT

---

**Built with Solidity, React, and Hardhat. Deployed on Ethereum Sepolia.**
