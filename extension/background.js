// background.js — relays API calls from the content script/popup to the FastAPI backend.
// Centralizing this here keeps BACKEND_URL in one place and avoids duplicating fetch logic.

const BACKEND_URL = "http://localhost:8000";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "MAP_FIELDS") {
    fetch(`${BACKEND_URL}/map-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((err) => Promise.reject(err));
        return res.json();
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.detail || err.message || "Unknown error" }));

    return true; // keep the message channel open for the async response
  }
});
