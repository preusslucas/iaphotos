/**
 * Formatação compartilhada entre servidor e navegador.
 *
 * Mora aqui, e não em `src/content`, porque componentes de CLIENTE precisam
 * dela. O `content` importa prisma e o cliente do MinIO; um `import` de valor
 * vindo do browser arrastaria os dois para o bundle e o build quebra com
 * "Can't resolve 'fs'" — o minio é código de servidor.
 *
 * Regra prática: o que o navegador importa não pode morar no mesmo módulo que
 * fala com banco ou storage.
 */
export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
