#!/usr/bin/env python3
"""Install the Chrome Native Messaging manifest for Zero Token Extension."""

import argparse
import json
import os
import sys
from pathlib import Path

HOST_NAME = "dev.zerotoken.extension_bridge"


def default_manifest_dir():
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/Google/Chrome/NativeMessagingHosts"
    if sys.platform.startswith("linux"):
        return Path.home() / ".config/google-chrome/NativeMessagingHosts"
    raise SystemExit("Unsupported platform for this installer")


def install_manifest(extension_id: str, manifest_dir: Path):
    host_script = Path(__file__).resolve().parent / "native_messaging_host.py"
    if not host_script.exists():
        raise FileNotFoundError(f"Host script not found: {host_script}")

    host_script.chmod(host_script.stat().st_mode | 0o755)
    manifest_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "name": HOST_NAME,
        "description": "Save Zero Token Extension credentials from Chrome to the local ~/.zero-click/.env.json store",
        "path": str(host_script),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{extension_id}/"],
    }

    manifest_path = manifest_dir / f"{HOST_NAME}.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    if hasattr(os, "chmod"):
        manifest_path.chmod(0o644)
    return manifest_path


def main():
    parser = argparse.ArgumentParser(description="Install Chrome Native Messaging host for Zero Token Extension")
    parser.add_argument("--extension-id", required=True, help="Chrome extension ID from chrome://extensions")
    parser.add_argument("--manifest-dir", help="Override manifest directory")
    args = parser.parse_args()

    manifest_dir = Path(args.manifest_dir).expanduser() if args.manifest_dir else default_manifest_dir()
    manifest_path = install_manifest(args.extension_id.strip(), manifest_dir)

    print(f"✅ Native host manifest installed: {manifest_path}")
    print("Next steps:")
    extension_dir = Path(__file__).resolve().parent.parent / "extension"
    print(f"  1. Load or reload the unpacked Chrome extension from {extension_dir}")
    print("  2. Open Outlook, Teams, SharePoint, or X to capture fresh credentials")
    print("  3. Click 'Sync to local' in the extension popup")
    print("  4. If the unpacked extension path changed, Chrome will assign a new extension ID — rerun this installer with the new ID.")


if __name__ == "__main__":
    main()
