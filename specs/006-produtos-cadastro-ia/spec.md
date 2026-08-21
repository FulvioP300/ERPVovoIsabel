# Spec 006 — Cadastro de Produto Assistido por IA

**Domínio:** AI Product Intake
**Fase:** 2 — Cadastro inteligente
**Status:** Draft
**Depende de:** [003-categorias](../003-categorias/spec.md), [004-sku](../004-sku/spec.md),
[005-produtos-cadastro-manual](../005-produtos-cadastro-manual/spec.md)

## 1. Visão geral

Reduzir o trabalho manual de cadastro: o operador fotografa a peça, escreve uma descrição
curta, e a IA preenche automaticamente os atributos estruturados do produto para revisão
humana antes de salvar.

## 2. User story

Como operador, quero fotografar uma peça e escrever uma frase curta (ex.: "Bermuda Jeans
Stretch masculina nova tamanho 32") e receber uma ficha de produto pré-preenchida, para não
precisar digitar manualmente cada atributo.

## 3. Interface inicial

```
┌────────────────────────────────────┐
│ Cadastrar peça com IA               │
│ Fotos                               │
│ [+ Adicionar imagens]               │
│ Descreva a peça                     │
│ Bermuda jeans masculina nova        │
│ tamanho 32                          │
│         [ Analisar com IA ]         │
└────────────────────────────────────┘
```

Imagens recomendadas (orientar o usuário): 1) Frente, 2) Costas, 3) Etiqueta, 4) Detalhes,
5) Defeitos (se existentes). No smartphone, usar
`<input type="file" accept="image/*" capture="environment">` quando suportado.

## 4. Fluxo

```
Fotos + Descrição do operador
   → POST /api/products/analyze
   → Backend → LLM multimodal → Structured Output → Zod
   → Produto em revisão → Usuário confirma
   → POST /api/products/confirm → Gerar SKU → Salvar produto
```

Etapa de análise (`/analyze`) e etapa de confirmação (`/confirm`) são **sempre** endpoints
distintos — análise nunca persiste nem gera SKU (constituição, princípio I).

## 5. API — Análise

```
POST /api/products/analyze
```

Entrada: `multipart/form-data` com `prompt` (texto) e `images[]`.

Saída (envelope padrão):

```json
{ "success": true, "data": { "...": "produto estruturado (subset do modelo de 005)" } }
```

Exemplo de payload estruturado retornado pela IA (nunca inclui `sku`):

```json
{
  "categoria_codigo": "BERM",
  "identificacao": { "nome": "...", "descricao": "..." },
  "classificacao": { "categoria": "Bermudas", "subcategoria": "Bermuda Jeans", "departamento": "Masculino" },
  "caracteristicas": { "tamanho_etiqueta": "32", "cor_principal": "Azul Jeans", "material": ["Jeans", "Denim Stretch"] },
  "condicao": { "estado": "novo", "possui_etiqueta": true, "possui_defeitos": false }
}
```

Esta operação **NÃO** deve gerar SKU.

## 6. API — Confirmação

```
POST /api/products/confirm
```

Fluxo interno: recebe produto revisado → valida Zod → valida categoria (código deve existir
e estar ativo em `categories`) → incrementa sequência ([004-sku](../004-sku/spec.md)) → gera
SKU → persiste produto → retorna produto criado.

## 7. Regras de negócio

- **Dado desconhecido é `null`, nunca inventado.** Ex.: se a marca não é identificável, a
  IA retorna `{"marca": {"nome": null}}` — nunca um palpite como "Marca provavelmente XYZ".
- Confiança por campo deve ser registrada sempre que possível em
  `ai_metadata.fields["<caminho.do.campo>"] = { confidence, source }` (ex.:
  `caracteristicas.cor_principal`, fonte `image`; `caracteristicas.tamanho_etiqueta`, fonte
  `image+prompt`).
- A IA só pode selecionar `categoria_codigo` dentre categorias ativas existentes
  ([003-categorias](../003-categorias/spec.md)) — nunca inventa uma categoria nova.
- Nenhum produto gerado por IA é publicado ou salvo automaticamente: o operador sempre revisa
  e pode alterar qualquer campo antes de confirmar (Human in the Loop, constituição
  princípio II).
- Após a análise, a interface deve destacar o que foi identificado com confiança e o que não
  foi, por exemplo:

```
✓ Categoria identificada
✓ Tamanho identificado
✓ Cor identificada
⚠ Marca não identificada
⚠ Composição não identificada
```

- A comunicação com o provedor de IA ocorre exclusivamente no backend; a API key do provedor
  nunca é exposta ao React.
- `POST /api/products/analyze` é protegido por rate limit configurável (ex.: 10
  análises/minuto/usuário) para conter custo e abuso.
- Durante a análise, a UI deve expor os quatro estados padrão de operação remota: `loading`
  ("Analisando peça... A IA está avaliando as imagens e preenchendo as características."),
  `success`, `error`, `empty`.

## 8. Critérios de aceite

**Cadastro com IA**
DADO um operador autenticado, E fotografias de uma peça, E uma descrição textual, QUANDO
clicar em "Analisar com IA", ENTÃO o sistema deve: enviar texto e imagens ao backend;
solicitar análise ao modelo multimodal; validar o resultado com Zod; preencher o formulário;
permitir edição; **não salvar automaticamente**.

**Dado desconhecido**
DADO que a marca não seja visível nas fotos, QUANDO a IA analisar a peça, ENTÃO deve produzir
`{"marca": {"nome": null}}` — nunca inventar uma marca.

## 9. Fora de escopo

Recomendação de produtos por IA, precificação automática por IA, geração automática de SKU
pela IA (proibido em qualquer fase) — ver constituição.

## 10. Conformidade constitucional

Esta spec é a implementação direta do princípio I ("A IA interpreta; a aplicação decide") e
do princípio II (Human in the Loop) da [constituição](../../memory/constitution.md).
