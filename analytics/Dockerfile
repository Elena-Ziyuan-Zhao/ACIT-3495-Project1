FROM python:3.11-slim

# Unbuffered output so `docker compose logs` shows lines immediately; no .pyc files.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN useradd --create-home --uid 10001 appuser
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser main.py .

USER appuser

# Healthy only if the last successful run (both databases reachable) was within 60 s.
HEALTHCHECK --interval=15s --timeout=3s --start-period=40s --retries=3 \
    CMD python -c "import os,sys,time; sys.exit(0 if time.time() - os.path.getmtime('/tmp/heartbeat') < 60 else 1)"

CMD ["python", "main.py"]
