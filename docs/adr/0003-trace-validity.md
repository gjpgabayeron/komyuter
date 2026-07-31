# ADR-0003: Trace validity uses maximum-speed discriminator, not average-speed window

The docs specified rejecting traces whose average speed falls outside 5–40 km/h. We replaced this with a maximum-instantaneous-speed discriminator: reject if max < 10 km/h (never moved) or max > 45 km/h (not a PUJ). Average speed is congestion-sensitive — a jeepney crawling through Iloilo City Proper peak traffic or standing at stops legitimately averages under 5 km/h — while max speed still separates walking (≤10), PUJ (≤45), and private car (>45) robustly.

Duration (>3 min) and coverage (≥60% of route length) filters are kept unchanged. Trace counts are raw submissions, not distinct commuters — no dedup is attempted, and the trust badge language ("Verified · 15 traces") reflects this. Trust scoring is an Inc 4 bonus feature, not on the PSSUQ critical path — it must be functional enough to demo but does not gate evaluation.
