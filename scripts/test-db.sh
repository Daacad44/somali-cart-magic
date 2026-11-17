#!/usr/bin/env bash
# Runs the database integration tests against a throwaway database.
# Usage: PGHOST=localhost PGPORT=5432 PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB="shop_test_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/seed.sql
psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/integration.sql
