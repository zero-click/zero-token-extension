# Zero Token Extension

[中文说明](./README.zh-CN.md)

Local-first Chrome extension for capturing Microsoft 365 API tokens and X session cookies, then syncing them into a shared JSON store for CLI automation.

## What it does

- Captures Microsoft Graph, Outlook, and SharePoint Bearer tokens from browser traffic
- Captures X `ct0` and `auth_token` cookies through Chrome cookie APIs
- Syncs everything into `~/.zero-click/.env.json`
- Keeps credentials local; nothing is sent to a remote server

## Requirements

- Google Chrome with Developer Mode enabled
- Python 3 for the native messaging host
- A local checkout of this repository

## Repository layout

```text
zero-token-extension/
├── extension/    # Load-unpacked Chrome extension
├── native-host/  # Local sync bridge, store helpers, migration tools
├── LICENSE
├── README.md
└── README.zh-CN.md
```

## Supported sources

| Site | Credential | Typical use |
|------|------------|-------------|
| [Outlook Web](https://outlook.cloud.microsoft/mail/) | Graph + Outlook | Mail, calendar, Teams-adjacent Graph calls |
| [Teams Web](https://teams.microsoft.com/) | Graph | Teams chat and Graph-backed actions |
| [OneDrive / SharePoint](https://pgone-my.sharepoint.com/) | SharePoint | Files, recordings, transcripts |
| [X](https://x.com/) | `ct0` + `auth_token` | X session automation |

## Install the extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `zero-token-extension/extension/`

## Enable local sync

1. Copy the extension ID from `chrome://extensions/`
2. Run:

```bash
python3 native-host/install_native_host.py --extension-id YOUR_EXTENSION_ID
```

3. Reload the unpacked extension

If you previously loaded a different unpacked path, Chrome may assign a new extension ID. Re-run the installer with the new ID when that happens.

## Daily usage

1. Use Outlook, Teams, SharePoint, OneDrive, or X normally
2. Open the extension popup
3. Review the captured credentials
4. Click **Sync to local**

The popup shows capture status, token freshness, cookie persistence, and sync results.

## Local store format

Credentials are stored in `~/.zero-click/.env.json` with a schema-versioned structure:

```json
{
  "schema_version": 1,
  "o365": {
    "graph": {},
    "outlook": {},
    "sharepoint": {}
  },
  "x": {
    "ct0": "",
    "auth_token": ""
  }
}
```

## CLI helpers

Save a copied token directly:

```bash
python3 native-host/save_token.py "eyJ..."
```

The helper auto-detects the token type and updates the shared store.

## Migrate legacy files

If you still have credentials under `~/.zero-o365/tokens/`, `~/.hermes/`, or `~/.zero-click/.env`:

```bash
python3 native-host/migrate_store.py --dry-run
python3 native-host/migrate_store.py
```

Existing values in `~/.zero-click/.env.json` are preserved by default. Use `--overwrite` only when you intentionally want legacy values to replace newer ones.

## Privacy and security

- Credentials stay in Chrome local storage until you explicitly sync them
- Native sync writes only to local files on your machine
- The repository contains code only; do not commit your real `~/.zero-click/.env.json`

## Development notes

- Extension version: `1.0.12`
- Native messaging host name: `dev.zerotoken.extension_bridge`
- After moving the repository to a different path, rerun `native-host/install_native_host.py`
