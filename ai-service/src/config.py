"""
CoalGuard.AI — AI Intelligence Subsystem Configuration
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@127.0.0.1:55432/coalguard"

    # Auth
    auth_mode: str = "development"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 480

    # API
    cors_origins: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    log_level: str = "INFO"

    # OCR
    ocr_languages: str = "eng"
    max_bytes: int = 5_242_880
    max_pages: int = 50

    # Search
    search_provider: str = "mock"
    search_api_key: str = ""
    research_max_results: int = 10

    # Model API credentials (server-side only)
    predictive_ai_api_key: str = ""
    chatbot_api_key: str = ""
    chatbot_base_url: str = "https://api.openai.com/v1"
    chatbot_model: str = "gpt-3.5-turbo"
    reasoning_model_api_key: str = ""

    # Workflow
    workflow_max_duration_minutes: int = 60
    workflow_max_tool_calls: int = 50

    # Vector DB
    chroma_path: str = "./chroma_db"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Workflow limits
    workflow_max_duration_minutes: int = 60
    workflow_max_tool_calls: int = 50


@lru_cache
def get_settings() -> Settings:
    return Settings()