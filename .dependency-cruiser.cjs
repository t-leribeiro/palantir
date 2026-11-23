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
