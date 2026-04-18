"""Zajednički OpenAI-kompatibilni chat completion (tekst)."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import settings
from app.services.ai.llm_resolve import chat_completions_url_and_model

logger = logging.getLogger(__name__)


def _strip_markdown_json(content: str) -> str:
    content = (content or "").strip()
    if content.startswith("```"):
        content = re.sub(r"^```[a-zA-Z]*\n?", "", content)
        content = re.sub(r"\n?```$", "", content).strip()
    return content


async def llm_chat_completion(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.25,
    timeout: float = 90.0,
) -> str:
    if not (settings.LLM_API_KEY or "").strip():
        raise ValueError("ai_disabled")
    url, model = chat_completions_url_and_model()
    payload: dict[str, Any] = {
        "model": model,
        "temperature": float(temperature),
        "messages": messages,
    }
    headers = {"Authorization": f"Bearer {settings.LLM_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    return str(content).strip()


async def llm_chat_json(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.2,
) -> Any:
    raw = await llm_chat_completion(messages, temperature=temperature)
    raw = _strip_markdown_json(raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("LLM JSON parse fail: %s", raw[:400])
        raise ValueError("llm_invalid_json") from None


async def llm_chat_stream_tokens(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.35,
    timeout: float = 120.0,
) -> AsyncIterator[str]:
    """OpenAI-kompatibilno streamovanje: delta content stringovi."""
    if not (settings.LLM_API_KEY or "").strip():
        raise ValueError("ai_disabled")
    try:
        url, model = chat_completions_url_and_model()
    except ValueError as exc:
        raise ValueError("llm_misconfigured") from exc
    payload: dict[str, Any] = {
        "model": model,
        "temperature": float(temperature),
        "messages": messages,
        "stream": True,
    }
    headers = {"Authorization": f"Bearer {settings.LLM_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                if line.startswith(":"):
                    continue
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data:
                    continue
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                for choice in chunk.get("choices") or []:
                    delta = choice.get("delta") or {}
                    c = delta.get("content")
                    if isinstance(c, str) and c:
                        yield c
