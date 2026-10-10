import { createHmac } from "node:crypto";

// Identyfikator klienta do limitu czestosci (ADR-0004 §3 warstwa 3). NIE zapisujemy surowego
// adresu IP ani User-Agenta — przechowujemy wylacznie HMAC-SHA256(IP, FORM_THROTTLE_SALT).
// Minimalizacja danych wg `04_Ryzyka/RODO i dane osobowe.md`.

export function hashClientIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

// Liczba zaufanych proxy przed aplikacja — KONFIGURACJA, nie stala (ISK-361 / E7 W2 / ADR-0006).
//
// SEMANTYKA (tozsama z `trust proxy = N` w Express oraz `set_real_ip_from` + N hopow w nginx):
// `trustedProxyCount = N` oznacza N zaufanych hopow bezposrednio przed aplikacja. Kazdy taki hop
// DOPISUJE dokladnie jeden wpis na KONIEC `x-forwarded-for` (adres rozmowcy, od ktorego odebral
// polaczenie). Dlatego ZAUFANY BLOK to OSTATNIE N wpisow listy, a realny adres klienta to
// PIERWSZY (najbardziej na lewo) wpis tego bloku — ten, ktory zapisal NAJBARDZIEJ ZEWNETRZNY
// zaufany proxy, widzac gniazdo klienta. Indeks: `parts.length - N`.
//
// Przyklady (klient 203.0.113.9):
//   N=1, XFF "203.0.113.9"                      -> blok=[203.0.113.9]            -> klient=ostatni
//   N=1, XFF "<spoof>, 203.0.113.9"             -> blok=[203.0.113.9]            -> klient=ostatni
//   N=2, XFF "<spoof>, 203.0.113.9, <innerLB>"  -> blok=[203.0.113.9, <innerLB>] -> klient=len-2
// Wszystko NA LEWO od zaufanego bloku jest kontrolowane przez atakujacego i jest IGNOROWANE —
// doklejanie wpisow z lewej NIE przesuwa wyboru. Odliczanie od KONCA (nie `length-1-N`) jest tu
// kluczowe: `length-1-N` wskazalby wpis spoza bloku, czyli wartosc podstawiona przez atakujacego.
//
// Wartosc MUSI odpowiadac realnej topologii wybranej platformy, potwierdzonej EMPIRYCZNIE na
// preview (warunek wdrozenia w ADR-0006) — nie na podstawie dokumentacji dostawcy. Wartosc < 1
// oznacza brak zaufanego proxy: zadnego naglowka przekazywania nie da sie wtedy ufac.
export interface ClientIpConfig {
  trustedProxyCount: number;
}

// Odczyt adresu klienta z naglowkow przekazywania. KLUCZOWE (E7 W2): platformy proxujace
// DOPISUJA prawdziwy adres na KONIEC `x-forwarded-for`, wiec lewy skraj listy jest kontrolowany
// przez klienta i NIE wolno mu ufac. Zwracamy pierwszy wpis zaufanego bloku (OSTATNIE N wpisow);
// `x-real-ip` (pojedyncza wartosc ustawiana przez najblizszy zaufany proxy) ma pierwszenstwo.
// Zwraca null, gdy adresu nie da sie ustalic w sposob godny zaufania — wywolujacy MUSI wtedy
// odrzucic zadanie, a NIE wrzucac wszystkich do wspolnego wiadra (ADR-0006, warunek wdrozenia).
export function extractClientIp(headers: Headers, config: ClientIpConfig): string | null {
  // Bez zaufanego proxy przed aplikacja zaden naglowek przekazywania nie jest wiarygodny.
  if (!Number.isInteger(config.trustedProxyCount) || config.trustedProxyCount < 1) {
    return null;
  }

  // `x-real-ip`: pojedyncza wartosc ustawiana przez najblizszy zaufany proxy — pierwszy wybor.
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  // `x-forwarded-for`: zaufany blok to OSTATNIE `trustedProxyCount` wpisow (po jednym na hop).
  // Realny klient = PIERWSZY wpis bloku = `parts.length - trustedProxyCount`. Gdy wpisow jest
  // mniej niz zaufanych hopow (indeks < 0), adresu nie da sie ustalic -> null (odrzucenie).
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const index = parts.length - config.trustedProxyCount;
    if (index >= 0 && parts[index]) {
      return parts[index];
    }
  }

  return null;
}
