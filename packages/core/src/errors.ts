/**
 * CerebreX — Custom error classes
 * All errors include a user-facing message AND an internal code
 * so we can log them without leaking internals to end users.
 */

export class CerebreXError extends Error {
  public readonly code: string;
  public readonly userMessage: string;

  constructor(code: string, userMessage: string, internalDetails?: string) {
    super(internalDetails || userMessage);
    this.name = 'CerebreXError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

export class ForgeError extends CerebreXError {
  constructor(message: string, details?: string) {
    super('FORGE_ERROR', message, details);
    this.name = 'ForgeError';
  }
}

export class TraceError extends CerebreXError {
  constructor(message: string, details?: string) {
    super('TRACE_ERROR', message, details);
    this.name = 'TraceError';
  }
}

export class MemexError extends CerebreXError {
  constructor(message: string, details?: string) {
    super('MEMEX_ERROR', message, details);
    this.name = 'MemexError';
  }
}

export class MemoryIntegrityError extends CerebreXError {
  constructor(key: string) {
    super(
      'MEMORY_INTEGRITY_VIOLATION',
      `Memory integrity check failed for key: ${key}. The stored value may have been tampered with.`,
    );
    this.name = 'MemoryIntegrityError';
  }
}

export class RegistryError extends CerebreXError {
  constructor(message: string, details?: string) {
    super('REGISTRY_ERROR', message, details);
    this.name = 'RegistryError';
  }
}

export class HiveError extends CerebreXError {
  constructor(message: string, details?: string) {
    super('HIVE_ERROR', message, details);
    this.name = 'HiveError';
  }
}
