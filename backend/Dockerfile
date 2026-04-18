FROM python:3.11-slim

RUN groupadd --gid 1000 appuser && useradd --uid 1000 --gid 1000 --create-home appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini alembic.ini
COPY alembic alembic
COPY app app
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R appuser:appuser /app

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
