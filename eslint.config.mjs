import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["src/components/**/*.{ts,tsx}", "src/lib/client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/server/ai/**", "@/lib/server/capability-runtime", "@/lib/server/ai-rate-limit"],
              message: "AI provider configuration and gateway code are server-only.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "coverage/**",
    "node_modules/**",
    "output/**",
    "services/document-worker/**/__pycache__/**",
    "tsconfig.tsbuildinfo",
  ]),
]);
