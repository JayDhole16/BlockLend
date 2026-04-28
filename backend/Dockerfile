FROM python:3.11-slim

WORKDIR /app

# Install system deps for psycopg2 / web3
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Install backend Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install AI service Python dependencies
COPY ai-services/requirements.txt /tmp/ai-requirements.txt
RUN pip install --no-cache-dir -r /tmp/ai-requirements.txt

# Copy backend source
COPY backend/ .

# Copy ai-services so the backend can import them at runtime
COPY ai-services/ /ai-services/

# Add ai-services to PYTHONPATH
ENV PYTHONPATH="/ai-services:${PYTHONPATH}"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
