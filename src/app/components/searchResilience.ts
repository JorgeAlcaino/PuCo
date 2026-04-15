export interface PollPartial<T> {
  total: number;
  listado: T[];
  progress: number;
  totalDays: number;
  warning?: string;
  failedDays?: number;
}

export interface PollData<T> {
  total: number;
  listado: T[];
  warning?: string;
  failedDays?: number;
}

export interface SearchRequestError<T> extends Error {
  partial?: PollPartial<T>;
  data?: PollData<T>;
  recoverable?: boolean;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function backoffDelayMs(attempt: number, baseMs = 350, maxMs = 6000): number {
  const exp = Math.min(baseMs * (2 ** attempt), maxMs);
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.round(exp * jitter);
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function isRecoverableErrorMessage(message: string): boolean {
  return /(timeout|429|5\d\d|inestable|tempor|rate|network|failed to fetch|reinici)/i.test(message);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (attempt < retries && isRetryableHttpStatus(response.status)) {
        await delay(backoffDelayMs(attempt));
        continue;
      }
      return response;
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      lastError = err;
      if (attempt < retries) {
        await delay(backoffDelayMs(attempt));
        continue;
      }
      throw err;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Error desconocido de red');
}

export function createSearchError<T>(
  message: string,
  details?: Partial<Pick<SearchRequestError<T>, 'partial' | 'data' | 'recoverable'>>,
): SearchRequestError<T> {
  const err = new Error(message) as SearchRequestError<T>;
  if (details?.partial) err.partial = details.partial;
  if (details?.data) err.data = details.data;
  if (typeof details?.recoverable === 'boolean') err.recoverable = details.recoverable;
  return err;
}
