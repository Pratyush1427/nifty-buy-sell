/** @type {import('next').NextConfig} */
module.exports = {
  // Lets a second build (tests, CI) use its own output folder instead of
  // clobbering the .next that a running `npm run dev` depends on.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
