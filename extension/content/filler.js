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

function getFieldOfStudyQueries(valStr) {
  const queries = [valStr];
  const lower = valStr.toLowerCase();

  if (lower.includes("computer") || lower.includes("software") || lower.includes("it") || lower.includes("tech")) {
    if (!queries.some((q) => q.toLowerCase() === "computer science")) queries.push("Computer Science");
    if (!queries.some((q) => q.toLowerCase() === "computer engineering")) queries.push("Computer Engineering");
    if (!queries.some((q) => q.toLowerCase() === "computer")) queries.push("Computer");
    if (!queries.some((q) => q.toLowerCase() === "engineering")) queries.push("Engineering");
    if (!queries.some((q) => q.toLowerCase() === "information technology")) queries.push("Information Technology");
  } else if (lower.includes("engineering")) {
    if (!queries.some((q) => q.toLowerCase() === "engineering")) queries.push("Engineering");
    const words = valStr.split(/\s+/).filter((w) => w.length > 3);
    for (const w of words) {
      if (!queries.some((q) => q.toLowerCase() === w.toLowerCase())) queries.push(w);
    }
  } else if (lower.includes("business") || lower.includes("management") || lower.includes("commerce")) {
    if (!queries.some((q) => q.toLowerCase() === "business administration")) queries.push("Business Administration");
    if (!queries.some((q) => q.toLowerCase() === "business")) queries.push("Business");
    if (!queries.some((q) => q.toLowerCase() === "management")) queries.push("Management");
  } else {
    const words = valStr.split(/\s+/).filter((w) => w.length >= 4 && !["and", "with", "from", "for", "the"].includes(w.toLowerCase()));
    for (const w of words) {
      if (!queries.some((q) => q.toLowerCase() === w.toLowerCase())) queries.push(w);
    }
  }
  return queries;
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

  const labelLower = (el.getAttribute("aria-label") || el.getAttribute("data-automation-id") || container?.textContent?.slice(0, 50) || "").toLowerCase();
  const isDegree = labelLower.includes("degree");
  const degreeKw = isDegree ? getDegreeKeyword(String(value)) : null;
  const isFieldOfStudy = labelLower.includes("field of study") || labelLower.includes("major");

  const valStr = String(value).trim();
  let searchQueries = [valStr];
  if (isFieldOfStudy) {
    searchQueries = getFieldOfStudyQueries(valStr);
  } else if (degreeKw && degreeKw !== valStr.toLowerCase()) {
    searchQueries.unshift(degreeKw);
  } else {
    const cleanWords = valStr.split(/\s+/).filter((w) => w.length >= 4 && !["and", "with", "from", "for"].includes(w.toLowerCase()));
    if (cleanWords.length > 1) {
      searchQueries.push(cleanWords[0]);
    }
  }

  const cleanWords = valStr.split(/\s+/).filter((w) => w.length >= 4 && !["and", "with", "from", "for"].includes(w.toLowerCase()));

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

    // Check if Workday displayed "No matches found"
    const hasNoMatches = Array.from(document.querySelectorAll("*")).some(
      (n) => n.children.length === 0 && n.textContent.trim().toLowerCase() === "no matches found"
    );

    if (hasNoMatches) {
      console.log(`[WDAutofill Combobox] Query "${query}" returned "No matches found". Trying fallback.`);
      continue; // do not pick default list options if "No matches found" was returned
    }

    if (options.length > 0) {
      const targetClean = valStr.toLowerCase().replace(/['’.\-]/g, "").trim();

      let match = options.find((opt) => {
        const text = opt.textContent.trim().toLowerCase().replace(/['’.\-]/g, "");
        return text === targetClean || text.includes(targetClean) || targetClean.includes(text);
      });

      if (!match && isDegree && degreeKw) {
        match = options.find((opt) => {
          const text = opt.textContent.toLowerCase().replace(/['’.\-]/g, "");
          return text.includes(degreeKw);
        });
      }

      if (!match && isFieldOfStudy) {
        const studyKeywords = ["computer science", "computer", "software", "engineering", "information technology"];
        for (const kw of studyKeywords) {
          if (valStr.toLowerCase().includes(kw) || query.toLowerCase().includes(kw)) {
            match = options.find((opt) => opt.textContent.toLowerCase().includes(kw));
            if (match) break;
          }
        }
      }

      if (!match) {
        match = options.find((opt) => {
          const text = opt.textContent.toLowerCase();
          return cleanWords.some((w) => text.includes(w.toLowerCase()));
        });
      }

      if (match) {
        match.scrollIntoView({ behavior: "auto", block: "nearest" });
        const radio = match.querySelector("input[type='radio'], [role='radio'], input[type='checkbox'], [role='checkbox']");
        if (radio) {
          radio.click();
        }
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

function setInputValueWithoutBlur(el, value) {
  if (!el) return;
  el.focus();
  el.dispatchEvent(new Event("focusin", { bubbles: true }));

  const prototype = window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  const tracker = el._valueTracker;
  if (tracker) {
    tracker.setValue(value === "" ? "___reset___" : "");
  }

  if (descriptor && descriptor.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }

  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: String(value) }));
  } catch (e) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function fillSkillsMultiSelect(inputEl, skillsValue) {
  if (!inputEl) return false;

  console.log("[WDAutofill Skills] Starting fillSkillsMultiSelect with raw value:", skillsValue);

  let skillsList = [];
  if (Array.isArray(skillsValue)) {
    skillsList = skillsValue.slice();
  } else if (typeof skillsValue === "string") {
    skillsList = skillsValue.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  }

  const preferred = ["React", "JavaScript", "Node.js", "SQL", "Python", "Java", "HTML", "CSS", "Git", "C++"];
  const prioritized = [];
  for (const p of preferred) {
    const found = skillsList.find((s) => s.toLowerCase() === p.toLowerCase() || s.toLowerCase().includes(p.toLowerCase()));
    if (found && !prioritized.includes(found)) prioritized.push(found);
  }
  for (const s of skillsList) {
    if (!prioritized.includes(s)) prioritized.push(s);
  }
  if (!prioritized.length) prioritized.push("React", "Node.js", "SQL");

  console.log("[WDAutofill Skills] Skills to try:", prioritized);

  const baseContainer =
    inputEl.closest("[data-automation-id*='formField'], [data-automation-id*='prompt'], [data-automation-id*='multiselect']") ||
    inputEl.parentElement?.parentElement ||
    inputEl.parentElement;

  function getExistingPills() {
    if (!baseContainer) return [];

    // Strategy 1: count × close-buttons — Workday pills show an × (times) button.
    // Each pill has exactly one, so button count = pill count.
    const allBtns = Array.from(baseContainer.querySelectorAll("button")).filter(btn => {
      if (btn.getBoundingClientRect().width === 0) return false;
      const txt = btn.textContent.trim();
      // × buttons: text is × \u00d7 ✕ \u2715 or aria-label has remove/delete/close/dismiss
      const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
      return txt === "\u00d7" || txt === "\u2715" || txt === "\u00d7" || txt === "x" ||
             ariaLabel.includes("remove") || ariaLabel.includes("delete") ||
             ariaLabel.includes("close") || ariaLabel.includes("dismiss");
    });
    if (allBtns.length > 0) {
      // Return pill names by reading sibling text of each × button
      return allBtns.map((btn, i) => {
        const pill = btn.closest("li, [class*='pill'], [class*='tag'], [class*='token'], [class*='chip'], [class*='selected'], [class*='item']") ||
                     btn.parentElement;
        const txt = pill ? pill.textContent.replace(/[\u00d7\u2715\u00d7x]/gi, "").trim().toLowerCase() : ("pill_" + i);
        return txt || ("pill_" + i);
      });
    }

    // Strategy 2: aria-label Remove buttons
    const removeBtns = Array.from(baseContainer.querySelectorAll("[aria-label*='Remove' i], [aria-label*='Delete' i], [data-automation-id*='delete' i]"));
    if (removeBtns.length > 0) {
      return removeBtns.map((b, i) => (b.getAttribute("aria-label") || ("pill_" + i)).replace(/remove|delete/gi, "").trim().toLowerCase());
    }

    // Strategy 3: selectedItem / compositePill data-automation-id elements
    const pillSelectors = [
      "[data-automation-id*='selectedItem']",
      "[data-automation-id*='compositePill']",
      "[data-automation-id*='multiSelect-selectedItem']"
    ].join(", ");
    const elements = Array.from(baseContainer.querySelectorAll(pillSelectors));
    return elements
      .filter(el => el.querySelector("button") || el.children.length <= 2)
      .map(el => el.textContent.trim().toLowerCase())
      .filter(t => t.length > 0 && t.length < 80);
  }

  // Find the skills search popup by locating the "Search Results" header
  // that Workday displays after typing in the skills input.
  function findSkillsPopupOptions() {
    // Strategy 1: find any visible text node saying "Search Results..."
    const allEls = Array.from(document.querySelectorAll("*"));
    let searchResultsEl = null;
    for (const el of allEls) {
      if (el.children.length === 0 && el.getBoundingClientRect().width > 0) {
        const txt = el.textContent.trim();
        if (txt.startsWith("Search Results")) {
          searchResultsEl = el;
          break;
        }
      }
    }

    if (searchResultsEl) {
      console.log("[WDAutofill Skills] Found Search Results header:", searchResultsEl.textContent.trim());
      // Walk UP to the popup container and collect checkbox rows
      let popup = searchResultsEl.parentElement;
      for (let i = 0; i < 6 && popup && popup !== document.body; i++) {
        const rows = collectCheckboxRows(popup);
        if (rows && rows.length > 0) return rows;
        popup = popup.parentElement;
      }
    }

    // Strategy 2: look for checkboxItem elements near our input
    const checkboxItems = Array.from(document.querySelectorAll("[data-automation-id*='checkboxItem']"))
      .filter(el => el.getBoundingClientRect().width > 0);
    if (checkboxItems.length > 0) {
      console.log("[WDAutofill Skills] Found", checkboxItems.length, "checkboxItems directly");
      return checkboxItems;
    }

    return null;
  }

  function collectCheckboxRows(container) {
    const rows = Array.from(container.querySelectorAll(
      "[data-automation-id*='checkboxItem'], [role='option'], [role='treeitem'], label"
    )).filter(el => {
      if (el.getBoundingClientRect().width === 0) return false;
      const txt = el.textContent.trim();
      return txt && !txt.startsWith("Search Results") && txt.length > 0;
    });
    return rows.length > 0 ? rows : null;
  }

  // Type skill name into input then press Enter to trigger Workday search.
  // Uses native value setter to clear (avoids execCommand(delete) eating focus),
  // then execCommand(insertText) to type the full word in one shot.
  async function typeAndSearch(input, value) {
    input.focus();
    input.click();
    await new Promise(r => setTimeout(r, 150));

    // Clear via native setter ONLY — execCommand("delete") can fire on wrong element
    const nativeDesc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    const tracker = input._valueTracker;
    if (tracker) tracker.setValue("___reset___");
    if (nativeDesc && nativeDesc.set) nativeDesc.set.call(input, "");
    else input.value = "";
    try {
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    } catch (e) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 120));

    // Re-focus after clear (React might move focus)
    input.focus();

    // Type the full skill word in one execCommand call
    let insertDone = false;
    try {
      if (typeof input.select === "function") input.select();
      insertDone = document.execCommand("insertText", false, value);
    } catch (e) {}

    // Fallback: native setter + fire input events
    if (!insertDone || input.value !== value) {
      if (tracker) tracker.setValue("");
      if (nativeDesc && nativeDesc.set) nativeDesc.set.call(input, value);
      else input.value = value;
    }

    try {
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    } catch (e) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
    console.log("[WDAutofill Skills] Typed:", input.value, "| Expected:", value);

    // Press Enter — triggers Workday's skills search API
    const enterOpts = { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 };
    input.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
    input.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
    input.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
  }

  // Main loop
  for (const skill of prioritized) {
    if (getExistingPills().length >= 10) {
      console.log("[WDAutofill Skills] Max skills added. Done.");
      break;
    }

    const existing = getExistingPills();
    const cleanSkill = skill.toLowerCase().trim();
    if (existing.some((p) => p.includes(cleanSkill) || cleanSkill.includes(p))) {
      console.log("[WDAutofill Skills] '" + skill + "' already present. Skipping.");
      continue;
    }

    console.log("[WDAutofill Skills] === Processing: '" + skill + "' ===");

    const currentInput =
      baseContainer.querySelector("input[type='text'], input[role='combobox'], input[type='search'], input:not([type])") || inputEl;

    currentInput.scrollIntoView({ behavior: "auto", block: "center" });
    await typeAndSearch(currentInput, skill);

    // Wait for "Search Results" popup or "No Items" (poll up to 3 sec)
    let popupRows = null;
    let noItems = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise(r => setTimeout(r, 200));

      // Check for no items
      const noItemsEl = Array.from(document.querySelectorAll("*")).find(el =>
        el.children.length === 0 &&
        el.getBoundingClientRect().width > 0 &&
        (el.textContent.trim().toLowerCase() === "no items" || el.textContent.trim().toLowerCase() === "no matches found")
      );
      if (noItemsEl) { noItems = true; break; }

      popupRows = findSkillsPopupOptions();
      if (popupRows && popupRows.length > 0) {
        console.log("[WDAutofill Skills] Popup found on attempt " + attempt + ", rows: " + popupRows.length);
        break;
      }
    }

    if (noItems || !popupRows || popupRows.length === 0) {
      console.log("[WDAutofill Skills] No popup/rows for '" + skill + "'. Skipping.");
      const escOpts = { bubbles: true, cancelable: true, key: "Escape", code: "Escape", keyCode: 27, which: 27 };
      currentInput.dispatchEvent(new KeyboardEvent("keydown", escOpts));
      currentInput.dispatchEvent(new KeyboardEvent("keyup", escOpts));
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    console.log("[WDAutofill Skills] Rows:", popupRows.map(r => r.textContent.trim().substring(0, 40)));

    // Match by text — priority order:
    // 1. Exact match (e.g. "Java" === "java")
    // 2. Parenthetical acronym match (e.g. "Structured Query Language (SQL)" for "sql")
    // 3. Word-boundary startsWith: next char after skill must be space/./,/( so
    //    "React.js" matches "react" but "React VR" also does — .js wins if listed first.
    //    "SQLCLR" does NOT match "sql" because 'C' is not a separator.
    // 4. Contains as fallback
    function wordBoundaryStartsWith(text, prefix) {
      if (!text.startsWith(prefix)) return false;
      const nextChar = text[prefix.length];
      return !nextChar || /[\s.,(\[/]/.test(nextChar);
    }
    const match =
      popupRows.find(r => r.textContent.trim().toLowerCase() === cleanSkill) ||
      popupRows.find(r => r.textContent.trim().toLowerCase().includes(`(${cleanSkill})`)) ||
      popupRows.find(r => wordBoundaryStartsWith(r.textContent.trim().toLowerCase(), cleanSkill)) ||
      popupRows.find(r => r.textContent.trim().toLowerCase().includes(cleanSkill));

    if (!match) {
      console.log("[WDAutofill Skills] No row matches '" + skill + "'. Skipping.");
      const escOpts = { bubbles: true, cancelable: true, key: "Escape", code: "Escape", keyCode: 27, which: 27 };
      currentInput.dispatchEvent(new KeyboardEvent("keydown", escOpts));
      currentInput.dispatchEvent(new KeyboardEvent("keyup", escOpts));
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    console.log("[WDAutofill Skills] Clicking: '" + match.textContent.trim() + "'");
    const pillsBefore = getExistingPills().length;
    match.scrollIntoView({ behavior: "auto", block: "nearest" });

    // Click the checkbox <input> inside the row â€” not the row itself
    const checkbox = match.querySelector("input[type='checkbox']") ||
      match.closest("[data-automation-id*='checkboxItem']")?.querySelector("input[type='checkbox']");

    if (checkbox) {
      console.log("[WDAutofill Skills] Clicking checkbox directly.");
      checkbox.click();
    } else {
      const clickOpts = { bubbles: true, cancelable: true, view: window };
      match.dispatchEvent(new MouseEvent("mousedown", clickOpts));
      match.dispatchEvent(new MouseEvent("mouseup", clickOpts));
      match.click();
    }

    // Wait for pill
    let pillAdded = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (getExistingPills().length > pillsBefore) { pillAdded = true; break; }
    }
    console.log("[WDAutofill Skills] Pill added: " + pillAdded + ". Pills:", getExistingPills());

    const escOpts = { bubbles: true, cancelable: true, key: "Escape", code: "Escape", keyCode: 27, which: 27 };
    currentInput.dispatchEvent(new KeyboardEvent("keydown", escOpts));
    currentInput.dispatchEvent(new KeyboardEvent("keyup", escOpts));
    await new Promise(r => setTimeout(r, 400));
  }

  const finalInput = baseContainer?.querySelector("input[type='text'], input[role='combobox'], input[type='search'], input:not([type])") || inputEl;
  document.body.click();
  if (finalInput) finalInput.blur();
  await new Promise(r => setTimeout(r, 200));

  const totalPills = getExistingPills().length;
  console.log("[WDAutofill Skills] Finished. Total pills:", totalPills);

  const success = totalPills > 0;
  if (success) {
    if (finalInput) finalInput.style.outline = "";
    if (inputEl) inputEl.style.outline = "";
  }
  return success;
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
