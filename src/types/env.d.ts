declare global {
  namespace NodeJS {
    interface ProcessEnv {
      [key: string]: string | undefined;
      LLM_PROVIDER_URL?: string;
      LLM_PROVIDER_API_KEY?: string;
      LOG_LEVEL?: string;
      NODE_ENV?: string;
    }
  }
}

export {};
