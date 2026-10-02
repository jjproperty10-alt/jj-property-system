#!/usr/bin/env bash
# Local isolated Postgres runner. Does not use Docker and does not touch a remote database.
# Installs the previous finance reader, the untouched public wrapper, and
# public.read_client_settlement_balance, snapshots with the previous reader,
# then applies 20261002150000 and the assertion matrix.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DB="${JJ_SEQ_READER_DB:-jj_seq_reader}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)

OLD_READER="$(mktemp)"
BALANCE="$(mktemp)"
trap 'rm -f "$OLD_READER" "$BALANCE"' EXIT

python3 - "$ROOT" "$OLD_READER" "$BALANCE" <<'PY'
import pathlib, sys
root, old_path, bal_path = sys.argv[1:]
src = pathlib.Path(root, "supabase/migrations/20260919190000_client_cash_settlement_execution.sql").read_text()
start = src.index("CREATE OR REPLACE FUNCTION finance.read_certified_client_settlement(")
end = src.index("CREATE OR REPLACE FUNCTION public.read_client_settlement_balance(")
pathlib.Path(old_path).write_text(src[start:end])
bal_start = end
# Grants for the staff reader end the object. Stop before anything after that GRANT.
marker = "GRANT EXECUTE ON FUNCTION public.read_client_settlement_balance(UUID, DATE) TO authenticated;"
bal_end = src.index(marker, bal_start) + len(marker) + 1
pathlib.Path(bal_path).write_text(src[bal_start:bal_end])
PY
chmod a+r "$OLD_READER" "$BALANCE"

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB};"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/20261002150000_certified_settlement_sequence_reader/00_harness.sql"
"${PSQL[@]}" -d "$DB" -f "$OLD_READER"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20260919180000_public_read_certified_client_settlement.sql"
"${PSQL[@]}" -d "$DB" -f "$BALANCE"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/20261002150000_certified_settlement_sequence_reader/01_fixtures.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20261002150000_certified_settlement_sequence_reader.sql"
"${PSQL[@]}" -d "$DB" --quiet -f "$ROOT/supabase/tests/20261002150000_certified_settlement_sequence_reader/99_matrix.sql" \
  > /tmp/jj_seq_reader_matrix.out

echo "----- matrix -----"
cat /tmp/jj_seq_reader_matrix.out
python3 - <<'PY'
from pathlib import Path
text = Path("/tmp/jj_seq_reader_matrix.out").read_text()
# psql aligned output: rows with | f | are failures when unaligned is off.
# The runner uses default aligned format. Fail if a line contains " f " as the passed column
# or the word false. Also accept the aligned boolean "f".
failed = []
for line in text.splitlines():
    parts = [p.strip() for p in line.split("|")]
    if len(parts) >= 2 and parts[1] in {"f", "false"}:
        failed.append(line)
if failed:
    print(f"FAILED {len(failed)}")
    for line in failed:
        print(line)
    raise SystemExit(1)
if "sequence_after_cash_is_518_75_in_client_favour" not in text:
    print("matrix output missing expected tests")
    raise SystemExit(1)
print("ALL ASSERTIONS PASSED")
PY
