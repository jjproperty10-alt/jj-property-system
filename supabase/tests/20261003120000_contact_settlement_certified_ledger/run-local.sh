#!/usr/bin/env bash
# Local isolated Postgres runner for 20261003120000. Never point this at a remote
# database: it creates and drops a throwaway database.
# Needs a local PostgreSQL 17 server reachable with psql (PGHOST/PGPORT/PGUSER),
# connecting as a superuser named postgres so the view owner matches Production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HERE="$ROOT/supabase/tests/20261003120000_contact_settlement_certified_ledger"
DB="${JJ_CS_DB:-jj_contact_settlement_test}"
PSQL=(psql -X -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")
case "${PGHOST:-/tmp}" in localhost|127.0.0.1|/*) ;; *) echo "refusing non-local PGHOST=${PGHOST}"; exit 2;; esac

LIVE_VIEWS="$(mktemp)"; trap 'rm -f "$LIVE_VIEWS"' EXIT
python3 - "$ROOT" "$LIVE_VIEWS" <<'PY'
import pathlib, re, sys
root, out = sys.argv[1:]
rb = pathlib.Path(root, "supabase/rollbacks/20261003120000_contact_settlement_certified_ledger_rollback.sql").read_text()
# Live v_contact_settlement = the CREATE statement in the rollback.
start = rb.index("CREATE OR REPLACE VIEW public.v_contact_settlement AS\n")
end = rb.index(";\n", start) + 2
view = rb[start:end]
# Live summary = the commented reference block at the end of the rollback.
ref = rb[rb.index("-- CREATE OR REPLACE VIEW public.v_contact_settlement_summary AS"):]
summ = "\n".join(l[3:] if l.startswith("-- ") else ("" if l == "--" else l) for l in ref.splitlines())
pathlib.Path(out).write_text(view + summ.rstrip("\n") + "\n" +
  "REVOKE ALL ON public.v_contact_settlement, public.v_contact_settlement_summary FROM PUBLIC;\n"
  "GRANT ALL ON public.v_contact_settlement, public.v_contact_settlement_summary TO service_role;\n")
PY

"${PSQL[@]}" -d postgres -qc "DROP DATABASE IF EXISTS ${DB};"
"${PSQL[@]}" -d postgres -qc "CREATE DATABASE ${DB};"
"${PSQL[@]}" -d postgres -qc "DO \$\$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END\$\$;"
grep -v '^CREATE ROLE' "$HERE/00_bootstrap.sql" | "${PSQL[@]}" -d "$DB" -q
"${PSQL[@]}" -d "$DB" -q -f "$LIVE_VIEWS"
"${PSQL[@]}" -d "$DB" -Atc "SELECT 'live_md5_reproduced', md5(pg_get_viewdef('public.v_contact_settlement'::regclass,true))='84b5a9448d4b8547b361602406bcf7e6' AND md5(pg_get_viewdef('public.v_contact_settlement_summary'::regclass,true))='edd2b35127b5299e4f6b66c62abac7b7';" > /tmp/jj_cs_matrix.out
"${PSQL[@]}" -d "$DB" -q -f "$HERE/10_fixtures.sql"
"${PSQL[@]}" -d "$DB" -q -f "$ROOT/supabase/migrations/20261003120000_contact_settlement_certified_ledger.sql"
"${PSQL[@]}" -d "$DB" -At -F '|' -f "$HERE/99_matrix.sql" >> /tmp/jj_cs_matrix.out
"${PSQL[@]}" -d "$DB" -At -F '|' -f "$HERE/96_shared_inclusion.sql" >> /tmp/jj_cs_matrix.out
# Re-running the migration must abort on the pre-check and leave the view unchanged.
if "${PSQL[@]}" -d "$DB" -q -f "$ROOT/supabase/migrations/20261003120000_contact_settlement_certified_ledger.sql" 2>/dev/null; then
  echo "migration_rerun_aborts|f" >> /tmp/jj_cs_matrix.out; else echo "migration_rerun_aborts|t" >> /tmp/jj_cs_matrix.out; fi
"${PSQL[@]}" -d "$DB" -q -f "$ROOT/supabase/rollbacks/20261003120000_contact_settlement_certified_ledger_rollback.sql"
"${PSQL[@]}" -d "$DB" -At -F '|' -f "$HERE/98_rollback_matrix.sql" >> /tmp/jj_cs_matrix.out
"${PSQL[@]}" -d postgres -qc "DROP DATABASE IF EXISTS ${DB};"
cat /tmp/jj_cs_matrix.out
FAILED=$(grep -c '|f$' /tmp/jj_cs_matrix.out || true)
TOTAL=$(wc -l < /tmp/jj_cs_matrix.out)
echo "passed $((TOTAL-FAILED)) / ${TOTAL}"
[ "$FAILED" -eq 0 ]
