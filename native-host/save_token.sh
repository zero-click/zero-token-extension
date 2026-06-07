#!/usr/bin/env bash
# Thin wrapper around save_token.py for shell convenience.
echo "⚠️  Please prefer: python3 native-host/save_token.py"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$SCRIPT_DIR/save_token.py" "$@"
