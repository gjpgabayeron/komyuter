# Contract — Security-event log lines

**Producer**: Fastify server pino logger (`request.log` / `app.log`).
**Consumer**: operator / server logs (grep-able JSON lines); no UI, no database.

## Shape

```jsonc
{
  "level": "info",
  "time": "2026-08-10T09:30:00.000Z",
  "reqId": "req-1",
  "event": "security.sign_in_success", // catalog below
  "account": "admin@komyuter.ph", // email or user id; "unknown" if unresolvable
  "source": "127.0.0.1", // request.ip
  "outcome": "success", // success | denied | throttled | signed_out
}
```

`reqId`, `time`, and `level` come from pino/Fastify; `event`, `account`, `source`,
and `outcome` are the security payload. When the request has no resolvable
identity (e.g. login with bad credentials), `account` is the attempted email;
for sign-out with an unresolvable token it is `"unknown"`.

## Event catalog (FR-014 / SC-007)

| `event`                      | Trigger                                                                                 | `outcome`    | `account`                  |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------ | -------------------------- |
| `security.sign_in_success`   | valid admin credentials accepted                                                        | `success`    | email                      |
| `security.sign_in_failure`   | unified denial: wrong password / non-admin / unconfirmed email / dev-credential refused | `denied`     | attempted email            |
| `security.sign_in_throttled` | throttler pre-check refusal                                                             | `throttled`  | attempted email            |
| `security.sign_out`          | `POST /api/auth/logout` (any token state)                                               | `signed_out` | token subject or `unknown` |

## Guarantees

- **Every** security event from the catalog produces exactly one structured line
  (SC-007: 100% coverage).
- Denial _reasons_ appear only here — never in HTTP responses (FR-005).
- Emitted on the request logger when a request context exists, so lines are
  correlate-able by `reqId` with the request audit hook (`app.ts:40-57`).
