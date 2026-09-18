// scanner.js — extracts visible, fillable form fields from the current Workday step.
// Uses label/attribute-based semantic detection (no hardcoded selectors) so it survives
// Workday's frequent UI/DOM changes.

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function isGenericLabel(str) {
  if (!str || typeof str !== "string") return true;
  const clean = str.trim().toLowerCase().replace(/[*:]/g, "").trim();
  if (!clean || clean.length < 2) return true;
  const genericPatterns = [
    /^select one( required)?$/i,
    /^select( required)?$/i,
    /^select\.\.\.$/i,
    /^choose one$/i,
    /^required$/i,
    /^search$/i,
    /^input$/i,
    /^field$/i,
    /^dropdown$/i,
    /^type to add$/i,
    /^enter value$/i,
    /^option$/i,
    /^options$/i,
  ];
  return genericPatterns.some((p) => p.test(clean));
}

function findLabelForElement(el) {
  if (el.type === "file") {
    return "Attach Resume / Documents";
  }

  // 1. Explicit <label for="id">
  if (el.id) {
    const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (labelEl && !isGenericLabel(labelEl.textContent)) {
      return labelEl.textContent.trim();
    }
  }

  // 2. aria-labelledby
  const ariaLabelledBy = el.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const ids = ariaLabelledBy.split(/\s+/).filter(Boolean);
    for (const id of ids) {
      const target = document.getElementById(id);
      if (target && !isGenericLabel(target.textContent)) {
        return target.textContent.trim();
      }
    }
  }

  // 3. aria-label (only if meaningful and not generic placeholder)
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel && !isGenericLabel(ariaLabel)) {
    return ariaLabel.trim();
  }

  // 4. Walk up parent hierarchy to find question prompt or field container label
  let curr = el.parentElement;
  let depth = 0;
  while (curr && curr !== document.body && depth < 6) {
    // Check for explicit label or legend inside this container
    const labelEl = curr.querySelector("label, legend, [data-automation-id*='label'], [data-automation-id*='Label']");
    if (labelEl && !isGenericLabel(labelEl.textContent) && labelEl !== el) {
      return labelEl.textContent.trim();
    }

    // Check for question heading or prompt text (p, h3, h4, or question class)
    const questionEl = curr.querySelector(
      "[data-automation-id*='question'], [data-automation-id*='Question'], [class*='question'], h3, h4, h5, p, [role='heading']"
    );
    if (questionEl && !isGenericLabel(questionEl.textContent) && questionEl !== el && !questionEl.contains(el)) {
      return questionEl.textContent.trim();
    }

    // Check preceding siblings of current parent level for question text
    let sib = curr.previousElementSibling;
    while (sib) {
      const sibText = sib.textContent.trim();
      if (sibText && !isGenericLabel(sibText) && (sibText.includes("?") || sibText.includes("*") || sibText.length > 10)) {
        return sibText;
      }
      sib = sib.previousElementSibling;
    }

    curr = curr.parentElement;
    depth++;
  }

  const fallback = el.name || el.getAttribute("data-automation-id") || "";
  if (fallback === "select-files") return "Attach Resume / Documents";
  return fallback;
}

function getFormRoot() {
  return document.querySelector("[data-automation-id='jobApplication'], [data-automation-id='form'], main") || document.body;
}

