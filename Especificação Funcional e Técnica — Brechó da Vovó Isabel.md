# Especificação Funcional e Técnica  
## ERP da Vovó Isabel

**Versão:** 1.0  
**Data:** 20/08/2026  
**Tipo de aplicação:** E-commerce + Backoffice Administrativo + Cadastro de Produtos Assistido por IA

---

# 1. Visão do produto

O sistema **ERP da Vovó Isabel** será uma aplicação web destinada à gestão e comercialização de peças únicas de brechó.

A aplicação deverá contemplar:

- catálogo de produtos;
- cadastro de peças únicas;
- cadastro assistido por Inteligência Artificial;
- análise de fotografias das peças;
- geração automática de informações do produto;
- geração controlada de SKU;
- administração do catálogo;
- autenticação;
- autorização baseada em perfis;
- criação e gestão de usuários;
- controle de estoque;
- gerenciamento de preços;
- gerenciamento de imagens;
- preparação para publicação em e-commerce;
- preparação futura para integração com marketplaces.

Cada peça física deverá possuir um **SKU único**, mesmo que existam outras peças aparentemente iguais.

---

# 2. Objetivo principal

Reduzir o trabalho manual necessário para cadastrar peças no brechó.

O operador deverá poder:

1. tirar fotografias da peça;
2. enviar as imagens para o sistema;
3. digitar uma pequena descrição, por exemplo:

> Bermuda Jeans Stretch masculina nova tamanho 32.

4. solicitar a análise pela IA;
5. receber automaticamente:
   - nome;
   - descrição;
   - categoria;
   - subcategoria;
   - departamento;
   - estilo;
   - ocasião;
   - estação;
   - cor;
   - material;
   - tamanho;
   - condição;
   - características;
   - tags;
   - título SEO;
   - slug;
6. revisar os dados;
7. informar dados que a IA não consiga determinar;
8. salvar a peça;
9. receber automaticamente o próximo SKU válido da categoria.

---

# 3. Princípios arquiteturais

A IA deverá ser utilizada como mecanismo de **interpretação e sugestão**, não como responsável por regras críticas de negócio.

A arquitetura deverá seguir o princípio:

```text
IA sugere
    ↓
Zod valida
    ↓
Backend aplica regras
    ↓
Usuário revisa
    ↓
Backend gera SKU
    ↓
MongoDB persiste
```

A IA NÃO deverá:

- gerar autonomamente o número do SKU;
- acessar diretamente o MongoDB;
- executar queries arbitrárias;
- alterar usuários;
- criar permissões;
- modificar estoque diretamente;
- excluir produtos;
- alterar preços sem confirmação;
- inventar categorias fora da taxonomia permitida.

---

# 4. Stack tecnológica

## 4.1 Front-end

- React
- Vite 8
- TypeScript
- React Router
- Zod
- React Hook Form
- TanStack Query
- CSS Modules ou Tailwind CSS

Preferência inicial:

```text
React
Vite 8
TypeScript
React Router
TanStack Query
React Hook Form
Zod
```

---

# 4.2 Back-end

- Node.js
- TypeScript
- Fastify
- Zod
- MongoDB Driver oficial

Inicialmente não utilizar:

- microserviços;
- Kafka;
- Redis;
- Kubernetes;
- LangChain;
- LangGraph;
- filas distribuídas.

Esses componentes somente deverão ser introduzidos quando existir uma necessidade concreta.

---

# 4.3 Banco de dados

Utilizar:

**MongoDB Atlas**

Collections iniciais:

```text
users
products
categories
sku_sequences
audit_logs
```

Collections futuras:

```text
customers
orders
payments
inventory_movements
marketplace_publications
```

---

# 4.4 Armazenamento de imagens

Preferencialmente:

**Cloudinary**

Alternativas futuras:

- AWS S3;
- Cloudflare R2.

O MongoDB deverá guardar apenas:

- identificador;
- URL;
- metadados;
- ordem;
- tipo da imagem.

Não armazenar os arquivos binários das fotografias diretamente nos documentos de produtos.

---

# 4.5 Inteligência Artificial

Utilizar um modelo multimodal capaz de receber:

```text
texto
+
uma ou várias imagens
```

e retornar dados estruturados.

A comunicação com o modelo deverá ocorrer exclusivamente pelo backend.

Nunca expor a API Key do provedor de IA no React.

---

# 5. Arquitetura geral

