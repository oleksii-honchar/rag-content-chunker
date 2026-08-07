module.exports = {
  preset: 'ts-jest',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/e2e/.*\\.test\\.ts$',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage-e2e',
  testEnvironment: 'node',
  globalSetup: '<rootDir>/src/e2e/global-setup.ts',
  globalTeardown: '<rootDir>/src/e2e/global-teardown.ts',
  setupFiles: ['<rootDir>/src/e2e/setup.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chokidar|anymatch|readdirp|glob-parent|is-binary-path|fsevents|nestjs-pino|pino-http|pino|pino-pretty|@mastra|@sindresorhus|escape-string-regexp|p-map|aggregate-error)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^tokenx$': '<rootDir>/src/e2e/mocks/tokenx.js',
  },
  testTimeout: 60000,
  verbose: true,
  // E2E suites share one Mnemosyne Docker instance and one SQLite tracker DB.
  // Parallel workers race on bank registration and Prisma writes (SQLite
  // "Operation has timed out"). Run sequentially (runInBand is CLI-only;
  // maxWorkers: 1 is the config equivalent).
  maxWorkers: 1,
  // E2E tests use real network connections (Mnemosyne MCP client HTTP
  // keep-alive sockets) that the global agent may not release in time.
  forceExit: true,
};
