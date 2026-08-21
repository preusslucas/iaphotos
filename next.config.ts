import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Sem isto o Turbopack sobe a árvore procurando lockfile e acha um
  // pnpm-lock.yaml perdido no diretório do usuário, fora do repositório.
  turbopack: { root: path.resolve(import.meta.dirname) },

  // Gera .next/standalone com um server.js e só as deps usadas — a imagem
  // Docker final fica pequena e não precisa de node_modules completo.
  output: 'standalone',

  experimental: {
    // O upload de referência no /admin passa PELO servidor, via Server Action,
    // e o limite padrão é 1MB — foto de celular estoura isso fácil. O erro que
    // aparece nesse caso não diz "arquivo grande", diz que a ação falhou, então
    // custa caro para descobrir. 10MB bate com o que `subirReferencia` valida.
    //
    // Só vale para o /admin: a selfie do cliente NÃO passa por aqui, vai direto
    // ao MinIO por URL pré-assinada.
    serverActions: { bodySizeLimit: '10mb' },
  },

  // sharp roda no worker e nas rotas de API; deixá-lo fora do bundle evita
  // que o Turbopack tente empacotar o binário nativo.
  serverExternalPackages: [
    'sharp',
    '@prisma/client',
    'bullmq',
    'ioredis',
    'minio',
    // tfjs resolve pesos e backend em runtime; empacotar quebra o carregamento.
    '@tensorflow/tfjs-core',
    '@tensorflow/tfjs-converter',
    '@tensorflow/tfjs-backend-cpu',
    '@tensorflow-models/blazeface',
  ],

  images: {
    // Todo asset servido ao usuário vem do MinIO por URL assinada. Nada de
    // domínio aberto aqui: o padrão é negar e liberar só o nosso bucket.
    remotePatterns: process.env.NEXT_PUBLIC_ASSET_HOST
      ? [{ protocol: 'https', hostname: process.env.NEXT_PUBLIC_ASSET_HOST }]
      : [],
  },
};

export default nextConfig;
