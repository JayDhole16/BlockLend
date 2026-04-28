# Nakshatra Lending

![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?style=flat-square&logo=solidity)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

A decentralized peer-to-peer lending protocol on Ethereum. Borrowers create on-chain loan requests, guarantors back them, lenders fund them, and repayments are handled automatically through smart contracts. AI models score creditworthiness at loan creation time and the results are stored on a soulbound NFT.

---

## Features

- **On-chain loan lifecycle** — `GUARANTOR_PENDING → OPEN_FOR_LENDERS → READY_TO_FUND → ACTIVE → REPAID/DEFAULTED`, enforced by Solidity state machines
- **Soulbound identity NFTs** — one non-transferable ERC-721 per wallet, storing reputation score, AI credit score, and fraud risk
- **AI credit scoring** — GradientBoosting credit model + RandomForest fraud detection, called at loan creation and optionally pushed on-chain
- **IPFS document storage** — loan documents pinned via local IPFS daemon or Pinata
- **Event-driven DB sync** — background task polls the chain every 5 seconds and keeps PostgreSQL in sync with contract state
- **MetaMask integration** — lenders fund loans and borrowers repay directly from the browser; no private keys sent to the server for those flows

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Solidity 0.8.20, Hardhat 2.19, OpenZeppelin 4.9 |
| Backend API | FastAPI (Python 3.11), SQLAlchemy 2 async, Web3.py 6 |
| AI Scoring | scikit-learn 1.4 — GradientBoostingRegressor + RandomForestClassifier |
| Frontend | Next.js 16, React 19, ethers.js v6, TailwindCSS v4, TanStack Query |
| Database | PostgreSQL 16 |
| Storage | IPFS (Kubo) with Pinata as fallback |
| Infrastructure | Docker, Docker Compose |

---

## Architecture

```
+--------------------------------------------------------------+
|                       Browser (Next.js)                       |
|                                                               |
|  MetaMask --> ethers.js --> LoanFactory / Escrow contracts    |
|  REST calls ------------> FastAPI backend                     |
+--------------------------------------------------------------+
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
         PostgreSQL      Hardhat node      IPFS node
              ^               |
              +-- event ------+
                  listener
                  (polls every 5s)
```

### Smart Contracts

Five contracts are deployed and wired together at startup:

| Contract | Role |
|----------|------|
| `MockUSDC` | ERC-20 stablecoin, 6 decimals, mirrors real USDC |
| `UserProfileNFT` | Soulbound ERC-721, one per wallet, stores reputation and AI scores |
| `LoanFactory` | Creates loans and manages the lifecycle state machine |
| `Escrow` | Holds funds in custody, handles repayment and interest distribution |
| `Reputation` | Updates on-chain scores (+5 on repayment, -20 on default) |

---

## Loan Lifecycle

```
Register wallet --> mint soulbound NFT
        |
        v
  Create Loan Request -----------------> GUARANTOR_PENDING
                                                |
                                   (all guarantors approve)
                                                |
                                                v
                                        OPEN_FOR_LENDERS
                                                |
                                   (lender deposits via MetaMask)
                                                |
                                                v
                                          READY_TO_FUND
                                                |
                                   (auto-released by event listener)
                                                |
                                                v
                                              ACTIVE
                                                |
                                   (borrower repays via MetaMask)
                                                |
                                +---------------+---------------+
                                |                               |
                                v                               v
                             REPAID                         DEFAULTED
                          reputation +5                   reputation -20
```

---

## Project Structure

```
nakshatra-lending/
├── ai-services/                  # ML inference and training
│   ├── ai_service.py             # unified scoring entry point
│   ├── credit_score/             # GradientBoosting model
│   └── fraud_detection/          # RandomForest model
│
├── backend/                      # FastAPI application
│   └── app/
│       ├── api/                  # route handlers: auth, users, loans
│       ├── database/             # async SQLAlchemy engine and session
│       ├── models/               # ORM models: User, Loan, LoanDocument
│       ├── schemas/              # Pydantic request/response schemas
│       └── services/             # blockchain, AI scoring, IPFS, loan orchestration
│
├── blockchain/                   # Hardhat project
│   ├── contracts/                # Solidity source
│   ├── scripts/                  # deploy.js, seedWallets.js
│   └── test/                     # contract unit tests
│
├── frontend/                     # Next.js application
│   └── src/
│       ├── app/                  # pages: borrower, lender, guarantor, loan/[id]
│       ├── components/           # UI components (shadcn/ui)
│       ├── context/              # Web3Context, QueryProvider
│       ├── hooks/                # useApi, useLoans, useWeb3Transactions
│       └── services/             # api.ts (Axios), web3.ts (ethers.js)
│
├── scripts/                      # dev automation (PowerShell + bash)
├── docker-compose.yml
├── addresses.env                 # contract addresses (written by deployer)
└── README.md
```

---

## Getting Started

### Option A — Docker

```bash
git clone https://github.com/JayDhole16/BlockLend.git
cd BlockLend

# Build images and start all services
docker compose up --build
```

The `deployer` service runs once after the Hardhat node is healthy, deploys all five contracts, and writes their addresses to `addresses.env`. Then restart the backend to pick them up:

