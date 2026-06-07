#!/usr/bin/env python3
"""Shared credential store helpers for Zero Token Extension."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Optional, Tuple

ZERO_CLICK_HOME = Path.home() / ".zero-click"
ZERO_CLICK_ENV_JSON = ZERO_CLICK_HOME / ".env.json"

LATEST_SCHEMA_VERSION = 1
RESERVED_KEYS = {"schema_version", "o365", "x"}
TOKEN_FILENAMES = {
    "graph": "microsoft_browser_token.json",
    "outlook": "microsoft_outlook_token.json",
    "sharepoint": "sharepoint_token.json",
}


def default_store() -> dict:
    return {
        "schema_version": LATEST_SCHEMA_VERSION,
        "o365": {},
        "x": {},
    }


def token_store_path() -> Path:
    return ZERO_CLICK_ENV_JSON


def _normalize_token_record(record: dict) -> dict:
    normalized = dict(record)
    if "access_token" not in normalized and normalized.get("token"):
        normalized["access_token"] = normalized["token"]
    return normalized


def normalize_store(data: Optional[dict]) -> dict:
    """Normalize store data into the current schema."""
    normalized = default_store()
    if not data:
        return normalized
    if not isinstance(data, dict):
        raise ValueError(f"Token store must be a JSON object: {ZERO_CLICK_ENV_JSON}")

    schema_version = data.get("schema_version")
    if schema_version is not None and schema_version > LATEST_SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported token store schema_version {schema_version}; upgrade native-host tooling first."
        )

    if isinstance(data.get("o365"), dict):
        for token_type, record in data["o365"].items():
            if token_type in TOKEN_FILENAMES and isinstance(record, dict):
                normalized["o365"][token_type] = _normalize_token_record(record)
    else:
        for token_type in TOKEN_FILENAMES:
            record = data.get(token_type)
            if isinstance(record, dict):
                normalized["o365"][token_type] = _normalize_token_record(record)

    x_record = data.get("x")
    if isinstance(x_record, dict):
        normalized["x"] = dict(x_record)

    normalized["schema_version"] = LATEST_SCHEMA_VERSION
    return normalized


def load_store() -> dict:
    """Load the shared JSON store from ~/.zero-click/.env.json."""
    if not ZERO_CLICK_ENV_JSON.exists():
        return default_store()

    data = json.loads(ZERO_CLICK_ENV_JSON.read_text())
    return normalize_store(data)


def save_store(store: dict) -> Path:
    """Atomically persist the shared JSON store."""
    normalized = normalize_store(store)
    ZERO_CLICK_HOME.mkdir(parents=True, exist_ok=True)
    tmp_path = ZERO_CLICK_ENV_JSON.parent / f"{ZERO_CLICK_ENV_JSON.name}.tmp"
    tmp_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n")
    tmp_path.chmod(0o600)
    tmp_path.replace(ZERO_CLICK_ENV_JSON)
    ZERO_CLICK_ENV_JSON.chmod(0o600)
    return ZERO_CLICK_ENV_JSON


def load_saved_token_record(token_type: str) -> Tuple[Optional[dict], Path]:
    """Load a saved O365 token record from the shared store."""
    store = load_store()
    entry = store["o365"].get(token_type)
    if isinstance(entry, dict) and (entry.get("access_token") or entry.get("token")):
        return _normalize_token_record(entry), ZERO_CLICK_ENV_JSON

    return None, ZERO_CLICK_ENV_JSON


def save_token_record(token_type: str, token_data: dict) -> Path:
    """Save an O365 token record into the shared store."""
    if token_type in RESERVED_KEYS:
        raise ValueError(f"{token_type} is a reserved store key")
    store = load_store()
    store["o365"][token_type] = _normalize_token_record(token_data)
    return save_store(store)


def load_saved_x_session() -> Tuple[Optional[dict], Path]:
    """Load the saved X session record."""
    store = load_store()
    entry = store.get("x")
    if isinstance(entry, dict) and (entry.get("ct0") or entry.get("auth_token")):
        return dict(entry), ZERO_CLICK_ENV_JSON

    return None, ZERO_CLICK_ENV_JSON


def save_x_session_record(session_data: dict) -> Path:
    """Save the X session record into the shared store."""
    store = load_store()
    store["x"] = dict(session_data)
    return save_store(store)


def extract_token_from_text(text: str, *, token_type: Optional[str] = None) -> str:
    """Extract a token string from raw text, token JSON, or the shared store JSON."""
    text = text.strip()
    if not text:
        return ""

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return text

    if isinstance(data, dict):
        token = data.get("access_token") or data.get("token")
        if token:
            return token

        normalized = normalize_store(data)
        if token_type:
            nested = normalized["o365"].get(token_type)
            if isinstance(nested, dict):
                token = nested.get("access_token")
                if token:
                    return token

    return text


def snapshot_store() -> dict:
    """Return a deep copy of the normalized store."""
    return deepcopy(load_store())
