"""
LLM service selector for choosing between providers.
"""

import os
from app.services.ollama_service import OllamaService
from app.services.gemini_service import GeminiService
from app.services.openrouter_service import OpenRouterService
from app.services.groq_service import GroqService
from app.services.llm_base import LLMProvider


def get_llm_service(provider_override: str | None = None) -> LLMProvider:
    """Get the configured LLM service based on environment variables or an override."""
    provider = (provider_override or os.getenv("LLM_PROVIDER", "ollama")).lower()

    if provider == "gemini":
        return GeminiService(model_name=os.getenv("GEMINI_MODEL", "gemini-1.5-flash"))
    if provider == "openrouter":
        return OpenRouterService(model_name=os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct"))
    if provider == "groq":
        return GroqService(model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"))
    if provider == "ollama":
        return OllamaService(model=os.getenv("OLLAMA_MODEL", "llama3.2"))
    # Fallback
    return OllamaService()