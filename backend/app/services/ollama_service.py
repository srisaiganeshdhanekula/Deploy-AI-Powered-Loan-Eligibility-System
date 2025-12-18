"""
Ollama LLM Service for AI chat interactions
"""

import requests
import json
from typing import Optional, Dict
from app.utils.logger import get_logger
from app.services.llm_base import LLMProvider

logger = get_logger(__name__)

OLLAMA_API_URL = "http://localhost:11434/api"


class OllamaService(LLMProvider):
    """Service for interacting with local Ollama LLM"""
    
    def __init__(self, model: str = "llama3"):
        self.model = model
        self.api_url = OLLAMA_API_URL
    
    def generate_response(self, prompt: str, context: Optional[dict] = None) -> str:
        """
        Generate a response from Ollama LLM
        
        Args:
            prompt: User's message/prompt
            context: Optional context data about the loan application
        
        Returns:
            Generated response text
        """
        try:
            # Build context-aware prompt
            system_prompt = self._build_system_prompt(context)
            full_prompt = f"{system_prompt}\n\nUser: {prompt}"
            
            response = requests.post(
                f"{self.api_url}/generate",
                json={
                    "model": self.model,
                    "prompt": full_prompt,
                    "stream": False
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Generated response from {self.model}")
                return result.get("response", "I couldn't generate a response.")
            else:
                # Log full response for debugging and return a helpful fallback
                try:
                    logger.error(f"Ollama API error: {response.status_code} - {response.text}")
                except Exception:
                    logger.error(f"Ollama API error: {response.status_code}")
                return (
                    "I'm currently unable to access the language model. "
                    "I can still help collect your application details. Please tell me your full name, email, annual income, "
                    "credit score, desired loan amount, employment status, and number of dependents."
                )
        
        except requests.exceptions.ConnectionError:
            logger.error("Cannot connect to Ollama. Make sure it's running on localhost:11434")
            return (
                "I can't reach the language model right now. You can still provide your loan details and I will process them. "
                "Please tell me your full name, email, annual income, credit score, desired loan amount, employment status, and dependents."
            )
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            return (
                "An internal error occurred while generating a response. Try again or provide your details and I will proceed without the language model."
            )

    # LLMProvider interface implementation
    def generate(self, prompt: str, context: Optional[Dict] = None) -> str:
        """Generate a response given a prompt and optional context (LLMProvider contract)."""
        return self.generate_response(prompt, context)

    def extract_structured_data(self, text: str) -> dict:
        """
        Extract structured fields from natural language using LLaMA via Ollama.

        Returns a dictionary with best-effort parsing of:
        - name (string)
        - monthly_income (number)
        - credit_score (number)
        - loan_amount (number)
        """
        prompt = (
            "Extract the following fields from this text and return JSON ONLY, no prose, no code fences.\n"
            "Fields: name (string), monthly_income (number INR), credit_score (number), loan_amount (number INR).\n"
            "Normalize Indian units: 'lakh' = 100000, 'crore' = 10000000.\n"
            "If a field is missing, set it to null. Example output: {\"name\": \"Nishtha\", \"monthly_income\": 80000, \"credit_score\": 750, \"loan_amount\": 500000}.\n\n"
            f"Text: {text}\n"
        )
        try:
            response = requests.post(
                f"{self.api_url}/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False
                },
                timeout=30
            )
            if response.status_code != 200:
                logger.error(f"Ollama extract error: {response.status_code} - {response.text}")
                return {}

            raw = response.json().get("response", "{}")
            # Best effort: try json parse; if it fails, attempt to find first JSON object
            data = self._safe_json_parse(raw)
            return data if isinstance(data, dict) else {}
        except Exception as e:
            logger.error(f"extract_structured_data error: {e}")
            return {}

    def generate_natural_reply(self, transcript: str, structured: dict, missing: list[str]) -> str:
        """Generate a short, friendly AI reply acknowledging captured info and asking for missing fields."""
        summary_bits = []
        if structured.get("name"):
            summary_bits.append(f"name as {structured['name']}")
        if structured.get("monthly_income"):
            summary_bits.append(f"monthly income of ₹{int(structured['monthly_income']):,}")
        if structured.get("credit_score"):
            summary_bits.append(f"credit score {int(structured['credit_score'])}")
        if structured.get("loan_amount"):
            summary_bits.append(f"loan amount ₹{int(structured['loan_amount']):,}")

        captured = ", ".join(summary_bits)
        need = ", ".join(missing)

        reply_prompt = (
            "You are a helpful, concise loan assistant.\n"
            f"User said: {transcript}\n"
            f"We captured: {captured if captured else 'nothing yet'}.\n"
            + (f"We still need: {need}.\n" if missing else "All required fields collected.\n") +
            "Reply in one or two friendly sentences. If fields are missing, ask a clear follow-up to obtain the next one."
        )
        try:
            response = requests.post(
                f"{self.api_url}/generate",
                json={
                    "model": self.model,
                    "prompt": reply_prompt,
                    "stream": False
                },
                timeout=30
            )
            if response.status_code == 200:
                return response.json().get("response", "Thanks. Please share the remaining details.")
        except Exception as e:
            logger.error(f"generate_natural_reply error: {e}")
        # Fallback
        if missing:
            return f"Thanks for the details. Could you also share your {missing[0]}?"
        return "Thanks! I’ve noted your details."

    def _safe_json_parse(self, s: str):
        """Attempt to parse JSON from a string, falling back to extracting the first {...} block."""
        try:
            return json.loads(s)
        except Exception:
            # Extract substring between first '{' and last '}'
            start = s.find('{')
            end = s.rfind('}')
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(s[start:end+1])
                except Exception:
                    return {}
            return {}
    
    def _build_system_prompt(self, context: Optional[dict]) -> str:
        """Build a system prompt with context"""
        base_prompt = """You are a concise, friendly AI loan officer.
Goals:
- Help applicants start and complete a loan application
- Collect key details step-by-step
- Offer to open the detailed application form once basics are captured

Rules:
- Ask ONE question at a time.
- Keep replies to 1-2 sentences.
- Confirm any values you infer or extract.
- If a user asks for general info, answer briefly then resume collection.
- Prefer Indian currency formatting and recognize lakh/crore.

Collect these in order: full name, email, annual income, credit score, desired loan amount, employment status, number of dependents.
Once annual income, credit score, and desired loan amount are present, suggest proceeding to the detailed application form."""
        
        if context:
            context_str = "\n\nApplicant Context:\n"
            if context.get("full_name"):
                context_str += f"Name: {context['full_name']}\n"
            if context.get("loan_amount"):
                context_str += f"Loan Amount Requested: ${context['loan_amount']:,.2f}\n"
            if context.get("credit_score"):
                context_str += f"Credit Score: {context['credit_score']}\n"
            if context.get("annual_income"):
                context_str += f"Annual Income: ${context['annual_income']:,.2f}\n"
            
            return base_prompt + context_str
        
        return base_prompt
    
    def check_service_health(self) -> bool:
        """Check if Ollama service is running"""
        try:
            response = requests.get(f"{self.api_url}/tags", timeout=5)
            return response.status_code == 200
        except:
            return False

    def health(self) -> bool:
        """LLMProvider health check compatibility."""
        return self.check_service_health()
