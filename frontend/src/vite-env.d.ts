/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VUE_APP_COGNITO_USERPOOL_ID: string
  readonly VUE_APP_COGNITO_CLIENT_ID: string
  readonly VUE_APP_API_ENDPOINT: string
  readonly VUE_APP_COGNITO_REGION?: string
  readonly VUE_APP_COGNITO_REDIRECT_URI?: string
  readonly VUE_APP_COGNITO_REDIRECT_URI_SIGNOUT?: string
  readonly VUE_APP_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
