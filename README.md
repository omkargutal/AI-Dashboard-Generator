AI Data Dashboard — Clone & Run

This repository contains a lightweight local dashboard generator that:
- Parses CSV files
- Infers simple schema (numeric, categorical, temporal)
- Generates local Vega-Lite views (bar/column, line, pie/donut, treemap approximation)
- Optionally calls an OpenAI-powered backend endpoint to generate a richer dashboard JSON

Contents
-- backend/: FastAPI app that builds prompts and calls OpenAI (or returns a mock dashboard).
-- my-dashboard/: Vite + React (TypeScript) frontend that parses CSVs, renders KPIs, and embeds Vega-Lite charts.
-- sample-data/sample.csv: example dataset used by the frontend "Load sample" feature.

Prerequisites
- Node.js (16+) and npm or pnpm for the frontend
- Python 3.10+ for the backend (this repo uses a virtualenv by convention)
- (Optional) Docker for containerized runs

Quick start — Backend (local)

1. Create and activate a virtual environment, then install dependencies:

```bash
cd /path/to/DashBoard
python -m venv .venv
source .venv/bin/activate   # on macOS / Linux
pip install --upgrade pip
pip install -r backend/requirements.txt
```

2. Configure your OpenAI API key (do NOT commit it):

```bash
export OPENAI_API_KEY="sk-..."
# On Windows (PowerShell): $env:OPENAI_API_KEY="sk-..."
```

3. Run the backend (development server with auto-reload):

```bash
cd /path/to/DashBoard
uvicorn backend.main:app --reload
```

Notes:
- If port 8000 is already in use, either stop the process using that port or run uvicorn on a different port (e.g. `--port 8001`).
- The backend supports a `MOCK_DASHBOARD` environment variable (set to `1`/`true`) which returns a canned dashboard without calling OpenAI — useful for development and testing without an API key.

Quick start — Frontend

1. Install dependencies and run Vite:

```bash
cd /path/to/DashBoard/my-dashboard
npm install
npm run dev
```

2. Open the URL printed by Vite (usually http://localhost:5173).
3. Use the UI to upload a CSV or click "Load sample" to see an auto-generated dashboard.

Running frontend + backend together
- Start the backend first (see above) so the frontend can call `http://localhost:8000/generate_dashboard`.
- If you run the backend on another port, update the frontend fetch URL in `my-dashboard/src/components/DashboardGenerator.tsx` or set up a small proxy in Vite.

Docker

Build the backend image:

```bash
docker build -t dashboard-backend .
```

Run without embedding your OpenAI key into the image:

```bash
docker run -e OPENAI_API_KEY="$OPENAI_API_KEY" -p 8000:8000 dashboard-backend
```

Alternatively mount an untracked key file:

```bash
docker run -v $(pwd)/openai_key.txt:/secrets/openai_key.txt -e OPENAI_KEY_PATH=/secrets/openai_key.txt -p 8000:8000 dashboard-backend
```

Environment variables
- OPENAI_API_KEY: (required for real OpenAI calls) API key for OpenAI.
- MOCK_DASHBOARD: if set to `1` or `true`, backend returns a canned dashboard and skips calling OpenAI.

Developer notes & repo structure
- `backend/main.py` — FastAPI app. Key endpoints:
  - POST `/generate_dashboard` expects a multipart/form-data `file` (CSV) and `intent` string and returns a JSON object `{ dashboard: ... }`.
  - The backend infers a schema from the CSV and builds a prompt for the model. If `MOCK_DASHBOARD` is enabled it returns a sample dashboard for easier frontend dev.
- `my-dashboard/src/components/DashboardGenerator.tsx` — Frontend logic for parsing CSVs, inferring schema, generating local Vega-Lite specs, and embedding with `vega-embed`.

Tips & troubleshooting
- Backend fails to start with "Address already in use":
  - Find and stop the process using port 8000: `lsof -i :8000 -sTCP:LISTEN` then `kill <PID>` (or run uvicorn on a different port).
- Frontend can't reach backend (CORS/network): backend already includes permissive CORS for local dev. Check the backend logs and ensure you started uvicorn from the repo root or use `backend.main:app` module path.
- Uploads not parsing / odd CSV behavior: ensure your CSV is comma-separated and not malformed; the frontend has a tolerant CSV parser but very malformed CSVs (mixed delimiters) may fail.
- If you don't want to call OpenAI while developing, set `MOCK_DASHBOARD=1` before starting the backend.

Testing
- There are no automated tests included by default. For quick manual verification:
  - Start the backend with `MOCK_DASHBOARD=1`.
  - Start the frontend via Vite and click "Load sample". You should see KPIs and several Vega-Lite charts.

Contributing
- PRs are welcome. Suggested small improvements:
  - Move shared CSV parsing/inference into a small library module so both frontend and backend can share logic.
  - Add unit tests for the CSV parser and schema inference.

License
- This project is provided as-is. Add an appropriate open-source license file if you intend to share publicly.

If you want, I can also:
- Start the frontend dev server and confirm the recent duplicate-chart fix is visible in the running app.
- Start the backend on a different port (e.g., 8001) to avoid killing existing processes and wire the frontend to it for testing.

Enjoy exploring the dashboard!

