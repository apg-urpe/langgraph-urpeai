/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Headers de seguridad recomendados
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), browsing-topics=()',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Images optimization config
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'vecspltvmyopwbjzerow.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  
  // Transpile external packages if needed
  transpilePackages: ['lucide-react', 'recharts'],
  
  // Environment variables exposed to browser
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '4.0.0',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_COMMIT_HASH: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown',
  },
  
  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@supabase/supabase-js', 'zustand'],
  },
  
  // Webpack config for faster dev builds
  /*
  webpack: (config, { dev }) => {
    if (dev) {
      // Faster source maps in development
      config.devtool = 'eval-cheap-module-source-map';
      
      // Ignore SWC platform warnings
      config.infrastructureLogging = {
        level: 'error',
      };
    }
    return config;
  },
  */
};

module.exports = nextConfig;
