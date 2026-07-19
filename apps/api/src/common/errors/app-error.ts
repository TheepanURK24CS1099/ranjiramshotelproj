export interface AppErrorOptions {
  statusCode: number;
  code: string;
  safeMessage: string;
  isOperational?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;

  readonly code: string;

  readonly safeMessage: string;

  readonly isOperational: boolean;

  constructor({ statusCode, code, safeMessage, isOperational = true, cause }: AppErrorOptions) {
    super(safeMessage, cause === undefined ? undefined : { cause });
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.safeMessage = safeMessage;
    this.isOperational = isOperational;
  }
}
