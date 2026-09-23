# syntax=docker/dockerfile:1

FROM node:24-alpine AS ui-build
WORKDIR /app/web-ui
COPY web-ui/package.json web-ui/package-lock.json ./
RUN npm ci
COPY web-ui ./
RUN npm run build

# Python, papis and the backend dependencies, shared by the test and runtime images.
FROM python:3.14-slim AS deps
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY service/requirements.txt /app/service/requirements.txt
COPY papis /app/papis
WORKDIR /app/service
RUN pip install --upgrade pip \
    && pip install -r /app/service/requirements.txt

WORKDIR /app

# Test image. scripts/test.sh mounts the repo read-only at /app and runs pytest.
FROM deps AS test
COPY requirements-dev.txt /tmp/requirements-dev.txt
RUN pip install -r /tmp/requirements-dev.txt

# Runtime image. It is the default target, so it must stay the last stage.
FROM deps AS runtime
ENV AURORA_DOCKER=1

COPY service /app/service
COPY --from=ui-build /app/web-ui/dist /app/web-ui/dist

EXPOSE 8973
CMD ["python", "-m", "uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8973"]
