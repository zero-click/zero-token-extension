#!/usr/bin/env python3
"""Migrate legacy token files into ~/.zero-click/.env.json."""

from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone

from token_store import (
    TOKEN_FILENAMES,
    backup_store,
    legacy_token_path,
    load_saved_token_record,
    load_saved_x_session,
    load_store,
    save_store,
    token_store_path,
)


def _format_timestamp(value) -> str:
    if not isinstance(value, (int, float)):
        return "unknown"
    return datetime.fromtimestamp(value, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def migrate(*, overwrite: bool, dry_run: bool) -> int:
    store = load_store()
    updated = deepcopy(store)
    actions: list[str] = []
    warnings: list[str] = []

    for token_type in TOKEN_FILENAMES:
        current = updated["o365"].get(token_type)
        legacy_record, legacy_path = load_saved_token_record(token_type, allow_legacy=True)
        if not legacy_record or legacy_path == token_store_path():
            continue

        if current and current.get("access_token") and not overwrite:
            warnings.append(
                f"Skip {token_type}: new store already has a token (existing expires { _format_timestamp(current.get('expires_at')) }, legacy source {legacy_path})."
            )
            continue

        updated["o365"][token_type] = legacy_record
        actions.append(f"Migrate {token_type} from {legacy_path}")
        if isinstance(legacy_record.get("expires_at"), (int, float)) and legacy_record["expires_at"] < datetime.now(timezone.utc).timestamp():
            warnings.append(f"{token_type} token is expired in legacy source; migrating metadata anyway.")

    current_x = updated.get("x") or {}
    legacy_x, legacy_path = load_saved_x_session(allow_legacy=True)
    if legacy_x and legacy_path != token_store_path():
        if (current_x.get("ct0") or current_x.get("auth_token")) and not overwrite:
            warnings.append(f"Skip x: new store already has X session values (legacy source {legacy_path}).")
        else:
            updated["x"] = legacy_x
            actions.append(f"Migrate x session from {legacy_path}")

    if not actions:
        print("No migration changes needed.")
        for warning in warnings:
            print(f"WARNING: {warning}")
        return 0

    print("Planned migration:")
    for action in actions:
        print(f"  - {action}")
    for warning in warnings:
        print(f"WARNING: {warning}")

    if dry_run:
        print("Dry run only; no files were changed.")
        return 0

    backup_path = backup_store()
    if backup_path:
        print(f"Backup created: {backup_path}")
    path = save_store(updated)
    print(f"Migrated credentials to: {path}")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Migrate legacy token files into ~/.zero-click/.env.json")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite values already present in the new store")
    parser.add_argument("--dry-run", action="store_true", help="Show planned migration actions without writing")
    args = parser.parse_args()
    raise SystemExit(migrate(overwrite=args.overwrite, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
