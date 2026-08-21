# Onde o projeto está — 2026-08-13

Documento de retomada. Leia isto antes de mexer em qualquer coisa; ele existe para
você não repetir medição que já foi paga nem desfazer decisão que já foi tomada
com dado na mão.

---

## 1. Resumo em cinco linhas

A Fase 0 (viabilidade da geração) **passou**, com o gerador `gpt-image-2` da OpenAI
servido pelo fal.ai, em `quality=low`, e o prompt `closeup-v2`. Custa US$0,005 por
imagem e o produto (`src/`) já está apontado para esse gerador e esse prompt.

Em 2026-08-13 a validação foi refeita com **19 selfies de pessoas diferentes**,
variadas em tom de pele, gênero, óculos, luz e enquadramento: 57/57 imagens, zero
recusa de moderação, zero erro, e aprovação humana em todas. O buraco da "UMA
selfie" está fechado. O teste ponta a ponta também rodou.

**O que sobrou:** a latência estourou o gate (p95 51s contra 40s), e o risco
jurídico/de política da seção 3 continua intocado — é o único que sobra antes de
tráfego pago.

---

## 1.5. Próximos passos — 2026-08-14

O sistema está **no ar** em `foto.souvenirpatriota.com`, com Postgres, Redis e
MinIO no Coolify, web e worker rodando, e a figura `patriota` completa (5 cenas,
3 referências, preços R$19,90 / R$29,90 no combo). Veja `DEPLOY.md`.

Em ordem de valor:

### a) Validar a geração em produção — grátis, faça primeiro

Ainda não saiu nenhuma imagem do ambiente de produção. Dá para provar o pipeline
inteiro sem pagamento nenhum:

1. abra a landing, escolha cena, envie uma selfie
2. vá até a tela de pagamento e pare (o checkout falha: token do MP é placeholder)
3. no `/admin`, o pedido aparece; clique em **Reprocessar**
4. acompanhe o log do worker

Custa US$0,005 e responde a única pergunta que ainda não foi respondida em
produção: a geração funciona ponta a ponta lá?

### b) Mercado Pago — é o que separa você de faturar

- `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` reais nas **duas** aplicações
  (o worker precisa porque é ele quem estorna)
- homologar o webhook em
  `https://foto.souvenirpatriota.com/api/webhooks/mercadopago`
- fazer **uma compra real de valor baixo**, ponta a ponta, antes de anunciar

Sem isso o checkout devolve 502 e ninguém compra.

### c) As amostras da landing continuam placeholders

Os cinco arquivos em `public/samples/patriota/` são retângulos escuros escritos
"exemplo provisório". É o que o comprador vê como amostra do produto.

**Limitação conhecida:** diferente das referências, a amostra NÃO tem upload no
painel. O campo `sampleImage` da cena é um caminho para `/public`, que é embutido
na imagem Docker no build — trocar exige commit, push e deploy. Se isso incomodar,
vale mover as amostras para o bucket e dar upload no `/admin`, como foi feito com
as referências.

Antes de publicar imagens geradas como material de venda, releia a seção 3: as
pessoas das selfies precisariam ter concordado em aparecer na sua landing.

### d) Trump e Flávio Bolsonaro (o order bump)

O seed cria as duas figuras **desligadas**, sem cena e sem referência — por isso
o combo de R$29,90 ainda não aparece no checkout. O código só oferece adicional
que consegue gerar.

Para cada uma, em `/admin/figuras/<slug>`:

1. cadastrar **pelo menos uma cena** (cena nova nasce desativada: salve e depois
   marque "Ativa")
2. subir de **1 a 3 fotos de referência**
3. **ligar** a figura no painel

> As figuras são `trump` e `flavio`, que já existem no banco de produção. Nada a
> criar: só cadastrar cena, subir referência e ligar. Se um dia quiser o Eduardo
> em vez do Flávio (os dois são filhos), é uma figura NOVA — não renomeie a
> existente depois de vender, porque `OrderItem` guarda o slug e o histórico
> deixaria de fazer sentido.

