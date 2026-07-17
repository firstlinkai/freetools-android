import { ToolPage } from "@/components/tool/tool-page";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, X } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob } from "@/lib/download";
import {
  CURRENCIES,
  computeTotals,
  formatDate,
  formatMoney,
  toNumber,
  type BusinessInfo,
  type ClientInfo,
  type CurrencyCode,
  type InvoiceState,
  type LineItem,
} from "./invoice-types";

const STORAGE_KEY = "omnitools.invoice.v1";

let itemCounter = 0;
function newItem(): LineItem {
  itemCounter += 1;
  return { id: `item-${Date.now()}-${itemCounter}`, description: "", qty: "1", rate: "" };
}

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function initialState(): InvoiceState {
  return {
    business: { name: "", email: "", address: "", phone: "" },
    client: { name: "", email: "", address: "" },
    invoiceNumber: "INV-001",
    issueDate: "",
    dueDate: "",
    currency: "USD",
    items: [{ id: "item-initial", description: "", qty: "1", rate: "" }],
    taxRate: "",
    discountPct: "",
    notes: "",
  };
}

export function InvoiceGeneratorClient() {
  const [state, setState] = useState<InvoiceState>(initialState);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const loadedRef = useRef(false);

  // Restore saved business info and preferences, then default the issue date.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          business?: Partial<BusinessInfo>;
          currency?: string;
          taxRate?: string;
        };
        setState((s) => ({
          ...s,
          business: {
            name: typeof saved.business?.name === "string" ? saved.business.name : s.business.name,
            email: typeof saved.business?.email === "string" ? saved.business.email : s.business.email,
            address:
              typeof saved.business?.address === "string" ? saved.business.address : s.business.address,
            phone: typeof saved.business?.phone === "string" ? saved.business.phone : s.business.phone,
          },
          currency: CURRENCIES.some((c) => c.code === saved.currency)
            ? (saved.currency as CurrencyCode)
            : s.currency,
          taxRate: typeof saved.taxRate === "string" ? saved.taxRate : s.taxRate,
        }));
      }
    } catch {
      // Corrupt storage: start fresh.
    }
    setState((s) => (s.issueDate ? s : { ...s, issueDate: todayISO() }));
    loadedRef.current = true;
  }, []);

  // Persist business info + preferences on change.
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          business: state.business,
          currency: state.currency,
          taxRate: state.taxRate,
        }),
      );
    } catch {
      // Storage full or blocked: preview and export still work.
    }
  }, [state.business, state.currency, state.taxRate]);

  const totals = useMemo(() => computeTotals(state), [state]);
  const cur = state.currency;

  const setBusiness = (patch: Partial<BusinessInfo>) =>
    setState((s) => ({ ...s, business: { ...s.business, ...patch } }));
  const setClient = (patch: Partial<ClientInfo>) =>
    setState((s) => ({ ...s, client: { ...s.client, ...patch } }));
  const setItem = (id: string, patch: Partial<LineItem>) =>
    setState((s) => ({
      ...s,
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  const removeItem = (id: string) =>
    setState((s) =>
      s.items.length <= 1 ? s : { ...s, items: s.items.filter((it) => it.id !== id) },
    );
  const addItem = () => setState((s) => ({ ...s, items: [...s.items, newItem()] }));

  const clearInvoice = () => {
    setState((s) => ({
      ...initialState(),
      business: s.business,
      currency: s.currency,
      issueDate: todayISO(),
      items: [newItem()],
    }));
    setConfirmClear(false);
    setExportError("");
  };

  const exportPdf = async () => {
    setExporting(true);
    setExportError("");
    try {
      const { generateInvoicePdf } = await import("./invoice-pdf");
      const bytes = await generateInvoicePdf(state);
      const name = (state.invoiceNumber.trim() || "invoice").replace(/[^\w.-]+/g, "-");
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${name}.pdf`);
    } catch {
      setExportError("PDF export failed. Check for unusual characters and try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* ── Form column ─────────────────────────────────────────────── */}
      <div className="flex w-full flex-col gap-4 lg:w-[440px] lg:shrink-0">
        <Panel title="Your business">
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="biz-name">Business name</Label>
              <Input
                id="biz-name"
                value={state.business.name}
                onChange={(e) => setBusiness({ name: e.target.value })}
                placeholder="Acme Studio LLC"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="biz-email">Email</Label>
                <Input
                  id="biz-email"
                  type="email"
                  value={state.business.email}
                  onChange={(e) => setBusiness({ email: e.target.value })}
                  placeholder="billing@acme.co"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="biz-phone">Phone (optional)</Label>
                <Input
                  id="biz-phone"
                  value={state.business.phone}
                  onChange={(e) => setBusiness({ phone: e.target.value })}
                  placeholder="+1 555 010 0000"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="biz-address">Address</Label>
              <Textarea
                id="biz-address"
                rows={2}
                value={state.business.address}
                onChange={(e) => setBusiness({ address: e.target.value })}
                placeholder={"100 Main Street\nSpringfield, ST 00000"}
                className="mt-1"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Saved in your browser, prefilled on your next invoice.
            </p>
          </div>
        </Panel>

        <Panel title="Bill to">
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="client-name">Client name</Label>
              <Input
                id="client-name"
                value={state.client.name}
                onChange={(e) => setClient({ name: e.target.value })}
                placeholder="Client Co."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={state.client.email}
                onChange={(e) => setClient({ email: e.target.value })}
                placeholder="accounts@client.co"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="client-address">Address</Label>
              <Textarea
                id="client-address"
                rows={2}
                value={state.client.address}
                onChange={(e) => setClient({ address: e.target.value })}
                placeholder={"200 Client Avenue\nMetropolis, ST 11111"}
                className="mt-1"
              />
            </div>
          </div>
        </Panel>

        <Panel title="Invoice details">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inv-number">Invoice number</Label>
              <Input
                id="inv-number"
                value={state.invoiceNumber}
                onChange={(e) => setState((s) => ({ ...s, invoiceNumber: e.target.value }))}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="inv-currency">Currency</Label>
              <Select
                id="inv-currency"
                value={state.currency}
                onChange={(e) =>
                  setState((s) => ({ ...s, currency: e.target.value as CurrencyCode }))
                }
                className="mt-1"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="inv-issue">Issue date</Label>
              <Input
                id="inv-issue"
                type="date"
                value={state.issueDate}
                onChange={(e) => setState((s) => ({ ...s, issueDate: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="inv-due">Due date</Label>
              <Input
                id="inv-due"
                type="date"
                value={state.dueDate}
                onChange={(e) => setState((s) => ({ ...s, dueDate: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
        </Panel>

        <Panel
          title="Line items"
          actions={
            <Button variant="secondary" size="sm" onClick={addItem}>
              <Plus className="h-3.5 w-3.5" />
              Add item
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="flex-1">Description</span>
              <span className="w-14 text-right">Qty</span>
              <span className="w-20 text-right">Rate</span>
              <span className="hidden w-20 text-right sm:block">Amount</span>
              <span className="w-8" />
            </div>
            {state.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Input
                  value={item.description}
                  onChange={(e) => setItem(item.id, { description: e.target.value })}
                  placeholder="Design work"
                  className="h-8 flex-1 text-xs"
                />
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={item.qty}
                  onChange={(e) => setItem(item.id, { qty: e.target.value })}
                  className="h-8 w-14 text-right font-mono text-xs"
                />
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={item.rate}
                  onChange={(e) => setItem(item.id, { rate: e.target.value })}
                  placeholder="0.00"
                  className="h-8 w-20 text-right font-mono text-xs"
                />
                <span className="hidden w-20 truncate text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
                  {formatMoney(toNumber(item.qty) * toNumber(item.rate), cur)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  onClick={() => removeItem(item.id)}
                  disabled={state.items.length <= 1}
                  aria-label="Remove item"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Totals and notes">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inv-tax">Tax rate %</Label>
                <Input
                  id="inv-tax"
                  type="number"
                  min="0"
                  step="any"
                  value={state.taxRate}
                  onChange={(e) => setState((s) => ({ ...s, taxRate: e.target.value }))}
                  placeholder="0"
                  className="mt-1 text-right font-mono"
                />
              </div>
              <div>
                <Label htmlFor="inv-discount">Discount %</Label>
                <Input
                  id="inv-discount"
                  type="number"
                  min="0"
                  step="any"
                  value={state.discountPct}
                  onChange={(e) => setState((s) => ({ ...s, discountPct: e.target.value }))}
                  placeholder="0"
                  className="mt-1 text-right font-mono"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="inv-notes">Notes</Label>
              <Textarea
                id="inv-notes"
                rows={3}
                value={state.notes}
                onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
                placeholder="Payment terms, bank details, thank-you note"
                className="mt-1"
              />
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Preview column ──────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <Panel
          title="Preview"
          bodyClassName="bg-muted p-4 sm:p-6"
          actions={
            <>
              {confirmClear ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Clear?
                  <Button variant="danger" size="sm" onClick={clearInvoice}>
                    Yes
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                    No
                  </Button>
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
                  Clear invoice
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={exportPdf} disabled={exporting}>
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Rendering" : "Download PDF"}
              </Button>
            </>
          }
        >
          {exportError && <p className="mb-3 text-xs text-danger">{exportError}</p>}

          {/* Deliberately white paper with dark ink in both themes, mirroring the PDF. */}
          <div className="mx-auto w-full max-w-[640px] rounded-lg bg-white p-6 text-zinc-900 shadow-sm sm:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight">
                  {state.business.name || "Your business"}
                </p>
                <div className="mt-1 space-y-0.5 text-xs text-zinc-500">
                  {state.business.email && <p>{state.business.email}</p>}
                  {state.business.phone && <p>{state.business.phone}</p>}
                  {state.business.address && (
                    <p className="whitespace-pre-line">{state.business.address}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold tracking-[0.25em]">INVOICE</p>
                <p className="mt-1 font-mono text-xs font-semibold">
                  {state.invoiceNumber || "INV-001"}
                </p>
                <div className="mt-1 space-y-0.5 text-xs text-zinc-500">
                  {state.issueDate && <p>Issued: {formatDate(state.issueDate)}</p>}
                  {state.dueDate && <p>Due: {formatDate(state.dueDate)}</p>}
                </div>
              </div>
            </div>

            <div className="mt-8">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Bill to
              </p>
              <p className="mt-1 text-sm font-semibold">
                {state.client.name || "Client name"}
              </p>
              <div className="mt-0.5 space-y-0.5 text-xs text-zinc-500">
                {state.client.email && <p>{state.client.email}</p>}
                {state.client.address && (
                  <p className="whitespace-pre-line">{state.client.address}</p>
                )}
              </div>
            </div>

            <table className="mt-8 w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-300 text-[10px] uppercase tracking-wider text-zinc-400">
                  <th className="pb-2 text-left font-semibold">Description</th>
                  <th className="pb-2 pl-2 text-right font-semibold">Qty</th>
                  <th className="pb-2 pl-2 text-right font-semibold">Rate</th>
                  <th className="pb-2 pl-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-2">
                      {item.description || <span className="text-zinc-400">Item</span>}
                    </td>
                    <td className="py-2 pl-2 text-right font-mono tabular-nums">
                      {toNumber(item.qty)}
                    </td>
                    <td className="py-2 pl-2 text-right font-mono tabular-nums">
                      {formatMoney(toNumber(item.rate), cur)}
                    </td>
                    <td className="py-2 pl-2 text-right font-mono tabular-nums">
                      {formatMoney(toNumber(item.qty) * toNumber(item.rate), cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto mt-4 w-full max-w-[240px] space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Subtotal</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(totals.subtotal, cur)}
                </span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">
                    Discount ({toNumber(state.discountPct)}%)
                  </span>
                  <span className="font-mono tabular-nums">
                    -{formatMoney(totals.discountAmount, cur)}
                  </span>
                </div>
              )}
              {totals.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tax ({toNumber(state.taxRate)}%)</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(totals.taxAmount, cur)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-300 pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatMoney(totals.total, cur)}</span>
              </div>
            </div>

            {state.notes.trim() && (
              <div className="mt-10 border-t border-zinc-200 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-line text-xs text-zinc-600">{state.notes}</p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="invoice-generator">
      <InvoiceGeneratorClient />
    </ToolPage>
  );
}
