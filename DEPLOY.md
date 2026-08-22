# Deploy no Coolify

Escrito em 2026-08-13. Assume o formato escolhido: **Postgres e Redis como
recursos gerenciados do Coolify**, MinIO como serviço à parte, e web e worker
como duas aplicações apontando para o mesmo repositório com Dockerfiles
diferentes.

Este documento cobre **subir a infraestrutura**. Subir não é vender: a lista do
fim (`Antes da primeira venda`) é o que separa uma coisa da outra.

---

## Antes de começar

Você precisa de um **domínio**. Não é preferência estética: o webhook do Mercado
Pago é a **única** coisa que autoriza uma geração
(`src/app/api/webhooks/mercadopago/route.ts`), e o MP só entrega notificação em
URL pública com HTTPS. Sem domínio, o cliente paga e nada acontece.

---

## 1. Os dados: Postgres e Redis

No Coolify, `+ New` → `Database` → **PostgreSQL 17** e, de novo, **Redis 7**.

Anote as URLs de conexão **internas** que o Coolify mostra (algo como
`postgres://usuario:senha@nome-do-servico:5432/banco`). São elas que vão nas
aplicações — a URL interna não sai do servidor.

**Não publique porta para fora** em nenhum dos dois. O banco tem selfie de
cliente e o Redis tem a fila; nada disso precisa de internet. As portas
`55432`/`56379` do `docker-compose.yml` existem só para o desenvolvimento local.

No Redis, ligue a persistência (`appendonly yes`). Sem ela, um restart do
container descarta jobs de pedidos **já pagos**.

## 2. O storage: MinIO

**O Coolify removeu o MinIO da lista de Services.** Suba como recurso do tipo
**Docker Compose**, colando `docker/minio-coolify.yml` deste repositório. Troque a
senha antes de salvar.

- Não reaproveite o `iaphotos123` do ambiente local — ele está versionado no
  `docker-compose.yml`.
- O bucket é criado sozinho: `ensureBucket()` roda no boot do worker.

Alternativa: qualquer storage compatível com S3 (Cloudflare R2, Backblaze B2,
AWS S3) serve, porque o cliente `minio` fala o protocolo S3. R2 tem egress
gratuito, o que importa num produto que só entrega imagem. **Não foi testado
aqui** — se for por esse caminho, valide upload e download antes de anunciar.

### O MinIO PRECISA de domínio público. O bucket, não.

Dê um domínio à **API (porta 9000)**, ex.: `storage.seudominio.com`.

Isto não é preferência, é requisito: `src/lib/storage.ts` tem **uma** configuração
de cliente, e é ela que assina as URLs que vão **para o navegador do cliente** —
o `PUT` da selfie e o download da foto pronta. Com um hostname interno do Docker
em `S3_ENDPOINT`, a URL assinada sai como `http://minio-xyz:9000/...`, um nome
que só existe dentro do servidor. O navegador não resolve, e aí **nenhum upload
funciona e nenhuma foto é entregue**.

Público é o ENDEREÇO, não o conteúdo. O bucket continua privado e todo objeto
continua exigindo assinatura de validade curta; sem a URL assinada, 403. Nunca
libere leitura anônima no bucket "para simplificar" — as selfies dos clientes
estão nele, e isso é dado pessoal sob a LGPD.

O **console (porta 9001)** é outra história: ou não exponha, ou proteja com senha
forte. Ele lista e baixa tudo.

## 3. As aplicações: web e worker

Duas aplicações, **mesmo repositório**, build pack `Dockerfile`:

| | web | worker |
|---|---|---|
| Dockerfile | `Dockerfile.web` | `Dockerfile.worker` |
| Porta | `3000` | nenhuma — não exponha |
| Domínio | o seu | nenhum |
| Healthcheck | `/api/health` | — |

**A migração roda no boot do web**, pelo `docker/entrypoint-web.sh`, e nunca no
worker. É de propósito: se os dois migrassem, um pegaria o lock e o outro morreria
no deploy. Não mude a ordem de subida achando que é detalhe.

### Build arg (não é variável de runtime)

`NEXT_PUBLIC_ASSET_HOST` e as duas do VTurb precisam ser marcadas como
**build variables** no Coolify. Variáveis `NEXT_PUBLIC_*` são inlinadas no
bundle durante o `next build` — injetar só em runtime não tem efeito nenhum no
código que roda no browser.

