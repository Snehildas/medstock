const tseslint = require("typescript-eslint");

module.exports = tseslint.config(...tseslint.configs.recommended, {
  files: ["src/**/*.ts"],
  ignores: ["src/generated/**"],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
  },
});
