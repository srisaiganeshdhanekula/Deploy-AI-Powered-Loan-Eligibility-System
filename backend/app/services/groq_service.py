"""
Groq LLM Service for high-speed AI interactions
"""

import os
from groq import Groq
from typing import Optional, Dict
from app.utils.logger import get_logger
from app.services.llm_base import LLMProvider

logger = get_logger(__name__)

class GroqService(LLMProvider):
    """Service for interacting with Groq Cloud API"""
    
    def __init__(self, model: str = None):
        self.api_key = os.getenv("GROQ_API_KEY")
        if not self.api_key:
            logger.error("GROQ_API_KEY not found in environment variables")
        
        self.client = Groq(api_key=self.api_key)
        # Use versatile model as default
        self.model = model or "llama-3.3-70b-versatile"

    def generate(self, prompt: str, context: Optional[Dict] = None) -> str:
        """
        Generate a response using Groq.
        
        Args:
            prompt: The user prompt or system instruction
            context: Optional dictionary to format into a system context string
        """
        if not self.api_key:
            return "Error: GROQ_API_KEY not configured."

        try:
            messages = []
            
            # If context is provided, inject it as system message
            if context:
                context_str = "\n".join([f"{k}: {v}" for k, v in context.items()])
                system_content = f"Context:\n{context_str}\n\nInstructions:\n{prompt}"
                messages.append({"role": "system", "content": system_content})
                # For generation tasks, we might just send the prompt as system or user.
                # If 'prompt' is the instruction, put it in system.
            else:
                messages.append({"role": "user", "content": prompt})

            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=1024,
                top_p=1,
                stream=False,
                stop=None,
            )
            
            return completion.choices[0].message.content

        except Exception as e:
            logger.error(f"Groq API error: {e}")
            return None

    def health(self) -> bool:
        """Check if Groq service is reachable."""
        if not self.api_key:
            return False
        try:
            # Minimal call to check connectivity
            self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1
            )
            return True
        except Exception:
            return False