```bash
docker compose restart backend
```

On subsequent runs (addresses already in `addresses.env`):

```bash
docker compose up
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Hardhat RPC | http://localhost:8545 |
| IPFS API | http://localhost:5001 |

### Option B — Local Development

**Prerequisites:** Node.js >= 18, Python >= 3.11, PostgreSQL >= 14

**Windows — single command:**

```powershell
npm run dev:all
```

**All platforms — separate terminals:**

```bash
# Terminal 1: start the local blockchain
npm run blockchain:start

# Terminal 2: deploy contracts and write addresses to .env (run once)
npm run blockchain:deploy

# Terminal 3: start the backend
npm run backend:start

# Terminal 4: start the frontend
npm run frontend:start
```

### Train the AI Models (optional)

The platform runs without trained models and falls back to neutral scores. To train:

```bash
cd ai-services
python credit_score/train.py
python fraud_detection/train.py
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env`. Contract addresses are written automatically by the deploy script.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL async connection string |
| `RPC_URL` | Ethereum RPC endpoint |
| `CHAIN_ID` | Chain ID (`31337` for Hardhat local) |
| `USDC_ADDRESS` | Deployed MockUSDC contract address |
| `LOAN_FACTORY_ADDRESS` | Deployed LoanFactory contract address |
| `ESCROW_ADDRESS` | Deployed Escrow contract address |
| `USER_PROFILE_NFT_ADDRESS` | Deployed UserProfileNFT contract address |
| `REPUTATION_ADDRESS` | Deployed Reputation contract address |
| `DEPLOYER_PRIVATE_KEY` | Wallet[0] key — Hardhat test key, never use in production |
| `JWT_SECRET` | Secret for signing auth tokens |
| `IPFS_API_URL` | Local IPFS daemon URL |
| `PINATA_API_KEY` | Pinata API key (optional IPFS fallback) |

---

## MetaMask Setup

Add the local Hardhat network to MetaMask:

| Field | Value |
|-------|-------|
| Network Name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency Symbol | ETH |

Import test wallets (Hardhat default mnemonic — local dev only):

| Role | Private Key |
|------|-------------|
| Deployer | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Lender (1,000,000 USDC) | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Borrower (5,000 USDC) | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| Guarantor 1 | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |
| Guarantor 2 | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b` |

---

## API Reference

Interactive docs available at `http://localhost:8000/docs` when the backend is running.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/register` | Register a wallet and mint a soulbound NFT |
| `GET` | `/users/{wallet}` | Fetch user profile from the database |
| `GET` | `/users/{wallet}/scores` | Fetch live AI scores from the blockchain |
| `POST` | `/loan/create` | Create a loan request (triggers AI scoring) |
| `GET` | `/loan/list` | List loans, filterable by borrower or status |
| `GET` | `/loan/{id}` | Fetch a single loan by ID |
| `POST` | `/loan/{id}/approve-guarantor` | Guarantor approves their participation |
| `POST` | `/loan/{id}/release` | Platform releases escrowed funds to borrower |
| `POST` | `/loan/{id}/repay` | Borrower repays principal + interest |
| `POST` | `/loan/{id}/upload-doc` | Upload a document to IPFS |
| `GET` | `/loan/{id}/sync` | Pull latest status from the blockchain |
| `GET` | `/loan/events` | Fetch recent on-chain events |
| `GET` | `/health` | Service health check |

---

## AI Scoring

Two models run at loan creation time. Results are stored on the borrower's soulbound NFT.

**Credit Score** — 0 to 100, higher is better

- Algorithm: `GradientBoostingRegressor`
- Features: repayment rate, loan frequency, average loan size, income proof flag, default count

**Fraud Risk** — `LOW`, `MEDIUM`, or `HIGH`

- Algorithm: `RandomForestClassifier`
- Features: wallet age, 30-day transaction count, rapid loan requests, average repayment delay, unique counterparties, large transaction flag

If models are not trained, the platform falls back to neutral defaults (score: 50, risk: LOW).

---

## Production Deployment

Key changes required before deploying to a live network:

- **Key management** — replace `DEPLOYER_PRIVATE_KEY` with AWS KMS, HashiCorp Vault, or a hardware wallet
- **Contracts** — deploy to Sepolia or mainnet; replace `MockUSDC` with real USDC (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`)
- **Database** — configure Alembic migrations; use PgBouncer for connection pooling
- **Security** — set a strong `JWT_SECRET`; restrict `allow_origins` in CORS to your domain; add rate limiting
- **Event indexing** — replace the polling loop with WebSocket subscriptions or a dedicated indexer (The Graph)
- **Transaction signing** — move all signing to MetaMask client-side; remove private key fields from API request bodies

---

## Known Limitations

- The backend-signing flow accepts private keys in request bodies. This is intentional for local dev convenience. All production user transactions should be signed client-side via MetaMask.
- AI models are trained on synthetic data. Production accuracy requires real historical loan data.
- Database schema is auto-created on startup. Alembic migrations are not yet configured.
- The event listener polls every 5 seconds. For high-throughput production use, replace with WebSocket subscriptions.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow, commit conventions, and PR guidelines.

## License

[MIT](./LICENSE)
