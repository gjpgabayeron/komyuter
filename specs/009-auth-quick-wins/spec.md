# Feature Specification: Auth Quick Wins

**Feature Branch**: `009-auth-quick-wins`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "For now, let's improve the current auth system while considering the features we planned o the future. Quick win auth fixes."

## Clarifications

### Session 2026-08-10

- Q: What counts as "the same source" for throttling? → A: Throttling is tracked both per network source (IP) and per account, with throttled denials kept indistinguishable from other denied outcomes (FR-005).
- Q: Should security events be recorded? → A: Yes — every security event (sign-in success, sign-in failure, throttling block, sign-out) is written to structured server logs with account, network source, and outcome; no new UI or database.
- Q: When the server is unreachable at startup, what should the admin see? → A: An explicit "backend unreachable" state with a retry action; the stored session is not cleared and the situation is never presented as an expired session.

## User Scenarios & Testing

### User Story 1 - Graceful session expiry (Priority: P1)

An administrator has been signed in for a while and their session expires while they work. The system ends the session, returns them to the sign-in screen with a clear "session expired" message, and remembers the page they were on. After signing in again, they land back on that page and resume their work.

**Why this priority**: Today an expired session silently leaves the administrator on a dashboard whose actions all fail, with no way back except manually navigating to the sign-in screen. This is the most visible defect in the current experience for the primary user.

**Independent Test**: Can be fully tested by signing in, letting the session expire, performing an action, and observing the automatic return to sign-in with the "session expired" message; then signing in again and confirming the return to the same page.

**Acceptance Scenarios**:

1. **Given** an expired session, **When** the administrator performs any action, **Then** they are taken to the sign-in screen and see a clear "session expired" message.
2. **Given** an expired session and a page the administrator was on, **When** they sign in again, **Then** they are returned to that page.
3. **Given** a still-valid session, **When** the administrator performs an action, **Then** no sign-out or expiry message appears.
4. **Given** an expired session, **When** the administrator signs in again with correct credentials, **Then** the sign-in succeeds normally (an expired session never blocks a fresh sign-in).

---

### User Story 2 - Backend unreachable at startup (Priority: P2)

When the administration dashboard loads but the backend cannot be reached, the system shows an explicit "backend unreachable" state with a retry action, and does not treat the situation as a sign-out. The stored session is left untouched, so once the backend is reachable again the administrator continues to the dashboard without re-signing in.

**Why this priority**: Today any failure during the startup session check — including a network blip or a stopped backend — is treated as "not signed in", wrongly sending the administrator to the sign-in screen and discarding a perfectly valid session (SECURITY.md finding L3).

**Independent Test**: Can be fully tested by loading the dashboard with the backend stopped, observing the "backend unreachable" state with a retry action, then starting the backend, retrying, and confirming the administrator continues to the dashboard without re-signing in.

**Acceptance Scenarios**:

1. **Given** the backend is unreachable when the dashboard loads, **When** the administrator opens the dashboard, **Then** they see an explicit "backend unreachable" state with a retry action, not the sign-in screen.
2. **Given** the backend unreachable at dashboard load, **When** the dashboard opens, **Then** the stored session is not cleared and no "session expired" message appears.
3. **Given** the backend recovers, **When** the administrator retries, **Then** they continue to the dashboard with their session intact, without re-signing in.

---

### User Story 3 - Hardened sign-in (Priority: P2)

Repeated failed sign-in attempts from the same source are throttled so automated password guessing cannot proceed. A denied sign-in looks identical whether the password was wrong or the credentials were valid but lacked administrative access — the system does not reveal that an account exists or that a password was correct. No one can create a new account through public self-signup, and provisioned accounts must use passwords of at least 8 characters and confirm their email before first use.

**Why this priority**: These are the classic abuse and account-discovery holes in the current sign-in flow, and they are cheap to close now.

