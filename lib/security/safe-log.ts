// Redakcja logow (ADR-0004 §6/§7): do logu serwera i do odpowiedzi HTTP nie moga trafiac
// dane osobowe, surowe identyfikatory ani sekrety. Logujemy wylacznie pola z bialej listy,
// skorelowane przez requestId. Pokryte testem jednostkowym.

const ALLOWED_KEYS = new Set([
  "event",
  "requestId",
  "inquiryId",
  "transport",
  "outcome",
  "layer",
  "status",
  "notificationStatus",
  "errorCode",
  "httpStatus",
]);

export type SafeLogger = (payload: Record<string, unknown>) => void;

export function safeLogPayload(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (ALLOWED_KEYS.has(key) && input[key] !== undefined) {
      output[key] = input[key];
    }
  }
  return output;
}

export function logServerEvent(logger: SafeLogger, input: Record<string, unknown>): void {
  logger(safeLogPayload(input));
}

// Stabilny, pozbawiony danych osobowych kod bledu. Nigdy nie zwraca komunikatu wyjatku,
// ktory moglby zawierac adres e-mail, tresc zgloszenia lub inne dane wejsciowe.
export function safeErrorCode(error: unknown): string {
  if (error instanceof Error) return "error";
  if (typeof error === "string") return "unknown";
  if (error && typeof error === "object") return "object_error";
  return "unknown";
}
