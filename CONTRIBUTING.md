# Contributing to Nakshatra Lending

Thanks for your interest. Here's how to get involved.

## Getting Started

1. Fork the repository and clone your fork
2. Follow the setup instructions in the [README](./README.md)
3. Create a branch: `git checkout -b feat/your-feature`

## Development Workflow

- Keep PRs focused — one feature or fix per PR
- Test your changes locally before submitting
- Run `npx hardhat test` before touching any smart contracts
- Make sure the backend starts cleanly: `uvicorn app.main:app --reload`

## Smart Contract Changes

Any change to a `.sol` file requires:
- Recompiling: `cd blockchain && npx hardhat compile`
- Re-running tests: `npx hardhat test`
- Re-deploying locally and updating `.env` addresses

## Code Style

- Python: follow PEP 8, use type hints
- TypeScript: strict mode, no `any` unless unavoidable
- Solidity: NatSpec comments on all public functions

## Commit Messages

Use conventional commits:
- `feat:` new feature
- `fix:` bug fix
- `chore:` tooling, deps, config
- `docs:` documentation only
- `refactor:` no behavior change

## Security

Do not commit real private keys, API keys, or secrets. The Hardhat keys in `.env.example` are public test keys — safe for local dev only.

If you find a security issue, open a private GitHub issue rather than a public one.

## Pull Request Checklist

- [ ] Code works locally end-to-end
- [ ] No secrets or credentials committed
- [ ] Smart contract tests pass (if contracts changed)
- [ ] `.env.example` updated if new env vars added