## 4. As variáveis

`env()` valida tudo no primeiro acesso, com mensagem clara
(`src/lib/env.ts`). Um deploy mal configurado falha no boot em vez de dar 500 na
primeira venda — se o container reiniciar em loop, **leia o log**, a mensagem diz
exatamente qual variável está errada.

| variável | web | worker | observação |
|---|:--:|:--:|---|
| `DATABASE_URL` | ✅ | ✅ | URL **interna** do Postgres |
| `REDIS_URL` | ✅ | ✅ | URL **interna** do Redis |
| `S3_ENDPOINT` | ✅ | ✅ | domínio **público** do MinIO, sem `https://` (veja acima) |
| `S3_PORT` | ✅ | ✅ | `443` |
| `S3_USE_SSL` | ✅ | ✅ | `true` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | ✅ | ✅ | credenciais do MinIO |
| `S3_BUCKET` | ✅ | ✅ | padrão `ia-photos` |
| `FAL_KEY` | ✅ | ✅ | https://fal.ai/dashboard/keys |
| `MP_ACCESS_TOKEN` | ✅ | ✅ | **produção**, prefixo `APP_USR-` |
| `MP_WEBHOOK_SECRET` | ✅ | — | do painel do MP, para validar a assinatura |
| `APP_URL` | ✅ | ✅ | `https://seu-dominio` — monta os links do e-mail |
| `ADMIN_PASSWORD` | ✅ | — | mínimo 12 caracteres |
| `NODE_ENV` | ✅ | ✅ | `production` |
| `SELFIE_RETENTION_DAYS` | ✅ | ✅ | padrão 7 |
| `RESULT_RETENTION_DAYS` | ✅ | ✅ | padrão 30 |
| `SUPPORT_WHATSAPP` | ✅ | — | opcional; só dígitos com DDI. Pode ficar vazia |
| `BREVO_API_KEY` | — | ✅ | só para o aviso de estorno; a foto **não** vai por e-mail |
| `BREVO_FROM_EMAIL` / `BREVO_FROM_NAME` | — | ✅ | remetente do aviso de estorno |
| `META_PIXEL_ID` / `META_CAPI_TOKEN` | ✅ | — | opcional, só para anúncio |
| `NEXT_PUBLIC_ASSET_HOST` | build | — | **build arg**, não runtime |
| `NEXT_PUBLIC_VTURB_ACCOUNT_ID` | build | — | **build arg**; conta do VTurb na URL do player |
| `NEXT_PUBLIC_VTURB_PLAYER_ID` | build | — | **build arg**; qualquer uma das duas vazia = landing usa a heroImage do /admin |

O worker precisa de `MP_ACCESS_TOKEN` porque é ele quem estorna.

`BREVO_*` e `META_*` são lidas direto de `process.env`, fora do schema do
`env.ts` — então elas **não** derrubam o boot se faltarem.

### A entrega é pelo navegador, não por e-mail

Decisão de 2026-08-13. A foto é entregue na própria tela: o download dispara
sozinho e há um botão. A URL assinada carrega `Content-Disposition: attachment`
(`presignedAttachment` em `src/lib/storage.ts`), porque o atributo `download` do
HTML é **ignorado** quando o link aponta para outra origem — e a URL assinada
sempre aponta para o MinIO.

A consequência disso é que **a aba do navegador é o único caminho da pessoa até
a foto**. Por isso o rascunho no `localStorage` deixou de ser apagado ao mostrar
o resultado: ela consegue reabrir o site no mesmo navegador e baixar de novo. Só
o botão "Fazer outra foto" descarta.

O que continua sem rede de proteção: **outro dispositivo, outro navegador, ou
limpar os dados do site.** Nesses casos ela perde o acesso e vai ter de falar com
o suporte, e você recupera o pedido pelo `/admin`. Se isso virar volume, a saída
é religar o e-mail — `sendResultEmail` já existe em `src/lib/email.ts`, pronta e
sem nenhuma chamada.

## 5. Depois do primeiro deploy

**1. Popule o catálogo.** As figuras, cenas e referências vivem no banco desde
2026-08-13. Rode o seed uma vez, de dentro do servidor ou com o `.env` apontando
para a produção:

```bash
pnpm db:seed
```

