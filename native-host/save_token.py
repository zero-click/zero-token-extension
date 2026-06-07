#!/usr/bin/env python3
"""Save browser-extracted O365 tokens and X session values."""

import argparse
import base64
import json
import sys
import time
from datetime import datetime, timezone
from typing import Optional, Union

from token_store import (
    load_saved_token_record,
    save_token_record,
    save_x_session_record,
    token_store_path,
)

OUTLOOK_AUDIENCE_PATTERNS = (
    "outlook.office.com",
    "outlook.office365.com",
    "substrate.office.com",
    "outlook.cloud.microsoft",
    "00000002-0000-0ff1-ce00-000000000000",
)
SHAREPOINT_AUDIENCE_PATTERNS = (
    "sharepoint.com",
    "00000003-0000-0ff1-ce00-000000000000",
)


def _decode_jwt_payload(token: str) -> dict:
    """Decode JWT payload without verification."""
    parts = token.split(".")
    if len(parts) != 3:
        return {}
    payload = parts[1]
    padding = 4 - len(payload) % 4
    if padding != 4:
        payload += "=" * padding
    payload = payload.replace("-", "+").replace("_", "/")
    try:
        decoded = base64.b64decode(payload)
        return json.loads(decoded)
    except Exception:
        return {}


def save_x_session(
    ct0: str,
    auth_token: str,
    *,
    exp: Optional[Union[int, float]] = None,
    session_cookie: Optional[bool] = None,
    source: Optional[str] = None,
):
    """Save X session cookies into ~/.zero-click/.env.json."""
    if not ct0:
        raise ValueError("Missing ct0 value")
    if not auth_token:
        raise ValueError("Missing auth_token value")
    if "\n" in ct0 or "\n" in auth_token:
        raise ValueError("X session values must be single-line strings")

    path = save_x_session_record(
        {
            "ct0": ct0,
            "auth_token": auth_token,
            "saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "expires_at": exp,
            "session_cookie": session_cookie,
            "source": source,
        }
    )
    return {
        "path": path,
        "keys": ["AUTH_TOKEN", "CT0"],
    }


def check_tokens():
    """Check status of all tokens."""
    now = time.time()
    tokens = [
        ("Graph", "graph"),
        ("Outlook", "outlook"),
        ("SharePoint", "sharepoint"),
    ]

    all_ok = True
    for label, token_type in tokens:
        data, path = load_saved_token_record(token_type)
        if not data:
            print(f"  ❌ {label}: not found")
            print(f"     Expected: {token_store_path()}")
            all_ok = False
            continue

        token = data.get("access_token") or data.get("token") or ""
        if isinstance(token, str) and token.startswith("Bearer "):
            token = token[7:]
        payload = _decode_jwt_payload(token) if token else {}
        expires_at = data.get("expires_at") or payload.get("exp")
        if isinstance(expires_at, str) and expires_at.isdigit():
            expires_at = int(expires_at)
        if isinstance(expires_at, (int, float)) and now > expires_at:
            exp_time = datetime.fromtimestamp(expires_at, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            print(f"  ❌ {label}: expired at {exp_time}")
            all_ok = False
        elif isinstance(expires_at, (int, float)):
            remaining = int((expires_at - now) / 60)
            print(f"  ✅ {label}: valid ({remaining}m remaining)")
            print(f"     Path: {path}")
        else:
            print(f"  ⚠️  {label}: found but no expiry info")
            print(f"     Path: {path}")

    return all_ok


def _detect_token_type(aud):
    aud_values = aud if isinstance(aud, list) else [aud]
    aud_str = " ".join(str(value) for value in aud_values)
    if "graph.microsoft.com" in aud_str:
        return "graph"
    if any(pattern in aud_str for pattern in OUTLOOK_AUDIENCE_PATTERNS):
        return "outlook"
    if any(pattern in aud_str for pattern in SHAREPOINT_AUDIENCE_PATTERNS):
        return "sharepoint"
    raise ValueError(f"无法自动识别 token 类型 (audience: {aud})")


def save_token(token: str, token_type: str = "auto", quiet: bool = False, prompt_on_non_jwt: bool = True):
    """Save a token to the shared JSON store."""
    if token.startswith("Bearer "):
        token = token[7:]

    if not token.startswith("eyJ"):
        if prompt_on_non_jwt and not quiet:
            print("⚠️  Warning: token 不像 JWT 格式 (应以 'eyJ' 开头)")
            resp = input("   继续保存? (y/N) ").strip().lower()
            if resp != "y":
                sys.exit(1)
        else:
            raise ValueError("token 不像 JWT 格式 (应以 'eyJ' 开头)")

    payload = _decode_jwt_payload(token)
    exp = payload.get("exp", "unknown")
    if isinstance(exp, str) and exp.isdigit():
        exp = int(exp)
    aud = payload.get("aud", "unknown")

    if token_type == "auto":
        token_type = _detect_token_type(aud)

    existing, _ = load_saved_token_record(token_type)
    token_data = {
        "access_token": token,
        "audience": aud,
        "saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "expires_at": exp,
    }
    for key in ("refresh_token", "client_id", "tenant_id"):
        if existing and existing.get(key):
            token_data[key] = existing[key]
    path = save_token_record(token_type, token_data)

    if not quiet:
        print(f"✅ Token 已保存到 {path}")
        print(f"🎯 Audience: {aud}")
        print(f"📁 Type: {token_type}")
        if isinstance(exp, (int, float)):
            exp_time = datetime.fromtimestamp(exp, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            print(f"⏰ 过期时间: {exp_time}")

    return {
        "path": path,
        "audience": aud,
        "type": token_type,
        "expires_at": exp,
    }


def main():
    parser = argparse.ArgumentParser(description="Save Microsoft browser-extracted tokens")
    parser.add_argument("token", nargs="?", help="The JWT access token to save")
    parser.add_argument("--graph", action="store_true", help="Force save as Graph API token")
    parser.add_argument("--outlook", action="store_true", help="Force save as Outlook REST API token")
    parser.add_argument("--sharepoint", action="store_true", help="Force save as SharePoint/OneDrive token")
    parser.add_argument("--check", action="store_true", help="Check token status")
    args = parser.parse_args()

    if args.check:
        ok = check_tokens()
        sys.exit(0 if ok else 1)

    if not args.token:
        parser.print_help()
        print("\n获取方法：")
        print("  1. 打开 https://outlook.office.com 并登录")
        print("  2. F12 → Network")
        print("  3. Graph: filter graph.microsoft.com → 复制 Bearer token")
        print("     Outlook: filter outlook.office.com/api → 复制 Bearer token")
        print("     SharePoint: filter sharepoint.com → 复制 Bearer token")
        print("\n例如:")
        print(f'  python3 {sys.argv[0]} "eyJ0eXAiOiJKV1Q..."')
        sys.exit(1)

    if args.graph:
        token_type = "graph"
    elif args.outlook:
        token_type = "outlook"
    elif args.sharepoint:
        token_type = "sharepoint"
    else:
        token_type = "auto"

    try:
        save_token(args.token, token_type)
    except ValueError as exc:
        print(f"❌ {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
