from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache

# Find .env at project root or server dir
_current_dir = Path(__file__).resolve().parent
_candidates = [
    _current_dir.parents[2] / ".env",  # project root: E:\001 Mini Project_Team_12\.env
    _current_dir.parents[1] / ".env",  # server dir
    Path(".env"),
]
_env_file = next((str(p) for p in _candidates if p.is_file()), ".env")


class Settings(BaseSettings):
    """Application configuration loaded from environment variables / .env file."""

    DATABASE_URL: str
    JWT_SECRET: str = Field(default="change-me-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    model_config = {
        "env_file": _env_file,
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache(maxsize=1)
def _get_settings() -> Settings:
    return Settings()


settings: Settings = _get_settings()
