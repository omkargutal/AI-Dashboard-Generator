FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend /app/backend
# Do NOT embed secrets in images. Pass OPENAI_API_KEY at runtime or use a mounted .env:
# docker run -e OPENAI_API_KEY="$OPENAI_API_KEY" -p 8000:8000 dashboard-backend
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
