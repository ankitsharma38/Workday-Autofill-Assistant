// content.js — orchestrates Scanner -> Mapper (via background) -> Filler -> Navigator loop.

const CONFIDENCE_THRESHOLD = 0.6;
let allFillLog = [];
let processing = false;
let currentStepName = "";
const processedFieldIds = new Set();

function getCurrentStepName() {
  const activeStep = document.querySelector("[aria-current='step'], [aria-current='true'], [data-automation-id*='activeStep']");
  if (activeStep && activeStep.textContent.trim()) {
    return activeStep.textContent.trim();
  }
  
  // Fallback to headings, but try to skip generic ones if possible
  const headings = Array.from(document.querySelectorAll("h2, h1, [data-automation-id*='pageHeader'], [class*='PageHeader']"));
  for (const h of headings) {
    const text = h.textContent.trim().toLowerCase();
    // Prefer headings that look like known Workday steps
    if (["my information", "my experience", "application questions", "voluntary disclosures", "review"].some(known => text.includes(known))) {
      return h.textContent.trim();
    }
  }

  if (headings.length > 0 && headings[0].textContent.trim()) {
    return headings[0].textContent.trim();
  }

  return location.pathname + location.hash;
}

function requestFieldMapping(resumeData, step, fields) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.id) {
      return reject(new Error("Extension reloaded. Please refresh the page."));
    }
    chrome.runtime.sendMessage(
      { type: "MAP_FIELDS", payload: { resume: resumeData, step, fields } },
      (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response || !response.ok) return reject(new Error(response?.error || "Mapping request failed"));
        resolve(response.data.mappings);
      }
    );
  });
}

async function processCurrentStep() {
  if (processing) return;
  if (!chrome.runtime?.id) return;
  processing = true;

  try {
    if (window.WDAutofill.isLoginOrCaptchaStep()) {
      return; // never automate auth/captcha steps — user completes these manually
    }

    const { resumeData } = await chrome.storage.local.get(["resumeData"]);
    if (!resumeData) return; // nothing to fill with yet — user hasn't uploaded a resume

    // Reset log and processed fields if step transitioned
    const stepName = getCurrentStepName();
    if (stepName !== currentStepName) {
      currentStepName = stepName;
      allFillLog = [];
      processedFieldIds.clear();
      if (window.WDAutofill.resetExpandedSections) {
        window.WDAutofill.resetExpandedSections();
      }
    }

    // Expand repeatable sections like Work Experience and Education
    if (window.WDAutofill.expandRepeatableSections) {
      await window.WDAutofill.expandRepeatableSections(resumeData);
      await new Promise((r) => setTimeout(r, 400)); // allow DOM to settle after expansion
    }

    const fields = window.WDAutofill.scanFields();
    if (!fields.length) return;

    // Only process if we haven't already attempted or filled these fields on this step
    const unfilledFields = fields.filter((f) => {
      if (processedFieldIds.has(f.selectorId)) return false;

      const el = document.querySelector(`[data-wd-autofill-id="${f.selectorId}"]`);
      if (!el) return true;
      if (f.type === "radio" || f.type === "checkbox") return true;
      if (f.type === "workday-dropdown") {
        const text = el.textContent.trim().toLowerCase();
        if (text && !text.includes("select one") && !text.includes("select...")) {
          processedFieldIds.add(f.selectorId);
          return false;
        }
        return true;
      }

      // Check if container already has a token/pill (e.g. Field of Study, Skills)
      const container = el.closest("[data-automation-id*='formField'], [data-automation-id*='prompt'], div") || el.parentElement;
      if (container) {
        const token = container.querySelector(
          "[data-automation-id*='selectedItem'], [class*='selectedItem'], [class*='pill'], [class*='token'], [class*='Tag'], [data-automation-id*='compositePill']"
        );
        if (token && token.textContent.trim().length > 1) {
          processedFieldIds.add(f.selectorId);
          return false;
        }
      }

      const isDatePlaceholder = ["mm/yyyy", "dd/mm/yyyy", "yyyy", "type to add"].includes((el.value || "").trim().toLowerCase());
      const containerHasError = container && (
        container.querySelector("[class*='error' i], [data-automation-id*='error' i]") ||
        container.textContent.toLowerCase().includes("error:") ||
        container.textContent.toLowerCase().includes("required and must have a value")
      );

      if (el.value && el.value.trim().length > 1 && !el.value.toLowerCase().includes("select") && !isDatePlaceholder && !containerHasError) {
        processedFieldIds.add(f.selectorId);
        return false;
      }
      return true;
    });

    if (!unfilledFields.length && allFillLog.length > 0) {
      return; // page is already processed
    }

    const fieldMetaBySelectorId = Object.fromEntries(fields.map((f) => [f.selectorId, f]));
    const mappings = await requestFieldMapping(resumeData, stepName, unfilledFields.length ? unfilledFields : fields);

    const stepLog = [];
    for (const m of mappings) {
      processedFieldIds.add(m.selectorId);
      const meta = fieldMetaBySelectorId[m.selectorId] || {};
      const result = await window.WDAutofill.applyMapping(m, meta, CONFIDENCE_THRESHOLD);
      stepLog.push({ ...result, label: meta.label, value: m.value });
    }

    // Deduplicate log by selectorId and identical label/value
    const logMap = new Map();
    for (const item of allFillLog) {
      logMap.set(item.selectorId, item);
    }
    for (const item of stepLog) {
      logMap.set(item.selectorId, item);
    }

    const seen = new Set();
    allFillLog = Array.from(logMap.values()).filter((item) => {
      const key = `${item.label}::${item.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    window.WDAutofill.renderReviewOverlay(allFillLog, handleConfirmSubmit);
  } catch (err) {
    console.error("[WDAutofill] Error processing step:", err);
  } finally {
    processing = false;
  }
}

function handleConfirmSubmit() {
  const submitted = window.WDAutofill.clickSubmit();
  if (!submitted) {
    const advanced = window.WDAutofill.clickNext();
    if (!advanced) {
      alert("Could not find a Next/Submit button on this step — please proceed manually.");
    }
  }
}

// Kick off on load, and again whenever the DOM changes meaningfully (Workday step transitions).
window.WDAutofill.observeStepChanges(() => processCurrentStep());
setTimeout(processCurrentStep, 1500); // initial run once the page settles
