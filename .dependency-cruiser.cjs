// Testes de arquitetura (ADR-0005, RNF-05). As 5 regras obrigatórias vêm primeiro.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-no-channels",
      comment: "O núcleo (src/modules) não pode depender de adaptadores de canal (ADR-0004).",
      severity: "error",
      from: { path: "^src/modules/" },
      to: { path: "^src/channels/" },
    },
    {
      name: "domain-pure",
      comment: "O domínio não importa aplicação, infraestrutura, plataforma, composição nem pacotes npm.",
      severity: "error",
      from: { path: "^src/modules/[^/]+/domain/" },
      to: {
        path: [
          "^src/modules/[^/]+/(application|infrastructure)/",
          "^src/(platform|main|channels)/",
        ],
      },
    },
    {
      name: "domain-no-packages",
      comment: "Parte de domain-pure: o domínio não depende de bibliotecas externas.",
      severity: "error",
      from: { path: "^src/modules/[^/]+/domain/" },
      to: { dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer", "npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "application-no-infra",
      comment: "A aplicação depende só de portas; implementações ficam na infraestrutura.",
      severity: "error",
      from: { path: "^src/modules/[^/]+/application/" },
      to: {
        path: ["^src/modules/[^/]+/infrastructure/", "^src/(platform|main|channels)/"],
      },
    },
    {
      name: "module-public-api-only",
      comment: "Um módulo só acessa outro pela API pública (src/modules/<outro>/index.ts).",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/[^/]+/",
        pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "no-module-cycles",
      comment: "Sem ciclos de dependência.",
      severity: "error",
      from: { path: "^src/" },
      to: { circular: true },
    },
    {
      name: "only-main-composes",
      comment: "Ninguém importa a raiz de composição.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/main/" },
      to: { path: "^src/main/" },
    },
    {
      name: "platform-no-modules",
      comment: "A plataforma é infraestrutura transversal e não conhece módulos de negócio.",
      severity: "error",
      from: { path: "^src/platform/" },
      to: { path: "^src/modules/" },
    },
    {
      name: "whatsapp-lib-isolated",
      comment: "A biblioteca não oficial do WhatsApp só entra por baileys-provider.ts (ADR-0009, D-20 da feature 003).",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/channels/whatsapp/provider/baileys-provider\\.ts$" },
      to: { path: "(^|node_modules/)baileys(/|$)" },
    },
    {
      name: "object-store-isolated",
      comment: "O SDK do S3 só entra pelo armazenamento de mídia (feature 005, D-06).",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/modules/media/infrastructure/object-store/" },
      to: { path: "(^|node_modules/)@aws-sdk/" },
    },
    {
      name: "transcriber-engine-isolated",
      comment: "Os adaptadores do motor de transcrição só são usados pela infraestrutura e pela API pública de media (feature 005, RF-07, D-21).",
      severity: "error",
      from: { path: "^src/", pathNot: ["^src/modules/media/index\\.ts$", "^src/modules/media/infrastructure/"] },
      to: { path: "^src/modules/media/infrastructure/transcribers/" },
    },
    {
      name: "embedder-engine-isolated",
      comment: "Os adaptadores do cálculo de sentido só são usados pela infraestrutura e pela API pública de knowledge (feature 007, D-01).",
      severity: "error",
      from: { path: "^src/", pathNot: ["^src/modules/knowledge/index\\.ts$", "^src/modules/knowledge/infrastructure/"] },
      to: { path: "^src/modules/knowledge/infrastructure/embedders/" },
    },
    {
      name: "verifier-engine-isolated",
      comment: "Os adaptadores do verificador externo só são usados pela infraestrutura e pela API pública de retrieval (feature 007, D-10).",
      severity: "error",
      from: { path: "^src/", pathNot: ["^src/modules/retrieval/index\\.ts$", "^src/modules/retrieval/infrastructure/"] },
      to: { path: "^src/modules/retrieval/infrastructure/verifiers/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(\\.test\\.ts$|/fixtures/)" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".js", ".mjs", ".cjs", ".json"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
