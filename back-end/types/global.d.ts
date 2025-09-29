// Global Node.js types for environments where @types/node is not available
declare global {
  var console: {
    log(...args: any[]): void;
    error(...args: any[]): void;
    warn(...args: any[]): void;
    info(...args: any[]): void;
    debug(...args: any[]): void;
  };

  var process: {
    env: { [key: string]: string | undefined };
    exit(code?: number): never;
    cwd(): string;
    argv: string[];
  };

  var Buffer: {
    from(data: string | ArrayBuffer | number[], encoding?: string): Buffer;
    isBuffer(obj: any): boolean;
  };

  interface Buffer {
    toString(encoding?: string): string;
    length: number;
  }

  var __dirname: string;
  var __filename: string;

  namespace NodeJS {
    interface ProcessEnv {
      [key: string]: string | undefined;
    }
  }
}

export {};