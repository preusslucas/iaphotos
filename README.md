# ia-photos

Gerador de fotos com IA vendido direto ao consumidor: o usuário envia uma selfie, escolhe uma cena,
paga por Pix e recebe em cerca de um minuto uma imagem fictícia ao lado de uma figura pública.

Estado atual, decisões tomadas e o que ainda falta: [HANDOFF.md](HANDOFF.md).
Como subir em produção: [DEPLOY.md](DEPLOY.md).

## Arquitetura

```
web     Next.js 16 (App Router, standalone)  — landing, upload, checkout, webhook, status
worker  Node + BullMQ                         — geração de imagem, pós-processamento, retenção
postgres  catalogo (figuras, cenas, referencias), pedidos, itens, jobs, assets, consentimentos
redis     fila BullMQ + rate limit
minio     selfies (retenção curta) e resultados (bucket privado)
```

Web e worker vivem no mesmo repositório e compartilham [src/lib/](src/lib/). São dois Dockerfiles
sobre o mesmo código, com comandos diferentes.

## Rodando local

```bash
cp .env.example .env      # ajuste as chaves; os valores de infra já casam com o compose
docker compose up -d      # postgres + redis + minio
pnpm install
pnpm db:migrate           # cria o schema
pnpm db:seed              # popula o catalogo (figuras e cenas) no banco
pnpm dev                  # web  → http://localhost:3000
pnpm dev:worker           # worker, em outro terminal
```

Verificação rápida de que a infra está de pé:

```bash
curl -s localhost:3000/api/health | jq
```

Ele checa Postgres, Redis e MinIO de verdade — um 200 aqui significa que as três respondem.
Console do MinIO em http://localhost:55901 (`iaphotos` / `iaphotos123`).

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` / `pnpm dev:worker` | Desenvolvimento (Turbopack / tsx watch) |
| `pnpm build` | `prisma generate` + `next build` + bundle do worker |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm db:migrate` | Cria e aplica migração em dev |
| `pnpm db:deploy` | Aplica migrações pendentes (produção) |
| `pnpm db:studio` | Prisma Studio |

## Fluxo do pedido

```
/[figura]          landing → cena → enquadramento → clima → selfie ─┐
                                                        │           │
                                        POST /api/orders│           │ router.push
                                        (PENDING + URL  │           │
                                         pré-assinada)  │           │
                                      PUT direto no MinIO┘          │
                                                                    ▼
/[figura]/oferta                          oferta → checkout → processando → resultado
                                                      │            │
                                       POST /api/checkout          │ GET /status (polling 2s)
                                       (Pix no Mercado Pago)       │ GET /result (paywall)
                                                                   │
       POST /api/webhooks/mercadopago ─────────────────────────────┘
       (assinatura validada → PAID → enfileira → worker gera N fotos)
```

**São duas rotas, não uma.** A fronteira fica no upload, e é onde o pedido passa a existir no
servidor. O mesmo componente (`Funnel`) monta nas duas, com `inicio="landing"` ou `inicio="oferta"`
— o que atravessa entre elas é o rascunho no `localStorage`, que já guardava `orderId`,
`accessToken`, a cena e a cobrança. A rota `/oferta` não valida nada no servidor: sem rascunho, o
cliente devolve a pessoa para a landing.

O desenho veio da LP feita no Lovable, onde a oferta era `/oferta`. O que a URL compra: o "voltar"
do navegador funciona, quem fecha a aba para abrir o app do banco reabre direto no Pix, e a queda
entre as duas páginas vira um número mensurável no pixel.

A entrega acontece na própria tela de resultado — **não há envio por e-mail**. `/r/[token]` existe
como link assinado de 30 dias, mas nada o dispara hoje.

Um pedido pode ter mais de uma foto: R$19,90 entrega uma, R$29,90 entrega as três do combo. Cada
foto é um `OrderItem` e falha sozinha — se a do adicional quebrar, a principal não vai junto.

O painel fica em `/admin` (senha em `ADMIN_PASSWORD`).

## Onde mexer para cada coisa

| Quero... | Onde |
|---|---|
| Mudar copy, preço, cenas, referências ou amostras | **`/admin`** — não há deploy no caminho |
| Mexer no visual da landing | [src/components/funnel/Landing.tsx](src/components/funnel/Landing.tsx) |
| Mexer na tela de preço e combo | [src/components/funnel/OfertaStep.tsx](src/components/funnel/OfertaStep.tsx) |
| Trocar cores, degradês ou sombras | [src/app/globals.css](src/app/globals.css) — leia os comentários de contraste antes |
| Colocar as fotos dos depoimentos | [public/depoimentos/README.md](public/depoimentos/README.md) |
| Lançar outra figura | `/admin` → "+ Nova figura" |
| Ajustar os prompts do gerador | [src/lib/prompts.ts](src/lib/prompts.ts) — meça no `spike/` antes |
| Trocar o texto de consentimento | [src/content/terms.ts](src/content/terms.ts) — **incremente `TERMS_VERSION`** |
| Mexer no pipeline de geração | [src/worker/generation.ts](src/worker/generation.ts) |
| Subir em produção | [DEPLOY.md](DEPLOY.md) |

## Decisões que valem saber antes de mexer

**As variáveis de ambiente são validadas preguiçosamente** ([src/lib/env.ts](src/lib/env.ts)). Se a
validação rodasse no import, o `next build` dentro do Docker quebraria, porque a imagem é construída
sem os secrets. Do jeito atual o build passa e um deploy mal configurado falha no boot com mensagem
clara — em vez de dar 500 na primeira venda.

