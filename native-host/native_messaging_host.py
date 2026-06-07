#!/usr/bin/env python3
"""Chrome Native Messaging host for saving captured O365 and X credentials locally."""

import json
import struct
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from save_token import save_token, save_x_session


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise EOFError("Invalid message length header")

    message_length = struct.unpack("<I", raw_length)[0]
    payload = sys.stdin.buffer.read(message_length)
    if len(payload) != message_length:
        raise EOFError("Incomplete message body")
    return json.loads(payload.decode("utf-8"))


def send_message(message):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def iter_items(message):
    items = message.get("items")
    return items or []


def handle_jwt_item(item):
    token = item.get("token")
    token_type = item.get("type", "auto")
    if not token:
        raise ValueError("Missing token")

    result = save_token(
        token,
        token_type=token_type,
        quiet=True,
        prompt_on_non_jwt=False,
    )
    return {
        "type": result["type"],
        "path": str(result["path"]),
        "audience": result["audience"],
        "expires_at": result["expires_at"],
    }


def handle_session_item(item):
    session_type = item.get("type")
    if session_type != "x":
        raise ValueError(f"Unsupported session type: {session_type}")

    result = save_x_session(
        item.get("ct0"),
        item.get("auth_token"),
        exp=item.get("exp"),
        session_cookie=item.get("session_cookie"),
        source=item.get("source"),
    )
    return {
        "type": session_type,
        "path": str(result["path"]),
        "keys": result["keys"],
    }


def handle_save_tokens(message):
    items = iter_items(message)
    if not items:
        return {"ok": False, "error": "No tokens provided"}

    saved = []
    errors = []

    for item in items:
        item_type = item.get("type", "unknown")
        try:
            if item.get("kind") == "session":
                saved.append(handle_session_item(item))
            else:
                saved.append(handle_jwt_item(item))
        except Exception as exc:  # surface exact failure to the popup
            errors.append({"type": item_type, "error": str(exc)})

    if not saved and errors:
        return {"ok": False, "error": errors[0]["error"], "errors": errors}

    return {"ok": True, "saved": saved, "errors": errors}


def main():
    while True:
        message = read_message()
        if message is None:
            break

        action = message.get("action")
        if action == "saveTokens":
            send_message(handle_save_tokens(message))
        else:
            send_message({"ok": False, "error": f"Unsupported action: {action}"})


if __name__ == "__main__":
    main()
