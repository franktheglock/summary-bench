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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
