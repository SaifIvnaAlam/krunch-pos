/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Set to `"true"` for mock sign-in (no API). Omit or any other value = real API only. */
  readonly VITE_USE_DEMO_DATA?: string;
  /** In API mode, only this email may use the sign-in form (default: seeded owner). */
  readonly VITE_SEEDED_ADMIN_EMAIL?: string;
  readonly VITE_DEFAULT_BRANCH_ID?: string;
  readonly VITE_DEFAULT_TERMINAL_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
