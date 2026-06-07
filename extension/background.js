// Background service worker — captures Bearer tokens from Microsoft API requests

const HOST_NAME = "dev.zerotoken.extension_bridge";
const X_COOKIE_URLS = ["https://x.com", "https://twitter.com"];
const X_COOKIE_NAMES = ["ct0", "auth_token"];
const JWT_PROVIDERS = [
  {
    id: "graph",
    storageKey: "graph_token",
    audiencePatterns: ["graph.microsoft.com"],
    requestUrls: ["https://graph.microsoft.com/*"],
  },
  {
    id: "outlook",
    storageKey: "outlook_token",
    audiencePatterns: [
      "outlook.office.com",
      "outlook.office365.com",
      "substrate.office.com",
      "outlook.cloud.microsoft",
      "00000002-0000-0ff1-ce00-000000000000",
    ],
    requestUrls: [
      "https://outlook.office.com/*",
      "https://outlook.office365.com/*",
      "https://outlook.cloud.microsoft/*",
      "https://substrate.office.com/*",
    ],
  },
  {
    id: "sharepoint",
    storageKey: "sharepoint_token",
    audiencePatterns: [
      "sharepoint.com",
      "00000003-0000-0ff1-ce00-000000000000",
    ],
    requestUrls: ["https://*.sharepoint.com/*"],
  },
];
const SESSION_PROVIDERS = [
  {
    id: "x",
    storageKey: "x_session",
    refresh: refreshXSessionFromCookies,
    isComplete: (session) => Boolean(session?.ct0 && session?.auth_token),
    toNativeItem: (session) => ({
      kind: "session",
      type: "x",
      ct0: session.ct0,
      auth_token: session.auth_token,
      exp: session.exp,
      session_cookie: session.session_cookie,
      source: session.source,
    }),
  },
];
const ALL_STORAGE_KEYS = [
  ...JWT_PROVIDERS.map((provider) => provider.storageKey),
  ...SESSION_PROVIDERS.map((provider) => provider.storageKey),
];
const ALL_URLS = [
  ...new Set([
    ...JWT_PROVIDERS.flatMap((provider) => provider.requestUrls),
    "https://*.microsoft.com/*",
    "https://*.office.com/*",
    "https://*.office365.com/*",
  ]),
];

console.log("[Zero Token] Service worker started! v1.0.12");

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function getCookie(details) {
  return new Promise((resolve, reject) => {
    chrome.cookies.get(details, (cookie) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(cookie || null);
    });
  });
}

function audienceIncludes(aud, patterns) {
  const values = Array.isArray(aud) ? aud : [aud || ""];
  return values.some((value) =>
    patterns.some((pattern) => String(value).includes(pattern))
  );
}

async function getXCookie(name) {
  for (const url of X_COOKIE_URLS) {
    const cookie = await getCookie({ url, name });
    if (cookie?.value) {
      return {
        value: cookie.value,
        domain: cookie.domain,
        url,
        expirationDate: cookie.expirationDate || null,
        session: Boolean(cookie.session),
      };
    }
  }
  return null;
}

async function refreshXSessionFromCookies() {
  const [ct0Cookie, authTokenCookie] = await Promise.all([
    getXCookie("ct0"),
    getXCookie("auth_token"),
  ]);

  if (!ct0Cookie && !authTokenCookie) {
    await storageRemove("x_session");
    return null;
  }

  const session = {
    ct0: ct0Cookie?.value || null,
    auth_token: authTokenCookie?.value || null,
    captured_at: Date.now(),
    source: ct0Cookie?.domain || authTokenCookie?.domain || "x.com",
    exp: [ct0Cookie?.expirationDate, authTokenCookie?.expirationDate]
      .filter((value) => typeof value === "number")
      .sort((a, b) => a - b)[0] || null,
    session_cookie: Boolean(ct0Cookie?.session || authTokenCookie?.session),
  };

  await storageSet({ x_session: session });
  return session;
}

function syncErrorMessage(error) {
  if (error.message.includes("Specified native messaging host not found")) {
    return "Native host not installed. Run install_native_host.py with your Chrome extension ID first.";
  }
  return error.message;
}

async function recordSyncStatus(status) {
  await storageSet({ last_sync: status });
  return status;
}

function getStoredJwtItems(stored) {
  return JWT_PROVIDERS.flatMap((provider) => {
    const data = stored[provider.storageKey];
    if (!data?.token) {
      return [];
    }

    return [
      {
        kind: "jwt",
        type: provider.id,
        token: data.token,
        captured_at: data.captured_at,
        exp: data.exp,
        aud: data.aud,
        url: data.url,
      },
    ];
  });
}