**Decisão de conteúdo antes de escrever as cenas:** as da `patriota` dizem
`crowd waving green and yellow Brazilian flags` e `busy Brazilian street market`.
Copiadas para o Trump, ele aparece num comício brasileiro. Pode ser exatamente a
graça — o comprador é brasileiro — ou pedir cena própria. Decida antes, porque o
`setting` é o que mais pesa no resultado e mudá-lo depois exige nova rodada.

### e) Trocar todos os segredos

`ADMIN_PASSWORD`, senhas de Postgres, Redis e MinIO passaram por uma conversa de
chat em texto claro. Nenhum dado de cliente existe ainda, então o risco é zero
hoje — e some de vez com uma troca antes da primeira venda.

---

## 2. O que fazer primeiro, na ordem

### Passo 1 — as 20 selfies — FEITO em 2026-08-13

Rodada em `spike/out/2026-08-13T16-08-27-527Z`, US$0,29, 19 selfies x 3 cenas.
O inventário completo, com o corte por categoria e as ressalvas de leitura, está
em `spike/inputs/selfies/_catalogo.md` — **leia antes de tirar qualquer conclusão
nova**, porque a análise tem que ser cortada por categoria, não pela média.

Resultado: 57/57 sucesso, 0 moderado, 0 erro, aprovação humana em todas.

Fica registrado o que a rodada NÃO respondeu, para ninguém achar que respondeu:

- **A amostra de pele escura é 4, não 5.** A selfie 004 (447x928) foi recusada
  pela validação antes de gastar — corretamente, mas o dado se perdeu.
- **Suspeita de clareamento de pele / afinamento de traços** nas mulheres de pele
  escura, mais visível na 022. Está **confundida com enquadramento** (a 022 era
  plano aberto de corpo inteiro). Para separar, compare a 022 contra a 015 ou a
  007 — plano aberto, pele clara. Se confirmar, muda o produto, não o prompt.
- **Duas das 19 não são selfie de celular** (002 e 011 são foto de estúdio). Nota
  alta nelas não generaliza para quem manda foto de WhatsApp.

### Passo 2 — melhor-de-3 com seleção automática

A US$0,005, gerar 3 imagens e entregar a melhor custa US$0,015 — ainda metade do
que custava uma única imagem no provedor anterior. É o que elimina a variância
residual: hoje ~20% dos clientes receberiam uma imagem que você mesmo notaria 2 ou 3.

Precisa de seletor **automático** (escolher à mão não escala em tráfego pago). O
caminho usual é embedding facial (ArcFace/InsightFace) comparando cada geração com
a selfie e entregando a de maior similaridade. Existe `src/lib/face-check.ts` no
repo — verifique se dá para reaproveitar antes de trazer dependência nova.

Mesmo métrica serviria para substituir a pontuação manual do spike.

### Passo 3 — teste ponta a ponta — FEITO em 2026-08-13

Rodou e passou. Cobriu pedido → upload direto ao MinIO por URL pré-assinada →
validações do checkout → geração → entrega. Três scripts em `scripts/` são hoje a
única cobertura desse caminho:

```bash
docker compose up -d
pnpm exec tsx --env-file=.env scripts/sobe-referencias.ts patriota \
  bolsonaro-01.jpg bolsonaro-02l.jpg bolsonaro-03.webp   # setup, uma vez
pnpm tsx scripts/e2e-simula-webhook.ts <orderId>          # libera a geração
pnpm tsx scripts/e2e-pega-resultado.ts <orderId> saida.png
```

**A perna de pagamento NÃO foi coberta**: o `MP_ACCESS_TOKEN` da máquina de
desenvolvimento é placeholder, então não dá para consultar um pagamento real nem
assinar a notificação. O `e2e-simula-webhook.ts` reproduz exatamente a transição
que o webhook faz (o `updateMany` idempotente + `enqueueGeneration`). A troca de
provider não tocou em pagamento — mas isso continua sem teste.

