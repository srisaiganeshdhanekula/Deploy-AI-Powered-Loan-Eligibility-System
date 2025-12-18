"""
Voice Service for speech-to-text and text-to-speech
"""

import subprocess
import os
import base64
import tempfile
from pathlib import Path
from app.utils.logger import get_logger

logger = get_logger(__name__)


class VoiceService:
    """Service for voice input/output using Whisper and gTTS"""
    
    def __init__(self):
        self.temp_dir = Path(__file__).parent.parent / "static" / "voices"
        self.temp_dir.mkdir(exist_ok=True, parents=True)
        self._whisper_cmd = "whisper"
        self._ffmpeg_cmd = "ffmpeg"
        self._whisper_model = os.getenv("WHISPER_MODEL", "tiny")
        self._whisper_language = os.getenv("WHISPER_LANGUAGE", "en")

    def _has_cmd(self, cmd: str) -> bool:
        try:
            subprocess.run(["which", cmd], capture_output=True, check=True)
            return True
        except Exception:
            return False
    
    def speech_to_text(self, audio_file_path: str) -> str:
        """
        Convert speech to text using OpenAI Whisper
        
        Args:
            audio_file_path: Path to audio file (mp3, wav, etc.)
        
        Returns:
            Transcribed text
        """
        try:
            if not self._has_cmd(self._whisper_cmd):
                logger.error("Whisper not installed. Install with: pip install openai-whisper")
                raise Exception("Whisper is not installed")

            input_path = Path(audio_file_path)
            cleanup_paths = []

            # If not wav, try to convert to wav for maximum compatibility
            audio_for_whisper = input_path
            conversion_error = None
            if input_path.suffix.lower() != ".wav":
                if not self._has_cmd(self._ffmpeg_cmd):
                    logger.error("FFmpeg not installed. Install with: brew install ffmpeg (macOS)")
                    raise Exception("FFmpeg is required to process non-WAV audio. Please install FFmpeg.")
                wav_path = self.temp_dir / f"conv_{os.urandom(8).hex()}.wav"
                ffmpeg_cmd = [
                    self._ffmpeg_cmd,
                    "-y",
                    "-i",
                    str(input_path),
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    str(wav_path),
                ]
                ffmpeg_res = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=120)
                if ffmpeg_res.returncode == 0:
                    cleanup_paths.append(wav_path)
                    audio_for_whisper = wav_path
                else:
                    # Record error but attempt to let whisper handle original file
                    conversion_error = (ffmpeg_res.stderr or ffmpeg_res.stdout or "").strip()
                    logger.error(f"FFmpeg conversion failed: {conversion_error}")
                    audio_for_whisper = input_path

            # Use whisper CLI (requires: pip install openai-whisper)
            base_cmd = [
                self._whisper_cmd,
                str(audio_for_whisper),
                "--output_format",
                "txt",
                "--output_dir",
                str(self.temp_dir),
                "--task",
                "transcribe",
                "--model",
                str(self._whisper_model),
                "--language",
                str(self._whisper_language),
            ]
            # Try with quiet flag (some builds support it), then fallback to --verbose False, then no verbosity flag
            attempts = [
                base_cmd + ["--quiet"],
                base_cmd + ["--verbose", "False"],
                base_cmd,
            ]
            result = None
            last_err = ""
            for cmd in attempts:
                try:
                    result = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=300,
                    )
                    if result.returncode == 0:
                        break
                    # If it's an argument error, try next variant
                    err = (result.stderr or "") + " " + (result.stdout or "")
                    last_err = err.strip()
                    if "unrecognized arguments" in err.lower() or "unrecognized argument" in err.lower():
                        continue
                    # For other failures, still try next variant just in case
                except subprocess.TimeoutExpired:
                    last_err = "timeout"
                    result = None
                    break

            # Whisper writes <stem>.txt into output_dir (drops original extension)
            expected_txt = self.temp_dir / f"{Path(audio_for_whisper).stem}.txt"
            if result and result.returncode == 0 and expected_txt.exists():
                with open(expected_txt, "r") as f:
                    transcribed_text = f.read().strip()
                # Clean up generated files
                try:
                    expected_txt.unlink(missing_ok=True)  # type: ignore[arg-type]
                except TypeError:
                    # Python<3.8 compatibility without missing_ok
                    if expected_txt.exists():
                        expected_txt.unlink()
                for p in cleanup_paths:
                    try:
                        Path(p).unlink()
                    except Exception:
                        pass
                logger.info("Successfully transcribed audio")
                return transcribed_text
            else:
                stderr = (result.stderr or "").strip() if result else ""
                stdout = (result.stdout or "").strip() if result else ""
                combined = last_err or f"stderr: {stderr} | stdout: {stdout}"
                if conversion_error:
                    combined = f"ffmpeg: {conversion_error} | whisper: {combined}"
                logger.error(f"Whisper error. {combined}")
                raise Exception("Audio conversion/transcription failed. Ensure FFmpeg (with libopus) and Whisper are installed.")
        
        except FileNotFoundError:
            logger.error("Required binary not found (Whisper/FFmpeg)")
            raise Exception("Missing required binary (Whisper/FFmpeg)")
        except subprocess.TimeoutExpired:
            logger.error("Whisper transcription timed out")
            raise Exception("Transcription took too long")
        except Exception as e:
            logger.error(f"Error in speech to text: {str(e)}")
            raise
    
    def text_to_speech(self, text: str, language: str = "en") -> str:
        """
        Convert text to speech using gTTS
        
        Args:
            text: Text to convert to speech
            language: Language code (default: en)
        
        Returns:
            Base64 encoded audio file
        """
        try:
            from gtts import gTTS
            
            # Create temporary file
            temp_file = self.temp_dir / f"response_{os.urandom(8).hex()}.mp3"
            
            # Generate speech
            tts = gTTS(text=text, lang=language, slow=False)
            tts.save(str(temp_file))
            
            # Read and encode file
            with open(temp_file, 'rb') as f:
                audio_data = f.read()
            
            encoded_audio = base64.b64encode(audio_data).decode('utf-8')
            
            # Clean up
            temp_file.unlink()
            
            logger.info(f"Generated audio for {len(text)} characters")
            return encoded_audio
        
        except ImportError:
            logger.error("gTTS not installed. Install with: pip install gtts")
            raise Exception("gTTS is not installed")
        except Exception as e:
            logger.error(f"Error in text to speech: {str(e)}")
            raise

    def text_to_speech_file(self, text: str, language: str = "en") -> tuple[str, str]:
        """
        Convert text to speech using gTTS and save to static/voices directory.

        Args:
            text: Text to synthesize
            language: Language code (default: en)

        Returns:
            (filename, url_path) where url_path can be served via /static/voices/{filename}
        """
        try:
            from gtts import gTTS

            # Ensure directory exists
            self.temp_dir.mkdir(exist_ok=True, parents=True)

            # Generate unique filename
            filename = f"reply_{os.urandom(8).hex()}.mp3"
            out_path = self.temp_dir / filename

            tts = gTTS(text=text, lang=language, slow=False)
            tts.save(str(out_path))

            logger.info(f"Saved TTS audio to {out_path}")
            # Return the relative URL (FastAPI mounts /static at backend/app/static)
            return filename, f"/static/voices/{filename}"

        except ImportError:
            logger.error("gTTS not installed. Install with: pip install gtts")
            raise Exception("gTTS is not installed")
        except Exception as e:
            logger.error(f"Error in text to speech file: {str(e)}")
            raise
    
    def process_voice_input(self, audio_base64: str) -> str:
        """
        Process base64 encoded audio and convert to text
        
        Args:
            audio_base64: Base64 encoded audio data
        
        Returns:
            Transcribed text
        """
        try:
            # Decode base64 to temporary file
            audio_data = base64.b64decode(audio_base64)
            temp_file = self.temp_dir / f"input_{os.urandom(8).hex()}.wav"
            
            with open(temp_file, 'wb') as f:
                f.write(audio_data)
            
            # Transcribe
            transcribed_text = self.speech_to_text(str(temp_file))
            
            # Clean up
            temp_file.unlink()
            
            return transcribed_text
        
        except Exception as e:
            logger.error(f"Error processing voice input: {str(e)}")
            raise
    
    def get_voice_enabled(self) -> bool:
        """Check if voice services are available"""
        return self._has_cmd(self._whisper_cmd) and self._has_cmd(self._ffmpeg_cmd)

    def get_health(self) -> dict:
        """Detailed health for voice stack."""
        return {
            "whisper": self._has_cmd(self._whisper_cmd),
            "ffmpeg": self._has_cmd(self._ffmpeg_cmd),
        }
