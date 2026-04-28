# Nakshatra Lending

A decentralized peer-to-peer lending platform built on Ethereum. Borrowers create on-chain loan requests, guarantors back them, lenders fund them, and repayments are handled automatically through smart contracts. AI models score borrowers at loan creation time and the results are stored on a soulbound NFT.

---

## Features

- **On-chain loan lifecycle** — GUARANTOR_PENDING → OPEN_FOR_LENDERS → READY_TO_FUND → ACTIVE → REPAID/DEFAULTED, enforced by Solidity state machines
- **Soulbound identity NFTs** — one non-transferable ERC-721 per wallet, storing reputation score, AI credit score, and fraud risk
- **AI credit scoring** — GradientBoosting credit model + RandomForest fraud detection, called at loan creation and optionally pushed on-chain
- **IPFS document storage** — loan documents pinned via local IPFS daemon or Pinata
- **Event-driven DB sync** — background task polls the chain every 5 seconds and keeps PostgreSQL in sync with contract state
- **MetaMask integration** — lenders fund loans and borrowers repay directly from the browser; no private keys sent to the server for those flows

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.20, Hardhat, OpenZeppelin 4.9 |
| Backend API | FastAPI (Python 3.11), SQLAlchemy 2 async, Web3.py 6 |
| AI Scoring | scikit-learn 1.4 (GradientBoostingRegressor + RandomForestClassifier) |
| Frontend | Next.js 16, React 19, ethers.js v6, TailwindCSS v4, TanStack Query |
| Database | PostgreSQL 16 |
| Storage | IPFS (Kubo) / Pinata |
| Containerization | Docker, Docker Compose |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (Next.js)                   │
│  MetaMask ──► ethers.js ──► Escrow / LoanFactory        │
│  REST calls ──────────────► FastAPI backend             │
└─────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         PostgreSQL      Hardhat node      IPFS node
              ▲               │
              └── event ──────┘
                  listener
                  (polls every 5s)
```

Five smart contracts are deployed and wired together:

- **MockUSDC** — ERC-20 stablecoin (6 decimals, matches real USDC)
- **UserProfileNFT** — soulbound ERC-721, one per wallet
- **LoanFactory** — creates and manages loan state machine
- **Escrow** — holds funds, handles repayment and interest distribution
- **Reputation** — updates on-chain scores (+5 on repay, -20 on default)

---

## Project Structure

```
nakshatra-lending/
├── ai-services/              # ML models (credit scoring + fraud detection)
│   ├── ai_service.py         # unified inference entry point
│   ├── credit_score/         # GradientBoosting model + training script
│   └── fraud_detection/      # RandomForest model + training script
│
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── api/              # route handlers (auth, users, loans)
│   │   ├── database/         # SQLAlchemy engine + session
│   │   ├── models/           # ORM models (User, Loan, LoanDocument)
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   └── services/         # blockchain, AI scoring, IPFS, loan orchestration
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
│
├── blockchain/               # Hardhat project
│   ├── contracts/            # Solidity source files
│   ├── scripts/              # deploy.js + seedWallets.js
│   └── hardhat.config.js
│
├── frontend/                 # Next.js application
│   └── src/
│       ├── app/              # pages (borrower, lender, guarantor, loan/[id])
│       ├── components/       # UI components + shadcn/ui
│       ├── context/          # Web3Context, QueryProvider
│       ├── hooks/            # useApi, useLoans, useWeb3Transactions
│       └── services/         # api.ts (Axios), web3.ts (ethers.js)
│
├── scripts/                  # dev automation (PowerShell + bash)
├── docker-compose.yml
├── .env.example              # → copy to backend/.env
└── README.md
```

---

## Quick Start

### Option A — Docker (all services in one command)

```bash
git clone <repo-url>
cd nakshatra-lending
docker compose up --build
```

Services start in order: PostgreSQL → IPFS → Hardhat node → contract deployer → backend → frontend.

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Hardhat RPC | http://localhost:8545 |
| IPFS API | http://localhost:5001 |

### Option B — Local development

**Prerequisites:** Node.js ≥ 18, Python ≥ 3.11, PostgreSQL ≥ 14

**Windows (one command):**
```powershell
npm run dev:all
```

**Manual (separate terminals):**

```bash
# Terminal 1 — blockchain node
npm run blockchain:start

# Terminal 2 — deploy contracts (run once after node is up)
npm run blockchain:deploy

# Terminal 3 — backend
npm run backend:start