async function refreshSessionProviders() {
  const results = await Promise.all(
    SESSION_PROVIDERS.map(async (provider) => [provider.id, await provider.refresh()])
  );
  return Object.fromEntries(results);
}

function getSessionItems(sessionResults) {
  return SESSION_PROVIDERS.flatMap((provider) => {
    const session = sessionResults[provider.id];
    if (!provider.isComplete(session)) {
      return [];
    }
    return [provider.toNativeItem(session)];
  });
}

async function syncStoredTokens() {
  const stored = await storageGet([...ALL_STORAGE_KEYS, "last_sync"]);
  const sessionResults = await refreshSessionProviders();
  const items = [
    ...getStoredJwtItems(stored),
    ...getSessionItems(sessionResults),
  ];

  if (items.length === 0) {
    throw new Error(
      "No captured Microsoft or X credentials available yet. Open Outlook/Teams/SharePoint or X first."
    );
  }

  try {
    const response = await sendNativeMessage({
      action: "saveTokens",
      source: "zero-token-extension",
      items,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Native host failed to save tokens.");
    }

    return recordSyncStatus({
      status: response.errors?.length ? "partial" : "success",
      synced_at: Date.now(),
      message: response.errors?.length
        ? `Synced ${response.saved.length}/${items.length} item(s); ${response.errors.length} failed.`
        : `Synced ${response.saved.length} item(s) to local files.`,
      saved: response.saved || [],
      errors: response.errors || [],
    });
  } catch (error) {
    return recordSyncStatus({
      status: "error",
      synced_at: Date.now(),
      message: syncErrorMessage(error),
      saved: [],
      errors: [{ error: error.message }],
    });
  }
}

function findJwtProviderByAudience(aud) {
  return JWT_PROVIDERS.find((provider) => audienceIncludes(aud, provider.audiencePatterns));
}

function saveToken(token, url) {
  // Decode JWT to determine audience
  let exp = null;
  let aud = null;
  try {
    const payloadPart = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = payloadPart + "=".repeat((4 - (payloadPart.length % 4)) % 4);
    const payload = JSON.parse(atob(paddedPayload));
    exp = payload.exp;
    aud = payload.aud || "";
    console.log(`[Zero Token] JWT decoded — aud: ${aud}, exp: ${new Date(exp * 1000).toISOString()}`);
  } catch (e) {
    console.log(`[Zero Token] Failed to decode JWT: ${e.message}`);
    return;
  }

  // Route by JWT audience
  const provider = findJwtProviderByAudience(aud);
  if (!provider) {
    console.log(`[Zero Token] Unknown audience: ${aud}, skipping`);
    return;
  }

  console.log(`[Zero Token] ✅ Saving as ${provider.storageKey}`);

  const data = {
    token,
    captured_at: Date.now(),
    exp,
    aud,
    url,
  };

  chrome.storage.local.set({ [provider.storageKey]: data });
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const authHeader = details.requestHeaders?.find(
      (h) => h.name.toLowerCase() === "authorization"
    );
    if (!authHeader || !authHeader.value.startsWith("Bearer ")) return;
    console.log(`[Zero Token] webRequest captured from ${details.url.slice(0, 80)}`);
    saveToken(authHeader.value.slice(7), details.url);
  },
  { urls: ALL_URLS },
  ["requestHeaders", "extraHeaders"]
);

// Method 2: message from content script (works when fetch is intercepted in page context)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveToken") {
    console.log(`[Zero Token] Content script captured from ${message.url.slice(0, 80)}`);
    saveToken(message.token, message.url);
    return;
  }

  if (message.action === "refreshSessions") {
    refreshSessionProviders()
      .then((sessions) => {
        sendResponse({ ok: true, sessions });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.action === "syncTokens") {
    syncStoredTokens()
      .then((status) => {
        sendResponse({ ok: status.status !== "error", status });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => {
  refreshSessionProviders().catch((error) => {
    console.warn("[Zero Token] Failed to refresh session providers on startup:", error.message);
  });
});

chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie } = changeInfo;
  if (!X_COOKIE_NAMES.includes(cookie.name)) {
    return;
  }
  if (!/(\.|^)x\.com$|(\.|^)twitter\.com$/.test(cookie.domain)) {
    return;
  }

  refreshSessionProviders().catch((error) => {
    console.warn("[Zero Token] Failed to refresh session providers from cookies:", error.message);
  });
});
