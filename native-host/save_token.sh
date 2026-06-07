#!/usr/bin/env bash
# DEPRECATED: Use save_token.py instead
# This script is kept for backward compatibility only.
echo "⚠️  DEPRECATED: Please use python3 scripts/save_token.py instead"
echo ""

# Forward to Python version
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$SCRIPT_DIR/save_token.py" "$@"
