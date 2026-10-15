/**
 * Jest가 TypeScript 단위 테스트를 실행하도록 구성합니다.
 * 실제 DB에 접속하는 통합 테스트는 MVP 이후 Supertest 환경에서 별도로 구성합니다.
 */
module.exports = {
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/generated/**",
    "!src/server.ts",
  ],
  coverageDirectory: "coverage",
  moduleFileExtensions: ["ts", "js", "json"],
  preset: "ts-jest",
  roots: ["<rootDir>/tests"],
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
};