```text
                    USUÁRIO
                       │
                       ▼
             ┌──────────────────┐
             │ React + Vite 8   │
             │                  │
             │ E-commerce       │
             │ Backoffice       │
             └────────┬─────────┘
                      │
                    HTTPS
                      │
                      ▼
             ┌──────────────────┐
             │ Fastify API      │
             │ TypeScript       │
             │                  │
             │ Auth             │
             │ Produtos         │
             │ SKU              │
             │ Usuários         │
             │ IA               │
             └───────┬──────────┘
                     │
          ┌──────────┼──────────────┐
          │          │              │
          ▼          ▼              ▼
     MongoDB       LLM        Cloudinary
      Atlas      Multimodal      Fotos
```

---

# 6. Separação entre frontend e backend

Estrutura sugerida:

```text
brecho-vovo-isabel/
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── features/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── schemas/
│   │   └── types/
│   │
│   ├── vite.config.ts
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── schemas/
│   │   ├── middleware/
│   │   ├── plugins/
│   │   ├── database/
│   │   └── server.ts
│   │
│   └── package.json
│
└── shared/
    ├── schemas/
    └── types/
```

---

# 7. Domínios iniciais

A aplicação será dividida inicialmente nos seguintes domínios:

```text
Authentication
Users
Products
Categories
SKU
AI Product Intake
Images
Audit
```

---

# 8. Módulos funcionais

## 8.1 Login

Tela de autenticação contendo:

- e-mail;
- senha;
- botão Entrar;
- exibição de erros de autenticação;
- opção futura de recuperação de senha.

Fluxo:

```text
Login
  ↓
POST /auth/login
  ↓
valida usuário
  ↓
valida senha
  ↓
gera sessão
  ↓
cookie seguro
  ↓
dashboard
```

---

# 9. Segurança da autenticação

Senhas nunca deverão ser armazenadas em texto puro.

Utilizar:

**Argon2id**

Exemplo conceitual:

```text
senha
  ↓
Argon2id
  ↓
hash
  ↓
MongoDB
```

A autenticação deverá utilizar:

```text
Access Token
+
Refresh Token
```

Preferencialmente armazenados utilizando cookies:

```text
HttpOnly
Secure
SameSite
```

Evitar armazenar tokens sensíveis em:

```text
localStorage
```

---

# 10. Perfis de acesso

Inicialmente deverão existir três perfis.

## ADMIN

Permissões:

- criar usuários;
- editar usuários;
- desativar usuários;
- alterar perfis;
- cadastrar produtos;
- editar produtos;
- excluir logicamente produtos;
- administrar categorias;
- alterar preços;
- publicar produtos;
- visualizar auditoria.

---

## OPERADOR

Permissões:

- cadastrar produtos;
- utilizar cadastro por IA;
- editar produtos;
- fazer upload de imagens;
- alterar estoque;
- alterar preço;
- publicar produto.

Não poderá:

- criar usuários;
- alterar permissões;
- consultar configurações sensíveis.

---

## CONSULTA

Permissões:

- consultar produtos;
- consultar catálogo;
- visualizar estoque.

Não poderá alterar dados.

---

# 11. Modelo de usuário

Collection:

```text
users
```

Documento:

```json
{
  "_id": "ObjectId",

  "name": "Maria Silva",

  "email": "maria@vovoisabel.com.br",

  "passwordHash": "...",

  "role": "operator",

  "status": "active",

  "lastLoginAt": null,

  "createdAt": "2026-08-20T23:00:00-03:00",

  "updatedAt": "2026-08-20T23:00:00-03:00",

  "createdBy": "ObjectId"
}
```

Valores permitidos para `role`:

```text
admin
operator
viewer
```

Valores permitidos para `status`:

```text
active
inactive
blocked
```

---

# 12. Administração de usuários

Criar módulo:

```text
Administração
    ↓
Usuários
```

Tela:

```text
Usuários
────────────────────────────────────

Buscar usuário...

Nome        E-mail              Perfil      Status

Maria       maria@...           Operador    Ativo
João        joao@...            Admin       Ativo

                        [+ Novo usuário]
```

---

# 13. Criação de usuário

Campos:

- nome;
- e-mail;
- senha temporária;
- confirmação da senha;
- perfil;
- status.

Regras:

- e-mail obrigatório;
- e-mail único;
- senha mínima de 8 caracteres;
- perfil obrigatório;
- usuário criado inicialmente como ativo;
- registrar administrador responsável pela criação.

