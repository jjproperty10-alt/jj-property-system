#!/usr/bin/env bash
# Local PostgreSQL 17 proof for the five draft migrations. Never connects to Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
MIG_DIR="$ROOT/supabase/migrations"
RESULTS="$TEST_DIR/RESULTS.txt"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)

extract_rollback() {
  awk '
    $0 ~ /^-- ROLLBACK-BEGIN$/ {capture=1; next}
    $0 ~ /^-- ROLLBACK-END$/ {capture=0; next}
    capture {
      sub(/^-- /, "")
      print
    }
  ' "$1"
}

md5_for() {
  local db="$1"
  local relations="$2"
  local functions="$3"
  local owners="$4"
  "${PSQL[@]}" -d "$db" -tA -c \
    "SELECT test.grant_policy_md5(ARRAY[${relations}]::text[], ARRAY[${functions}]::text[], ARRAY[${owners}]::text[])"
}

recreate() {
  local db="$1"
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${db}" >/dev/null
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE ${db}" >/dev/null
  "${PSQL[@]}" -d "$db" -f "$TEST_DIR/00_fixture.sql" >/dev/null
}

run_file() {
  local db="$1"
  local file="$2"
  "${PSQL[@]}" -d "$db" -f "$file"
}

: > "$RESULTS"
echo "postgres $(sudo -u postgres psql -tA -c 'SHOW server_version')" | tee -a "$RESULTS"

run_case() {
  local key="$1"
  local db="$2"
  local migration="$3"
  local relations="$4"
  local functions="$5"
  local owners="$6"
  local before_sql="$7"
  local after_sql="$8"

  echo "== $key ==" | tee -a "$RESULTS"
  recreate "$db"
  if [[ -n "$before_sql" ]]; then
    run_file "$db" "$before_sql"
  fi
  local before after rolled
  before="$(md5_for "$db" "$relations" "$functions" "$owners")"
  run_file "$db" "$migration"
  after="$(md5_for "$db" "$relations" "$functions" "$owners")"
  run_file "$db" "$after_sql"
  local rollback
  rollback="$(mktemp /tmp/jj-rollback.XXXXXX.sql)"
  extract_rollback "$migration" > "$rollback"
  chmod a+r "$rollback"
  run_file "$db" "$rollback"
  rm -f "$rollback"
  rolled="$(md5_for "$db" "$relations" "$functions" "$owners")"
  echo "$key before_md5=$before" | tee -a "$RESULTS"
  echo "$key after_md5=$after" | tee -a "$RESULTS"
  echo "$key rollback_md5=$rolled" | tee -a "$RESULTS"
  if [[ "$before" != "$rolled" ]]; then
    echo "$key ROLLBACK_MD5_MISMATCH" | tee -a "$RESULTS"
    exit 1
  fi
  if [[ "$before" == "$after" ]]; then
    echo "$key AFTER_MD5_DID_NOT_CHANGE" | tee -a "$RESULTS"
    exit 1
  fi
  echo "$key rollback_match=yes" | tee -a "$RESULTS"
}

USER_REL="'public.user_roles'"
USER_FN="'public.admin_manage_user_role','public.user_roles_block_self_escalation'"
NONE=""
NO_OWNERS=""

run_case user_roles jj_sec_user_roles \
  "$MIG_DIR/20261003150000_user_roles_self_escalation_lock.sql" \
  "$USER_REL" "$USER_FN" "$NO_OWNERS" \
  "$TEST_DIR/before_user_roles.sql" "$TEST_DIR/after_user_roles.sql"

run_case contacts jj_sec_contacts \
  "$MIG_DIR/20261003150100_contacts_staff_only_rls.sql" \
  "'public.contacts','public.contact_properties'" "$NONE" "$NO_OWNERS" \
  "$TEST_DIR/before_contacts.sql" "$TEST_DIR/after_contacts.sql"

CAP_REL="'public.contact_opening_balances','public.partnership_capital','public.case_audit_log'"
run_case capital_audit jj_sec_capital \
  "$MIG_DIR/20261003150200_capital_balances_audit_staff_rls.sql" \
  "$CAP_REL" "$NONE" "$NO_OWNERS" \
  "$TEST_DIR/before_capital_audit.sql" "$TEST_DIR/after_capital_audit.sql"

