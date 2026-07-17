import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, Loader2, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadBlob, formatBytes } from "@/lib/download";

interface Strength {
  score: number; // 0–4
  label: string;
  className: string;
}

/**
 * Rough, purely advisory password strength. Deliberately simple — it nudges
 * toward longer passphrases rather than pretending to be a real estimator.
 */
function scorePassword(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  score = Math.min(score, 4);

  if (pw.length < 8) return { score: 1, label: "Too short", className: "bg-danger" };
  if (score <= 2) return { score, label: "Weak", className: "bg-danger" };
  if (score === 3) return { score, label: "Fair", className: "bg-muted-foreground" };
  return { score: 4, label: "Strong", className: "bg-accent" };
}

const MIN_LENGTH = 8;

export function ProtectPdfClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const bufferRef = useRef<ArrayBuffer | null>(null);
  const genRef = useRef(0);

  useEffect(
    () => () => {
      genRef.current++;
      bufferRef.current = null;
    },
    [],
  );

  const reset = useCallback(() => {
    genRef.current++;
    bufferRef.current = null;
    setFileName(null);
    setFileSize(0);
    setPassword("");
    setConfirm("");
    setBusy(false);
    setError(null);
    setDone(false);
  }, []);

  const loadFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setError("That file isn't a PDF.");
      return;
    }
    setError(null);
    setDone(false);
    setPassword("");
    setConfirm("");
    setFileName(file.name);
    setFileSize(file.size);
    bufferRef.current = await file.arrayBuffer();
  }, []);

  const strength = useMemo(() => scorePassword(password), [password]);
  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canProtect =
    !busy && password.length >= MIN_LENGTH && confirm.length > 0 && password === confirm;

  const protect = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || !canProtect) return;
    setBusy(true);
    setError(null);
    setDone(false);
    const gen = ++genRef.current;

    try {
      // Loaded on demand so the crypto-capable PDF library never lands in the
      // initial page bundle.
      const { PDFDocument, PDFHeader, EncryptedPDFError } = await import("@cantoo/pdf-lib");

      let doc;
      try {
        doc = await PDFDocument.load(buffer.slice(0));
      } catch (err) {
        // `instanceof` rather than a constructor-name check: class names are
        // mangled by the production minifier.
        if (err instanceof EncryptedPDFError) {
          setError(
            "This PDF is already password protected. Remove the existing password first, then protect it again.",
          );
          return;
        }
        throw err;
      }

      // @cantoo/pdf-lib picks the encryption revision from the document header
      // string: "1.7ext3" selects V5 / AESV3 (AES-256). Without this, a 1.4–1.6
      // file silently gets weaker RC4/AES-128 and anything else falls through to
      // RC4-40 — so pin it before encrypting. `minor` is typed as a number but is
      // stringified internally, and the written header stays a valid "%PDF-1.7".
      doc.context.header = PDFHeader.forVersion(1, "7ext3" as unknown as number);

      doc.encrypt({
        userPassword: password,
        ownerPassword: password,
        permissions: {
          printing: "highResolution",
          modifying: false,
          copying: true,
          annotating: true,
          fillingForms: true,
          contentAccessibility: true,
          documentAssembly: false,
        },
      });

      const bytes = await doc.save();
      if (genRef.current !== gen) return;

      const base = (fileName ?? "document").replace(/\.pdf$/i, "") || "document";
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `${base}-protected.pdf`,
      );
      setDone(true);
    } catch {
      if (genRef.current !== gen) return;
      setError("Could not protect this PDF. It may be corrupted or not a valid PDF.");
    } finally {
      if (genRef.current === gen) setBusy(false);
    }
  }, [canProtect, password, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Choose a password, and the file is encrypted in your browser."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(fileSize)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      <Panel title="Set a password" bodyClassName="space-y-4 p-4">
        <form
          className="max-w-sm space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void protect();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              disabled={busy}
              aria-describedby="pw-strength"
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
            />
            {password.length > 0 && (
              <div id="pw-strength" className="flex items-center gap-2 pt-0.5">
                <span className="flex h-1 flex-1 gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1 flex-1 rounded-full ${
                        i < strength.score ? strength.className : "bg-border"
                      }`}
                    />
                  ))}
                </span>
                <span className="text-xs text-muted-foreground">{strength.label}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pw2">Confirm password</Label>
            <Input
              id="pw2"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter the password"
              value={confirm}
              disabled={busy}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (error) setError(null);
              }}
            />
            {mismatch && <p className="text-xs text-danger">Passwords don&apos;t match.</p>}
            {tooShort && !mismatch && (
              <p className="text-xs text-danger">
                Use at least {MIN_LENGTH} characters.
              </p>
            )}
          </div>
        </form>

        <Button onClick={() => void protect()} disabled={!canProtect}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Encrypting
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Protect &amp; download
            </>
          )}
        </Button>

        {done && !busy && (
          <p className="inline-flex items-center gap-1.5 text-sm text-accent">
            <Check className="h-4 w-4" aria-hidden />
            Done — your protected PDF has been downloaded.
          </p>
        )}

        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Write your password down somewhere safe. It isn&apos;t stored or sent
            anywhere, so if you forget it the protected PDF cannot be recovered —
            by us or by anyone else.
          </span>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Your PDF is encrypted with <strong>AES-256</strong> (the PDF standard
            security handler), entirely in this browser tab — the file is never
            uploaded. Anyone opening it will be asked for the password.
          </span>
        </div>
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="protect-pdf">
      <ProtectPdfClient />
    </ToolPage>
  );
}
