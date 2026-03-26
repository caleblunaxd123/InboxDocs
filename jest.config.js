/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
  // Transform zustand (ESM-only) and other ESM packages
  transformIgnorePatterns: [
    'node_modules/(?!(zustand|uuid)/)',
  ],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        allowJs: true,
        jsx: 'react-jsx',
        module: 'commonjs',
        target: 'ES2020',
        moduleResolution: 'node',
        baseUrl: '.',
        paths: { '@/*': ['src/*'] },
      },
      diagnostics: false,
    }],
  },
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/__tests__/__mocks__/react-native.ts',
    '^react-native-get-random-values$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
    '^expo-sqlite$': '<rootDir>/src/__tests__/__mocks__/expo-sqlite.ts',
    '^expo-file-system/legacy$': '<rootDir>/src/__tests__/__mocks__/expo-file-system.ts',
    '^expo-file-system$': '<rootDir>/src/__tests__/__mocks__/expo-file-system.ts',
    '^expo-secure-store$': '<rootDir>/src/__tests__/__mocks__/expo-secure-store.ts',
    '^expo-auth-session$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
    '^expo-web-browser$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
    '^expo-notifications$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
    '^expo-background-fetch$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
    '^expo-task-manager$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
    '^expo-sharing$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
    '^expo-linear-gradient$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
    '^@expo/vector-icons$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
    '^expo-image$': '<rootDir>/src/__tests__/__mocks__/empty.ts',
  },
};
