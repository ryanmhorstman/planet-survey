# Operations

What an operator needs once PSU-7 is public: cost ceilings, abuse controls that live outside the repository, takedowns and key rotation.

## Cost ceiling

Every paid route reserves quota in Upstash before calling a provider (`reserve()` in `lib/server.js`). The Lua script enforces per-IP hourly limits, global daily limits and concurrency leases atomically, and fails closed when Redis is unreachable.

| Route                                   | Scope     | Per IP / hour | Global / day (default) | Concurrent |
| --------------------------------------- | --------- | ------------: | ---------------------: | ---------: |
| `/api/analyze`, expedition notes        | `analyze` |            20 |                    500 |          8 |
| `/api/agent` (one reservation per turn) | `analyze` |            20 |                    500 |          8 |
| `/api/image`, expedition images         | `image`   |            12 |                    100 |          3 |
| `/api/reports` (publish)                | `share`   |            20 |                    500 |          8 |

Limits count requests, not dollars. A field-researcher survey uses up to eight `analyze` reservations, so the agent spends the same daily pool as single field notes. Set provider-side spend limits as the final backstop.

**Known limitation:** the global daily caps are an availability target. A handful of IPs can use up the image pool for the day. A per-IP daily cap would not fix this (an attacker adds IPs); the fix, if it becomes necessary, is an account or proof-of-work gate on paid routes.

## Abuse controls outside the repository

`vercel.json` cannot express rate limits on free routes. Add two Vercel Firewall rate-limit rules in the project dashboard:

- `GET /api/reports`: each request with a random UUID costs a Blob read. Suggested: 60 requests per minute per IP.
- `GET /api/exoplanets`: proxies the NASA archive. Suggested: 30 requests per minute per IP.

## Public report takedown

Public reports are immutable Blob objects. To remove one:

```sh
node --env-file=.env.local scripts/delete-report.js <report-id>                 # dry run
node --env-file=.env.local scripts/delete-report.js <report-id> --yes           # delete the report
node --env-file=.env.local scripts/delete-report.js <report-id> --with-images --yes
```

Edge caches keep a copy for up to an hour (`s-maxage=3600`). Free text in public reports is limited to the report name (100 characters) and site names (80 characters each); field notes must carry a server signature or are replaced with the model note.

## Signing secret

`PSU7_SIGNING_SECRET` signs NASA catalogue records, AI field notes and images (`lib/attest.js`). Verification also accepts signatures made with `BLOB_READ_WRITE_TOKEN`, which signed everything before the dedicated secret existed, so existing links keep working.

To rotate: set a new `PSU7_SIGNING_SECRET` and redeploy. Reports published before rotation stay readable (reading does not re-verify), but re-publishing one needs fresh signatures, which means re-running its interpretation or images. Catalogue records cached in browsers are re-signed the next time a visitor opens the catalogue.

## Live eval

`npm run eval:live` runs 40 stratified worlds through the production field-note request and writes every response to `evals/runs/`. With `claude-opus-5-5` at effort `low`, expect roughly $1 to $2 per run; the script prints the token totals. Re-score a saved run without new calls:

```sh
node scripts/eval-narratives.js --replay evals/runs/<file>.jsonl
```
