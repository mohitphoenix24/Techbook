# One image that serves the API and the built React app.
#   docker build -t support-pilot .
#   docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... -e AGENT_TOKEN=... -e LEAD_TOKEN=... -v supportpilot-data:/data support-pilot
# Then open http://localhost:8000

FROM node:24-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=web /web/dist ./frontend_dist
ENV FRONTEND_DIST=/app/frontend_dist DATABASE_PATH=/data/support.db
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
