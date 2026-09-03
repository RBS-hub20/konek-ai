/** @type {import('next').NextConfig} */

/* NEXT_PUBLIC_APP_URL is deliberately NOT declared in `env` here.
   Anything put in `env` is inlined into the bundle at build time, which would
   freeze the URL to whatever was set during the build — on Vercel that is the
   per-deployment VERCEL_URL, not your production domain, and Twilio callbacks
   would then point at a stale preview host. Instead lib/env.ts resolves it at
   request time: NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost.
   This block only warns when it is missing. */
if (!process.env.NEXT_PUBLIC_APP_URL) {
  const fallback = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  console.warn(
    `[KONEK AI] NEXT_PUBLIC_APP_URL is not set — requests will fall back to ${fallback}. ` +
      'Set it to your production domain in the Vercel dashboard so Twilio callbacks and Stripe redirects stay stable.'
  );
}

const nextConfig = {
  reactStrictMode: true,

  /* No `output: 'export'` — the API routes need a server runtime. */

  images: {
    /* Brand assets are local files in /public. Remote HTTPS hosts are allowed
       so uploaded logos or CDN assets work without a config change. */
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },

  /* Keep a bad lint or type run from silently shipping. */
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