O que o teste encontrou está na seção 5, em "Arestas conhecidas".

---

## 3. Risco que não se resolve com código

**Não foi endereçado e derruba o produto inteiro, não uma rota.** É a única coisa
aqui que mais US$0,30 de teste não resolve:

- As **políticas de uso da OpenAI** restringem retratar pessoas reais sem
  consentimento. A API não recusou em 30 gerações, mas "não bloqueia" e "é
  permitido" são coisas diferentes. O fal é revendedor: se a OpenAI cortar, cai sem
  aviso, possivelmente no meio da campanha.
- **Direito de imagem** (Código Civil art. 20) e, tratando-se de figura política, a
  **legislação eleitoral** tem regras próprias sobre montagens, com janelas de
  período eleitoral.

Não é conselho jurídico. É um risco material que vale consultar um advogado antes
de investir em tráfego pago. A mitigação técnica já está no lugar: veja
`src/lib/providers/seedream.ts`, mantido desligado justamente para trocar de
provedor em minutos se a política mudar.

---

## 4. Setup numa máquina nova

O git **não** traz três coisas, todas de propósito:

```bash
git clone git@github.com:igorm-dev/ia-photos.git
cd ia-photos
pnpm install
cd spike && pnpm install && cd ..
```

**0. As migrations.** Estavam com os nomes **fora de ordem** — a que altera a
tabela `Order` ordenava antes da que a cria, então `prisma migrate deploy` num
banco zerado quebrava com *"relation Order does not exist"*. Corrigido em
2026-08-13 renomeando a pasta, e verificado num banco descartável. Se você tiver
algum banco onde o nome antigo já esteja registrado, acerte o histórico:

```sql
UPDATE _prisma_migrations SET migration_name='20260810211213_funil_pagamento_geracao'
 WHERE migration_name='20260810183335_funil_pagamento_geracao';
```

