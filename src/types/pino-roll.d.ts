declare module "pino-roll" {
  function rotate(
    filename: string,
    options: {
      size?: string;
      interval?: string;
      compress?: boolean;
      maxFiles?: number;
      mkdir?: boolean;
      dateFormat?: string;
      nameFormat?: string;
    },
  ): void;
  export default rotate;
}