Ele cria a figura `patriota` com as 5 cenas e, desligadas, `trump` e `flavio`
como adicionais. É idempotente — pode rodar de novo sem duplicar nem desfazer o
que você ajustou no painel.

**2. Suba as fotos de referência pelo `/admin`.** Entre em
`/admin/figuras/patriota` e use o bloco "Fotos de referência". O arquivo passa
pelo servidor e vai para o bucket — **não é mais preciso abrir o console do
MinIO**, que era o passo manual e arriscado da versão anterior deste guia.

Sem referência, todo pedido da figura fica retido em `NEEDS_REVIEW` sem gerar, e
o worker avisa no boot. O painel também marca em amarelo a figura que ainda não
pode vender.

As referências **não estão no git** (imagem de terceiro). Elas estão na sua
máquina, em `spike/inputs/reference/`.

O `scripts/sobe-referencias.ts` continua existindo para uso por linha de comando.

**3. Para lançar um líder novo (Trump, Flávio):** `/admin` → "+ Nova figura" →
cadastre cenas e referências → só então **ligue**. Ela nasce desligada de
propósito. Marque-a como adicional em `/admin/figuras/patriota`, no bloco
"Adicionais no checkout", para ela entrar no order bump.

**2. Confira a saúde:** `curl https://seu-dominio/api/health` deve trazer os três
checks em `ok`. Se `storage` falhar, é `S3_ENDPOINT`/`S3_PORT`.

**3. Confira o log do worker.** Ele deve dizer `ouvindo "generation" e
"retention"` e **não** deve reclamar de referência.

**4. Homologue o webhook** no painel do Mercado Pago apontando para
`https://seu-dominio/api/webhooks/mercadopago`. Sem isso, pagamento aprovado
nunca vira imagem.

**5. Entre em `/admin`** e confirme que a senha funciona e que a figura aparece.

---

## Antes da primeira venda

Nada aqui é opcional, e nada disso é resolvido subindo o sistema.

- [ ] **Credenciais reais do Mercado Pago.** As de hoje são placeholder: o
      checkout devolve `502` e ninguém compra. É o bloqueio nº 1.
- [ ] **`BREVO_API_KEY`** (menos urgente). Não é mais a entrega da foto — só o
      aviso de estorno. Sem ela, quem você estornar não é avisado por e-mail.
- [ ] **Trocar as imagens de exemplo.** As de `public/samples/patriota/` são
      placeholders literais — retângulos escuros escritos "exemplo provisório".
      É o que o comprador vê como amostra do produto.
- [ ] **Subir os arquivos de bônus** para `bonuses/patriota/` (`legendas.pdf`,
      `figurinhas.zip`, `wallpapers.zip`). O catálogo promete os três; se o
      cliente clicar hoje, quebra.
- [ ] **Uma compra real de valor baixo**, ponta a ponta, antes do primeiro
      anúncio.
- [ ] **A conversa com um advogado** sobre direito de imagem, legislação
      eleitoral e as políticas de uso da OpenAI (`HANDOFF.md`, seção 3). É o
      único risco da lista que nenhum teste resolve, e derruba o produto inteiro
      em vez de uma rota.

## Quando algo der errado

| sintoma | causa provável |
|---|---|
| container do web reinicia em loop | variável faltando — a mensagem no log diz qual |
| `/api/health` com `storage: false` | `S3_ENDPOINT`, `S3_PORT` ou `S3_USE_SSL` errados |
| upload da selfie falha no navegador | `S3_ENDPOINT` aponta para hostname interno; tem de ser o domínio público |
| health `ok` mas cliente não consegue enviar foto | mesma causa: o servidor alcança o MinIO, o navegador não |
| pagou e nada acontece | webhook não homologado, ou `MP_WEBHOOK_SECRET` errado |
| pedidos parados em `NEEDS_REVIEW` | referências fora do bucket; veja o aviso no topo do `/admin` |
| download abre a imagem em vez de baixar | o botão está usando `resultUrl`; tem de ser `downloadUrl` |
| cliente diz que perdeu a foto | outro dispositivo ou dados do site limpos; recupere o pedido pelo `/admin` |
| aviso de estorno não chega | `BREVO_API_KEY` vazia (não derruba o boot, por isso passa batido) |
| imagem sai com roupa errada | referências ausentes — não deveria mais acontecer, mas confira o log do worker |
