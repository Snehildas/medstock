const { createDefaultPreset } = require("ts-jest");

/** @type {import("jest").Config} */
module.exports = {
  ...createDefaultPreset({
    tsconfig: {
      esModuleInterop: true,
      strict: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      isolatedModules: true,
    },
  }),
  testEnvironment: "node",
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
