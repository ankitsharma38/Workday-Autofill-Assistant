const BACKEND_URL = "http://localhost:8000";

const fileInput = document.getElementById("resumeFile");
const dropZone = document.getElementById("dropZone");
const fileLabel = document.getElementById("fileLabel");
const fileNameDisplay = document.getElementById("fileNameDisplay");
const uploadBtn = document.getElementById("uploadBtn");
const progressCard = document.getElementById("progressCard");
const progressBar = document.getElementById("progressBar");
const progressPercent = document.getElementById("progressPercent");
const progressStep = document.getElementById("progressStep");
const progressHint = document.getElementById("progressHint");
const statusAlert = document.getElementById("statusAlert");
const previewSection = document.getElementById("previewSection");
const profileCard = document.getElementById("profileCard");
const clearBtn = document.getElementById("clearBtn");
const backendStatus = document.getElementById("backendStatus");

let progressTimer = null;

// Health check on startup
checkBackendHealth();

function checkBackendHealth() {
  fetch(`${BACKEND_URL}/health`)
    .then((res) => {
      if (res.ok) {
        backendStatus.innerHTML = '<span class="pulse-dot"></span><span class="status-text">AI Ready</span>';
      } else {
        throw new Error();
      }
    })
    .catch(() => {
      backendStatus.innerHTML = '<span class="pulse-dot" style="background:#ef4444;box-shadow:none;"></span><span class="status-text" style="color:#b91c1c;">Offline (8000)</span>';
    });
}

// Drag & Drop handlers
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    updateFileDisplay(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    updateFileDisplay(fileInput.files[0]);
  }
});

function updateFileDisplay(file) {
  const sizeKb = Math.round(file.size / 1024);
  fileLabel.innerHTML = `<strong>${file.name}</strong>`;
  fileNameDisplay.textContent = `${sizeKb} KB • Ready to parse`;
  dropZone.style.borderColor = "#10b981";
  dropZone.style.background = "#f0fdf4";
}

// Progress Bar Simulation
function startProgressAnimation() {
  progressCard.style.display = "block";
  uploadBtn.disabled = true;
  statusAlert.style.display = "none";
  let currentPercent = 5;
  updateProgress(currentPercent, "Uploading resume...", "Sending document to local AI backend...");

  const stages = [
    { at: 20, step: "Reading document...", hint: "Extracting text and structure from PDF/DOCX" },
    { at: 45, step: "Extracting sections...", hint: "Analyzing work history, education, and credentials" },
    { at: 70, step: "AI semantic understanding...", hint: "Structuring JSON schema" },
    { at: 88, step: "Normalizing skills & dates...", hint: "Standardizing formats for Workday autofill" },
  ];

  let stageIdx = 0;
  progressTimer = setInterval(() => {
    if (stageIdx < stages.length) {
      const target = stages[stageIdx];
      if (currentPercent < target.at) {
        currentPercent += Math.floor(Math.random() * 4) + 2;
        updateProgress(currentPercent, target.step, target.hint);
      } else {
        stageIdx += 1;
      }
    } else if (currentPercent < 94) {
      currentPercent += 1;
      updateProgress(currentPercent, "Finalizing profile...", "Almost ready to autofill");
    }
  }, 250);
}

function updateProgress(percent, stepText, hintText) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  progressBar.style.width = `${clamped}%`;
  progressPercent.textContent = `${clamped}%`;
  if (stepText) progressStep.textContent = stepText;
  if (hintText) progressHint.textContent = hintText;
}

function finishProgress(callback) {
  clearInterval(progressTimer);
  updateProgress(100, "Resume parsed successfully!", "Ready to autofill on Workday");
  progressBar.style.background = "#10b981";
  setTimeout(() => {
    progressCard.style.display = "none";
    uploadBtn.disabled = false;
    progressBar.style.background = ""; // reset gradient
    if (callback) callback();
  }, 600);
}

function failProgress(errMessage) {
  clearInterval(progressTimer);
  progressCard.style.display = "none";
  uploadBtn.disabled = false;
  showAlert(errMessage, "error");
}

function showAlert(msg, type = "error") {
  statusAlert.className = `status-alert ${type}`;
  statusAlert.textContent = msg;
  statusAlert.style.display = "block";
}

// Upload & Parse Action
uploadBtn.addEventListener("click", async () => {
  if (!fileInput.files.length) {
    showAlert("Please select a .pdf or .docx resume first.", "error");
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("file", file);

  startProgressAnimation();

  try {
    const res = await fetch(`${BACKEND_URL}/parse-resume`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error (${res.status})`);
    }

    const resumeData = await res.json();
    await chrome.storage.local.set({ resumeData });

    finishProgress(() => {
      showAlert("Resume parsed and saved to local storage!", "success");
      renderProfile(resumeData);
    });
  } catch (err) {
    failProgress(err.message || "Failed to parse resume.");
  }
});

// Render Profile
function renderProfile(r) {
  if (!r) return;
  previewSection.style.display = "block";

  // Initials
  const name = r.name || "Candidate Profile";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "CV";

  const expCount = (r.experience || []).length;
  const eduCount = (r.education || []).length;
  const skills = (r.skills || []).slice(0, 8);

  profileCard.innerHTML = `
    <div class="profile-top">
      <div class="avatar-badge">${initials}</div>
      <div>
        <div class="profile-name">${escapeHtml(name)}</div>
        ${r.email ? `<div class="profile-info-row">✉ ${escapeHtml(r.email)}</div>` : ""}
        ${r.location ? `<div class="profile-info-row">📍 ${escapeHtml(r.location)}</div>` : ""}
      </div>
    </div>
    
    <div class="profile-stats">
      <span class="stat-chip">${expCount} Work ${expCount === 1 ? "Role" : "Roles"}</span>
      <span class="stat-chip">${eduCount} ${eduCount === 1 ? "Education" : "Educations"}</span>
      <span class="stat-chip">${(r.skills || []).length} Skills</span>
    </div>

    ${skills.length > 0
      ? `
      <div class="skills-title">Extracted Skills</div>
      <div class="skills-wrapper">
        ${skills.map((s) => `<span class="skill-pill">${escapeHtml(s)}</span>`).join("")}
        ${(r.skills || []).length > 8 ? `<span class="skill-pill">+${(r.skills || []).length - 8} more</span>` : ""}
      </div>
    `
      : ""
    }
  `;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Clear Profile
clearBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(["resumeData"]);
  previewSection.style.display = "none";
  profileCard.innerHTML = "";
  fileInput.value = "";
  fileLabel.innerHTML = 'Drop resume or <span class="browse-link">browse</span>';
  fileNameDisplay.textContent = "Supports PDF or DOCX format";
  dropZone.style.borderColor = "";
  dropZone.style.background = "";
  statusAlert.style.display = "none";
  showAlert("Profile cleared. You can upload a new resume.", "success");
});

// Load saved resume on popup open
chrome.storage.local.get(["resumeData"], (res) => {
  if (res.resumeData) {
    renderProfile(res.resumeData);
  }
});