---

# 14. Gestão de usuários

Administrador deverá poder:

```text
Criar
Visualizar
Editar
Ativar
Desativar
Bloquear
Alterar perfil
Resetar senha
```

Preferencialmente não realizar exclusão física de usuários.

Usar:

```text
status = inactive
```

---

# 15. Modelo de categoria

Collection:

```text
categories
```

Exemplo:

```json
{
  "_id": "ObjectId",

  "code": "BERM",

  "name": "Bermudas",

  "department": "Masculino",

  "active": true,

  "createdAt": "2026-08-20T23:00:00-03:00"
}
```

Exemplos:

```text
BERM | Bermudas
CALC | Calças
CAMI | Camisas
POLO | Camisas Polo
VEST | Vestidos
JAQU | Jaquetas
BLUS | Blusas
SAIA | Saias
SAPT | Sapatos
BOLS | Bolsas
ACES | Acessórios
```

Os códigos deverão ser administrados pelo sistema.

A IA somente poderá selecionar códigos existentes.

---

# 16. Modelo do SKU

Formato:

```text
BVI-{CATEGORIA}-{SEQUENCIA}
```

Exemplo:

```text
BVI-BERM-000001
BVI-BERM-000002
BVI-VEST-000001
BVI-POLO-000001
```

Onde:

```text
BVI     = Brechó Vovó Isabel

BERM    = código da categoria

000001  = sequência numérica da categoria
```

---

# 17. Sequência do SKU

Collection:

```text
sku_sequences
```

Documento:

```json
{
  "_id": "BERM",
  "currentValue": 24
}
```

Para geração do próximo SKU utilizar operação atômica equivalente a:

```javascript
findOneAndUpdate(
  {
    _id: "BERM"
  },
  {
    $inc: {
      currentValue: 1
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
)
```

Resultado:

```text
25
```

SKU:

```text
BVI-BERM-000025
```

---

# 18. Regra fundamental do SKU

Nunca implementar:

```text
buscar último SKU
      ↓
somar 1
      ↓
salvar
```

porque duas requisições simultâneas podem gerar o mesmo número.

Usar sempre incremento atômico.

---

# 19. Modelo completo de produto

Collection:

```text
products
```

Estrutura:

```json
{
  "_id": "ObjectId",

  "sku": "BVI-BERM-000025",

  "status": "disponivel",

  "identificacao": {
    "nome": "Bermuda Jeans Stretch Masculina Azul Tamanho 32",
    "descricao": "Bermuda jeans masculina em denim azul...",
    "peca_unica": true,
    "quantidade": 1,
    "data_cadastro": "2026-08-20T23:00:00-03:00"
  },

  "classificacao": {
    "categoria_codigo": "BERM",
    "categoria": "Bermudas",
    "subcategoria": "Bermuda Jeans",
    "departamento": "Masculino",

    "estilo": [
      "Casual",
      "Básico",
      "Urbano"
    ],

    "ocasiao": [
      "Dia a dia",
      "Passeio",
      "Lazer"
    ],

    "estacao": [
      "Primavera",
      "Verão"
    ]
  },

  "marca": {
    "nome": null,
    "original": null
  },

  "caracteristicas": {
    "tamanho_etiqueta": "32",
    "tamanho_equivalente": null,

    "cor_principal": "Azul Jeans",

    "cores_secundarias": [],

    "estampa": "Lisa",

    "material": [
      "Jeans",
      "Denim Stretch"
    ],

    "composicao": null,

    "lavagem": "Média",

    "modelagem": "Reta",

    "elasticidade": "Stretch",

    "fechamento": [
      "Botão",
      "Zíper"
    ]
  },

  "medidas": {
    "unidade": "cm",

    "cintura": null,
    "quadril": null,
    "gancho": null,
    "comprimento": null,
    "largura_barra": null
  },

  "condicao": {
    "estado": "novo",

    "nota": 10,

    "possui_etiqueta": true,

    "possui_defeitos": false,

    "defeitos": [],

    "observacoes": "Peça nova com etiquetas."
  },

  "preco": {
    "preco_original_estimado": null,
    "custo_aquisicao": null,
    "preco_venda": null,
    "preco_promocional": null,
    "moeda": "BRL"
  },

  "estoque": {
    "quantidade": 1,

    "localizacao": {
      "loja": "Loja Principal",
      "setor": "Masculino",
      "arara": null,
      "posicao": null
    }
  },

  "imagens": {
    "principal": null,

    "galeria": []
  },

  "ecommerce": {
    "publicado": false,

    "slug": "bermuda-jeans-stretch-masculina-azul-tamanho-32",

    "titulo_seo": "Bermuda Jeans Stretch Masculina Azul Tamanho 32 Nova",

    "tags": [
      "bermuda masculina",
      "bermuda jeans",
      "jeans masculino",
      "bermuda stretch",
      "tamanho 32"
    ]
  },

  "marketplaces": {
    "mercado_livre": {
      "publicado": false,
      "id_anuncio": null
    },

    "shopee": {
      "publicado": false,
      "id_anuncio": null
    }
  },

  "venda": {
    "vendido": false,

    "data_venda": null,

    "canal_venda": null,

    "valor_venda": null
  },

  "ai_metadata": {
    "generated": true,

    "model": null,

    "generated_at": null,

    "fields": {}
  },

  "auditoria": {
    "criado_por": "ObjectId",

    "criado_em": "2026-08-20T23:00:00-03:00",

    "atualizado_por": "ObjectId",

    "atualizado_em": "2026-08-20T23:00:00-03:00"
  }
}
```

