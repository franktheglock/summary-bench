This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Storage Modes

The app supports two backends:

1. Local SQLite for local development.
2. Supabase for hosted deployments such as Cloudflare.

The backend is controlled by `SUMMARYARENA_STORAGE`:

- `auto` (default): use Supabase when configured, otherwise fall back to local SQLite.
- `sqlite`: force the local file-backed database.
- `supabase`: force Supabase and fail fast if the env vars are missing.

### Local SQLite

Run the app from the `web/` folder as usual.

The database file is created automatically at `web/data/summaryarena.sqlite` on first upload.

If you want a different path, set `SQLITE_PATH` in `web/.env.local`.

### Cloudflare + Supabase

This is the intended hosted setup.

1. Create a Supabase project.
2. Run the SQL in `web/supabase/schema.sql` in the Supabase SQL editor.
3. In Cloudflare, set these environment variables:

	- `SUMMARYARENA_STORAGE=supabase`
	- `SUPABASE_URL=...`
	- `SUPABASE_ANON_KEY=...`

4. Optionally set `SUPABASE_SERVICE_ROLE_KEY` for server-side writes.

If you also want a local copy while developing, keep `SUMMARYARENA_STORAGE=sqlite` or unset the Supabase variables in `web/.env.local`.

The upload endpoint is `web/app/api/upload/route.ts`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

### Recommended: Vercel

For this app, Vercel is the better free-tier target.

Why:

- This is a full-stack Next.js app with server routes, which Vercel supports directly.
- Vercel's current hobby guidelines are much more forgiving for this type of workload than Cloudflare Workers Free.
- Cloudflare Free is tighter for SSR apps because Workers Free has a 100,000 requests per day cap and a 10 ms CPU limit per request, while full-stack Next.js on Cloudflare also needs an extra Workers adapter setup.

Current docs references:

- Vercel hobby fair-use guidance includes roughly `100 GB` fast data transfer, `100 GB-hours` function execution, and `100 build hours` per month.
- Cloudflare Pages Free allows `500` builds per month, but Pages Functions usage still counts against Workers Free limits.

### Vercel settings

When creating the project in Vercel:

1. Import the repository.
2. Set the Root Directory to `web`.
3. Framework Preset should auto-detect as `Next.js`.
4. Build Command: `npm run build`
5. Install Command: `npm install`
6. Leave Output Directory empty.

Add these environment variables in Vercel:

- `SUMMARYARENA_STORAGE=supabase`
- `SUPABASE_URL=...`
- `SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUMMARYARENA_MODERATOR_EMAILS=alice@example.com,bob@example.com`
- `SUMMARYARENA_MODERATOR_IDS=uuid-1,uuid-2`

Do not add `SQLITE_PATH` in production.

### Moderator Access

Moderator login is controlled by a server-side allowlist. Set either of these environment variables:

- `SUMMARYARENA_MODERATOR_EMAILS` - comma-separated GitHub email addresses allowed to access `/moderator`
- `SUMMARYARENA_MODERATOR_IDS` - comma-separated Supabase user IDs allowed to access `/moderator`

If both are set, a user only needs to match one of them.

### Cloudflare alternative

Cloudflare is still possible, but it is not the shortest path for this repo.

For a full SSR Next.js deployment there, you would want the Next.js Workers path rather than plain Pages static hosting. That means adding the Cloudflare Next.js adapter and validating the app against Workers limits.

If you want the fastest launch, use Vercel first and revisit Cloudflare only if you specifically want its network model or pricing after hobby limits.