function collectRadioGroups(root) {
  const radios = Array.from(root.querySelectorAll("input[type='radio']")).filter(isVisible);
  const groups = {};
  radios.forEach((r) => {
    const key = r.name || findLabelForElement(r);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return groups;
}

function getRepeatableEntryIndex(el, sectionKeyword) {
  const isWork = sectionKeyword.includes("work");
  const selector = isWork
    ? "input[data-automation-id*='jobTitle' i], input[id*='jobTitle' i], input[name*='jobTitle' i], input[aria-label*='job title' i]"
    : "input[data-automation-id*='school' i], input[id*='school' i], input[name*='school' i], input[aria-label*='school' i], input[data-automation-id*='institution' i], input[aria-label*='institution' i]";

  const indicators = Array.from(document.querySelectorAll(selector)).filter((i) => i.offsetParent !== null || i.type !== "hidden");
  if (indicators.length <= 1) return 1;

  let countBefore = 0;
  for (const ind of indicators) {
    if (ind === el) {
      countBefore++;
      break;
    }
    const pos = ind.compareDocumentPosition(el);
    if ((pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      countBefore++;
    } else {
      break;
    }
  }
  return Math.max(1, countBefore);
}

function getSectionContext(el) {
  const findHeader = window.WDAutofill?.findSectionHeader;
  if (!findHeader) return null;

  const workHeader = findHeader("work experience");
  const eduHeader = findHeader("education");

  if (workHeader) {
    const afterWork = (workHeader.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const beforeEdu = !eduHeader || ((eduHeader.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
    if (afterWork && beforeEdu) {
      const idx = getRepeatableEntryIndex(el, "work experience");
      return `Work Experience ${idx}`;
    }
  }

  if (eduHeader) {
    const afterEdu = (eduHeader.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const otherHeader = findHeader("skills") || findHeader("certifications") || findHeader("social") || findHeader("website") || findHeader("resume");
    const beforeOther = !otherHeader || ((otherHeader.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
    if (afterEdu && beforeOther) {
      const idx = getRepeatableEntryIndex(el, "education");
      return `Education ${idx}`;
    }
  }

  return null;
}

function findContextHeading(el) {
  let curr = el.parentElement;
  let depth = 0;
  while (curr && curr !== document.body && depth < 8) {
    // Check if container has an aria-label indicating a group
    if ((curr.tagName === "SECTION" || curr.tagName === "FIELDSET" || curr.getAttribute("role") === "group" || curr.getAttribute("role") === "region") && curr.getAttribute("aria-label")) {
      return curr.getAttribute("aria-label").trim();
    }
    
    // Check for a heading that is a direct child or close descendant of a container
    const heading = curr.querySelector(":scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > [data-automation-id*='heading']");
    if (heading && !isGenericLabel(heading.textContent) && heading !== el && !heading.contains(el)) {
       return heading.textContent.trim();
    }

    curr = curr.parentElement;
    depth++;
  }
  return null;
}

function scanFields() {
  const root = getFormRoot();
  if (!root) return [];

  const fields = [];
  let counter = 0;

  const assignSelectorId = (el) => {
    counter += 1;
    const id = `wd-field-${counter}`;
    el.setAttribute("data-wd-autofill-id", id);
    return id;
  };
  
  const getFullLabel = (el) => {
      const baseLabel = findLabelForElement(el);
      const secCtx = getSectionContext(el);
      if (secCtx) {
        if (baseLabel && !baseLabel.toLowerCase().includes(secCtx.toLowerCase())) {
          return `${secCtx} - ${baseLabel}`;
        }
        return baseLabel;
      }
      const context = findContextHeading(el);
      if (context && baseLabel && context.toLowerCase() !== baseLabel.toLowerCase() && !baseLabel.toLowerCase().includes(context.toLowerCase())) {
          return `${context} - ${baseLabel}`;
      }
      return baseLabel;
  };

  // Text-like inputs
  root
    .querySelectorAll(
      "input[type='text'], input[type='email'], input[type='tel'], input[type='date'], input[type='search'], input[role='combobox'], input:not([type]), textarea"
    )
    .forEach((el) => {
      if (!isVisible(el) || el.disabled) return;
      const selectorId = assignSelectorId(el);
      fields.push({
        selectorId,
        label: getFullLabel(el),
        type: el.tagName.toLowerCase() === "textarea" ? "textarea" : el.type || "text",
        placeholder: el.getAttribute("placeholder") || undefined,
      });
    });

  // Selects (standard HTML selects)
  root.querySelectorAll("select").forEach((el) => {
    if (!isVisible(el) || el.disabled) return;
    const selectorId = assignSelectorId(el);
    const options = Array.from(el.options).map((o) => o.textContent.trim()).filter(Boolean);
    fields.push({ selectorId, label: getFullLabel(el), type: "select", options });
  });

function isUtilityOrNavButton(el) {
  if (el.closest("header, nav, [data-automation-id*='utility'], [data-automation-id*='Header']")) return true;
  const autoId = (el.getAttribute("data-automation-id") || "").toLowerCase();
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  const id = (el.id || "").toLowerCase();
  if (autoId.includes("utility") || ariaLabel.includes("settings") || ariaLabel.includes("language") || id.includes("utility")) return true;
  const text = el.textContent.trim().toLowerCase();
  if (["english", "settings", "sign in", "sign out", "candidate home", "utilitymenubutton"].includes(text)) return true;
  return false;
}

  // Workday custom dropdown buttons (Degree, Country Code, State, etc.)
  root
    .querySelectorAll(
      "button[aria-haspopup='listbox'], button[data-automation-id*='dropdown'], button[data-automation-id*='select'], [role='button'][aria-haspopup='listbox'], div[role='combobox']:not(input)"
    )
    .forEach((el) => {
      if (!isVisible(el) || el.disabled) return;
      if (isUtilityOrNavButton(el)) return;
      const text = el.textContent.trim().toLowerCase();
      // Avoid action buttons
      if (["next", "save and continue", "back", "delete", "add", "add another", "cancel", "submit"].includes(text)) return;
      const label = getFullLabel(el);
      if (!label || isGenericLabel(label) || label.toLowerCase().includes("utilitymenu") || label.toLowerCase() === "settings") return;
      const isYesNoQuestion =
        /^(are|do|will|have|can|is|did|has|should|would)\s/i.test(label) ||
        label.includes("?") ||
        label.toLowerCase().includes("sponsorship") ||
        label.toLowerCase().includes("authorized") ||
        label.toLowerCase().includes("18 years");

      const selectorId = assignSelectorId(el);
      fields.push({
        selectorId,
        label,
        type: "workday-dropdown",
        options: isYesNoQuestion ? ["Yes", "No"] : [],
      });
    });

  // Checkboxes
  root.querySelectorAll("input[type='checkbox']").forEach((el) => {
    if (!isVisible(el) || el.disabled) return;
    const selectorId = assignSelectorId(el);
    fields.push({ selectorId, label: getFullLabel(el), type: "checkbox", options: ["true", "false"] });
  });

  // Radio groups — one field entry per group, options = each radio's label
  const radioGroups = collectRadioGroups(root);
  Object.entries(radioGroups).forEach(([groupKey, radios]) => {
    counter += 1;
    const groupSelectorId = `wd-radio-group-${counter}`;
    const options = radios.map((r) => (r.value || findLabelForElement(r)).trim());
    radios.forEach((r, idx) => r.setAttribute("data-wd-autofill-id", `${groupSelectorId}::${idx}`));
    fields.push({
      selectorId: groupSelectorId,
      label: getFullLabel(radios[0]) || groupKey,
      type: "radio",
      options,
    });
  });

  // File uploads — flagged for manual attach, never auto-filled (browser security + assignment rule)
  root.querySelectorAll("input[type='file']").forEach((el) => {
    if (!isVisible(el)) return;
    const selectorId = assignSelectorId(el);
    fields.push({ selectorId, label: getFullLabel(el), type: "file" });
  });

  return fields;
}

window.WDAutofill = window.WDAutofill || {};
window.WDAutofill.scanFields = scanFields;
