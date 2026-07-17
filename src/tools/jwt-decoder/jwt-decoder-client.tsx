import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** base64url string → UTF-8 text. Throws on invalid input. */
function b64urlToText(part: string): string {
  let normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) normalized += "=";
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** UTF-8 text → base64url, used only to build the offline sample token. */
function textToB64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildSampleToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: "1234567890",
    name: "Ada Lovelace",
    role: "admin",
    iat: now - 3600,
    nbf: now - 3600,
    exp: now + 7200,
  };
  // The signature is a placeholder — this tool never verifies signatures anyway.
  return `${textToB64url(JSON.stringify(header))}.${textToB64url(JSON.stringify(payload))}.c2FtcGxlLXNpZ25hdHVyZQ`;
}

interface TimeClaim {
  claim: "exp" | "iat" | "nbf";
  label: string;
  value: number;
  date: string;
}

interface Decoded {
  header: string;
  payload: string;
  signature: string;
  timeClaims: TimeClaim[];
  expired: boolean | null; // null = no exp claim
  notYetValid: boolean;
  error: string | null;
}

const TIME_CLAIM_LABEL: Record<TimeClaim["claim"], string> = {
  exp: "Expires (exp)",
  iat: "Issued at (iat)",
  nbf: "Not before (nbf)",
};

function decodeToken(raw: string): Decoded | null {
  const token = raw.trim();
  if (!token) return null;
  const fail = (error: string): Decoded => ({
    header: "",
    payload: "",
    signature: "",
    timeClaims: [],
    expired: null,
    notYetValid: false,
    error,
  });

  const parts = token.split(".");
  if (parts.length !== 3)
    return fail(`A JWT has 3 dot-separated parts (header.payload.signature) — found ${parts.length}.`);

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(b64urlToText(parts[0]));
  } catch {
    return fail("The header is not valid base64url-encoded JSON.");
  }
  try {
    payload = JSON.parse(b64urlToText(parts[1]));
  } catch {
    return fail("The payload is not valid base64url-encoded JSON.");
  }

  const timeClaims: TimeClaim[] = [];
  let expired: boolean | null = null;
  let notYetValid = false;
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const claims = payload as Record<string, unknown>;
    const nowSec = Date.now() / 1000;
    for (const claim of ["exp", "iat", "nbf"] as const) {
      const v = claims[claim];
      if (typeof v === "number" && Number.isFinite(v)) {
        timeClaims.push({
          claim,
          label: TIME_CLAIM_LABEL[claim],
          value: v,
          date: new Date(v * 1000).toLocaleString(),
        });
        if (claim === "exp") expired = v < nowSec;
        if (claim === "nbf" && v > nowSec) notYetValid = true;
      }
    }
  }

  return {
    header: JSON.stringify(header, null, 2),
    payload: JSON.stringify(payload, null, 2),
    signature: parts[2],
    timeClaims,
    expired,
    notYetValid,
    error: null,
  };
}

export function JwtDecoderClient() {
  const [input, setInput] = useState("");

  const decoded = useMemo(() => decodeToken(input), [input]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p>
          <span className="font-medium text-foreground">Decoding only.</span> The signature is{" "}
          <span className="font-medium text-foreground">not verified</span> — never trust a token
          based on this tool. Everything runs locally; nothing leaves this device.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setInput(buildSampleToken())}
        >
          <KeyRound className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <Panel title="Token">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          placeholder="Paste a JWT here: xxxxx.yyyyy.zzzzz"
          className="min-h-[8rem] resize-y font-mono text-xs leading-relaxed"
          aria-label="JWT input"
        />
      </Panel>

      {decoded?.error && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">Not a decodable JWT</p>
          <p className="mt-1 text-xs">{decoded.error}</p>
        </div>
      )}

      {decoded && !decoded.error && (
        <>
          {(decoded.expired !== null || decoded.notYetValid || decoded.timeClaims.length > 0) && (
            <Panel title="Validity (by timestamps only)">
              <div className="flex flex-wrap items-center gap-2">
                {decoded.expired !== null && (
                  <span
                    className={cn(
                      "inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold",
                      decoded.expired
                        ? "bg-danger/10 text-danger"
                        : "bg-accent-muted text-accent",
                    )}
                  >
                    {decoded.expired ? "Expired" : "Not expired"}
                  </span>
                )}
                {decoded.notYetValid && (
                  <span className="inline-flex h-7 items-center rounded-full bg-danger/10 px-3 text-xs font-semibold text-danger">
                    Not yet valid (nbf in the future)
                  </span>
                )}
                {decoded.expired === null && !decoded.notYetValid && (
                  <span className="text-xs text-muted-foreground">No exp claim present.</span>
                )}
              </div>
              {decoded.timeClaims.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {decoded.timeClaims.map((c) => (
                    <li key={c.claim} className="flex flex-wrap items-baseline gap-2 text-xs">
                      <span className="w-32 shrink-0 text-muted-foreground">{c.label}</span>
                      <code className="font-mono text-accent">{c.value}</code>
                      <span className="text-foreground">{c.date}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Header" actions={<CopyButton text={decoded.header} />}>
              <pre className="max-h-64 overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {decoded.header}
              </pre>
            </Panel>
            <Panel title="Payload" actions={<CopyButton text={decoded.payload} />}>
              <pre className="max-h-64 overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {decoded.payload}
              </pre>
            </Panel>
          </div>

          <Panel title="Signature (raw, not verified)">
            <code className="block break-all rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
              {decoded.signature || "(empty)"}
            </code>
          </Panel>
        </>
      )}

      {!decoded && (
        <p className="p-2 text-sm text-muted-foreground">
          Paste a token above (or load the sample). The decoded header, payload, and timestamp
          claims appear here instantly.
        </p>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="jwt-decoder">
      <JwtDecoderClient />
    </ToolPage>
  );
}
