#!/usr/bin/env bash
# Deploys the Botan E-commerce backend to a Supabase project. Safe to re-run.
#
# Required env:
#   SUPABASE_PROJECT_REF     project ref (e.g. abcdefghijklmnopqrst)
#   SUPABASE_ACCESS_TOKEN    personal access token (or run `supabase login` first)
#   SUPABASE_DB_PASSWORD     database password (used by link / db push)
# Optional env (pushed as Edge Function secrets when set):
#   WAAFI_MERCHANT_UID WAAFI_API_USER_ID WAAFI_API_KEY
#   WAAFI_ENV (sandbox|production)  WAAFI_MODE (live|mock)  ALLOWED_ORIGINS
#
# Usage: scripts/deploy-supabase.sh [--seed] [--skip-db] [--skip-functions]
set -euo pipefail

SEED=0; SKIP_DB=0; SKIP_FN=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --skip-db) SKIP_DB=1 ;;
    --skip-functions) SKIP_FN=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m    ✗ %s\033[0m\n' "$*" >&2; exit 1; }

if command -v supabase >/dev/null 2>&1; then SB=(supabase); else SB=(npx --yes supabase@latest); fi
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF (Project Settings → General → Reference ID)}"

step "Linking project ${SUPABASE_PROJECT_REF}"
if [[ -f supabase/.temp/project-ref ]] && [[ "$(cat supabase/.temp/project-ref)" == "$SUPABASE_PROJECT_REF" ]]; then
  ok "already linked"
else
  "${SB[@]}" link --project-ref "$SUPABASE_PROJECT_REF" ${SUPABASE_DB_PASSWORD:+--password "$SUPABASE_DB_PASSWORD"}
  ok "linked"
fi

if [[ $SKIP_DB -eq 0 ]]; then
  step "Applying database migrations (db push)"
  if [[ $SEED -eq 1 ]]; then
    "${SB[@]}" db push --include-seed ${SUPABASE_DB_PASSWORD:+--password "$SUPABASE_DB_PASSWORD"}
    ok "migrations + seed applied"
  else
    "${SB[@]}" db push ${SUPABASE_DB_PASSWORD:+--password "$SUPABASE_DB_PASSWORD"}
    ok "migrations applied (use --seed to load demo catalogue)"
  fi
else
  warn "skipping database"
fi

step "Setting Edge Function secrets"
SECRETS=()
for name in WAAFI_MERCHANT_UID WAAFI_API_USER_ID WAAFI_API_KEY WAAFI_ENV WAAFI_MODE ALLOWED_ORIGINS; do
  if [[ -n "${!name:-}" ]]; then SECRETS+=("${name}=${!name}"); ok "$name"; fi
done
if [[ ${#SECRETS[@]} -gt 0 ]]; then
  "${SB[@]}" secrets set --project-ref "$SUPABASE_PROJECT_REF" "${SECRETS[@]}" >/dev/null
  ok "${#SECRETS[@]} secret(s) set (values not printed)"
else
  warn "no WAAFI_* env vars set — payments return NOT_CONFIGURED unless WAAFI_MODE=mock is set"
fi
if [[ -z "${WAAFI_API_KEY:-}" && "${WAAFI_MODE:-}" != "mock" ]]; then
  warn "WAAFI_API_KEY not provided in this run (existing remote secrets are kept)"
fi

if [[ $SKIP_FN -eq 0 ]]; then
  step "Deploying Edge Functions"
  for fn in waafi-pay admin-users; do
    "${SB[@]}" functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF"
    ok "$fn"
  done
else
  warn "skipping functions"
fi

step "Done"
echo "    Frontend env: VITE_SUPABASE_URL=https://${SUPABASE_PROJECT_REF}.supabase.co"
echo "                  VITE_SUPABASE_ANON_KEY=<Project Settings → API → anon key>"
echo "    Create the owner: sign up, then run in SQL editor:"
echo "      update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"role\":\"owner\"}' where email = '<you>';"
echo "      update public.profiles set role = 'owner' where email = '<you>';"
