// navigator.js — detects step transitions via MutationObserver and advances the flow.
// Explicitly refuses to automate login/account-creation/captcha screens.

function isLoginOrCaptchaStep() {
  const text = document.body.innerText.toLowerCase();
  return (
    (text.includes("sign in") && text.includes("password")) ||
    text.includes("create account") ||
    text.includes("captcha") ||
    text.includes("verify you are human")
  );
}

function findButtonByLabel(labels) {
  const candidates = Array.from(document.querySelectorAll("button, [role='button']"));
  return candidates.find((btn) => {
    if (btn.offsetParent === null || btn.disabled) return false;
    const label = btn.textContent.trim().toLowerCase();
    return labels.includes(label);
  });
}

function findNextButton() {
  const autoBtn = document.querySelector(
    "button[data-automation-id='bottom-navigation-next-button'], button[data-automation-id*='next'], button[data-automation-id*='saveAndContinue'], button[data-automation-id*='continue']"
  );
  if (autoBtn && !autoBtn.disabled && autoBtn.offsetParent !== null) return autoBtn;
  return findButtonByLabel(["save and continue", "save & continue", "next", "continue"]);
}

function findSubmitButton() {
  const autoBtn = document.querySelector(
    "button[data-automation-id='bottom-navigation-submit-button'], button[data-automation-id*='submit'], button[data-automation-id*='Submit']"
  );
  if (autoBtn && !autoBtn.disabled && autoBtn.offsetParent !== null) return autoBtn;
  return findButtonByLabel(["submit", "submit application"]);
}

function triggerClick(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: "auto", block: "center" });
  el.focus();
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new PointerEvent("pointerup", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.click();
}

function clickNext() {
  const btn = findNextButton();
  if (btn) {
    triggerClick(btn);
    return true;
  }
  return false;
}

function clickSubmit() {
  const btn = findSubmitButton();
  if (btn) {
    triggerClick(btn);
    return true;
  }
  return false;
}

function observeStepChanges(callback) {
  const root = document.querySelector("[data-automation-id='jobApplication'], main") || document.body;
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(callback, 800); // debounce rapid DOM churn during re-renders
  });
  observer.observe(root, { childList: true, subtree: true });
  return observer;
}

const expandedSections = new Set();

function resetExpandedSections() {
  expandedSections.clear();
}

function findSectionHeader(keyword) {
  const kw = keyword.toLowerCase().trim();
  const kwNoSpaces = kw.replace(/\s+/g, "");

  // 1. Check data-automation-id
  const autoCandidates = Array.from(document.querySelectorAll("[data-automation-id]")).filter((el) => {
    const aid = el.getAttribute("data-automation-id").toLowerCase();
    return (
      aid.includes(kwNoSpaces) ||
      aid.includes(kw.replace(/\s+/g, "-")) ||
      aid.includes(kw.replace(/\s+/g, "_"))
    );
  });
  if (autoCandidates.length > 0) {
    const headerEl = autoCandidates.find((el) => /header|title/i.test(el.getAttribute("data-automation-id")));
    return headerEl || autoCandidates[0];
  }

  // 2. Headings, legends, labels, and text nodes
  const candidates = Array.from(
    document.querySelectorAll("h1, h2, h3, h4, h5, h6, legend, [role='heading'], label, div, span, p")
  ).filter((el) => {
    if (el.children.length > 3) return false;
    const text = el.textContent.trim().toLowerCase();
    return (
      text === kw ||
      text === `${kw} *` ||
      text === `* ${kw}` ||
      text.startsWith(kw + " ") ||
      text.startsWith(kw + "\n") ||
      text.startsWith(kw + "*")
    );
  });

  if (candidates.length > 0) {
    return candidates.find((el) => el.getBoundingClientRect().height > 0) || candidates[0];
  }

  return null;
}

function isAddButtonCandidate(btn) {
  if (!btn || btn.disabled || btn.offsetParent === null) return false;
  const text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
  const aria = (btn.getAttribute("aria-label") || "").trim().toLowerCase();
  const autoId = (btn.getAttribute("data-automation-id") || "").trim().toLowerCase();

  // Exclude navigation and deletion buttons
  if (
    text.includes("save") ||
    text.includes("next") ||
    text.includes("back") ||
    text.includes("continue") ||
    text.includes("submit") ||
    text.includes("delete") ||
    text.includes("remove") ||
    text.includes("cancel") ||
    aria.includes("delete") ||
    aria.includes("remove")
  ) {
    return false;
  }

  // Check Add semantics
  const matchesText =
    text === "add" ||
    text === "add another" ||
    text === "add more" ||
    text.startsWith("add ");
  const matchesAria =
    aria === "add" ||
    aria.includes("add another") ||
    aria.startsWith("add ");
  const matchesAuto =
    autoId === "add" ||
    autoId === "add-button" ||
    autoId.includes("addanother") ||
    autoId.includes("add-another") ||
    autoId.startsWith("add");

  return matchesText || matchesAria || matchesAuto;
}