---

# 20. Status de produtos

Valores permitidos:

```text
rascunho
em_revisao
disponivel
reservado
vendido
inativo
```

Fluxo normal:

```text
rascunho
   ↓
em_revisao
   ↓
disponivel
   ↓
reservado
   ↓
vendido
```

---

# 21. Cadastro tradicional de produto

O usuário deverá poder cadastrar manualmente:

```text
Produtos
   ↓
Novo Produto
   ↓
Cadastro Manual
```

Campos deverão refletir o modelo de produto.

---

# 22. Cadastro assistido por IA

Disponibilizar:

```text
Produtos
   ↓
Novo Produto
   ↓
Cadastrar com IA
```

Interface inicial:

```text
┌────────────────────────────────────┐
│ Cadastrar peça com IA              │
│                                    │
│ Fotos                              │
│                                    │
│ [+ Adicionar imagens]              │
│                                    │
│ Descreva a peça                    │
│                                    │
│ Bermuda jeans masculina nova       │
│ tamanho 32                         │
│                                    │
│         [ Analisar com IA ]        │
└────────────────────────────────────┘
```

---

# 23. Fluxo de IA

```text
Fotos
+
Descrição do operador
       │
       ▼
POST /api/products/analyze
       │
       ▼
Backend
       │
       ▼
LLM multimodal
       │
       ▼
Structured Output
       │
       ▼
Zod
       │
       ▼
Produto em revisão
       │
       ▼
Usuário confirma
       │
       ▼
Gerar SKU
       │
       ▼
Salvar produto
```

---

# 24. Saída da IA

A IA deverá retornar somente atributos da peça.

NÃO deverá retornar SKU definitivo.

Exemplo:

```json
{
  "categoria_codigo": "BERM",

  "identificacao": {
    "nome": "Bermuda Jeans Stretch Masculina Azul Tamanho 32",

    "descricao": "Bermuda jeans masculina..."
  },

  "classificacao": {
    "categoria": "Bermudas",

    "subcategoria": "Bermuda Jeans",

    "departamento": "Masculino"
  },

  "caracteristicas": {
    "tamanho_etiqueta": "32",

    "cor_principal": "Azul Jeans",

    "material": [
      "Jeans",
      "Denim Stretch"
    ]
  },

  "condicao": {
    "estado": "novo",

    "possui_etiqueta": true,

    "possui_defeitos": false
  }
}
```

---

# 25. Informação desconhecida

A IA não deverá inventar informações.

Quando não for possível determinar:

```json
{
  "marca": {
    "nome": null
  }
}
```

e não:

```json
{
  "marca": {
    "nome": "Marca provavelmente XYZ"
  }
}
```

---

# 26. Confiança da IA

Sempre que possível registrar confiança por campo:

```json
{
  "ai_metadata": {
    "fields": {
      "caracteristicas.cor_principal": {
        "confidence": 0.98,
        "source": "image"
      },

      "caracteristicas.tamanho_etiqueta": {
        "confidence": 0.99,
        "source": "image+prompt"
      },

      "marca.nome": {
        "confidence": 0.20,
        "source": "image"
      }
    }
  }
}
```

---

# 27. Human in the Loop

Nenhum produto gerado pela IA deverá ser publicado automaticamente na primeira versão.