# Terminal 4 — frontend
npm run frontend:start
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env`. The deploy script fills in contract addresses automatically.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `RPC_URL` | Ethereum RPC endpoint (Hardhat: `http://127.0.0.1:8545`) |
| `CHAIN_ID` | Chain ID (Hardhat local: `31337`) |
| `USDC_ADDRESS` | Deployed MockUSDC address |
| `LOAN_FACTORY_ADDRESS` | Deployed LoanFactory address |
| `ESCROW_ADDRESS` | Deployed Escrow address |
| `USER_PROFILE_NFT_ADDRESS` | Deployed UserProfileNFT address |
| `REPUTATION_ADDRESS` | Deployed Reputation address |
| `DEPLOYER_PRIVATE_KEY` | Wallet[0] private key (Hardhat default — test only) |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `IPFS_API_URL` | Local IPFS daemon URL |
| `PINATA_API_KEY` | Pinata API key (optional fallback) |

---

## MetaMask Setup

1. Add network manually in MetaMask:

   | Field | Value |
   |-------|-------|
   | Network Name | Hardhat Local |
   | RPC URL | `http://127.0.0.1:8545` |
   | Chain ID | `31337` |
   | Currency | ETH |

2. Import test wallets (Hardhat default mnemonic — local dev only):

   | Role | Private Key |
   |------|-------------|
   | Deployer | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
   | Lender (1M USDC) | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
   | Borrower (5K USDC) | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
   | Guarantor 1 | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |
   | Guarantor 2 | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b` |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register user + mint soulbound NFT |
| GET | `/users/{wallet}` | Get user profile from DB |
| GET | `/users/{wallet}/scores` | Get live on-chain AI scores |
| POST | `/loan/create` | Create loan request (runs AI scoring) |
| GET | `/loan/list` | List loans (filter by borrower/status) |
| GET | `/loan/{id}` | Get single loan |
| POST | `/loan/{id}/approve-guarantor` | Guarantor approves participation |
| POST | `/loan/{id}/release` | Platform releases funds to borrower |
| POST | `/loan/{id}/repay` | Borrower repays loan |
| POST | `/loan/{id}/upload-doc` | Upload document to IPFS |
| GET | `/loan/{id}/sync` | Sync status from blockchain |
| GET | `/loan/events` | Fetch recent blockchain events |
| GET | `/health` | Health check |

Full interactive docs at `http://localhost:8000/docs`.

---

## Loan Lifecycle

```
Register wallet (mint NFT)
        │
        ▼
Create Loan Request ──────────────► GUARANTOR_PENDING
        │                                   │
        │                    (all guarantors approve)
        │                                   │
        │                                   ▼
        └──────────────────────────► OPEN_FOR_LENDERS
                                            │
                                   (lender funds via MetaMask)
                                            │
                                            ▼
                                      READY_TO_FUND
                                            │
                                  (auto-released by event listener)
                                            │
                                            ▼
                                          ACTIVE
                                            │
                              (borrower repays via MetaMask)
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                           REPAID                     DEFAULTED
                        (reputation +5)            (reputation -20)
```

---

## AI Scoring

Two models run at loan creation time:

**Credit Score** (0–100, higher is better)
- Algorithm: GradientBoostingRegressor
- Features: repayment rate, loan frequency, avg loan size, income proof flag, default count

**Fraud Risk** (LOW / MEDIUM / HIGH)
- Algorithm: RandomForestClassifier
- Features: wallet age, tx count, rapid loan requests, repayment delay, counterparty diversity, large tx flag

Both models fall back to neutral defaults (50 credit, LOW fraud) if not yet trained. To train:

```bash
cd ai-services
python credit_score/train.py
python fraud_detection/train.py
```

---

## Deployment

### Local (Docker)
```bash
docker compose up --build
```

### Production considerations

- Replace `DEPLOYER_PRIVATE_KEY` with a proper key management solution (AWS KMS, HashiCorp Vault)
- Set a strong `JWT_SECRET`
- Use a real PostgreSQL instance with connection pooling (PgBouncer)
- Deploy contracts to a testnet (Sepolia) or mainnet and update all addresses
- Replace `MockUSDC` with real USDC (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` on mainnet)
- Add rate limiting to the API (FastAPI middleware or a reverse proxy)
- Set `allow_origins` in CORS to your actual frontend domain

---

## Known Limitations

- Private keys are passed in request bodies for the backend-signing flow. This is intentional for local dev convenience. In production, use MetaMask signing for all user transactions.
- AI models are trained on synthetic data. Real-world accuracy requires historical loan data.
- The event listener polls every 5 seconds. For production, consider WebSocket subscriptions or a dedicated indexer.
- No database migrations — tables are created with `CREATE TABLE IF NOT EXISTS` on startup. Use Alembic for production schema management.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
#   B l o c k L e n d  
 #   B l o c k L e n d  
 