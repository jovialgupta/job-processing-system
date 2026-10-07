FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN mkdir -p uploads

# API: uvicorn app.main:app --host 0.0.0.0 --port 8000
# Workers: python -m app.start_workers   (both set in docker-compose.yml)