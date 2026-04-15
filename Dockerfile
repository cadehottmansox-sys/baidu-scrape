FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    wget curl gnupg ca-certificates \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 \
    tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng \
    libzbar0 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m playwright install chromium
RUN python -m playwright install-deps chromium
COPY . .

ENV HEADLESS=true
ENV MAX_RESULTS=10
ENV ACTION_DELAY_SECONDS=1.2
ENV PLAYWRIGHT_TIMEOUT_MS=30000
ENV ADMIN_SECRET=change-this-to-something-secret
ENV APP_URL=https://your-app.railway.app

EXPOSE 8080
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-8080} --workers 1 --timeout 180"]