Fluxo:

```text
IA
 ↓
preenche ficha
 ↓
operador revisa
 ↓
operador altera se necessário
 ↓
Salvar
```

---

# 28. Uso do Zod

O Zod será responsável por validar o contrato entre:

```text
Frontend
Backend
IA
MongoDB
```

Exemplo:

```typescript
const ProductConditionSchema = z.object({
  estado: z.enum([
    "novo",
    "seminovo",
    "usado"
  ]),

  nota: z.number()
    .min(0)
    .max(10)
    .nullable(),

  possui_etiqueta: z.boolean(),

  possui_defeitos: z.boolean(),

  defeitos: z.array(
    z.object({
      tipo: z.string(),

      descricao: z.string(),

      localizacao: z.string().nullable(),

      foto: z.string().nullable()
    })
  )
});
```

---

# 29. Regras com Zod

Exemplo:

se:

```text
possui_defeitos = true
```

então:

```text
defeitos.length >= 1
```

A regra deverá ser validada antes da persistência.

---

# 30. Administração de produtos

Tela:

```text
Produtos
```

Recursos:

- busca;
- filtros;
- ordenação;
- paginação;
- novo produto;
- edição;
- visualização;
- ativação;
- desativação;
- publicação;
- marcação como vendido.

---

# 31. Filtros de produtos

Permitir filtros por:

```text
SKU
nome
categoria
subcategoria
departamento
marca
tamanho
cor
estado da peça
status
faixa de preço
data de cadastro
```

---

# 32. Tela de produtos

Exemplo:

```text
Produtos

[Buscar pelo nome ou SKU...]

Categoria [Todos]
Status    [Disponível]
Tamanho   [Todos]

-----------------------------------------------------

Foto   SKU                 Produto              Preço

       BVI-BERM-000025     Bermuda Jeans        R$129,90

       BVI-POLO-000018     Polo Masculina       R$89,90

-----------------------------------------------------

                    [+ Novo Produto]
```

---

# 33. Dashboard administrativo

Tela inicial após autenticação.

Indicadores iniciais:

```text
Produtos disponíveis

Produtos cadastrados hoje

Produtos vendidos

Produtos em revisão

Produtos sem preço

Produtos sem imagens
```

Posteriormente:

```text
Faturamento
Ticket médio
Produtos mais visualizados
Categorias mais vendidas
Giro de estoque
Margem
```

---

# 34. Auditoria

Criar collection:

```text
audit_logs
```

Exemplo:

```json
{
  "_id": "ObjectId",

  "userId": "ObjectId",

  "action": "PRODUCT_UPDATE",

  "entity": "product",

  "entityId": "ObjectId",

  "timestamp": "2026-08-20T23:30:00-03:00",

  "metadata": {
    "field": "preco.preco_venda",

    "oldValue": 129.90,

    "newValue": 119.90
  }
}
```

---

# 35. Operações auditáveis

Registrar pelo menos:

```text
LOGIN_SUCCESS
LOGIN_FAILED

USER_CREATE
USER_UPDATE
USER_DISABLE

PRODUCT_CREATE
PRODUCT_UPDATE
PRODUCT_DISABLE
PRODUCT_PUBLISH
PRODUCT_SOLD

PRICE_UPDATE

CATEGORY_CREATE
CATEGORY_UPDATE
CATEGORY_DISABLE
```

---

# 36. Segurança de rotas

As APIs deverão possuir middleware de autenticação.

Exemplo:

```text
request
  ↓
authentication middleware
  ↓
authorization middleware
  ↓
controller
```

---

# 37. Autorização

Exemplo:

```text
DELETE /users/:id
```

deverá exigir:

```text
role = admin
```

Enquanto:

```text
POST /products
```

poderá aceitar:

```text
admin
operator
```

---

# 38. API inicial

Base:

```text
/api
```

---

# 39. Authentication API

```text
POST /api/auth/login

POST /api/auth/logout

POST /api/auth/refresh

GET /api/auth/me
```

---

# 40. Users API

```text
GET    /api/users

GET    /api/users/:id

POST   /api/users

PATCH  /api/users/:id

PATCH  /api/users/:id/status

PATCH  /api/users/:id/password
```

Apenas administradores poderão acessar o módulo.

---

# 41. Products API

```text
GET    /api/products

GET    /api/products/:id

POST   /api/products

PATCH  /api/products/:id

DELETE /api/products/:id
```

