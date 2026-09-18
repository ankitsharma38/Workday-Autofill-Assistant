// filler.js — applies AI-mapped values to scanned fields using native browser events
// (React-controlled Workday inputs ignore plain .value assignment without these events).

function isValidPreFilled(val) {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  const placeholders = ["mm/yyyy", "dd/mm/yyyy", "yyyy", "select one", "select...", "type to add"];
  if (placeholders.includes(trimmed.toLowerCase())) return false;
  if (/^mm\/\d{4}$/i.test(trimmed)) return false; // invalid uncompleted date like MM/2025
  return true;
}

function setReactInputValue(el, value, sendEnter = false) {
  if (!el) return;
  el.focus();
  el.dispatchEvent(new Event("focusin", { bubbles: true }));

  const prototype = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  // Reset React's internal value tracker so React recognizes the change
  const tracker = el._valueTracker;
  if (tracker) {
    tracker.setValue("");
  }

  // Try authentic execCommand first
  if (typeof el.select === "function") {
    try { el.select(); } catch (e) {}
  }
  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, String(value));
  } catch (e) {
    inserted = false;
  }

  if (!inserted || el.value !== String(value)) {
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  try {
    el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: String(value) }));
  } catch (e) {}

  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: String(value) }));
  } catch (e) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  el.dispatchEvent(new Event("change", { bubbles: true }));

  if (sendEnter) {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
  }

  el.blur();
  el.dispatchEvent(new Event("focusout", { bubbles: true }));
}

async function fillDateInput(el, value) {
  if (!el || !value) return false;
  const valStr = String(value).trim();

  // Normalize format to MM/YYYY
  let formatted = valStr;
  if (/^\d{4}[-/]\d{1,2}$/.test(valStr)) {
    const [y, m] = valStr.split(/[-/]/);
    formatted = `${m.padStart(2, "0")}/${y}`;
  } else if (/^\d{1,2}[-/]\d{4}$/.test(valStr)) {
    const [m, y] = valStr.split(/[-/]/);
    formatted = `${m.padStart(2, "0")}/${y}`;
  }

  el.scrollIntoView({ behavior: "auto", block: "center" });
  el.focus();
  el.click();
  el.dispatchEvent(new Event("focusin", { bubbles: true }));

  // Select any existing text or placeholder
  if (typeof el.select === "function") {
    try { el.select(); } catch (e) {}
  }
  try {
    document.execCommand("selectAll", false, null);
  } catch (e) {}

  // 1. Try native bulk insertText
  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, formatted);
  } catch (e) {
    inserted = false;
  }

  // 2. If bulk insert didn't format or match, simulate character typing
  if (!inserted || el.value !== formatted) {
    try {
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
    } catch (e) {}

    for (const char of formatted) {
      if (char === "/" && el.value.endsWith("/")) continue;

      const keyOpts = { key: char, code: isNaN(char) ? "Slash" : `Digit${char}`, bubbles: true };
      el.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
      el.dispatchEvent(new KeyboardEvent("keypress", keyOpts));

      let charDone = false;
      try {
        charDone = document.execCommand("insertText", false, char);
      } catch (e) {}

      if (!charDone) {
        const proto = window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        const trk = el._valueTracker;
        if (trk) trk.setValue("");
        if (desc && desc.set) {
          desc.set.call(el, el.value + char);
        } else {
          el.value += char;
        }
      }

      try {
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: char }));
      } catch (e) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      el.dispatchEvent(new KeyboardEvent("keyup", keyOpts));
    }
  }

  // 3. Final guarantee on native property descriptor & valueTracker
  const prototype = window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  const tracker = el._valueTracker;
  if (tracker) tracker.setValue("");
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, formatted);
  } else {
    el.value = formatted;
  }

  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: formatted }));
  } catch (e) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));

  // 4. Press Enter and Tab to commit in DatePicker state
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab", code: "Tab", keyCode: 9, which: 9 }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Tab", code: "Tab", keyCode: 9, which: 9 }));

  // 5. Native blur so focusout triggers internal validation/commit
  el.blur();
  el.dispatchEvent(new Event("focusout", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("blur", { bubbles: false }));

  await new Promise((r) => setTimeout(r, 100));
  return true;
}

