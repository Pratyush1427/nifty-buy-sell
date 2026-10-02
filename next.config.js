/** @type {import('next').NextConfig} */
module.exports = {
  // Lets a second build (tests, CI) use its own output folder instead of
  // clobbering the .next that a running `npm run dev` depends on.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // Index member lists are read from data/*.csv at runtime; make sure the
    // serverless bundles include them.
    outputFileTracingIncludes: {
      '/api/**/*': ['./data/*.csv'],
    },
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};
