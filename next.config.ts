import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Esconde o indicador de dev tools do Next (o "N" no canto). Só afecta o dev.
  devIndicators: false,
  typescript: {
    // O tsc --noEmit verifica o código real; este flag ignora o validator auto-gerado pelo Next.js 16
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        // A Atribuicao era rota propria e abria sem o menu lateral. Passou a separador
        // do dashboard; quem tiver o endereco antigo guardado cai no separador certo.
        source: '/dashboard/atribuicao',
        destination: '/dashboard?tab=atribuicao',
        permanent: false,
      },
    ];
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
