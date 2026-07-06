/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Set to `"true"` for mock sign-in (no API). Omit or any other value = real API only. */
  readonly VITE_USE_DEMO_DATA?: string;
  readonly VITE_DEFAULT_BRANCH_ID?: string;
  readonly VITE_DEFAULT_TERMINAL_ID?: string;
  readonly VITE_MEDIA_PUBLIC_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
