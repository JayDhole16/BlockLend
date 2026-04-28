/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  },
  // Allow standalone output for Docker
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

module.exports = nextConfig;
