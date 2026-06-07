function timeAgo(ts) {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function timeRemaining(exp) {
  if (!exp) return { text: "unknown", valid: false };
  const remaining = exp * 1000 - Date.now();
  if (remaining <= 0) return { text: "expired", valid: false };
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  return { text: `${hours}h ${mins}m remaining`, valid: true };
}

function formatExpiry(exp) {
  if (!exp) return "unknown";
  return new Date(exp * 1000).toLocaleString();
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

const GROUP_CONFIG = [
  {
    id: "o365",
    label: "O365",
    description: "Microsoft browser tokens for Graph, Outlook, and SharePoint.",
  },
  {
    id: "x",
    label: "X",
    description: "Session values synced into ~/.zero-click/.env.json.",
  },
];

const PROVIDER_CONFIG = [
  {
    id: "graph",
    storageKey: "graph_token",
    label: "Graph API (Teams)",
    kind: "jwt",
    group: "o365",
    className: "graph",
    emptyHint: "Open Teams/Outlook web to capture token",
    fields: [
      { name: "token", label: "Token", copyLabel: "📋 Copy Token", primary: true },
    ],
  },
  {
    id: "outlook",
    storageKey: "outlook_token",
    label: "Outlook (Mail)",
    kind: "jwt",
    group: "o365",
    className: "outlook",
    emptyHint: "Open Teams/Outlook web to capture token",
    fields: [
      { name: "token", label: "Token", copyLabel: "📋 Copy Token", primary: true },
    ],
  },
  {
    id: "sharepoint",
    storageKey: "sharepoint_token",
    label: "SharePoint / OneDrive",
    kind: "jwt",
    group: "o365",
    className: "sharepoint",
    emptyHint: "Open Teams/Outlook web to capture token",
    fields: [
      { name: "token", label: "Token", copyLabel: "📋 Copy Token", primary: true },
    ],
  },
  {
    id: "x",
    storageKey: "x_session",
    label: "X Session",
    kind: "session",
    group: "x",
    className: "x",
    emptyHint: "Open x.com while logged in to capture session cookies",
    fields: [
      { name: "ct0", label: "CT0", copyLabel: "📋 Copy CT0", required: true },
      { name: "auth_token", label: "AUTH_TOKEN", copyLabel: "📋 Copy Auth Token", required: true },
    ],
  },
];

const PROVIDER_CONFIG_BY_ID = Object.fromEntries(
  PROVIDER_CONFIG.map((provider) => [provider.id, provider])
);
const STORAGE_KEYS = PROVIDER_CONFIG.map((provider) => provider.storageKey);

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function previewValue(value, length = 80) {
  if (!value) return "";
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function providerFields(config) {
  return config.fields || [{ name: "token", label: "Token", copyLabel: "📋 Copy Token", primary: true }];
}

function providerValue(data, fieldName) {
  return data?.[fieldName] || "";
}

function providerCopyLabel(config, fieldName) {
  return providerFields(config).find((field) => field.name === fieldName)?.copyLabel || "📋 Copy Value";
}

function sessionReady(config, data) {
  const requiredFields = providerFields(config).filter((field) => field.required);
  return requiredFields.every((field) => Boolean(providerValue(data, field.name)));
}

function sessionStatus(data, ready) {
  if (!ready) {
    return { statusClass: "expired", text: "Partial capture", detail: null };
  }

  if (data?.exp) {
    const remainingMs = data.exp * 1000 - Date.now();
    const { text, valid } = timeRemaining(data.exp);
    const isLongLived = remainingMs > 7 * 24 * 60 * 60 * 1000;
    return {
      statusClass: valid ? "valid" : "expired",
      text: valid ? (isLongLived ? "Persistent cookie" : text) : "⚠️ Expired",
      detail: valid
        ? `Expires ${formatExpiry(data.exp)}`
        : "Cookie expired; refresh x.com to capture a new one.",
    };
  }

  if (data?.session_cookie) {
    return {
      statusClass: "valid",
      text: "Session cookie",
      detail: "Expires when the browser session ends.",
    };
  }

  return {
    statusClass: "valid",
    text: "Ready to sync",
    detail: null,
  };
}

function renderProviderHeader(config, statusMarkup) {
  return `
    <div class="provider-header">
      <span class="token-type ${config.className}">${config.label}</span>
      ${statusMarkup}
    </div>
  `;
}

function renderProviderSection(config, data) {
  if (config.kind === "session") {
    return renderSessionProvider(config, data);
  }
  return renderJwtProvider(config, data);
}

function renderJwtProvider(config, data) {
  if (!data) {
    return `
      <div class="provider-block">
        ${renderProviderHeader(config, '<span class="status none">Not captured</span>')}
        <div class="token-info">${config.emptyHint}</div>
      </div>
    `;
  }

  const { text: remaining, valid } = timeRemaining(data.exp);
  const captured = timeAgo(data.captured_at);
  const statusClass = valid ? "valid" : "expired";
  const mainField = providerFields(config).find((field) => field.primary) || providerFields(config)[0];
  const preview = previewValue(providerValue(data, mainField.name));

  return `
    <div class="provider-block">
      ${renderProviderHeader(
        config,
        `<span class="status ${statusClass}">${valid ? remaining : "⚠️ Expired"}</span>`
      )}
      <div class="token-info">Captured ${captured}</div>
      <div class="token-preview" data-provider="${config.id}" data-field="${mainField.name}" title="Click to copy">${preview}</div>
      <div class="actions">
        <button class="btn btn-copy" data-provider="${config.id}" data-field="${mainField.name}">${providerCopyLabel(config, mainField.name)}</button>
      </div>
    </div>
  `;
}

function renderSessionProvider(config, data) {
  if (!data) {
    return `
      <div class="provider-block">
        ${renderProviderHeader(config, '<span class="status none">Not captured</span>')}
        <div class="token-info">${config.emptyHint}</div>
      </div>
    `;
  }

  const ready = sessionReady(config, data);
  const { statusClass, text: statusText, detail } = sessionStatus(data, ready);
  const captured = timeAgo(data.captured_at);
  const fieldMarkup = providerFields(config)
    .map((field, index) => {
      const value = providerValue(data, field.name);
      const spacing = index > 0 ? ' style="margin-top: 6px;"' : "";
      return `
        <div class="token-info"${spacing}>${field.label}</div>
        <div class="token-preview" data-provider="${config.id}" data-field="${field.name}" title="Click to copy">${previewValue(value)}</div>
        <div class="actions">
          <button class="btn btn-copy" data-provider="${config.id}" data-field="${field.name}">${providerCopyLabel(config, field.name)}</button>
        </div>
      `;
    })
    .join("");

  return `
    <div class="provider-block">
      ${renderProviderHeader(
        config,
        `<span class="status ${statusClass}">${statusText}</span>`
      )}
      <div class="token-info">Captured ${captured}${data.source ? ` from ${data.source}` : ""}</div>
      ${detail ? `<div class="token-info">${detail}</div>` : ""}
      ${fieldMarkup}
    </div>
  `;
}

function renderGroup(group, result) {
  const providers = PROVIDER_CONFIG.filter((provider) => provider.group === group.id);
  if (providers.length === 0) {
    return "";
  }

  return `
    <section class="token-section">
      <div class="section-card">
        <div class="section-header">
          <div class="section-title">${group.label}</div>
          <div class="section-subtitle">${group.description}</div>
        </div>
        <div class="section-body">
          ${providers.map((provider) => renderProviderSection(provider, result[provider.storageKey])).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderSyncStatus(lastSync) {
  const statusEl = document.getElementById("sync-status");
  if (!lastSync) {
    statusEl.className = "sync-status";
    statusEl.innerHTML = "<strong>Ready</strong>Click Sync to local after tokens are captured.";
    return;
  }

  const statusClass = lastSync.status === "error" ? "error" : "success";
  const savedSummary = (lastSync.saved || [])
    .map((item) => `${PROVIDER_CONFIG_BY_ID[item.type]?.label || item.type}: ${item.path}`)
    .join("<br>");
  const errorSummary = (lastSync.errors || [])
    .map((item) => `${PROVIDER_CONFIG_BY_ID[item.type]?.label || item.type || "unknown"} failed: ${item.error}`)
    .join("<br>");
  const detail = [savedSummary, errorSummary].filter(Boolean).join("<br>");

  statusEl.className = `sync-status ${statusClass}`;
  statusEl.innerHTML = `<strong>${lastSync.message}</strong>Last run ${timeAgo(lastSync.synced_at)}${detail ? `<br>${detail}` : ""}`;
}

function bindCopyHandlers(container, result) {
  container.querySelectorAll(".btn-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const providerId = btn.dataset.provider;
      const field = btn.dataset.field || "token";
      const config = PROVIDER_CONFIG_BY_ID[providerId];
      const tokenData = result[config?.storageKey];
      const value = tokenData?.[field];
      if (value) {
        navigator.clipboard.writeText(value).then(() => {
          btn.textContent = "✅ Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = providerCopyLabel(config, field);
            btn.classList.remove("copied");
          }, 2000);
        });
      }
    });
  });

  container.querySelectorAll(".token-preview").forEach((el) => {
    el.addEventListener("click", () => {
      const providerId = el.dataset.provider;
      const field = el.dataset.field || "token";
      const config = PROVIDER_CONFIG_BY_ID[providerId];
      const tokenData = result[config?.storageKey];
      const value = tokenData?.[field];
      if (value) {
        navigator.clipboard.writeText(value);
      }
    });
  });
}

function bindSyncButton() {
  const syncButton = document.getElementById("sync-button");
  syncButton.addEventListener("click", async () => {
    syncButton.disabled = true;
    syncButton.textContent = "Syncing...";

    try {
      const response = await sendMessage({ action: "syncTokens" });
      if (!response?.ok) {
        throw new Error(response?.status?.message || response?.error || "Sync failed.");
      }
    } catch (error) {
      const statusEl = document.getElementById("sync-status");
      statusEl.className = "sync-status error";
      statusEl.innerHTML = `<strong>${error.message}</strong>Check native host installation and try again.`;
    } finally {
      syncButton.disabled = false;
      syncButton.textContent = "Sync to local";
      render();
    }
  });
}

async function render() {
  try {
    await sendMessage({ action: "refreshSessions" });
  } catch (error) {
    console.warn("Failed to refresh session providers:", error);
  }

  const result = await getStorage([...STORAGE_KEYS, "last_sync"]);
  const container = document.getElementById("tokens");
  container.innerHTML = GROUP_CONFIG
    .map((group) => renderGroup(group, result))
    .join("");

  bindCopyHandlers(container, result);
  renderSyncStatus(result.last_sync);
}

render();
bindSyncButton();
// Auto-refresh every 30s
setInterval(render, 30000);
