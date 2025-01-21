declare global {
  namespace NodeJS {
    interface ProcessEnv {
      LLM_PROVIDER_URL: string;
      LLM_PROVIDER_API_KEY: string;
      LOG_LEVEL: string;
    }
  }
}

export {};