**Independent Test**: Can be fully tested by observing throttling after repeated failed attempts, comparing the denied outcomes of a wrong password versus a valid non-admin credential, attempting public sign-up and seeing it refused, and verifying the password-length and email-confirmation rules.

**Acceptance Scenarios**:

1. **Given** 6 failed sign-in attempts within 5 minutes from the same network or against the same account, **When** a further attempt is made, **Then** it is refused and further attempts stay refused for at least 15 minutes.
2. **Given** a source under throttling, **When** a sign-in from that source succeeds, **Then** the failed-attempt count is cleared (a legitimate administrator is not permanently locked out).
3. **Given** a wrong password, **When** the administrator submits, **Then** the outcome is identical in wording and timing to the case of valid credentials without administrative access.
4. **Given** the public sign-up flow, **When** an unauthenticated visitor attempts to create an account, **Then** the attempt is refused.
5. **Given** a newly provisioned account whose email is not yet confirmed, **When** the owner signs in, **Then** sign-in is refused until the email is confirmed.
6. **Given** a provisioned account with a password shorter than 8 characters, **When** provisioning is attempted, **Then** it is rejected.
7. **Given** any sign-in success, sign-in failure, or throttling block, **When** the event occurs, **Then** a structured log record containing the account, network source, and outcome is written.
8. **Given** a sign-out or an expired session, **When** the session ends, **Then** a structured log record containing the account and outcome is written.

---

### User Story 4 - Dashboard and backend hardening without broken workflows (Priority: P3)

The administration dashboard blocks execution of any script that is not part of its own approved code, the backend refuses requests that do not come from the dashboard itself, and every administrative action is checked against one consistent authorization rule so that granting or revoking access applies uniformly everywhere. All existing administrator workflows continue to work unchanged.

**Why this priority**: This is layered defense against the biggest client-side risk (an injected script reading a stored credential) plus the foundation seam that the planned permission-based access (RBAC) will build on.

**Independent Test**: Can be fully tested by attempting to run an injected script and seeing it blocked, sending a request from a foreign site and seeing it refused, revoking an administrator and observing immediate uniform loss of access, and running each existing workflow to confirm no regressions.

**Acceptance Scenarios**:

1. **Given** a dashboard page, **When** page content attempts to execute a script that is not part of the dashboard's approved code, **Then** the script is blocked and does not run.
2. **Given** the administration dashboard, **When** a request arrives that did not originate from the dashboard itself, **Then** the backend refuses it.
3. **Given** a revoked administrator whose sign-in token is still technically valid, **When** they attempt any administrative action, **Then** every action is denied uniformly (no action remains accessible).
4. **Given** all hardening in place, **When** an administrator performs each existing workflow (viewing and editing routes, fares, and the dataset export), **Then** all workflows complete successfully.

---

### Edge Cases

- Session expires while the administrator has unsaved edits in a form: the return-to-sign-in flow must show the expiry message; unsaved edits are not restored (accepted behavior, stated on the message).
- Session expires between page load and a save action: the save must fail cleanly with the expiry message rather than a confusing error, and re-signing in must not cause a duplicate submission.
- Throttling false positive: a legitimate administrator who mistypes several times (or two administrators sharing one network) is blocked for the window — accepted; a successful sign-in clears the counter for that source and account.
- Browser back/forward navigation after the expiry redirect must not resurrect the dead session's view.
- Security hardening must not break map display and search inside the dashboard (map rendering and geocoding are part of existing workflows).
- An action that runs longer than the remaining session time (e.g. a large export) must fail cleanly on expiry without corrupting its output; the administrator re-signs in and retries.
- Backend unreachable at dashboard load must be presented as "unreachable", never as "expired" or a sign-out.

## Requirements

### Functional Requirements

