FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    KB_DB_PATH=/data/knowledge_base.db \
    SENTENCE_TRANSFORMERS_HOME=/app/.cache/sentence_transformers

COPY backend/requirements.txt /app/requirements.txt

# Install CPU-only torch first to avoid pulling the GPU variant (~700 MB saved)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir -r /app/requirements.txt

# Pre-download the embedding model so the container starts without a network fetch
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY backend/app /app/app

EXPOSE 8000

CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
