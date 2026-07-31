# ADR-0009: No ETA anywhere — distances only

`SCHEMA.md` discusses ETA implications (detours §4.4, hail-and-ride §5.4) but no speed assumption is ever defined, and PUJs run "full-then-go" with no schedule. We decided the navigation response carries **no duration** — only distance, fare, transfer count, and walk distance. No walking-time constant, no ride-time guess.

Rationale: any ETA is an ungrounded speed assumption that a panelist could challenge; the mobile app already shows honest live "Xm away" distance indicators via AR. The detour-ETA rule in SCHEMA §4.4 survives because it is really a _distance_ computation (which passengers are affected), not a time one.