function fillTextLike(el, value) {
  if (!el) return false;
  if (isValidPreFilled(el.value)) return true; // preserve valid pre-filled data

  setReactInputValue(el, value, false);
  return true;
}

function getDegreeKeyword(text) {
  if (!text) return "";
  const t = text.toLowerCase().replace(/['’.\-]/g, "");
  if (/bachelor|b\.?tech|b\.?e|b\.?s|b\.?a|undergraduate/i.test(t)) return "bachelor";
  if (/master|m\.?tech|m\.?e|m\.?s|m\.?b\.?a|postgraduate/i.test(t)) return "master";
  if (/doctor|ph\.?d/i.test(t)) return "doctor";
  if (/associate/i.test(t)) return "associate";
  if (/high\s*school|secondary|diploma/i.test(t)) return "high school";
  return t;
}

async function fillComboboxLike(el, value) {
  if (!el || !value) return false;
  const container = el.closest("[data-automation-id*='formField'], [data-automation-id*='prompt'], div") || el.parentElement;

  // 1. Check if container already has a valid selected pill token
  if (container) {
    const existingToken = container.querySelector(
      "[data-automation-id*='selectedItem'], [class*='selectedItem'], [class*='pill'], [class*='token'], [class*='Tag'], [data-automation-id*='compositePill']"
    );
    if (existingToken && existingToken.textContent.trim().length > 1) {
      return true;
    }
  }

  // 2. Remove any pre-existing invalid token
  if (container) {
    const errorTokens = container.querySelectorAll(
      "[data-automation-id*='selectedItem'], [class*='selectedItem'], [class*='pill'], [class*='token'], [class*='Tag']"
    );
    for (const tok of errorTokens) {
      const deleteBtn = tok.querySelector("button, [role='button'], [data-automation-id*='delete'], [aria-label*='Remove'], svg");
      if (deleteBtn) {
        deleteBtn.click();
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  const isDegree = (el.getAttribute("aria-label") || "").toLowerCase().includes("degree") ||
                   (el.getAttribute("data-automation-id") || "").toLowerCase().includes("degree");
  const degreeKw = isDegree ? getDegreeKeyword(String(value)) : null;

  const valStr = String(value).trim();
  const searchQueries = [valStr];
  if (degreeKw && degreeKw !== valStr.toLowerCase()) {
    searchQueries.unshift(degreeKw);
  }
  const cleanWords = valStr.split(/\s+/).filter((w) => w.length >= 4 && !["and", "with", "from", "for"].includes(w.toLowerCase()));
  if (cleanWords.length > 1) {
    searchQueries.push(cleanWords[0]);
  }

  for (const query of searchQueries) {
    el.scrollIntoView({ behavior: "auto", block: "center" });
    el.focus();
    el.click();

    try {
      if (typeof el.select === "function") el.select();
      document.execCommand("selectAll", false, null);
    } catch (e) {}

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, query);
    } catch (e) {}

    if (!inserted || el.value !== query) {
      setReactInputValue(el, query, false);
    }

    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: query }));
    } catch (e) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));

    // Send Enter key to trigger Workday AJAX search query
    const enterOpts = { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 };
    el.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
    el.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
    el.dispatchEvent(new KeyboardEvent("keyup", enterOpts));

    // Wait and check if options appeared
    await new Promise((r) => setTimeout(r, 450));
    let options = Array.from(
      document.querySelectorAll(
        "[role='listbox'] [role='option'], [role='option'], [data-automation-id*='prompt-option'], [id*='promptOption'], [data-automation-id*='menu-item'], li[role='presentation']"
      )
    ).filter((elem) => elem.getBoundingClientRect().width > 0);

    // If options didn't appear, click the prompt search icon (:≡)
    if (!options.length && container) {
      const promptBtn = container.querySelector(
        "button[data-automation-id*='prompt'], [role='button'][data-automation-id*='prompt'], [data-automation-id*='promptIcon'], button[aria-label*='prompt' i], [aria-label*='prompt' i], [data-automation-id*='search' i], svg"
      );
      if (promptBtn) {
        promptBtn.click();
        await new Promise((r) => setTimeout(r, 550));
        options = Array.from(
          document.querySelectorAll(
            "[role='listbox'] [role='option'], [role='option'], [data-automation-id*='prompt-option'], [id*='promptOption'], [data-automation-id*='menu-item'], li[role='presentation']"
          )
        ).filter((elem) => elem.getBoundingClientRect().width > 0);
      }
    }

    if (options.length > 0) {
      const targetClean = valStr.toLowerCase().replace(/['’.\-]/g, "").trim();

      let match = options.find((opt) => {
        const text = opt.textContent.trim().toLowerCase().replace(/['’.\-]/g, "");
        return text === targetClean || text.includes(targetClean) || targetClean.includes(text);
      });

      if (!match && degreeKw) {
        match = options.find((opt) => {
          const text = opt.textContent.toLowerCase().replace(/['’.\-]/g, "");
          return text.includes(degreeKw);
        });
      }

      if (!match) {
        match = options.find((opt) => {
          const text = opt.textContent.toLowerCase();
          return cleanWords.some((w) => text.includes(w.toLowerCase()));
        });
      }

      if (!match) {
        match = options[0];
      }

      if (match) {
        match.scrollIntoView({ behavior: "auto", block: "nearest" });
        const clickOpts = { bubbles: true, cancelable: true, view: window };
        match.dispatchEvent(new PointerEvent("pointerdown", clickOpts));
        match.dispatchEvent(new MouseEvent("mousedown", clickOpts));
        match.dispatchEvent(new PointerEvent("pointerup", clickOpts));
        match.dispatchEvent(new MouseEvent("mouseup", clickOpts));
        match.click();
        await new Promise((r) => setTimeout(r, 400));

        el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape", code: "Escape", keyCode: 27, which: 27 }));
        el.blur();
        document.body.click();
        return true;
      }
    }
  }

  el.blur();
  return true;
}

async function fillWorkdayDropdown(btn, value) {
  if (!btn) return false;
  const valStr = String(value).trim();
  const currentText = btn.textContent.trim().toLowerCase();
  const degreeKw = getDegreeKeyword(valStr);

  if (degreeKw && currentText.includes(degreeKw) && !currentText.includes("select one") && !currentText.includes("select...")) {
    return true; // already filled with correct degree category
  }

  btn.focus();
  const clickOpts = { bubbles: true, cancelable: true, view: window };
  btn.dispatchEvent(new PointerEvent("pointerdown", clickOpts));
  btn.dispatchEvent(new MouseEvent("mousedown", clickOpts));
  btn.dispatchEvent(new PointerEvent("pointerup", clickOpts));
  btn.dispatchEvent(new MouseEvent("mouseup", clickOpts));
  btn.click();
  await new Promise((r) => setTimeout(r, 450));

  let options = Array.from(
    document.querySelectorAll(
      "[role='listbox'] [role='option'], [role='option'], [role='menuitem'], [role='treeitem'], [data-automation-id*='prompt-option'], [data-automation-id*='dropdown-option'], [data-automation-id*='select-option'], li[role='presentation'], div[id*='promptOption']"
    )
  ).filter((elem) => elem.getBoundingClientRect().width > 0);

  if (options.length > 0) {
    const cleanVal = valStr.toLowerCase().replace(/['’.\-]/g, "").trim();

    // 1. Exact or cleaned match
    let match = options.find((opt) => {
      const cleanOpt = opt.textContent.trim().toLowerCase().replace(/['’.\-]/g, "");
      return cleanOpt === cleanVal || cleanOpt.includes(cleanVal) || cleanVal.includes(cleanOpt);
    });

    // 2. Degree category match (bachelor, master, doctor, etc.)
    if (!match && degreeKw) {
      match = options.find((opt) => {
        const cleanOpt = opt.textContent.toLowerCase().replace(/['’.\-]/g, "");
        return cleanOpt.includes(degreeKw);
      });
    }

    // 3. Word overlap match
    if (!match) {
      const words = cleanVal.split(/\s+/).filter((w) => w.length >= 4);
      match = options.find((opt) => {
        const optText = opt.textContent.toLowerCase();
        return words.some((w) => optText.includes(w));
      });
    }

    if (match) {
      match.scrollIntoView({ behavior: "auto", block: "nearest" });
      match.dispatchEvent(new PointerEvent("pointerdown", clickOpts));
      match.dispatchEvent(new MouseEvent("mousedown", clickOpts));
      match.dispatchEvent(new PointerEvent("pointerup", clickOpts));
      match.dispatchEvent(new MouseEvent("mouseup", clickOpts));
      match.click();
      await new Promise((r) => setTimeout(r, 350));
      return true;
    }
  }

  // Check if searchbox inside popup
  const searchBox = document.querySelector("[role='listbox'] input, [data-automation-id='searchBox']");
  if (searchBox) {
    setReactInputValue(searchBox, degreeKw || valStr, true);
    await new Promise((r) => setTimeout(r, 400));
    const filteredOpt = document.querySelector("[role='listbox'] [role='option'], [role='option']");
    if (filteredOpt) {
      filteredOpt.dispatchEvent(new MouseEvent("mousedown", clickOpts));
      filteredOpt.dispatchEvent(new MouseEvent("mouseup", clickOpts));
      filteredOpt.click();
      await new Promise((r) => setTimeout(r, 350));
      return true;
    }
  }

  // Close popup if no match found
  btn.click();
  return false;
}

function fillSelect(el, value) {
  if (!el) return false;
  const valStr = String(value).trim().toLowerCase();
  const option = Array.from(el.options).find((o) => o.textContent.trim().toLowerCase() === valStr || o.textContent.trim().toLowerCase().includes(valStr));
  if (!option) return false;
  el.value = option.value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function fillCheckbox(el, value) {
  if (!el) return false;
  const shouldCheck = value === "true" || value === true;
  if (el.checked !== shouldCheck) el.click();
  return true;
}

function fillRadioGroup(groupSelectorId, value) {
  const radios = document.querySelectorAll(`[data-wd-autofill-id^="${groupSelectorId}::"]`);
  const valStr = String(value).trim().toLowerCase();
  for (const r of radios) {
    const label = (r.value || r.closest("label")?.textContent || "").trim().toLowerCase();
    if (label === valStr || label.includes(valStr) || valStr.includes(label)) {
      r.click();
      return true;
    }
  }
  return false;
}

function flagFieldForReview(selectorId, fieldMeta) {
  const el = document.querySelector(
    `[data-wd-autofill-id="${selectorId}"], [data-wd-autofill-id^="${selectorId}::"]`
  );
  if (el) el.style.outline = "2px solid #e0a800";
  window.WDAutofill.pendingReview = window.WDAutofill.pendingReview || [];
  window.WDAutofill.pendingReview.push({ selectorId, label: fieldMeta.label, type: fieldMeta.type });
}

async function fillSkillsMultiSelect(inputEl, skillsValue) {
  if (!inputEl) return false;
  let skillsList = [];
  if (Array.isArray(skillsValue)) {
    skillsList = skillsValue;
  } else if (typeof skillsValue === "string") {
    skillsList = skillsValue.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  }
  skillsList = skillsList.slice(0, 5); // Limit to top 5 skills
  if (!skillsList.length) return false;

  for (const skill of skillsList) {
    const container = inputEl.closest("[data-automation-id*='skill'], [data-automation-id*='multiselect']") || inputEl.parentElement;
    if (container && container.innerText.toLowerCase().includes(skill.toLowerCase())) {
      continue; // skill pill already present
    }

    inputEl.focus();
    setReactInputValue(inputEl, skill, false);
    await new Promise((r) => setTimeout(r, 500));

    const options = Array.from(
      document.querySelectorAll("[role='listbox'] [role='option'], [role='option'], [data-automation-id*='prompt-option']")
    ).filter((elem) => elem.getBoundingClientRect().width > 0);

    let selected = false;
    if (options.length > 0) {
      const match = options.find((opt) => opt.textContent.trim().toLowerCase().includes(skill.toLowerCase())) || options[0];
      if (match) {
        match.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        match.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        match.click();
        selected = true;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    if (!selected) {
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
      inputEl.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  // Clear any residual search text in input
  if (inputEl.value) {
    setReactInputValue(inputEl, "", false);
  }
  return true;
}

async function applyMapping(mapping, fieldMeta, confidenceThreshold = 0.6) {
  const { selectorId, value, confidence } = mapping;

  if (value === null || value === undefined || confidence < confidenceThreshold) {
    flagFieldForReview(selectorId, fieldMeta);
    return { selectorId, applied: false };
  }

  if (fieldMeta.type === "radio") {
    const applied = fillRadioGroup(selectorId, value);
    if (!applied) flagFieldForReview(selectorId, fieldMeta);
    return { selectorId, applied };
  }

  const el = document.querySelector(`[data-wd-autofill-id="${selectorId}"]`);
  if (!el) return { selectorId, applied: false };

  let applied = false;
  const labelLower = (fieldMeta.label || "").toLowerCase();
  const isSkillField = labelLower.includes("skill") || (el.getAttribute("aria-label") || "").toLowerCase().includes("skill");

  if (isSkillField && (el.getAttribute("role") === "combobox" || el.getAttribute("type") === "search" || el.tagName === "INPUT")) {
    applied = await fillSkillsMultiSelect(el, value);
  } else if (labelLower.includes("degree")) {
    if (el.tagName === "BUTTON" || fieldMeta.type === "workday-dropdown" || el.getAttribute("aria-haspopup") === "listbox") {
      applied = await fillWorkdayDropdown(el, value);
    }
    if (!applied) {
      applied = await fillComboboxLike(el, value);
    }
  } else if (fieldMeta.type === "workday-dropdown") {
    applied = await fillWorkdayDropdown(el, value);
  } else if (fieldMeta.type === "select") {
    applied = fillSelect(el, value);
  } else if (fieldMeta.type === "checkbox") {
    applied = fillCheckbox(el, value);
  } else if (fieldMeta.type === "file") {
    applied = false; // never automate file uploads
  } else if (
    el.getAttribute("role") === "combobox" ||
    el.getAttribute("type") === "search" ||
    labelLower.includes("field of study") ||
    labelLower.includes("major") ||
    labelLower.includes("school") ||
    labelLower.includes("institution")
  ) {
    applied = await fillComboboxLike(el, value);
  } else if (
    fieldMeta.type === "date" ||
    labelLower.includes("from") ||
    labelLower.includes("to") ||
    labelLower.includes("start date") ||
    labelLower.includes("end date") ||
    labelLower.includes("date") ||
    (el.getAttribute("placeholder") || "").toLowerCase().includes("yyyy") ||
    (el.getAttribute("data-automation-id") || "").toLowerCase().includes("date")
  ) {
    applied = await fillDateInput(el, value);
  } else {
    applied = fillTextLike(el, value);
  }

  if (!applied) flagFieldForReview(selectorId, fieldMeta);
  return { selectorId, applied };
}

window.WDAutofill = window.WDAutofill || {};
window.WDAutofill.applyMapping = applyMapping;
