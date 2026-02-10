# syntax=docker/dockerfile:1

FROM node:20-alpine AS ui-build
WORKDIR /app/web-ui
COPY web-ui/package.json web-ui/package-lock.json ./
RUN npm ci
COPY web-ui ./
RUN npm run build

FROM python:3.11-slim AS runtime
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

COPY service /app/service
COPY web-ui/dist /app/web-ui/dist

EXPOSE 5173
CMD ["python", "-m", "uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "5173"]
