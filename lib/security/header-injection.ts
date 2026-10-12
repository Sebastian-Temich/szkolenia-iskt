// Ochrona przed wstrzyknieciem naglowkow e-mail (ISK-370, ustalenie S3 z bramki E7).
// Znaki konca linii (CR = 0x0D, LF = 0x0A) w danych zgloszenia pozwalalyby zamknac biezacy
// naglowek wiadomosci i dopisac wlasne (np. `Bcc:`), gdy dane trafiaja do tematu lub adresata
// powiadomienia (ADR-0004 §5). Dwie warstwy obrony: schemat Zod odrzuca je PRZED zapisem, a ten
// modul chroni warstwe poczty PRZED wywolaniem Resend — gdyby jakiekolwiek pole naglowkowe
// powstalo z pominieciem schematu.
//
// Skan po punktach kodowych zamiast wyrazenia regularnego — bez znakow sterujacych w zrodle
// i bez wyjatku dla reguly `no-control-regex` (zgodnie ze stylem `lib/validation/inquiry.ts`).

const CR = 0x0d;
const LF = 0x0a;

/** Zwraca `true`, gdy wartosc zawiera znak CR lub LF. */
export function hasLineBreak(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === CR || code === LF) return true;
  }
  return false;
}

/**
 * Rzuca, gdy ktorekolwiek pole naglowkowe wiadomosci (`from`, `to`, `subject`) zawiera CR/LF.
 * Ostatnia linia obrony tuz przed wywolaniem dostawcy poczty. Komunikat jest stabilny i wolny
 * od danych osobowych (ADR-0004 §6) — nie zawiera wartosci pola.
 */
export function assertNoEmailHeaderInjection(fields: {
  from: string;
  to: string;
  subject: string;
}): void {
  for (const value of [fields.from, fields.to, fields.subject]) {
    if (hasLineBreak(value)) {
      throw new Error("mail_header_injection");
    }
  }
}