`DELETE` deverá preferencialmente realizar exclusão lógica.

---

# 42. AI API

```text
POST /api/products/analyze
```

Entrada:

```text
multipart/form-data
```

Contendo:

```text
prompt
images[]
```

Resposta:

```json
{
  "success": true,

  "data": {
    "...": "produto estruturado"
  }
}
```

Essa operação NÃO deverá gerar SKU.

---

# 43. Confirmação do produto

Endpoint:

```text
POST /api/products/confirm
```

Fluxo:

```text
recebe produto revisado
       ↓
valida Zod
       ↓
valida categoria
       ↓
incrementa sequência
       ↓
gera SKU
       ↓
persiste produto
       ↓
retorna produto
```

---

# 44. Categories API

```text
GET    /api/categories

POST   /api/categories

PATCH  /api/categories/:id

PATCH  /api/categories/:id/status
```

---

# 45. Imagens API

```text
POST   /api/images

DELETE /api/images/:id
```

Upload deverá ser permitido somente para usuários autenticados.

Validar:

- MIME type;
- tamanho;
- número máximo de imagens;
- extensões permitidas.

---

# 46. Requisitos de segurança

Obrigatórios:

- HTTPS;
- senhas Argon2id;
- cookies HttpOnly;
- cookies Secure em produção;
- SameSite;
- proteção contra brute force;
- rate limit;
- validação Zod de toda entrada;
- validação de MIME type;
- limite de tamanho de upload;
- sanitização;
- CORS restritivo;
- secrets exclusivamente em environment variables;
- logs de segurança;
- RBAC;
- MongoDB não acessível diretamente pelo frontend.

---

# 47. Variáveis de ambiente

Backend:

```text
NODE_ENV

PORT

MONGODB_URI

JWT_ACCESS_SECRET

JWT_REFRESH_SECRET

AI_API_KEY

CLOUDINARY_CLOUD_NAME

CLOUDINARY_API_KEY

CLOUDINARY_API_SECRET

FRONTEND_URL
```

Nunca versionar `.env`.

---

# 48. Rate limiting

Aplicar principalmente em:

```text
/auth/login

/products/analyze
```

A chamada de IA deverá possuir limites para evitar custos inesperados.

Exemplo conceitual:

```text
10 análises / minuto / usuário
```

O valor deverá ser configurável.

---

# 49. Projeto gráfico

A identidade visual deverá ser inspirada no:

**Brechó da Vovó Isabel**

e utilizar como principais referências:

- o site informado no projeto;
- a imagem de identidade visual fornecida;
- estética clássica;
- aparência sofisticada;
- elementos vintage;
- bordô;
- dourado;
- textura semelhante a veludo;
- ornamentos clássicos.

---

# 50. Paleta visual

Paleta inicial sugerida:

```text
Bordô profundo
#4A0008

Bordô principal
#65000B

Bordô claro
#7E101C

Dourado
#B28233

Dourado claro
#D5AD55

Dourado iluminado
#E4C36A

Creme
#F6EFE2

Preto
#15100C

Branco
#FFFFFF
```

A paleta deverá ser ajustada visualmente com base nos assets oficiais.

---

# 51. Identidade visual

O logo deverá ser protagonista principalmente em:

- tela inicial;
- login;
- cabeçalho;
- rodapé;
- e-commerce.

No backoffice utilizar versão reduzida para não comprometer espaço funcional.

---

# 52. Tipografia

Combinar:

### Títulos

Fonte serifada elegante.

Exemplos:

```text
Cormorant Garamond
Playfair Display
Libre Baskerville
```

### Corpo

Fonte de alta legibilidade.

Exemplos:

```text
Inter
Lato
Source Sans
```

Não utilizar fontes excessivamente ornamentadas para textos longos.

---

# 53. Estilo visual

Elementos principais:

```text
Bordô
+
Dourado
+
Creme
+
Ornamentos sutis
+
Sombras
+
Bordas douradas
+
Cards
+
Texturas discretas
```

Evitar excesso de ornamentação dentro do backoffice.

O e-commerce poderá possuir estética mais rica.

O painel administrativo deverá priorizar:

```text
legibilidade
+
rapidez
+
clareza
```

---

# 54. Componentes visuais

Criar componentes reutilizáveis:

```text
Button

Input

Select

Textarea

Modal

Dialog

Card

Badge

Table

Pagination

SearchInput

ImageUploader

ProductCard

ProductForm

UserForm

Sidebar

Header

Breadcrumb

Loading

Toast

ConfirmationDialog
```