**A geração só é enfileirada pelo webhook do Mercado Pago**, nunca por sinal vindo do front. E são
duas barreiras independentes contra cobrar duas vezes pelo mesmo pedido: `mpPaymentId` é `@unique`
no banco e o `jobId` do BullMQ é o próprio `orderId`.

**A migração roda no boot do container web, nunca no worker.** Se os dois migrassem, um pegaria o
lock e o outro morreria no deploy.

**`NEXT_PUBLIC_*` são inlinados no bundle durante o build.** No Coolify, elas precisam ser build
args em [Dockerfile.web](Dockerfile.web) — injetar só como env de runtime não tem efeito no código
do browser.

**Os prompts nunca chegam ao browser.** `toPublicFigure()` em [src/content/index.ts](src/content/index.ts)
tira `setting`, `referenceKeys` e a LoRA antes de o config atravessar para o Client Component. Tudo
que um Server Component passa adiante fica visível no "ver código-fonte", e os prompts são o
resultado mais caro da Fase 0. O `sceneId` vindo do cliente é sempre resolvido contra o catálogo no
servidor — se ele virasse prompt direto, qualquer um usaria sua conta do fal.ai de graça.

**`clientIp` lê o ÚLTIMO valor de `x-forwarded-for`, não o primeiro.** O proxy anexa o IP de quem
conectou nele; tudo antes disso é texto que o cliente escreveu. Usar o primeiro — o instinto natural
— deixaria um bot furar o rate limit trocando o header a cada requisição. Se um dia entrar outro
proxy na frente, `TRUSTED_PROXY_HOPS` em [src/lib/ratelimit.ts](src/lib/ratelimit.ts) muda junto.

**Erro do provedor e moderação são tratados de forma oposta**
([src/lib/providers/gpt-image-2.ts](src/lib/providers/gpt-image-2.ts)).
Moderação é definitiva: repetir gasta dinheiro sem chance de sucesso. Erro é transitório: repete 3
vezes e só então o pedido é encerrado. Classificar errado custa nos dois sentidos — uma chave de API
expirada tratada como moderação reembolsaria as vendas do dia inteiro.

**O catálogo vive no banco, não no código.** Figuras, cenas, referências e preços são editados em
`/admin`; lançar um líder novo não exige deploy. O `setting` da cena é o prompt que vai direto ao
gerador — um erro de digitação ali quebra a geração em produção sem passar por revisão de código.

**Estorno automático só em falha definitiva.** A regra vive num lugar só, `settleFailedOrder` em
[src/worker/generation.ts](src/worker/generation.ts). Moderação estorna na hora; todo o resto vira
`NEEDS_REVIEW`, com o dinheiro retido e o pedido esperando ação no `/admin`.

**A entrega é pelo navegador, não por e-mail.** O download dispara sozinho na tela de resultado e a
URL assinada leva `Content-Disposition: attachment` — o atributo `download` do HTML é ignorado
quando o link aponta para outra origem, e a URL assinada sempre aponta para o MinIO.

## O que a Fase 0 decidiu

Os números completos, com o histórico e o que ainda não foi respondido, estão em
[HANDOFF.md](HANDOFF.md). O resumo do que decidiu o produto:

| Decisão | Evidência |
|---|---|
| **Provedor: `gpt-image-2`** (OpenAI via fal.ai), não Seedream | semelhança melhor, 6× mais barato, 4,5× mais rápido |
| **`quality=low`** | `high` custa 33×, leva 137s e só muda textura de pele, não identidade |
| **Prompt `closeup-v2`** | subiu o piso das cenas instáveis (selfie-rua 5,3,2 → 5,4,3) |
| **Trava de enquadramento no prompt** | sem ela o rosto do cliente ocupava ~150px e a nota caiu para 1 de 5 |
| **Só a regra de "uma pessoa" foi automatizada** | "tamanho mínimo do rosto" teve correlação **invertida** nos dados |

Rodada de 2026-08-13, com **19 selfies de pessoas diferentes**: 57/57 imagens, zero recusa de
moderação, zero erro, aprovação humana em todas. Custo US$0,005 por imagem; p95 de 51s.

Enquadramento e clima escolhidos pelo cliente foram medidos à parte em 2026-08-14 (20 imagens,
nota 5 em todas) antes de irem para a tela.

## Pendências antes de ligar tráfego

- [ ] Trocar as imagens de exemplo — hoje são placeholders. Agora dá para enviar pelo `/admin`,
      em Figuras → (a figura) → cada cena → "Enviar amostra". O carrossel de exemplos da landing
      só aparece quando pelo menos uma cena tem amostra: sem elas a seção some inteira
- [ ] Comprimir o vídeo do topo antes de apontar `NEXT_PUBLIC_HERO_VIDEO` para ele. O arquivo que
      saiu do Lovable tem 47 MB — inaceitável para um público em 4G, e ele fica no caminho crítico
      da única página que recebe tráfego pago. Alvo: 2–3 MB (H.264, 720p de largura, sem áudio,
      6–8 s em loop)
- [ ] Cadastrar `trump` e `flavio`: cena, referência e ligar (elas nascem desligadas)
- [ ] Credenciais reais do Mercado Pago nas **duas** aplicações e webhook homologado
- [ ] Uma compra real de valor baixo, ponta a ponta, antes do primeiro anúncio
- [ ] Trocar todos os segredos gerados durante o desenvolvimento
- [ ] **Conversa com advogado** sobre direito de imagem, legislação eleitoral e as políticas de uso
      da OpenAI — é o único risco que nenhum teste resolve, e derruba o produto inteiro, não uma rota

## Fase 0 (spike)

[spike/](spike/) é o harness que decide a viabilidade da geração antes de o produto existir.
Não faz parte do build nem do deploy. Veja [spike/README.md](spike/README.md).
# ia-photos
# iaphotos
