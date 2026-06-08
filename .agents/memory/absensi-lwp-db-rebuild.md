---
name: AbsensiLWP db rebuild rule
description: After any schema change in lib/db/src/schema, the dist/ type declarations must be regenerated or tsc type-checking fails for all consumers.
---

## Rule

After adding or modifying tables in `lib/db/src/schema/index.ts`, always run:

```
pnpm --filter @workspace/db exec tsc --build
```

This regenerates `lib/db/dist/` (`.d.ts` + `.d.ts.map` files) so TypeScript project references in `artifacts/api-server` can see the new exports.

**Why:** `lib/db/tsconfig.json` uses `"composite": true` with `"emitDeclarationOnly": true`. The API server's `tsconfig.json` uses `"references": [{ "path": "../../lib/db" }]`, so TypeScript resolves `@workspace/db` to the compiled `dist/` output — NOT the source `.ts` files directly. If `dist/` is stale, `tsc --noEmit` reports "Module '@workspace/db' has no exported member 'X'" even though the source is correct.

**How to apply:** Any time you add a table, column, or type export to `lib/db/src/schema/index.ts`, run the build command above before running `tsc --noEmit` checks. The esbuild runtime (`pnpm run dev` on the API server) is unaffected — it bundles directly from source and ignores this issue.
