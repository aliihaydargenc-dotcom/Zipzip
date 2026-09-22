interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.css';

/// <reference types="vite/client" />
