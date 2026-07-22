const js = require("@eslint/js");
const globals = require("globals");

/**
 * Practical lint gate:
 * - Whole API: catch real bugs (undef, constant binary, misused await patterns)
 * - Permission/handoff core: stricter async surface
 * - Legacy unused imports/vars are warnings so the gate stays green while
 *   still surfacing cleanup work; critical modules promote unused to error.
 */

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  {
    ignores: [
      "node_modules/**",
      "uploads/**",
      "data/**",
      "tmp/**",
      "coverage/**",
      "scripts/**",
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Base correctness without drowning CI in historical unused-import debt.
      "no-undef": "error",
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      "no-constant-binary-expression": "error",
      "no-async-promise-executor": "error",
      "no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      // Historical code uses `return await` intentionally in places; not a security signal.
      "no-return-await": "off",
      "require-await": "off",
      // Disallow treating a bare Promise as a value in boolean contexts is not a
      // core ESLint rule; we rely on require-await + review on permission paths.
      "no-unsafe-finally": "error",
      "no-unreachable": "error",
      "constructor-super": "error",
      "no-this-before-super": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-extra-boolean-cast": "error",
      "no-func-assign": "error",
      "no-sparse-arrays": "error",
      "no-unexpected-multiline": "error",
    },
  },
  // Permission / handoff / access core: promote unused to error and require await hygiene.
  {
    files: [
      "src/security/**/*.js",
      "src/lib/projectHandoff.js",
      "src/lib/projectVersion.js",
      "src/modules/defects/routes.js",
      "src/modules/tasks/routes.js",
      "src/modules/requirements/routes.js",
      "src/modules/requirements/schema.js",
      "server.js",
    ],
    rules: {
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      "require-await": "error",
      "no-async-promise-executor": "error",
      "no-constant-binary-expression": "error",
    },
  },
];
