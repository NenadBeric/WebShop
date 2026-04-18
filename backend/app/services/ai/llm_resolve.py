"""Isti obrasc kao Trainify `app/services/ai/model_factory.py` — URL + model za OpenAI-kompatibilni HTTP chat (bez LangChain)."""

from __future__ import annotations

from app.config import settings

_PROVIDER_PRESETS: dict[str, dict[str, str | None]] = {
    "openai": {"base_url": "https://api.openai.com/v1", "default_model": "gpt-4o-mini"},
    "deepseek": {"base_url": "https://api.deepseek.com/v1", "default_model": "deepseek-chat"},
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "default_model": "deepseek/deepseek-chat:free"},
    "custom": {"base_url": None, "default_model": None},
}


def chat_completions_url_and_model() -> tuple[str, str]:
    """Vraća (pun URL do .../chat/completions, model_id)."""
    provider = (settings.LLM_PROVIDER or "openai").lower().strip()
    preset = _PROVIDER_PRESETS.get(provider, _PROVIDER_PRESETS["custom"])

    if provider == "openai":
        base = (preset["base_url"] or "").rstrip("/")
        model = (settings.LLM_MODEL or "").strip() or str(preset["default_model"])
        return f"{base}/chat/completions", model

    base = (settings.LLM_BASE_URL or preset["base_url"] or "").strip().rstrip("/")
    model = (settings.LLM_MODEL or "").strip() or (preset["default_model"] or "")

    if not model:
        raise ValueError(
            f"LLM_PROVIDER={provider!r} zahteva LLM_MODEL u .env (ili koristite ugrađene: openai, deepseek, openrouter)"
        )
    if not base:
        raise ValueError("LLM_PROVIDER=custom zahteva LLM_BASE_URL u .env")

    return f"{base}/chat/completions", model
