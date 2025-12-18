"""
Base LLM provider interface for pluggable LLM services.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    def generate(self, prompt: str, context: Optional[Dict] = None) -> str:
        """Generate a response given a prompt and optional context."""
        pass

    @abstractmethod
    def health(self) -> bool:
        """Check if the LLM service is healthy and available."""
        pass