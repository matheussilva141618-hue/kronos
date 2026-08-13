"""
KRONOS — Motor de Voz Neural Local
Servidor HTTP de áudio bidirecional: TTS + STT
Roda em 127.0.0.1:8001
"""

import os
import io
import uuid
import time
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

# ─── Configuração de logging ───────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kronos_voice")

# ─── Modelos de entrada/saída ──────────────────────────────────────────────────
class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "pt_BR"
    tone: Optional[str] = "neutral"
    rate: Optional[float] = 1.0
    pitch: Optional[float] = 1.0

class STTResponse(BaseModel):
    transcript: str
    confidence: float
    isFinal: bool

class HealthResponse(BaseModel):
    status: str
    tts_engine: str
    stt_engine: str

# ─── App FastAPI ──────────────────────────────────────────────────────────────
app = FastAPI(title="Kronos Voice Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Estado do sistema ────────────────────────────────────────────────────────
_tts_engine = "unknown"
_stt_engine = "unknown"
_piper_model = None

def _detect_engines():
    global _tts_engine, _stt_engine
    try:
        import piper
        _tts_engine = "piper"
    except Exception:
        try:
            import gtts
            _tts_engine = "gTTS"
        except Exception:
            try:
                import pyttsx3
                _tts_engine = "pyttsx3"
            except Exception:
                _tts_engine = "none"

    try:
        import whisper
        _stt_engine = "whisper"
    except Exception:
        try:
            import speech_recognition as sr
            _stt_engine = "speech_recognition"
        except Exception:
            _stt_engine = "none"

_detect_engines()

# ─── TTS: Piper (preferencial) ────────────────────────────────────────────────
def _synthesize_piper(text: str, voice: str = "pt_BR", rate: float = 1.0, pitch: float = 1.0) -> bytes:
    try:
        from piper import Piper
        model_path = os.environ.get("PIPER_MODEL", "models/pt_BR-faber-medium.onnx")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Modelo Piper não encontrado: {model_path}")
        piper = Piper(model_path)
        audio = piper.synthesize(text, length_scale=1.0/rate if rate > 0 else 1.0)
        return audio
    except Exception as e:
        logger.warning(f"Piper TTS falhou: {e}")
        raise

# ─── TTS: gTTS (fallback) ─────────────────────────────────────────────────────
def _synthesize_gtts(text: str, voice: str = "pt_BR", rate: float = 1.0, pitch: float = 1.0) -> bytes:
    try:
        from gtts import gTTS
        lang = voice.split("-")[0] if "-" in voice else voice.split("_")[0]
        tts = gTTS(text=text, lang=lang, slow=(rate < 0.9))
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.warning(f"gTTS falhou: {e}")
        raise

# ─── TTS: pyttsx3 (fallback offline) ─────────────────────────────────────────
def _synthesize_pyttsx3(text: str, voice: str = "pt_BR", rate: float = 1.0, pitch: float = 1.0) -> bytes:
    try:
        import pyttsx3
        engine = pyttsx3.init()
        engine.setProperty("rate", int(rate * 160))
        engine.setProperty("pitch", int(pitch * 50))
        voices = engine.getProperty("voices")
        if voice.startswith("pt"):
            for v in voices:
                if hasattr(v, "languages") and v.languages and any("pt" in str(l).lower() for l in v.languages):
                    engine.setProperty("voice", v.id)
                    break
        buf = io.BytesIO()
        engine.save_to_file(text, buf)
        engine.runAndWait()
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.warning(f"pyttsx3 falhou: {e}")
        raise

def _synthesize(text: str, voice: str = "pt_BR", rate: float = 1.0, pitch: float = 1.0) -> tuple[bytes, str]:
    global _tts_engine
    if _tts_engine == "piper":
        return _synthesize_piper(text, voice, rate, pitch), _tts_engine
    if _tts_engine == "gTTS":
        return _synthesize_gtts(text, voice, rate, pitch), _tts_engine
    if _tts_engine == "pyttsx3":
        return _synthesize_pyttsx3(text, voice, rate, pitch), _tts_engine
    raise RuntimeError("Nenhum engine TTS disponível")

# ─── STT: Whisper (preferencial) ──────────────────────────────────────────────
def _transcribe_whisper(audio_bytes: bytes) -> STTResponse:
    try:
        import whisper
        model = whisper.load_model("small")
        result = model.transcribe(io.BytesIO(audio_bytes), language="pt")
        return STTResponse(
            transcript=result.get("text", "").strip(),
            confidence=result.get("confidence", 1.0) or 1.0,
            isFinal=True,
        )
    except Exception as e:
        logger.warning(f"Whisper STT falhou: {e}")
        raise

# ─── STT: SpeechRecognition (fallback) ────────────────────────────────────────
def _transcribe_sr(audio_bytes: bytes) -> STTResponse:
    try:
        import speech_recognition as sr
        r = sr.Recognizer()
        with sr.AudioFile(io.BytesIO(audio_bytes)) as source:
            audio = r.record(source)
        text = r.recognize_google(audio, language="pt-BR")
        return STTResponse(transcript=text, confidence=0.9, isFinal=True)
    except Exception as e:
        logger.warning(f"SpeechRecognition fallback falhou: {e}")
        raise

def _transcribe(audio_bytes: bytes) -> STTResponse:
    global _stt_engine
    if _stt_engine == "whisper":
        return _transcribe_whisper(audio_bytes)
    if _stt_engine == "speech_recognition":
        return _transcribe_sr(audio_bytes)
    raise RuntimeError("Nenhum engine STT disponível")

# ─── Rotas ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok", tts_engine=_tts_engine, stt_engine=_stt_engine)

@app.post("/tts")
async def tts(req: TTSRequest):
    try:
        audio, engine = _synthesize(req.text, req.voice, req.rate, req.pitch)
        return StreamingResponse(
            io.BytesIO(audio),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename=kronos_tts_{uuid.uuid4().hex}.wav",
                "X-TTS-Engine": engine,
            },
        )
    except Exception as e:
        logger.error(f"Erro TTS: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/stt")
async def stt(audio: bytes):
    try:
        result = _transcribe(audio)
        return JSONResponse(content=result.dict())
    except Exception as e:
        logger.error(f"Erro STT: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── Entrypoint ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")