function findAddButtonForSection(keyword) {
  const kw = keyword.toLowerCase().trim();
  const header = findSectionHeader(kw);
  if (!header) {
    console.log(`[WDAutofill] Section header not found for "${kw}"`);
    return null;
  }

  // Determine next boundary element in DOM
  let nextHeader = null;
  if (kw.includes("work")) {
    nextHeader =
      findSectionHeader("education") ||
      findSectionHeader("certifications") ||
      findSectionHeader("skills") ||
      findSectionHeader("social") ||
      findSectionHeader("website");
  } else if (kw.includes("edu")) {
    nextHeader =
      findSectionHeader("certifications") ||
      findSectionHeader("skills") ||
      findSectionHeader("social") ||
      findSectionHeader("website") ||
      findSectionHeader("resume");
  }

  // 1. Check parent container if available
  const container = header.closest(
    "[data-automation-id*='section' i], [data-automation-id*='Section' i], [data-automation-id*='panel' i], fieldset, [role='group'], [role='region']"
  );
  if (container) {
    const containerBtns = Array.from(container.querySelectorAll("button, [role='button']")).filter(isAddButtonCandidate);
    if (containerBtns.length > 0) {
      return containerBtns[containerBtns.length - 1];
    }
  }

  // 2. DOM order scan: all Add buttons between header and nextHeader
  const allAddBtns = Array.from(document.querySelectorAll("button, [role='button']")).filter(isAddButtonCandidate);

  const sectionAddBtns = allAddBtns.filter((btn) => {
    const pos = header.compareDocumentPosition(btn);
    const isFollowing = (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    if (!isFollowing) return false;

    if (nextHeader) {
      const nextPos = nextHeader.compareDocumentPosition(btn);
      const isPreceding = (nextPos & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
      if (!isPreceding) return false;
    }
    return true;
  });

  if (sectionAddBtns.length > 0) {
    return sectionAddBtns[sectionAddBtns.length - 1];
  }

  return null;
}

function getWorkExperienceCount() {
  const inputs = Array.from(document.querySelectorAll("input, textarea")).filter((el) => {
    if (el.offsetParent === null && el.type !== "hidden") return false;
    const autoId = (el.getAttribute("data-automation-id") || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    return (
      autoId.includes("jobtitle") ||
      autoId.includes("job-title") ||
      id.includes("jobtitle") ||
      name.includes("jobtitle") ||
      aria.includes("job title")
    );
  });
  return inputs.length;
}

function getEducationCount() {
  const inputs = Array.from(document.querySelectorAll("input, select, button[aria-haspopup='listbox']")).filter((el) => {
    if (el.offsetParent === null && el.type !== "hidden") return false;
    const autoId = (el.getAttribute("data-automation-id") || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    return (
      autoId.includes("school") ||
      id.includes("school") ||
      name.includes("school") ||
      aria.includes("school") ||
      autoId.includes("institution") ||
      id.includes("institution") ||
      name.includes("institution") ||
      aria.includes("institution")
    );
  });
  if (inputs.length > 0) return inputs.length;

  const degrees = Array.from(document.querySelectorAll("input, select, button[aria-haspopup='listbox']")).filter((el) => {
    if (el.offsetParent === null && el.type !== "hidden") return false;
    const autoId = (el.getAttribute("data-automation-id") || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    return autoId.includes("degree") || id.includes("degree") || name.includes("degree") || aria.includes("degree");
  });
  return degrees.length;
}

async function waitForCount(getCountFn, expectedCount, timeoutMs = 3500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
    if (getCountFn() >= expectedCount) {
      return true;
    }
  }
  return false;
}

async function expandRepeatableSections(resumeData) {
  if (!resumeData) return;
  const currentStep = document.querySelector("h2, [data-automation-id*='pageHeader']")?.textContent.trim() || document.title;

  async function expandSection(sectionKey, resumeItems, keyword, getCountFn) {
    if (!Array.isArray(resumeItems) || resumeItems.length === 0) return;
    const sectionToken = currentStep + "::" + sectionKey;
    if (expandedSections.has(sectionToken)) return;

    const targetCount = resumeItems.length;
    let currentCount = getCountFn();

    let attempts = 0;
    while (currentCount < targetCount && attempts < 10) {
      const addBtn = findAddButtonForSection(keyword);
      if (!addBtn) {
        console.log(`[WDAutofill] No Add button found for "${keyword}" (current count: ${currentCount})`);
        break;
      }

      console.log(`[WDAutofill] Clicking Add button for "${keyword}" (current: ${currentCount}, target: ${targetCount})...`);
      triggerClick(addBtn);

      const increased = await waitForCount(getCountFn, currentCount + 1, 3500);
      if (!increased) {
        console.warn(`[WDAutofill] DOM count did not increase after clicking Add for "${keyword}"`);
      }
      currentCount = getCountFn();
      attempts++;
    }

    if (currentCount >= targetCount) {
      expandedSections.add(sectionToken);
    }
  }

  await expandSection("work", resumeData.experience, "work experience", getWorkExperienceCount);
  await expandSection("edu", resumeData.education, "education", getEducationCount);
}

window.WDAutofill = window.WDAutofill || {};
window.WDAutofill.isLoginOrCaptchaStep = isLoginOrCaptchaStep;
window.WDAutofill.clickNext = clickNext;
window.WDAutofill.clickSubmit = clickSubmit;
window.WDAutofill.observeStepChanges = observeStepChanges;
window.WDAutofill.expandRepeatableSections = expandRepeatableSections;
window.WDAutofill.findSectionHeader = findSectionHeader;
window.WDAutofill.resetExpandedSections = resetExpandedSections;

