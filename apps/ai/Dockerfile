# syntax=docker/dockerfile:1.7
# Groundline AI service (FastAPI). Build from the repository root:
#   docker build -f apps/ai/Dockerfile -t groundline-ai .
# Applies its own schema migrations at startup and runs the ingestion worker in-process.

ARG PYTHON_VERSION=3.12

FROM python:${PYTHON_VERSION}-slim-bookworm AS build
COPY --from=ghcr.io/astral-sh/uv:0.10.4 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PYTHON=python${PYTHON_VERSION}
WORKDIR /app
# Dependencies first, so code changes don't reinstall them.
COPY apps/ai/pyproject.toml apps/ai/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project
COPY apps/ai/src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-editable

FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 AI_HOST=0.0.0.0 AI_PORT=8000 ENVIRONMENT=production
RUN groupadd --system app && useradd --system --gid app --home /app app
# Amazon RDS certificate authorities, so database connections can verify the server.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds/global-bundle.pem
WORKDIR /app
COPY --from=build --chown=app:app /app/.venv ./.venv
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)" || exit 1
CMD ["python", "-m", "groundline_ai.server"]
