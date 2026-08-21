# Fase 0 — spike de viabilidade

Este diretório **não faz parte do produto**. Ele existe para responder uma pergunta antes de
escrever a primeira linha do funil de venda:

> O FLUX Kontext consegue colocar a figura pública e o cliente na mesma foto, com semelhança
> convincente, sem ser recusado por política de conteúdo, em menos de 40s e por menos de
> ~R$0,60 a imagem?

Se a resposta for não em todas as três rotas, o produto não existe do jeito planejado — e é muito
mais barato descobrir isso aqui do que depois de construir checkout, fila e landing.

## As rotas testadas

Tudo roda no **fal.ai**, que revende os FLUX Kontext fechados da BFL e também serve o Seedream.
Uma única chave cobre quatro rotas, sem depósito mínimo.

| Rota | Como funciona | Custo/img | Aposta |
|---|---|---|---|
| **A** `a-kontext-multiref` | Selfie + 2-3 fotos da figura no Kontext max | ~US$0,08 | Zero setup. Maior risco de recusa por política |
| **B** `b-lora` | LoRA da figura treinada antes | ~US$0,035 | Identidade estável, custo fixo de treino |
| **C** `c-plate-faceswap` | Cena pré-renderizada, IA só insere o rosto do cliente | ~US$0,04 | Mais previsível, menos variedade |
| **D** `d-seedream` | Seedream 4.5 edit (ByteDance) | ~US$0,03 | Mais barato, boa fama em identidade, política diferente |
| **E** `e-nano-banana` | Nano Banana / Gemini 2.5 Flash Image edit | ~US$0,039 | Melhor coerência de cena; política do Google é a mais restritiva |
| — | `a-kontext-multiref-bfl` | ~US$0,08 | Mesma rota A na BFL direta, só para comparar |

A rota `-bfl` fica desligada até existir `BFL_API_KEY`. Ela existe porque a BFL direta é ~37% mais
barata por imagem — vale migrar depois que a hipótese estiver validada, não antes.

## Setup

```bash
cd spike
pnpm install
cp .env.example .env    # só FAL_KEY é obrigatória para começar
```

Rotas sem as env vars necessárias são **puladas**, não falham. Antes de gastar, o runner imprime
quais rotas vão rodar e quanto cada uma custa — `--routes=a` casa por prefixo e pode selecionar
mais de uma.

## Insumos

```
inputs/
  selfies/     ~20 selfies reais e VARIADAS — é aqui que o teste tem valor
  reference/   2-3 fotos nítidas da figura pública, rosto grande, ângulos diferentes (rotas A)
  scenes/      cenas pré-renderizadas com a figura, nomeadas como o plateFile de scenes.ts (rota C)
```

Sobre as selfies: um conjunto só de fotos boas produz um resultado bonito e uma decisão errada.
Inclua de propósito óculos, barba, chapéu, contraluz, foto de corpo inteiro, foto com outra pessoa
ao lado e uma foto claramente ruim. O tráfego pago vai mandar exatamente isso.

## Rodar

Gaste em etapas. A pergunta que mata o projeto — *a política do provedor recusa esta figura?* —
custa menos de US$1 para responder, e as outras só importam se ela passar.

```bash
# 1. A figura passa pela moderação?  (~US$0,33)
pnpm run run -- --routes=a,d --scenes=selfie-rua --limit=3

# 2. Quais cenas passam?  (~US$1,30)
pnpm run run -- --routes=a,d --limit=2

# 3. Avaliação de verdade, só nas cenas aprovadas
pnpm run run -- --routes=a,c,d --scenes=selfie-rua,comicio --limit=20

pnpm run run -- --concurrency=4 --seed=7    # outras opções
```

Para exercitar o harness inteiro sem gastar crédito nem ter chave nenhuma:

```bash
node scripts/make-fake-selfies.mjs    # 5 selfies sintéticas (1 é rejeitada de propósito)
pnpm run run -- --dry-run
pnpm run report
```

O dry-run simula moderação e erro em parte dos casos, então os caminhos de falha do relatório
também são exercitados. As imagens resultantes são retângulos coloridos — servem para validar o
encanamento, não a semelhança.

O runner valida e normaliza as selfies **antes** de chamar qualquer API (formato, resolução mínima,
tamanho, EXIF), imprime o custo estimado do pior caso e só então gasta crédito.

## Iterar prompt sem mexer em código de produção

Os prompts moram em [src/prompts.ts](src/prompts.ts) como variantes nomeadas. É o único
arquivo que você precisa editar para testar uma ideia.

```bash
pnpm run run -- --list-prompts                     # o que já existe e a hipótese de cada um
pnpm run run -- --routes=d --prompt=framing --scenes=comicio --limit=3
```

A variante fica gravada em cada resultado, no nome do arquivo e no `scores.csv`, então o
`review.html` compara formulações lado a lado sem você organizar nada à mão.

**Como comparar de forma justa:** mesma cena, mesmas selfies, mesmo `--seed`. Trocando só o
prompt, a diferença nas notas é do prompt. Com 3 selfies numa cena, cada variante custa ~US$0,09.

## Julgar o resultado

```bash
pnpm run report      # imprime as métricas e gera out/<run>/review.html
```

O `review.html` mostra selfie original ao lado do resultado, com botões de nota 1-5 e exportação de
`scores.csv`. Métrica automática não resolve semelhança percebida — é olho humano.

## Critério de aprovação

Uma rota passa quando, na mesma rodada:

- **≥70%** das gerações terminam em `ok` (sem moderação, erro ou timeout)
- **≥70%** das imagens aproveitadas recebem nota **≥ 4** no review
- **p95 ≤ 40s**
- **custo/imagem aproveitada ≤ US$0,11** (~R$0,60)

Os três primeiros vêm dos números; o segundo, do `review.html`. Os limites estão em
[`src/config.ts`](src/config.ts) (`gate`).

## Saída

Quando alguma rota passar, congele os prompts e parâmetros vencedores em `PROMPTS.md` na raiz do
projeto, junto com o custo real medido — é esse número que define o preço de venda. As 4-6 cenas
aprovadas viram o catálogo do produto.

> A tabela de preços em `src/config.ts` é uma estimativa. Confira em bfl.ai/pricing e fal.ai/pricing
> antes de usar o custo para precificar.
