const { createDefaultPreset } = require("ts-jest");

/** @type {import("jest").Config} */
module.exports = {
  ...createDefaultPreset({
    tsconfig: {
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      strict: true,
    },
  }),
  testEnvironment: "node",
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
