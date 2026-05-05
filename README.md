# AI Micro-Publisher

AI Micro-Publisher is a Vite + React + Express + tRPC application for controlled content publishing workflows.

It includes:

- topic discovery and topic review flows
- LLM-backed draft generation with spend tracking
- two-stage quality review with manual override
- publishing controls for approved pages
- public SEO pages at `/p/:slug`
- sitemap generation for published pages

## Stack

- React 19
- Vite 7
- Express
- tRPC
- Drizzle ORM
- MySQL/TiDB-compatible database
- BullMQ and Redis scaffolding for worker-backed milestones
- Vitest

## Local setup

1. Install dependencies:

```bash
corepack pnpm install --frozen-lockfile
```

2. Copy the example env file and fill in real values:

```bash
cp .env.example .env
```

3. Run database migrations:

```bash
corepack pnpm db:push
```

4. Start the app:

```bash
corepack pnpm dev
```

## Scripts

- `corepack pnpm dev` - start the local dev server
- `corepack pnpm build` - build client and server bundles
- `corepack pnpm start` - run the production build
- `corepack pnpm check` - run TypeScript checks
- `corepack pnpm test` - run the test suite
- `corepack pnpm db:push` - generate and apply Drizzle migrations

## Main routes

- `/admin/topics` - topic discovery and acceptance
- `/admin/generation` - generation jobs and draft review
- `/admin/quality` - quality review queue and overrides
- `/admin/publishing` - publish approved pages and inspect live URLs
- `/p/:slug` - public article page
- `/sitemap.xml` - sitemap for published pages

## Environment

See `.env.example` for the required variables.

The app expects:

- a database connection
- OAuth settings for admin authentication
- Forge API settings for storage and model calls
- an app base URL for public page links and sitemap generation

## Notes

- `node_modules`, `.manus`, `.manus-logs`, and other local artifacts are ignored.
- Public pages only resolve after a page has been moved from `approved` to `published`.
- The publish flow uses the resolved request host when `VITE_APP_URL` is not set.
