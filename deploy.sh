#!/usr/bin/env bash
# Deploy Misconnect to Cloud Run.
set -euo pipefail

SERVICE="${SERVICE:-claim-tracer}"
REGION="${REGION:-us-east1}"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"

[ -n "${PROJECT}" ] && [ "${PROJECT}" != "(unset)" ] || {
  echo "No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID" >&2; exit 1; }
[ -f .env.local ] || { echo "Missing .env.local" >&2; exit 1; }

GEMINI_API_KEY="$(grep -E '^GEMINI_API_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '\r' | xargs)"
[ -n "$GEMINI_API_KEY" ] || { echo "GEMINI_API_KEY empty in .env.local" >&2; exit 1; }

echo "Deploying '${SERVICE}' to ${REGION} in ${PROJECT}…"

# --timeout 300 because Gemini calls (claim letter, NL parse) can run long when
# the API is under load; the risk lookups themselves are sub-50ms.
# --memory 1Gi because the 4.5MB aggregate is parsed into memory at startup.
gcloud run deploy "${SERVICE}" \
  --source . \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --timeout 300 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 4 \
  --concurrency 40 \
  --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY}"

echo
gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)'
