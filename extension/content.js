// Content script — bridges between page context and extension

// Inject the fetch/XHR interceptor into the page context
const script = document.createElement("script");
script.src = chrome.runtime.getURL("inject.js");
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the injected script
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "zero-token-extension") return;

  const { token, url } = event.data;
  console.log(`[Zero Token] Content captured from ${url.slice(0, 60)}`);

  // Send to background service worker
  chrome.runtime.sendMessage({ action: "saveToken", token, url });
});
