# Fotos dos depoimentos

Os rostos que aparecem na seção "Quem já usou aprova" da landing.

## Nomes esperados

Um arquivo por depoimento, na ordem em que eles estão cadastrados
(`Testimonial.sortOrder`):

```
public/depoimentos/1.webp
public/depoimentos/2.webp
public/depoimentos/3.webp
```

O caminho não é convenção: ele fica gravado em `Testimonial.photo`, no banco. O
`prisma/seed.mjs` grava estes três **se os arquivos existirem** — e grava `null`
se não existirem, para a landing não renderizar avatar quebrado. Uma figura nova
pode apontar para os arquivos que quiser, com qualquer nome.

## O que a landing faz sem eles

Desenha as iniciais do nome num círculo verde-claro. É a aparência que a seção
tinha antes deste campo existir, e ela é aceitável — não há pressa em preencher.

## Formato

- **Quadradas.** São recortadas em círculo de 36×36 CSS pixels; qualquer coisa
  que não seja 1:1 chega cortada nas laterais.
- **Pelo menos 72×72** de lado, para não borrar em tela de densidade 2x.
- **`.webp`**, entre 4 e 15 KB. São três imagens carregadas no meio de uma
  página que precisa abrir em 4G, e um `.jpg` de 200 KB cada some com o ganho de
  toda a otimização que o resto da página faz.
- `loading="lazy"` já está aplicado: elas ficam abaixo da dobra e não competem
  com a hero pelo LCP.

## Antes de subir qualquer rosto

O texto do depoimento é ilustrativo, e a foto tem que ser do mesmo tipo — rosto
gerado, banco de imagens com licença, ou pessoa que autorizou por escrito.

Rosto de pessoa real ao lado de um depoimento que ela não escreveu é uso de
imagem sem consentimento, e não é um detalhe: a landing promete transparência
duas seções abaixo, na caixa de "Segurança e transparência", e o rodapé legal
afirma que todas as imagens do site são fictícias. Uma foto real aqui
transforma as duas afirmações em mentira documentada.
