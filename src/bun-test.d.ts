import 'bun:test'

declare module 'bun:test' {
  interface AsymmetricMatchers {
    objectContaining<T extends object>(obj: Partial<T>): AsymmetricMatcher
  }
}
