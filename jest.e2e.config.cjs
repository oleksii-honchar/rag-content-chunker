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
    'node_modules/(?!(chokidar|anymatch|readdirp|glob-parent|is-binary-path|fsevents)/)',
  ],
  testTimeout: 60000,
  verbose: true,
};
