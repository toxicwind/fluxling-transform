#!/usr/bin/env python3
"""
FreeInference backend for codeflux-patchling (living code).

Routes patchling's generate_diff / smartapply through the estate's
rhodochrosite router (:25193) to the freeinference qwen lane, so code
transformation runs on the same freeinference models the rest of the estate
uses — no nano-gpt, no per-box keys.

Backend contract (kept additive; never breaks a caller that imports from
`patchling.core` directly):

    from patchling.freeinference import generate_diff, smartapply

Both signatures mirror `patchling.core`'s public API; the only difference is
that the LLM endpoint defaults to the estate router + freeinference qwen.
"""

from __future__ import annotations

import os
from pathlib import Path

from .core import generate_diff as _core_generate_diff
from .core import smartapply as _core_smartapply

# Estate router SSOT. The router :25193 is the canonical OpenAI/Anthropic
# inference gateway; freeinference is its primary fast lane.
DEFAULT_ROUTER_URL = os.getenv("PATCHLING_ROUTER_URL", "http://127.0.0.1:25193/v1")
DEFAULT_ROUTER_KEY_FILE = os.getenv(
    "PATCHLING_ROUTER_KEY_FILE", os.path.expanduser("~/.tau/router.key")
)
# The freeinference qwen model that has worked best for the estate (architect
# directive 2026-11-04). Override with PATCHLING_MODEL. NOTE: rhodochrosite
# serves BARE model ids (anomaly #38: prefixed ids return 404 on :25193), so
# this is `qwen3.6-35b`, not `freeinference/qwen3.6-35b`.
DEFAULT_MODEL = os.getenv("PATCHLING_MODEL", "qwen3.6-35b")


def _router_key() -> str:
    """Return the rhodochrosite router key, preferring env then the key file."""
    env_key = os.getenv("PATCHLING_ROUTER_KEY") or os.getenv("RHODOCHROSITE_KEY")
    if env_key:
        return env_key.strip()
    key_file = Path(DEFAULT_ROUTER_KEY_FILE)
    if key_file.exists():
        return key_file.read_text(encoding="utf8").strip()
    raise RuntimeError(
        f"No router key: set PATCHLING_ROUTER_KEY or RHODOCHROSITE_KEY, or ensure "
        f"{DEFAULT_ROUTER_KEY_FILE} exists."
    )


def generate_diff(
    environment,
    goal,
    model=None,
    temperature=1.0,
    max_tokens=32000,
    api_key=None,
    base_url=None,
    prepend=None,
    anthropic_budget_tokens=None,
    images=None,
):
    """Generate a git diff via the estate router's freeinference qwen lane."""
    return _core_generate_diff(
        environment,
        goal,
        model=model or DEFAULT_MODEL,
        temperature=temperature,
        max_tokens=max_tokens,
        api_key=api_key or _router_key(),
        base_url=base_url or DEFAULT_ROUTER_URL,
        prepend=prepend,
        anthropic_budget_tokens=anthropic_budget_tokens,
        images=images,
    )


def smartapply(
    diff_text,
    files,
    model=None,
    api_key=None,
    base_url=None,
):
    """Apply a diff with AI conflict resolution via the freeinference qwen lane."""
    return _core_smartapply(
        diff_text,
        files,
        model=model or DEFAULT_MODEL,
        api_key=api_key or _router_key(),
        base_url=base_url or DEFAULT_ROUTER_URL,
    )


__all__ = ["generate_diff", "smartapply", "DEFAULT_MODEL", "DEFAULT_ROUTER_URL"]
