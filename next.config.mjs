/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the app is bundled INTO the native shell (Tauri), so there is
  // no Node server, no hosting and no API routes. Everything runs on-device.
  output: 'export',
  distDir: 'dist',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true }
};

export default nextConfig;
