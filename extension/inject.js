// Content script — intercepts fetch/XHR to capture Authorization headers
// This works even when requests are made from the page context

(function () {
  const HERMES_ID = "zero-token-extension";
  // Keep this list aligned with background.js JWT_PROVIDERS and manifest host permissions.
  const JWT_PROVIDER_URLS = [
    { id: "graph", patterns: ["graph.microsoft.com"] },
    {
      id: "outlook",
      patterns: [
        "outlook.office.com",
        "outlook.office365.com",
        "substrate.office.com",
        "outlook.cloud.microsoft",
      ],
    },
    { id: "sharepoint", patterns: ["sharepoint.com"] },
  ];
  const TOKEN_URL_PATTERNS = JWT_PROVIDER_URLS.flatMap((provider) => provider.patterns);

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input?.url) return input.url;
    if (input instanceof URL) return input.href;
    return "";
  }

  function isTokenUrl(url) {
    return TOKEN_URL_PATTERNS.some((pattern) => url.includes(pattern));
  }

  function headerValue(headers, name) {
    if (!headers) return null;
    if (headers instanceof Headers) return headers.get(name);
    if (Array.isArray(headers)) {
      const found = headers.find(([key]) => key?.toLowerCase() === name.toLowerCase());
      return found?.[1] || null;
    }
    if (typeof headers === "object") {
      return headers[name] || headers[name.toLowerCase()] || null;
    }
    return null;
  }

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    try {
      const [input, init] = args;
      const url = requestUrl(input);

      if (isTokenUrl(url)) {
        const authValue =
          headerValue(init?.headers, "Authorization") ||
          headerValue(input?.headers, "Authorization");

        if (authValue && authValue.startsWith("Bearer ")) {
          window.postMessage(
            { type: HERMES_ID, token: authValue.slice(7), url },
            "*"
          );
        }
      }
    } catch (e) {}
    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._hermes_url = requestUrl(url) || String(url || "");
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (
      name.toLowerCase() === "authorization" &&
      value.startsWith("Bearer ") &&
      this._hermes_url &&
      isTokenUrl(this._hermes_url)
    ) {
      window.postMessage(
        { type: HERMES_ID, token: value.slice(7), url: this._hermes_url },
        "*"
      );
    }
    return originalSetHeader.apply(this, [name, value]);
  };
})();
