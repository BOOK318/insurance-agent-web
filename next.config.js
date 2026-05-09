const appUrl = process.env.NEXT_PUBLIC_APP_URL;
let allowedDevOrigins = [];
try {
  if (appUrl) {
    const url = new URL(appUrl);
    allowedDevOrigins = Array.from(new Set([url.hostname, url.host]));
  }
} catch {
  allowedDevOrigins = [];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  allowedDevOrigins,
  webpack: config => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      'pg-native': false,
    };
    return config;
  },
};

module.exports = nextConfig;