- **FR-001**: When an administrator's session expires, the system MUST end the session and return them to the sign-in screen with a clear "session expired" message.
- **FR-002**: The system MUST remember the page the administrator was on and return them to it after a fresh sign-in.
- **FR-003**: The system MUST refuse further sign-in attempts after at most 5 failed attempts within any 5-minute window, tracked both per network source and per account, with the block lasting at least 15 minutes.
- **FR-014**: The system MUST record every security event — successful sign-in, failed sign-in, throttling block, and sign-out — in structured server logs, each with the account, network source, and outcome.
- **FR-015**: When the backend cannot be reached while the dashboard loads, the system MUST show an explicit "backend unreachable" state with a retry action, MUST NOT clear the stored session, and MUST NOT present the situation as an expired session.
- **FR-004**: The system MUST clear the failed-attempt count for a source once a sign-in from that source succeeds.
- **FR-005**: A denied sign-in MUST produce an outcome that is indistinguishable in wording and timing between "wrong password" and "valid credentials without administrative access".
- **FR-006**: The administration service MUST refuse public self-service account creation.
- **FR-007**: Newly provisioned administrator accounts MUST use passwords of at least 8 characters.
- **FR-008**: Newly provisioned administrator accounts MUST confirm their email address before their first sign-in.
- **FR-009**: The administration dashboard MUST block execution of any script that is not part of its own approved code.
- **FR-010**: The administration backend MUST refuse requests that do not originate from the administration dashboard itself.
- **FR-011**: Every administrative action MUST be authorized by one consistent rule, so that granting or revoking an administrator changes their access uniformly across all actions without exception.
- **FR-012**: Deployments beyond local development MUST NOT use the documented development credential; that credential is accepted only in the local development environment.
- **FR-013**: The hardening MUST NOT break existing administrator workflows (viewing and editing routes and fares, dataset export, map display and search).

### Key Entities

- **Administrator Account**: an identity allowed to use the administration dashboard; has credentials, an email, a confirmed/unconfirmed state, and is granted or revoked access as a whole.
- **Sign-in Session**: a time-limited access right granted after sign-in; expires and must be re-established; the subject of the "session expired" experience.
- **Sign-in Attempt**: a record of a failed sign-in from a source; drives throttling; cleared on success.
- **Authorization Rule**: the single rule that decides whether a signed-in administrator may perform an administrative action; the future home of role- and permission-based access (RBAC).

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of expired sessions end with the administrator returned to the sign-in screen showing "session expired", and re-sign-in returns them to the same page within 1 minute.
- **SC-002**: 100 consecutive automated sign-in attempts from one network source, or against one account, yield zero successful sign-ins.
- **SC-003**: An observer cannot determine from the sign-in outcome whether an account exists or a password was correct (denied outcomes are identical).
- **SC-004**: Public self-signup produces zero new accounts.
- **SC-005**: Every existing administrator workflow still completes successfully after the hardening (0 regressions).
- **SC-006**: A revoked administrator's access to every administrative action ends immediately (uniform revocation).
- **SC-007**: 100% of security events (sign-in success, sign-in failure, throttling block, sign-out) produce a structured log record containing the account, network source, and outcome.
- **SC-008**: 100% of dashboard loads with an unreachable backend show the "backend unreachable" state with a retry action, and the stored session survives until the backend is reachable again.

## Assumptions

- Scope is the administration dashboard and its backend only; the anonymous commuter app is out of scope (ADR-0006).
- The quick win for expired sessions is a clean sign-out plus re-sign-in. Silent refresh or a cookie-based session is a future decision and out of scope; this feature must not block it.
- The authorization rule remains a single binary grant/revoke for now; role- and permission-based access (RBAC, SECURITY.md §6.2) is a planned future feature that this feature's single-rule requirement sets up.
- Local development keeps a development credential for convenience; production-like deployments must use a different one (FR-012).
- The existing development administrator is exempt from email confirmation in local development only.
- Password change and reset flows are managed by the identity provider and are out of scope.
- The throttle numbers (5 attempts / 5 minutes, 15-minute block) are reasonable defaults and may be tuned at planning time without changing the requirement's intent.
