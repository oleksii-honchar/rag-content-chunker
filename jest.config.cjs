module.exports = {
  preset: 'ts-jest',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/((?!e2e/)).*\\.test\\.ts$',
  collectCoverageFrom: ['src/**/*.ts', '!src/e2e/**/*'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chokidar|anymatch|readdirp|glob-parent|is-binary-path|fsevents|nestjs-pino|pino-http|pino|pino-pretty)/)',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 70,
      functions: 80,
      statements: 80,
    },
  },
};
