# ADR-0004: Backend framework is Fastify v5, not Express

`TECHSTACK.md` and `OVERVIEW.md` specify Fastify v5; `SUMMARY.md` specifies Express 4.x — the docs contradict each other. We chose **Fastify v5**, matching the primary stack docs and its coherent plugin ecosystem (`@fastify/rate-limit`, `@fastify/cors`; authentication is via Supabase Auth, ADR-0006). Native Zod integration (`fastify-type-provider-zod`) pairs with the shared Zod schemas in `@komyuter/shared`, and schema-based serialization gives a defensible performance number for the thesis defense.

`SUMMARY.md`'s Express references (including jsonwebtoken+bcrypt, Helmet, Swagger) are superseded and must be corrected wherever they appear.
