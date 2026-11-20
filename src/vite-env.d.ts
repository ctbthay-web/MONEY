/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_KIWIFY_URL_START?: string
  readonly VITE_KIWIFY_URL_PLUS?: string
  readonly VITE_KIWIFY_URL_PRO?: string
  readonly VITE_KIWIFY_URL_PREMIUM?: string
  readonly VITE_LEGAL_NAME?: string
  readonly VITE_LEGAL_DOC?: string
  readonly VITE_SUPPORT_EMAIL?: string
  readonly VITE_SUPPORT_WHATSAPP?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
