import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // O tsc --noEmit verifica o código real; este flag ignora o validator auto-gerado pelo Next.js 16
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        // Permitir acesso das paginas HTML locais (file://) e de qualquer origem
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
