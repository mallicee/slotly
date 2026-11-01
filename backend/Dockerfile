# Build from the repository root: docker build -f backend/Dockerfile -t slotly-api .
FROM python:3.13-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    CATALOG_PATH=/app/shared/catalog.json \
    DATABASE_URL=sqlite:////data/slotly.db

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY shared ./shared

RUN useradd --create-home slotly && mkdir /data && chown slotly /data
USER slotly
VOLUME /data
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
