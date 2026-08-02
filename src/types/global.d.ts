/**
 * Ambient declarations for globals that exist at runtime in the React
 * Native / Metro environment but aren't part of standard TS lib types.
 *
 * `__DEV__` is injected by Metro/React Native.
 * `require` is Metro's module loader — used here only for optional,
 * try/caught peer-dependency lookups (see utils/helpers.ts#optionalRequire).
 */

declare const __DEV__: boolean;

declare function require(id: string): any;
