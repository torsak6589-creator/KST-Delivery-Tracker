/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // xlsx is parsed only in server route handlers; keep it external to the bundle.
  experimental: { serverComponentsExternalPackages: ["xlsx"] },
};
export default nextConfig;