---

# 55. Layout do Backoffice

Desktop:

```text
┌────────────────────────────────────────────┐
│ Logo            Usuário              Sair │
├───────────┬────────────────────────────────┤
│           │                                │
│ Dashboard │                                │
│ Produtos  │          Conteúdo              │
│ Categorias│                                │
│ Usuários  │                                │
│           │                                │
│ Config.   │                                │
│           │                                │
└───────────┴────────────────────────────────┘
```

---

# 56. Responsividade

A aplicação deverá suportar:

```text
Desktop
Tablet
Smartphone
```

O cadastro de produto deverá ser especialmente otimizado para smartphone, pois fotografias poderão ser feitas diretamente pelo dispositivo.

---

# 57. Captura de imagens no celular

O frontend deverá aceitar:

```html
<input
  type="file"
  accept="image/*"
  capture="environment"
/>
```

quando suportado pelo navegador.

Fluxo desejado:

```text
Abrir cadastro
      ↓
Fotografar frente
      ↓
Fotografar costas
      ↓
Fotografar etiqueta
      ↓
Informar descrição
      ↓
Analisar com IA
```

---

# 58. Imagens recomendadas

O sistema deverá orientar o usuário a fornecer:

```text
1. Frente
2. Costas
3. Etiqueta
4. Detalhes
5. Defeitos, se existentes
```

---

# 59. Estados de interface

Toda operação remota deverá possuir:

```text
loading

success

error

empty
```

Exemplo durante análise:

```text
Analisando peça...

A IA está avaliando as imagens e
preenchendo as características.
```

---

# 60. Feedback da análise

Depois da IA:

```text
✓ Categoria identificada

✓ Tamanho identificado

✓ Cor identificada

⚠ Marca não identificada

⚠ Composição não identificada
```

Isso facilita a revisão humana.

---

# 61. Índices MongoDB

Criar índice único:

```javascript
{
  sku: 1
}
```

com:

```text
unique = true
```

Criar índice único em usuários:

```javascript
{
  email: 1
}
```

---

# 62. Índices de pesquisa

Inicialmente:

```javascript
{
  "classificacao.categoria_codigo": 1,
  "status": 1
}
```

e:

```javascript
{
  "classificacao.departamento": 1,
  "caracteristicas.tamanho_etiqueta": 1,
  "status": 1
}
```

---

# 63. Requisitos não funcionais

## Performance

Interfaces comuns:

```text
< 2 segundos
```

quando infraestrutura permitir.

Operações de IA poderão possuir tempo maior.

---

## Disponibilidade

Suficiente para operação de pequena empresa.

Não exigir arquitetura multi-região na primeira versão.

---

## Escalabilidade

A arquitetura deverá permitir evolução sem exigir microserviços inicialmente.

---

## Manutenibilidade

Obrigatório:

```text
TypeScript strict
ESLint
Prettier
Zod
componentização
separação de responsabilidades
testes automatizados
```

---

# 64. Estratégia de testes

## Unitários

Testar principalmente:

```text
SKU Generator
Zod schemas
regras de produto
regras de usuário
permissões
```

---

## Integração

Testar:

```text
Fastify + MongoDB

Auth

Products

Users

SKU sequence
```

---

## E2E

Fluxos prioritários:

```text
Login

Cadastrar peça manualmente

Cadastrar peça utilizando IA

Editar peça

Criar usuário

Alterar usuário

Marcar peça como vendida
```

---

# 65. Critério de aceite — Login

DADO um usuário ativo

QUANDO informar e-mail e senha corretos

ENTÃO deverá ser autenticado e levado ao dashboard.

---

# 66. Critério de aceite — Login inválido

DADO um usuário

QUANDO informar credenciais incorretas

ENTÃO:

- não autenticar;
- não revelar se o e-mail existe;
- registrar tentativa;
- apresentar mensagem genérica.

---

# 67. Critério de aceite — Cadastro com IA

DADO um operador autenticado

E fotografias de uma peça

E uma descrição textual

QUANDO clicar em:

```text
Analisar com IA
```

ENTÃO o sistema deverá:

- enviar texto e imagens ao backend;
- solicitar análise ao modelo multimodal;
- validar o resultado;
- preencher o formulário;
- permitir edição;
- não salvar automaticamente.

---

# 68. Critério de aceite — SKU

DADO:

