import { issueFormToken } from "@/lib/security/form-token";

// Wydanie swiezego tokenu czasowego formularza (ISK-357 T4). Gdy token wygasnie (> 60 min),
// klient pobiera nowy stad i pozwala wyslac zgloszenie ponownie BEZ utraty wpisanej tresci —
// zamiast cichego porzucenia zgloszenia. Token jest podpisywany wylacznie serwerowym sekretem.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const tokenSecret = process.env.FORM_TOKEN_SECRET;
  if (!tokenSecret) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return new Response(JSON.stringify({ formToken: issueFormToken(tokenSecret) }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