**1. As chaves.** `cp .env.example .env` e `cp spike/.env.example spike/.env`, depois
preencha. Para rodar o spike, só `FAL_KEY` (https://fal.ai/dashboard/keys) importa.
`SUPPORT_WHATSAPP` é opcional e pode ficar em branco.

**2. As fotos de referência da figura** — `spike/inputs/reference/`. **Sem elas o
spike não roda**: são as 2-3 fotos nítidas do rosto da figura pública que entram em
todo request. Copie da máquina antiga (não estão no git: imagem de terceiro).

**3. As selfies** — `spike/inputs/selfies/`. Dados pessoais, nunca versionados.

Confirme que o encanamento está de pé sem gastar nada:

```bash
cd spike && pnpm run run -- --routes=g --scenes=comicio --dry-run
```

Deve imprimir `g-gpt-image-2` e `closeup-v2`. Se imprimir outro prompt, alguém mexeu
no default em `spike/src/prompts.ts`.

**4. As referências dentro do MinIO.** Copiar os arquivos para
`spike/inputs/reference/` resolve o spike, mas **não** o produto: o worker busca as
referências no storage, em `figures/<slug>/ref-NN.jpg`. Num MinIO novo elas não
existem, e (veja "Arestas conhecidas") isso não dá erro — entrega errado calado.

```bash
pnpm exec tsx --env-file=.env scripts/sobe-referencias.ts patriota \
  bolsonaro-01.jpg bolsonaro-02l.jpg bolsonaro-03.webp
```

O `--env-file` não é opcional nesse script: ele não importa o prisma, e era o
prisma que carregava o `.env` de carona nos outros.

Confirme com `curl -s localhost:3000/api/health` — os três checks têm de dar `ok`.

### Se o MinIO não subir no Windows

Sintoma: `docker compose up` falha com *"an attempt was made to access a socket in
a way forbidden by its access permissions"*, ou o container sobe **sem publicar
porta** (`docker compose ps` mostra `9000/tcp` em vez de `0.0.0.0:...->9000/tcp`) e
o health check acusa `ECONNREFUSED`.

Não é porta ocupada: o Windows reserva faixas inteiras para o Hyper-V, e as portas
originais 59000/59001 caíam dentro de uma delas. Já foram trocadas para
55900/55901. Se a faixa mudar na sua máquina, veja quais estão reservadas com:

```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

e escolha portas fora delas em `docker-compose.yml` **e** em `S3_PORT` no `.env`.
Atenção: `docker compose up -d` **reaproveita** container já criado e não aplica
mapeamento de porta novo — use `--force-recreate minio`.

---

## 5. Decisões já tomadas, com o motivo

Não desfaça sem medir de novo — cada uma custou dinheiro para descobrir.

| decisão | por quê |
|---|---|
| `gpt-image-2` e não Seedream | semelhança melhor, 6x mais barato, 4,5x mais rápido |
| `quality=low` e não `high` | `high` custa 33x, leva 137s e só muda textura de pele, não identidade |
| prompt `closeup-v2` | subiu o piso das cenas instáveis (selfie-rua 5,3,2 → 5,4,3) |
| `seedream.ts` fica no repo, desligado | seguro operacional contra mudança de política da OpenAI |
| custo gravado como 1 centavo | o real é US$0,005 e a coluna é `Int`; superestimar aperta a margem do /admin, subestimar a infla |

### O que foi aprendido e é caro redescobrir

1. **Proibição concreta funciona; pedido abstrato de fidelidade não.** "Do not grey
   their hair" mudou o resultado. "Preserve the exact facial identity" sozinho, não.
   Ao escrever variante nova, proíba o artefato específico.
2. **Resolução de saída não explica semelhança.** O `gpt-image-2` sai em 768x1024 e
   ganha do Seedream em 3072x4096. O que pesa é a fidelidade da imagem de **entrada**.
3. **Texto de cena pode brigar com identidade.** `slight wide-angle lens distortion`
   e `smiling at the camera` em `patriota.ts` eram a causa da instabilidade da cena
   `selfie-rua`. O prompt hoje sobrepõe os dois — se preferir consertar na origem,
   apague as cláusulas da cena e o modelo para de ter que escolher.
4. **Mude uma variável por rodada.** Todo achado acima veio de comparação isolada.
   Mudar cena e prompt juntos custa a mesma grana e não conclui nada.

### Arestas conhecidas

- **A entrega é pelo navegador, não por e-mail — decidido em 2026-08-13.** O
  download dispara sozinho na tela de resultado e há um botão. A URL assinada
  leva `Content-Disposition: attachment` (`presignedAttachment` em
  `src/lib/storage.ts`): o atributo `download` do HTML **é ignorado** quando o
  link aponta para outra origem, e a URL assinada sempre aponta para o MinIO —
  com ele sozinho o navegador só abria a imagem numa aba.
  Descoberto no caminho: **`sendResultEmail` nunca foi chamada em lugar nenhum.**
  A foto já não ia por e-mail, e `notifiedAt` nunca era preenchido — o README
  descreve um envio que não existe. A função continua lá, pronta, para o dia em
  que quiserem religar.
  Consequência: a aba do navegador é o único caminho até a foto. Por isso o
  rascunho no `localStorage` **deixou de ser apagado** ao mostrar o resultado
  (`Funnel.tsx`) — só o botão "Fazer outra foto" descarta. Continua sem rede em
  outro dispositivo, outro navegador ou dados do site limpos; nesses casos o
  cliente fala com o suporte e você recupera pelo `/admin`.
- **Estorno automático só em falha DEFINITIVA — decidido em 2026-08-13.** A regra
  vive num lugar só, `settleFailedOrder` em `src/worker/generation.ts`. Moderação
  estorna na hora (reprocessar não resolve: a mesma selfie será recusada de novo).
  Todo o resto — referência ausente, storage fora, provedor fora — vira
  `NEEDS_REVIEW`: **o dinheiro fica retido** e o pedido aparece num aviso no topo
  do `/admin`, com botão de reprocessar e de estornar à mão. O motivo: nesses
  casos o cliente prefere a foto ao dinheiro, e estornar joga fora uma venda já
  ganha por um problema nosso de cinco minutos.
  **A contrapartida, que é real:** o aviso é *pull*, não *push*. Ninguém é
  notificado — se você não abrir o `/admin`, o pedido fica com o dinheiro do
  cliente e sem foto, indefinidamente. Não há prazo nem estorno de segurança, por
  decisão explícita. Se um dia o `BREVO_API_KEY` for preenchido, um alerta por
  e-mail fecha esse buraco.
- **O WhatsApp do suporte não é público.** `SUPPORT_WHATSAPP` é variável de
  servidor e **não** `NEXT_PUBLIC_` — esse prefixo embutiria o número no bundle de
  todo visitante da landing. Ele só sai na resposta de `/status` de um pedido
  `NEEDS_REVIEW`, ou seja, só chega a quem pagou e teve problema. Verificado: não
  aparece em nenhum chunk do cliente. Deixar em branco é suportado — a tela
  aparece igual, sem o botão.
- **Referência ausente não falha — degrada em silêncio.** CONSERTADO em
  2026-08-13; o parágrafo abaixo fica como registro do que era. Hoje
  `loadReferences` derruba o job quando NENHUMA referência carrega (vira
  `NEEDS_REVIEW`, sem gastar um centavo de API), avisa quando carrega parcialmente,
  e o worker confere tudo no boot antes de aceitar job. Era assim: `loadReferences` em
  `src/worker/generation.ts` engole cada referência que faltar com um
  `console.warn` e segue com a lista vazia. O pedido vira `READY` e é entregue.
  Não vira imagem quebrada, o que é pior: o `gpt-image-2` conhece a figura do
  próprio treinamento e produz alguém *parecido*, mas com a roupa errada (jaqueta
  genérica em vez de terno, faixa e broche) e o rosto menos fiel. Foi exatamente o
  que aconteceu no primeiro teste ponta a ponta, e só apareceu porque alguém leu o
  log do worker. Em produção, um bucket migrado ou uma chave renomeada entrega
  todos os pedidos assim, sem um único erro. As duas imagens do comparativo estão
  descritas acima; a decisão de falhar fechado (job com retry) em vez de entregar
  ainda **não foi tomada**.
- **`validateSelfie` era código morto — consertado em 2026-08-13.** Formato,
  resolução e tamanho estavam escritos em `src/lib/image.ts`, exportados e nunca
  chamados: o upload vai direto ao MinIO por URL pré-assinada e o `/api/orders` só
  valida a extensão que o próprio cliente declara no JSON. Uma foto 447x928 (a
  mesma que o harness da Fase 0 recusava) passava o checkout e virava R$29,90
  cobrados. Agora é chamado em `src/app/api/checkout/route.ts`, ao lado do
  `checkFaces`, e falha FECHADO — o oposto do face-check, de propósito: aqui negar
  é barato (o cliente troca a foto) e deixar passar é caro (cobrança + estorno).

- A trava de expressão diz `the person on the left`, mas **o modelo generaliza**: na
  motociata os dois saíram sérios. Semelhança não piora; a foto vende pior. Conserto:
  liberar sorriso para a figura (`the person on the right may smile naturally`).
- `gpt-image-2` **não aceita `seed`**. Nenhuma geração é reproduzível — só o
  `providerJobId` identifica uma imagem no suporte. É por isso que o spike tem
  `--repeat`: sem seed, só amostragem mede recusa e variância.
- **A latência estourou o gate e não é concorrência.** p95 de 51,0s contra um gate
  de 40s na rodada de 57 imagens com `--concurrency=3`. A hipótese óbvia era
  contenção, então foi medida: 5 imagens em `--concurrency=1` deram p50 43,6s e
  p95 46,8s — **pior**, não melhor. Concorrência está descartada. Sobram o tamanho
  da entrada (4 imagens por request) e a variância do próprio fal ao longo do dia.
  Dimensione a fila para **~55s por imagem**, não 45s, e reveja a promessa de
  "cerca de um minuto" da landing (`src/content/figures/patriota.ts`), que hoje
  fica sem folga nenhuma.
- `aperto-de-mao` e `churrasco` foram cortadas do catálogo por causa do **Seedream**,
  que não é mais o provedor. Podem estar vivas — US$0,03 para reavaliar.

---

## 6. Referência rápida

```bash
# spike
pnpm run run -- --list-prompts                    # variantes e suas hipóteses
pnpm run run -- --dry-run                         # exercita sem gastar
pnpm run run -- --routes=g --scenes=X --repeat=3  # rota g = gpt-image-2
pnpm report [--run=<id>]                          # review.html para pontuar
pnpm typecheck

# produto
pnpm dev / pnpm dev:worker / pnpm build / pnpm lint / pnpm typecheck
docker compose up -d                              # Postgres, Redis, MinIO
```

Flags úteis: `--limit=N` (primeiras N selfies), `--concurrency=N`, `--prompt=<id>`,
`--repeat=N`, `--seed=N` (ignorado pela rota g).
Env: `GPT_IMAGE_QUALITY=low|medium|high`, `GENERATION_TIMEOUT_MS`.

**Custos por imagem** (confira em fal.ai/pricing — os do `gpt-image-2` são estimados
a partir da tabela da OpenAI, sem o markup do fal nem os tokens das 4 imagens de
entrada; a fatura do fal é a única fonte confiável):

| rota | US$/img | notas |
|---|---|---|
| `g-gpt-image-2` low | 0,005 | **em uso** |
| `d-seedream` | 0,030 | fallback |
| `e-nano-banana` | 0,039 | pior semelhança |
| `f-nano-banana-pro` 2K | 0,139 | estoura o gate |
| `g-gpt-image-2` high | 0,165 | estoura o gate e o SLA |

Gasto total da Fase 0 até aqui: ~US$0,71.

---

## 7. Números medidos (para comparar depois)

### Rodada de 2026-08-13 — 19 selfies × 3 cenas, `closeup-v2` (a mais recente)

```
sucesso  57/57 (100%)   moderado 0   erro 0   timeout 0
latência p50 38.8s      p95 51.0s    <- estourou o gate de 40s
custo    US$0.29 total  US$0.005/imagem
humano   aprovadas
```

Controle de concorrência, mesma rota e cena, `--concurrency=1`, 5 imagens:

```
latência p50 43.6s   p95 46.8s   <- serial é PIOR; concorrência descartada
```

Gasto acumulado da Fase 0: ~US$1,03.

### Rodada de 2026-08-12 — 1 selfie × 5 cenas × 3 repetições, `closeup`

Mantida para comparação. **Cuidado ao comparar latência**: esta rodada não
registrou a concorrência usada, e é a diferença de p50 (28,6s aqui contra 38,8s
acima) que continua sem explicação.

```
sucesso  15/15   moderado 0   erro 0   timeout 0
latência p50 28.6s   p95 38.3s
custo    US$0.005/imagem
humano   12/15 com nota >=4 (80%)
```

Por cena (`closeup` → `closeup-v2`):

| cena | closeup | closeup-v2 |
|---|---|---|
| comicio | 5,4,4 | a pontuar |
| moto | 4,4,4 | a pontuar |
| feira | 4,4,4 | a pontuar |
| estadio | 5,4,3 | 5,5,4 |
| selfie-rua | 5,3,2 | 5,4,3 |

As três primeiras foram geradas com `closeup-v2` em
`spike/out/2026-08-12T03-09-56-367Z/review.html` e **ainda não foram pontuadas** —
é o dado que falta para confirmar que promover o `closeup-v2` a padrão não regrediu
as cenas que já iam bem.
