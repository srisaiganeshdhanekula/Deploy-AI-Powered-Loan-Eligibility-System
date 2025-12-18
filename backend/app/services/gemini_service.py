"""
Gemini LLM service using Google Generative AI.
"""

import os
import time
import hashlib
import google.generativeai as genai
from typing import Optional, Dict
from app.services.llm_base import LLMProvider


class GeminiService(LLMProvider):
    """Service for interacting with Google's Gemini LLM."""

    def __init__(self, model_name: str = "gemini-1.5-flash"):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
        self.model_name = model_name
        self.client = genai.GenerativeModel(model_name) if api_key else None
        
        # Simple in-memory cache for responses
        self.cache = {}
        self.cache_max_age = 3600  # 1 hour
        self.cache_max_size = 100  # Max 100 cached responses

    def _get_cache_key(self, prompt: str, context: Optional[Dict] = None) -> str:
        """Generate a cache key from prompt and context."""
        context_str = str(sorted(context.items())) if context else ""
        cache_input = f"{prompt}|{context_str}"
        return hashlib.md5(cache_input.encode()).hexdigest()

    def _get_cached_response(self, cache_key: str) -> Optional[str]:
        """Get cached response if it exists and isn't expired."""
        if cache_key in self.cache:
            cached_item = self.cache[cache_key]
            if time.time() - cached_item['timestamp'] < self.cache_max_age:
                return cached_item['response']
            else:
                # Remove expired cache entry
                del self.cache[cache_key]
        return None

    def _cache_response(self, cache_key: str, response: str):
        """Cache a response with timestamp."""
        # Clean up old entries if cache is full
        if len(self.cache) >= self.cache_max_size:
            # Remove oldest entries
            sorted_items = sorted(self.cache.items(), key=lambda x: x[1]['timestamp'])
            for i in range(len(self.cache) - self.cache_max_size + 1):
                del self.cache[sorted_items[i][0]]
        
        self.cache[cache_key] = {
            'response': response,
            'timestamp': time.time()
        }

    def generate(self, prompt: str, context: Optional[Dict] = None) -> str:
        """Generate a response using Gemini with caching."""
        if not self.client:
            return "Gemini API key is missing. Please configure GEMINI_API_KEY."

        # Check cache first
        cache_key = self._get_cache_key(prompt, context)
        cached_response = self._get_cached_response(cache_key)
        if cached_response:
            return cached_response

        # Build context string
        ctx = ""
        if context:
            ctx = "\n".join(f"{k}: {v}" for k, v in context.items() if v)

        # Construct prompt
        full_prompt = f"""You are a helpful AI loan officer for an AI Loan System.
Your role is to:
1. Help applicants understand the loan application process
2. Answer questions about loan eligibility
3. Guide them through document verification
4. Provide information about interest rates and terms
5. Be professional, empathetic, and clear

Keep responses concise (1-2 paragraphs) unless more detail is requested.

Applicant Context:
{ctx}

User: {prompt}

Assistant:"""

        # Retry logic for rate limits
        import time
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.client.generate_content(full_prompt)
                result = response.text.strip()
                
                # Cache successful response
                self._cache_response(cache_key, result)
                
                return result
            except Exception as e:
                error_str = str(e).lower()
                if "429" in error_str or "quota" in error_str or "rate limit" in error_str:
                    if attempt < max_retries - 1:
                        # Extract retry delay from error if available
                        retry_delay = 60  # Default 60 seconds
                        if "retry in" in error_str:
                            import re
                            match = re.search(r'retry in (\d+\.?\d*)s', error_str)
                            if match:
                                retry_delay = float(match.group(1))
                        
                        print(f"Gemini rate limit hit. Retrying in {retry_delay} seconds... (attempt {attempt + 1}/{max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        return f"Gemini API rate limit exceeded. Please try again later. Error: {str(e)}"
                else:
                    return f"Gemini error: {str(e)}. Please try again."

    def health(self) -> bool:
        """Check if Gemini is configured and available."""
        return bool(self.client)

    def clear_cache(self):
        """Clear all cached responses."""
        self.cache.clear()

    def get_cache_stats(self) -> Dict:
        """Get cache statistics."""
        return {
            "cache_size": len(self.cache),
            "max_cache_size": self.cache_max_size,
            "cache_max_age_seconds": self.cache_max_age
        }