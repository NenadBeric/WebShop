from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://webshop:webshop@localhost:5432/webshop"
    OIDC_ISSUER: str = ""
    OIDC_ISSUER_EXTERNAL: str = ""
    JWT_SECRET: str = "WebShop-Dev-Secret-Change-Me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24
    # Isti secret kao Trainify ``JWT_SECRET`` — omogućava Bearer iz Trainify klijenta (BFF / embed_token).
    TRAINIFY_JWT_SECRET: str = ""
    TRAINIFY_JWT_ALGORITHM: str = "HS256"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    ENVIRONMENT: str = "development"
    ALLOW_LEGACY_AUTH: bool = True
    # SMTP optional — ako je prazno, mejl se samo loguje
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "webshop@localhost"
    TELEGRAM_BOT_TOKEN: str = ""
    OIDC_AUDIENCE: str = ""
    # Zitadel Management API (PAT sa pravima čitanja korisnika u org.) — provera postojanja mejla u produkciji
    ZITADEL_MANAGEMENT_PAT: str = ""
    ZITADEL_MANAGEMENT_ORG_ID: str = ""
    # AI / LLM (isti obrasci kao Trainify: uključeno kada je LLM_API_KEY podešen)
    # LLM_PROVIDER: openai | deepseek | openrouter | custom
    LLM_PROVIDER: str = "openai"
    LLM_API_KEY: str = ""
    # LLM_MODEL: opciono prepisuje podrazumevani model provajdera
    LLM_MODEL: str = ""
    LLM_BASE_URL: str = ""
    LLM_TEMPERATURE: float = 0.7
    # Langfuse (opciono)
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"
    WEBSHOP_SEED_DEMO: bool = True
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def legacy_auth_enabled(self) -> bool:
        if self.ENVIRONMENT == "production":
            return False
        return self.ALLOW_LEGACY_AUTH and not self.OIDC_ISSUER

    # `.env` in repo root may also contain Docker/Compose and frontend variables (POSTGRES_*, L10N_*).
    # Ignore unknown keys so local dev doesn't crash on extra env vars.
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