```text
BERM.currentValue = 24
```

QUANDO um novo produto da categoria BERM for confirmado

ENTÃO deverá ser criado:

```text
BVI-BERM-000025
```

e:

```text
BERM.currentValue = 25
```

---

# 69. Critério de aceite — concorrência

DADAS duas requisições simultâneas

QUANDO ambas cadastrarem uma Bermuda

ENTÃO os SKUs deverão ser distintos.

Exemplo:

```text
BVI-BERM-000025

BVI-BERM-000026
```

Nunca poderão existir dois produtos com o mesmo SKU.

---

# 70. Critério de aceite — usuário administrador

DADO um usuário `admin`

QUANDO acessar Administração → Usuários

ENTÃO poderá:

```text
consultar
criar
editar
ativar
desativar
alterar perfil
resetar senha
```

---

# 71. Critério de aceite — operador

DADO um usuário `operator`

QUANDO tentar acessar:

```text
/admin/users
```

ENTÃO deverá receber:

```text
403 Forbidden
```

e a página deverá permanecer inacessível no frontend.

---

# 72. Critério de aceite — dados desconhecidos pela IA

DADO que a marca não seja visível

QUANDO a IA analisar a peça

ENTÃO deverá produzir:

```json
{
  "marca": {
    "nome": null
  }
}
```

Nunca deverá inventar uma marca.

---

# 73. MVP

A primeira versão deverá possuir apenas:

```text
Login

Dashboard

Usuários

Categorias

Produtos

Cadastro Manual

Cadastro por IA

SKU automático

Upload de imagens

Edição de produto

Busca de produtos

Controle de status

Auditoria básica
```

---

# 74. Fora do MVP

Não implementar inicialmente:

```text
Carrinho

Checkout

Gateway de pagamento

Frete automatizado

Mercado Livre

Shopee

CRM

Programa de fidelidade

Recomendação por IA

Precificação automática

ERP

BI avançado

Multiagentes
```

Esses recursos deverão ser tratados como evolução.

---

# 75. Roadmap sugerido

## Fase 1 — Backoffice

```text
Autenticação

Usuários

RBAC

Categorias

Produtos

MongoDB
```

---

## Fase 2 — Cadastro inteligente

```text
Upload de imagens

LLM multimodal

Zod

Produto em revisão

SKU automático
```

---

## Fase 3 — E-commerce

```text
Catálogo público

Busca

Filtros

Página do produto

Carrinho
```

---

## Fase 4 — Venda

```text
Checkout

Pagamento

Pedido

Baixa automática da peça
```

---

## Fase 5 — Marketplaces

```text
Mercado Livre

Shopee

Sincronização de estoque

Pedidos externos
```

---

## Fase 6 — Inteligência comercial

```text
Precificação por IA

Recomendação

Análise de giro

Previsão de venda

SEO automático

BI
```

---

# 76. Regra arquitetural final

Toda funcionalidade deverá respeitar:

```text
React
   ↓
API Fastify
   ↓
Application Service
   ↓
Domain Rules
   ↓
Repository
   ↓
MongoDB
```

Integrações externas deverão ser abstraídas:

```text
AI Provider

Image Provider

Database Repository
```

permitindo substituir fornecedores posteriormente.

---

# 77. Regra específica para IA

O princípio central da aplicação deverá ser:

> **A IA interpreta; a aplicação decide.**

Portanto:

```text
LLM
 ↓
sugestão estruturada
 ↓
Zod
 ↓
regras de negócio
 ↓
revisão humana
 ↓
persistência
```

e nunca:

```text
LLM
 ↓
acesso irrestrito ao banco
```

---

# 78. Resultado esperado do MVP

Ao final do MVP deverá ser possível entrar no sistema, fotografar uma peça, informar algo como:

```text
Bermuda Jeans Stretch masculina nova tamanho 32
```

e receber automaticamente:

```text
Nome

Descrição

Categoria

Departamento

Características

Cor

Tamanho

Condição

Tags

SEO
```

O operador revisará a ficha e pressionará:

```text
Salvar produto
```

O sistema então deverá:

```text
validar produto
        ↓
obter categoria BERM
        ↓
incrementar sequência atomicamente
        ↓
gerar BVI-BERM-XXXXXX
        ↓
salvar produto
        ↓
registrar auditoria
        ↓
confirmar cadastro
```

Esse fluxo deverá constituir o núcleo funcional inicial do **Brechó da Vovó Isabel**.