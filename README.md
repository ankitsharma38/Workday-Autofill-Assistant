# Workday Autofill Assistant (AI-Powered)

An AI-driven Chrome Extension (Manifest V3) and FastAPI backend that automates complex, multi-step job applications on Workday platforms. The system parses unstructured resumes into validated JSON schemas, semantically maps fields dynamically using an LLM, handles complex dynamic DOM elements (repeatable sections, custom dropdowns, masked datepickers, autocomplete comboboxes), and submits **only after explicit human confirmation**.

---

## 🎯 Target Application Tested
Per the assignment submission guidelines, this implementation was actively developed and validated against:
* **Primary Target Posting:** Target Careers — *Food & Beverage Team Leader* (`R0000452489`)
  * `https://target.wd5.myworkdayjobs.com/en-US/targetcareers/details/Food---Beverage-Team-Leader_R0000452489`
* **Secondary Verification:** NVIDIA External Career Site — *Senior Executive Events Manager* (`JR2023151-1`)

---

## ✨ Key Features

1. **Intelligent Resume Parsing & Normalization (`/parse-resume`)**:
   - Ingests both `.pdf` and `.docx` resumes.
   - Converts unstructured text into typed Pydantic models (`ResumeData`) using OpenAI (`gpt-4o-mini`).
   - Normalizes dates, extracts work history, degrees, institutions, skills, and social links (LinkedIn, GitHub).

2. **Autonomous Multi-Step Workday Navigation**:
   - Detects Workday step transitions using a debounced `MutationObserver`.
   - Explicitly avoids automating authentication screens, account creation, or CAPTCHA verification, safely handing over control to the user.

3. **Dynamic Repeatable Section Expansion**:
   - Discovers section boundaries and `[Add]` / `[Add Another]` buttons via DOM order without relying on brittle, hardcoded IDs.
   - Uses dynamic DOM polling (`waitForCount`) to expand multiple Work Experience and Education cards to match the candidate's exact resume history.

4. **Semantic Field Mapping & Heuristics (`/map-fields`)**:
   - Labels fields with hierarchical context (e.g. `Work Experience 1 - Job Title`, `Education 1 - Degree`).
   - AI maps fields semantically, determines confidence scores (0.0 – 1.0), and provides reasoning.
   - Answers common screening questions (Work Authorization, Sponsorship, Age requirements, Non-compete agreements).
   - Hard-validates select and radio options against live DOM options to eliminate hallucinations.

5. **Advanced Workday Input Automation**:
   - **React-Controlled Inputs:** Overrides property descriptors and resets `_valueTracker`.
   - **Masked DatePickers:** Simulates native `execCommand("insertText")`, keystroke input, `Enter`/`Tab` commit, and native `blur`/`focusout` to prevent "field is required" validation errors.
   - **Comboboxes & Prompts (Field of Study):** Dispatches native Enter queries, interacts with `:≡` prompt search buttons, and handles Workday's custom taxonomy pill tokens.
   - **Dropdowns (Degree Level):** Normalizes degree categories (e.g. "Bachelor's Degree" ➔ "Bachelors level degree").

6. **Human-in-the-Loop Confirmation Gate**:
   - Injected review overlay lists all filled fields and highlights low-confidence items (`< 0.6`) for manual review.
   - Submits or advances only when the user explicitly clicks **Save & Continue** / **Submit**.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│             Chrome Extension (Manifest V3)             │
│                                                        │
│  ┌──────────────┐     Upload PDF/DOCX     ┌─────────┐  │
│  │ Popup UI     │ ──────────────────────> │ Storage │  │
│  └──────────────┘                         └────┬────┘  │
│                                                │       │
│  ┌─────────────────────────────────────────────▼────┐  │
│  │ Content Script (Workday Page)                    │  │
│  │                                                  │  │
│  │  1. Navigator ➔ Detects step & expands sections │  │
│  │  2. Scanner   ➔ Scrapes DOM fields & labels      │  │
│  │  3. Mapper    ➔ Sends fields + resume to backend │  │
│  │  4. Filler    ➔ Simulates native typing & events │  │
│  │  5. Overlay   ➔ Displays review & awaits confirm │  │
│  └───────────────────────▲──────────────────────────┘  │
└──────────────────────────┼─────────────────────────────┘
                           │ HTTP / JSON
┌──────────────────────────▼─────────────────────────────┐
│                 FastAPI Backend                        │
│                                                        │
│  • /parse-resume  ➔ pdf/docx extraction + OpenAI parse │
│  • /map-fields    ➔ Semantic field mapper & heuristics │
│  • /health        ➔ Healthcheck endpoint               │
└────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

* **Backend**: Python 3.11+, FastAPI, Uvicorn, LangChain, OpenAI API (`gpt-4o-mini`), Pydantic v2, `pypdf`, `python-docx`, `pytest`.
* **Frontend / Extension**: Chrome Extensions Manifest V3, Vanilla JavaScript (ES6+), Vanilla CSS (responsive glassmorphism review overlay), Chrome Storage API.

---

## 🚀 Setup & Installation

### 1. Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment**:
   * Windows:
     ```bash
     python -m venv venv
     venv\Scripts\activate
     ```
   * macOS / Linux:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and insert your OpenAI API key:
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4o-mini
   ```

5. **Start the FastAPI server**:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   * Verify it is running by visiting: `http://localhost:8000/health` (should return `{"status": "ok"}`).

---

### 2. Chrome Extension Installation

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` directory inside `workday-autofill/`.
5. Pin the **Workday Autofill Assistant** extension to your Chrome toolbar.

---

## 🧪 Testing

### Automated Backend Tests
Run the unit test suite covering resume extraction and mapping validation:
```bash
# From the project root or backend folder (with venv active)
pytest backend/tests -v
```
All tests verify file type validation, option matching logic, and Pydantic schema validation.

---

## 📋 How to Use

1. **Upload Resume**:
   - Click the extension icon in Chrome.
   - Drag and drop your `.pdf` or `.docx` resume and click **Parse & Save Resume**.
   - Verify that your name, contact details, work roles count, and skills appear in the preview card.

2. **Navigate to Workday**:
   - Open the Target posting URL (or any Workday posting) and click **Apply**.
   - Sign in or create an account manually (automation is deliberately paused on authentication screens).

3. **Autofill in Action**:
   - **My Information:** Autofills First Name, Last Name, Address, Phone, and Email.
   - **My Experience:** Automatically clicks **Add** and **Add Another** to create all work experience entries and education blocks, then fills titles, companies, dates, role descriptions, degree levels, and fields of study.
   - **Application Questions:** Answers common screening questions.
   - **Review Overlay:** Displays all mapped values on the right side of the screen. Review the values and click **Save & Continue** to proceed.

---

## 🔒 Security & Constraints Compliance

* **Authentication Guard**: Explicitly halts on login, registration, and CAPTCHA screens (`navigator.js`), allowing users to authenticate securely.
* **Human-in-the-Loop**: The form is never submitted automatically without the user reviewing and clicking the confirmation button on the review overlay.
* **Local Data Storage**: Candidate resume data is stored exclusively in `chrome.storage.local` on the client's machine.
