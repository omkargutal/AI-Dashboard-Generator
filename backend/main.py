import os, io, json, re
from typing import List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from openai import OpenAI  # official client
from dotenv import load_dotenv
import uvicorn
from pydantic import BaseModel


# Load .env file (backend/.env) so os.getenv("OPENAI_API_KEY") will pick it up
load_dotenv()

# Replace the simple env read with a safer loader that avoids hard-coding
def load_openai_key():
    # First try environment variable (now loaded from .env if present)
    key = os.getenv("OPENAI_API_KEY")
    if key:
        return key.strip()
    # Fallback: try a local untracked file (openai_key.txt) if the user prefers storing key locally
    local_path = os.path.join(os.path.dirname(__file__), "..", "openai_key.txt")
    try:
        with open(local_path, "r") as f:
            k = f.read().strip()
            if k:
                return k
    except Exception:
        pass
    # Final fallback: None (caller should handle and show meaningful error)
    return None

# Do NOT create the OpenAI client at import time (so the server can start without immediately failing).
def get_openai_client():
    key = load_openai_key()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=("OPENAI_API_KEY not set. Set environment variable OPENAI_API_KEY "
                    "or place the key in backend/.env or backend/../openai_key.txt (untracked).")
        )
    return OpenAI(api_key=key)

app = FastAPI()

# Enable CORS so frontend can call backend
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# ------------------------------
# Schema inference
# ------------------------------
def infer_schema(df: pd.DataFrame, sample_n=200):
    rows = min(len(df), sample_n)
    df_sample = df.head(rows)
    schema = []
    total = len(df)
    for col in df.columns:
        ser = df_sample[col]
        dtype = str(ser.dtype)
        nunique = int(ser.nunique(dropna=True))
        missing_pct = float(ser.isna().mean()) if total > 0 else 0.0
        samples = ser.dropna().unique().tolist()[:5]
        likely_categorical = (nunique / max(total, 1) < 0.05) or (nunique <= 50)
        schema.append({
            "name": col,
            "dtype": dtype,
            "nunique": nunique,
            "missing_pct": round(missing_pct, 3),
            "samples": samples,
            "likely_categorical": bool(likely_categorical)
        })
    return schema, df_sample.to_csv(index=False)

# ------------------------------
# Prompt building
# ------------------------------
def build_prompt(schema_json: List[dict], sample_csv: str, user_intent: str) -> List[dict]:
    system = (
        "You are a BI assistant that returns ONLY valid JSON describing a dashboard. "
        "The JSON must follow the schema provided. Output nothing else."
    )

    user = f"""DATA SCHEMA:
{json.dumps(schema_json, indent=2)}

SAMPLE ROWS (CSV):
{sample_csv}

USER INTENT:
{user_intent}

CONSTRAINTS:
- Return EXACTLY one JSON object with the keys: dashboard -> title, description, filters, views, layout.
- Each view must contain 'vega_lite' which is a valid Vega-Lite specification.
- Max 6 views. Use aggregations sensibly.
Now produce the JSON only."""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]

# Pydantic model for request body (kept for reference / future endpoints)
class GenerateRequest(BaseModel):
    prompt: str

# NOTE: The following mock `/generate` endpoint used during early development
# has been commented out to avoid routing conflicts with the real CSV ->
# OpenAI dashboard generator. Keep it here as a reference in case you want
# to re-enable a mock mode later.
#
# @app.post("/generate")
# def generate(req: GenerateRequest):
#     return {"result": f"Mocked output for prompt: {req.prompt}"}

# ------------------------------
# Endpoint
# ------------------------------
@app.post("/generate_dashboard")
async def generate_dashboard(file: UploadFile = File(...), intent: str = Form(...)):
    # Read CSV file
    data = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(data))
    except Exception:
        text = data.decode(errors='ignore')
        df = pd.read_csv(io.StringIO(text))

    # Build schema & sample CSV
    schema_json, sample_csv = infer_schema(df, sample_n=200)
    messages = build_prompt(schema_json, sample_csv, intent)

    # If MOCK_DASHBOARD is set in the environment, return a canned dashboard
    # immediately for frontend development and testing without hitting OpenAI.
    if os.getenv("MOCK_DASHBOARD", "false").lower() in ("1", "true", "yes"):
        # Simple example dashboard that matches the expected shape
        mock_dashboard = {
            "title": "Mock Dashboard",
            "description": f"Mock generated for intent: {intent}",
            "filters": [],
            "layout": {"columns": 2},
            "views": [
                {
                    "id": "v1",
                    "title": "Mock Time Series",
                    "vega_lite": {
                        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                        "data": {"values": [
                            {"date": "2025-10-01", "amount": 100},
                            {"date": "2025-10-02", "amount": 150},
                            {"date": "2025-10-03", "amount": 120}
                        ]},
                        "mark": "line",
                        "encoding": {
                            "x": {"field": "date", "type": "temporal"},
                            "y": {"field": "amount", "type": "quantitative"}
                        }
                    }
                },
                {
                    "id": "v2",
                    "title": "Mock Category Breakdown",
                    "vega_lite": {
                        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                        "data": {"values": [
                            {"category": "A", "value": 60},
                            {"category": "B", "value": 30},
                            {"category": "C", "value": 10}
                        ]},
                        "mark": "arc",
                        "encoding": {
                            "theta": {"field": "value", "type": "quantitative"},
                            "color": {"field": "category", "type": "nominal"}
                        }
                    }
                }
            ]
        }
        return {"dashboard": mock_dashboard}

    # Create OpenAI client here and call the API; return clear HTTP errors on failure
    try:
        client = get_openai_client()
    except HTTPException as e:
        # Propagate the HTTPException so FastAPI returns proper status + message
        raise e

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",  # or latest chat model you have access to
            messages=messages,
            temperature=0.0,
            max_tokens=1500
        )
    except Exception as e:
        # Normalize common OpenAI errors to more specific HTTP statuses so the
        # frontend can surface actionable messages (quota, auth, rate-limit).
        se = str(e)
        # Log the original exception for server-side diagnostics
        print("OpenAI error:", se)

        # Quota / rate-limit errors
        if "insufficient_quota" in se or "quota" in se or "429" in se:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"OpenAI request failed (quota/rate-limit): {se}"
            )

        # Authentication errors
        if "401" in se or "unauthorized" in se.lower() or "invalid_api_key" in se.lower() or "invalid" in se.lower():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"OpenAI request failed (auth): {se}"
            )

        # Fallback to 502 for other upstream failures
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI request failed: {se}"
        )

    content = resp.choices[0].message.content

    # Parse JSON safely
    try:
        dashboard_json = json.loads(content)
    except Exception:
        # try naive extraction
        m = re.search(r"(\{(?:.|\n)*\})", content)
        if m:
            try:
                dashboard_json = json.loads(m.group(1))
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Model returned text but JSON extraction failed. Raw model output included."
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to parse JSON from model output."
            )

    return {"dashboard": dashboard_json["dashboard"]}

# ------------------------------
# Run Uvicorn
# ------------------------------
if __name__ == "__main__":
    # use the app object directly so running `python backend/main.py` works reliably
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