echo "== capital_audit_no_actor ==" | tee -a "$RESULTS"
recreate jj_sec_no_actor
run_file jj_sec_no_actor "$TEST_DIR/swap_no_actor.sql"
no_before="$(md5_for jj_sec_no_actor "$CAP_REL" "$NONE" "$NO_OWNERS")"
run_file jj_sec_no_actor "$MIG_DIR/20261003150200_capital_balances_audit_staff_rls.sql"
run_file jj_sec_no_actor "$TEST_DIR/after_audit_no_actor.sql"
no_after="$(md5_for jj_sec_no_actor "$CAP_REL" "$NONE" "$NO_OWNERS")"
no_rollback="$(mktemp /tmp/jj-rollback.XXXXXX.sql)"
extract_rollback "$MIG_DIR/20261003150200_capital_balances_audit_staff_rls.sql" > "$no_rollback"
chmod a+r "$no_rollback"
run_file jj_sec_no_actor "$no_rollback"
rm -f "$no_rollback"
no_rolled="$(md5_for jj_sec_no_actor "$CAP_REL" "$NONE" "$NO_OWNERS")"
echo "capital_audit_no_actor before_md5=$no_before" | tee -a "$RESULTS"
echo "capital_audit_no_actor after_md5=$no_after" | tee -a "$RESULTS"
echo "capital_audit_no_actor rollback_md5=$no_rolled" | tee -a "$RESULTS"
if [[ "$no_before" != "$no_rolled" ]]; then
  echo "capital_audit_no_actor ROLLBACK_MD5_MISMATCH" | tee -a "$RESULTS"
  exit 1
fi
echo "capital_audit_no_actor rollback_match=yes" | tee -a "$RESULTS"

PMS_FN="'public.pms_resolve_mapping','public.pms_reservations_for_property'"
run_case pms jj_sec_pms \
  "$MIG_DIR/20261003150300_pms_rpc_revoke_authenticated.sql" \
  "$NONE" "$PMS_FN" "$NO_OWNERS" \
  "$TEST_DIR/before_pms.sql" "$TEST_DIR/after_pms.sql"

GRANT_REL="$(
  python3 - <<'PY'
import re
from pathlib import Path
text = Path("/workspace/supabase/migrations/20261003150400_anon_grant_hardening.sql").read_text()
tables = re.search(r"tables text\[\] := ARRAY\[(.*?)\];", text, re.S).group(1)
views = re.search(r"views text\[\] := ARRAY\[(.*?)\];", text, re.S).group(1)
names = re.findall(r"'([a-z0-9_]+)'", tables) + re.findall(r"'([a-z0-9_]+)'", views)
print(",".join(f"'public.{name}'" for name in names))
PY
)"

run_case grants jj_sec_grants \
  "$MIG_DIR/20261003150400_anon_grant_hardening.sql" \
  "$GRANT_REL" "$NONE" "'postgres','supabase_admin'" \
  "$TEST_DIR/before_grants.sql" "$TEST_DIR/after_grants.sql"

echo "== compose ==" | tee -a "$RESULTS"
recreate jj_sec_compose
run_file jj_sec_compose "$MIG_DIR/20261003150000_user_roles_self_escalation_lock.sql"
run_file jj_sec_compose "$MIG_DIR/20261003150100_contacts_staff_only_rls.sql"
run_file jj_sec_compose "$MIG_DIR/20261003150200_capital_balances_audit_staff_rls.sql"
run_file jj_sec_compose "$MIG_DIR/20261003150300_pms_rpc_revoke_authenticated.sql"
run_file jj_sec_compose "$MIG_DIR/20261003150400_anon_grant_hardening.sql"
run_file jj_sec_compose "$TEST_DIR/after_user_roles.sql"
run_file jj_sec_compose "$TEST_DIR/after_contacts.sql"
run_file jj_sec_compose "$TEST_DIR/after_capital_audit.sql"
run_file jj_sec_compose "$TEST_DIR/after_pms.sql"
run_file jj_sec_compose "$TEST_DIR/after_grants.sql"
echo "compose after_behaviors=pass" | tee -a "$RESULTS"

echo "ALL_LOCAL_PROOFS_PASSED" | tee -a "$RESULTS"
