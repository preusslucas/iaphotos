import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Bundle gerado do worker — lintar saída de build só produz ruído.
    "dist/**",
    // Projeto isolado, com o próprio tsconfig e ciclo de vida.
    "spike/**",
  ]),
  {
    rules: {
      // Descartar campos por desestruturação (`const { secreto: _s, ...resto }`)
      // é como se remove uma propriedade sem mutar o objeto. A variável existe
      // justamente para não ser usada — o prefixo `_` marca a intenção.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
]);

export default eslintConfig;
