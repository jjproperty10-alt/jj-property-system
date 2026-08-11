# Supabase Edge Functions — recovered deployed source

These are **recovered, verbatim copies** of the Hostaway/PMS Edge Functions currently deployed
in Supabase project `vsiiprzjrstjcmjpwcrd`, captured **2026-08-11** as part of the
Hostaway P0 source-control recovery. See `../../docs/hostaway/DEPLOYED_STATE_2026-08-11.md`.

**This recovery changed no production behavior.** No function was redeployed, modified, or
reformatted for behavior. The files reflect deployed truth so future changes can be reviewed
from Git rather than edited only in the deployed environment.

## Functions
| slug | deployed ver | verify_jwt | role |
|---|---|---|---|
| `pms-hostaway-auth-test` | v2 | true | read-only Hostaway auth probe |
| `pms-hostaway-sync-listings` | v4 | true | listings ingestion (external_id keyed) |
| `pms-hostaway-sync-reservations` | v6 | true | reservations ingestion (external_id keyed) |
| `pms-admin-status` | v2 | true | admin/monitoring read (auth required, anon 403) |
| `pms-hostaway-webhook` | v1 | **false** | webhook receiver, Basic-auth via Vault `hostaway_webhook_auth` |
| `pms-hostaway-register-webhook` | v1 | true | one-off webhook registration |
| `pms-hostaway-finance-query` | v1 | true | read-only Hostaway financeCalculatedField probe |

**Excluded:** `jj-qa-auth-helper` (QA magic-link helper, not Hostaway; contains a hardcoded gate
string — see manifest). Deliberately not recovered here.

## Config note
`verify_jwt` is stored in Supabase per-function config (not in these files). `pms-hostaway-webhook`
runs with `verify_jwt=false` because Hostaway cannot present our JWT; it is instead protected by
HTTP Basic auth checked against a Vault secret. All others require `verify_jwt=true`.

## Secrets
No secret values are committed. Runtime secrets are read from env (`SUPABASE_DB_URL`) and Supabase
Vault (`edge_invoke_key`, `hostaway_webhook_auth`, per-connection `credentials_ref`, and the legacy
fixed names `hostaway_account_id` / `hostaway_client_secret`).
