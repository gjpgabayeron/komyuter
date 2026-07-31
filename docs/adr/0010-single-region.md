# ADR-0010: Single connected regional graph — no city discriminator

`OVERVIEW.md` lists "multi-city scalability" as an admin feature and `SUMMARY.md` defers expansion to other cities to future work, but the thesis scope is one region: Iloilo City Proper + Oton, Pavia, Leganes, forming a single connected transit graph (transfer edges cross municipal boundaries). We chose to model **one regional graph with no `city` column** anywhere in the schema.

Multi-city would require city-scoped CRUD and cross-city graph isolation — multi-tenant machinery nobody exercises before defense day, and an extra panel question to defend. Route naming stays free-form (`name`, `short_name`) so an admin could later distinguish regions without a schema change. Expansion to other cities remains a stated future-work item.
