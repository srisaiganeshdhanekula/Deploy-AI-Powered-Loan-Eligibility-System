"""
OpenRouter LLM service using OpenAI-compatible chat completions API.
"""

import os
import time
import requests
from typing import Optional, Dict
from app.services.llm_base import LLMProvider
from app.utils.logger import get_logger


logger = get_logger(__name__)


class OpenRouterService(LLMProvider):
    """Service for interacting with OpenRouter chat completions API."""

    def __init__(self, model_name: str = None):
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.model_name = model_name or os.getenv(
            "OPENROUTER_MODEL", "meta-llama/llama-3.1-70b-instruct"
        )
        self.base_url = os.getenv(
            "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1/chat/completions"
        )
        self.site_url = os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000")
        self.app_name = os.getenv("OPENROUTER_APP_NAME", "AI Loan System")

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            # These are recommended by OpenRouter for attribution
            "HTTP-Referer": self.site_url,
            "X-Title": self.app_name,
        }

    def _build_system_prompt(self, context: Optional[Dict]) -> str:
        # Build a concise system prompt similar to GeminiService
        ctx = ""
        if context:
            try:
                ctx = "\n".join(
                    f"{k}: {v}" for k, v in context.items() if v is not None and v != ""
                )
            except Exception:
                ctx = str(context)

        return (
            "You are a concise, friendly AI loan officer.\n"
            "Goals:\n"
            "- Help applicants start and complete a loan application\n"
            "- Collect key details step-by-step\n"
            "- Offer to open the detailed application form once basics are captured\n\n"
            "Rules:\n"
            "- Ask ONE question at a time.\n"
            "- Keep replies to 1-2 sentences.\n"
            "- Confirm any values you infer or extract.\n"
            "- If a user asks for general info, answer briefly then resume collection.\n"
            "- Prefer Indian currency formatting and recognize terms like lakh/crore when paraphrasing.\n\n"
            "Collect these in order: full name, email, annual income, credit score, desired loan amount, employment status, number of dependents.\n"
            "Once annual income, credit score, and desired loan amount are present, suggest proceeding to the detailed application form.\n\n"
            f"Applicant Context:\n{ctx}".strip()
        )

    def _build_messages(self, prompt: str, context: Optional[Dict], allow_system: bool = True):
        system_prompt = self._build_system_prompt(context)
        if allow_system:
            return [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ]
        # Fallback path for providers that don't allow system/developer instructions (e.g., Google AI Studio Gemma)
        combined = f"{system_prompt}\n\nUser: {prompt}"
        return [
            {"role": "user", "content": combined},
        ]

    def generate(self, prompt: str, context: Optional[Dict] = None) -> str:
        """Generate a response using OpenRouter chat completions."""
        if not self.api_key:
            raise RuntimeError("OpenRouter API key is missing. Please configure OPENROUTER_API_KEY.")
        allow_system = True
        payload = {
            "model": self.model_name,
            "messages": self._build_messages(prompt, context, allow_system=allow_system),
            "temperature": 0.4,
            "top_p": 0.9,
        }

        try:
            # Simple exponential backoff on 429 / transient errors
            attempts = 0
            backoff = 1.0
            while attempts < 3:
                resp = requests.post(self.base_url, headers=self._headers(), json=payload, timeout=60)
                if resp.status_code == 200:
                    data = resp.json()
                    content = (
                        data.get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                    )
                    return content.strip() if content else ""

                # Handle Google AI Studio restriction: developer instruction not enabled
                if resp.status_code == 400 and "Developer instruction is not enabled" in resp.text and allow_system:
                    logger.warning("OpenRouter: system/developer instructions not allowed by provider. Retrying without system message.")
                    allow_system = False
                    payload["messages"] = self._build_messages(prompt, context, allow_system=False)
                    # Do not count this as a retry attempt; try immediately
                    continue

                # Handle 429 with Retry-After if provided
                if resp.status_code == 429:
                    retry_after = resp.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after else backoff
                    logger.warning(f"OpenRouter 429: backing off for {delay}s")
                    time.sleep(delay)
                    attempts += 1
                    backoff *= 2
                    continue

                # Retry once for 5xx
                if 500 <= resp.status_code < 600:
                    logger.warning(f"OpenRouter {resp.status_code}: retrying in {backoff}s")
                    time.sleep(backoff)
                    attempts += 1
                    backoff *= 2
                    continue

                # Non-retryable: raise to allow upstream handler to fall back to heuristic
                logger.error(f"OpenRouter API error: {resp.status_code} - {resp.text}")
                raise RuntimeError(f"OpenRouter API error: {resp.status_code} - {resp.text}")

            # If we exhausted retries, raise an error so caller can handle fallback
            raise RuntimeError("OpenRouter: exhausted retries or transient errors")
        except requests.RequestException as e:
            logger.error(f"OpenRouter request failed: {e}")
            raise RuntimeError(f"OpenRouter request failed: {e}")

    def health(self) -> bool:
        # Basic health: presence of API key
        return bool(self.api_key)
