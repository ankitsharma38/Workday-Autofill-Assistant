// review-overlay.js — floating summary panel + confirm-gated submit.
// This is the ONLY code path allowed to trigger a real Workday submit click.

function renderReviewOverlay(fillLog, onConfirm) {
  const existing = document.getElementById("wd-autofill-overlay");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = "wd-autofill-overlay";

  function cleanLabel(raw) {
    if (!raw) return "Field";
    let text = raw.replace(/\*$/, "").trim();
    if (text.toLowerCase().includes("type to add skills")) return "Skills";
    return text;
  }

  const rows = fillLog
    .map(
      (entry) => `
    <div class="wd-row ${entry.applied ? "wd-ok" : "wd-flag"}">
      <span class="wd-label">${cleanLabel(entry.label || entry.selectorId)}</span>
      <span class="wd-value">${entry.applied ? entry.value ?? "" : "Needs manual review"}</span>
    </div>
  `
    )
    .join("");

  const isSubmitStep = Boolean(
    document.querySelector("button[data-automation-id*='submit'], button[data-automation-id*='Submit']") ||
    Array.from(document.querySelectorAll("button")).some((b) => b.textContent.trim().toLowerCase() === "submit")
  );
  const actionText = isSubmitStep ? "Confirm &amp; Submit" : "Save &amp; Continue";

  panel.innerHTML = `
    <div class="wd-header">Workday Autofill — Review</div>
    <div class="wd-body">${rows || "<p>No fields filled yet.</p>"}</div>
    <div class="wd-footer">
      <button id="wd-confirm-btn">${actionText}</button>
      <button id="wd-close-btn">Close</button>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById("wd-confirm-btn").addEventListener("click", onConfirm);
  document.getElementById("wd-close-btn").addEventListener("click", () => panel.remove());
}

window.WDAutofill = window.WDAutofill || {};
window.WDAutofill.renderReviewOverlay = renderReviewOverlay;
