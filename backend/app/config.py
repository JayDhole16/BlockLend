from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, AliasChoices
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ───────────────────────────────────────────────────────────────────
    APP_NAME: str = "Nakshatra Lending API"
    DEBUG: bool = False

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/nakshatra"

    # ── Blockchain ────────────────────────────────────────────────────────────
    # Accepts both RPC_URL (short form) and WEB3_PROVIDER_URL (long form)
    WEB3_PROVIDER_URL: str = Field(
        default="http://127.0.0.1:8545",
        validation_alias=AliasChoices("RPC_URL", "WEB3_PROVIDER_URL"),
    )
    CHAIN_ID: int = 31337

    # Contract addresses — accept both naming conventions
    MOCK_USDC_ADDRESS: str = Field(
        default="",
        validation_alias=AliasChoices("USDC_ADDRESS", "MOCK_USDC_ADDRESS"),
    )
    USER_PROFILE_NFT_ADDRESS: str = ""
    LOAN_FACTORY_ADDRESS: str = ""
    ESCROW_ADDRESS: str = ""
    REPUTATION_ADDRESS: str = ""

    # Deployer / owner private key (wallet[0] from Hardhat node)
    DEPLOYER_PRIVATE_KEY: str = ""

    # ── IPFS ──────────────────────────────────────────────────────────────────
    IPFS_API_URL: str = "http://127.0.0.1:5001"
    PINATA_API_KEY: str = ""
    PINATA_SECRET_KEY: str = ""

    # ── Auth ──────────────────────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24

    # ── AI Services ───────────────────────────────────────────────────────────
    AI_SERVICE_URL: str = "http://localhost:8001"


@lru_cache
def get_settings() -> Settings:
    return Settings()
