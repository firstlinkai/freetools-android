export interface BusinessInfo {
  name: string;
  email: string;
  address: string;
  phone: string;
}

export interface ClientInfo {
  name: string;
  email: string;
  address: string;
}

export interface LineItem {
  id: string;
  description: string;
  qty: string;
  rate: string;
}

export interface InvoiceState {
  business: BusinessInfo;
  client: ClientInfo;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: CurrencyCode;
  items: LineItem[];
  taxRate: string;
  discountPct: string;
  notes: string;
}

export const CURRENCIES = [
  { code: "USD", label: "USD ($)", screenSymbol: "$", pdfSymbol: "$" },
  { code: "EUR", label: "EUR (€)", screenSymbol: "€", pdfSymbol: "€" },
  { code: "GBP", label: "GBP (£)", screenSymbol: "£", pdfSymbol: "£" },
  { code: "INR", label: "INR (₹)", screenSymbol: "₹", pdfSymbol: "Rs. " },
  { code: "AUD", label: "AUD (A$)", screenSymbol: "A$", pdfSymbol: "A$" },
  { code: "CAD", label: "CAD (C$)", screenSymbol: "C$", pdfSymbol: "C$" },
  { code: "JPY", label: "JPY (¥)", screenSymbol: "¥", pdfSymbol: "JPY " },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function currencyDef(code: CurrencyCode) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** On-screen formatting with the real symbol via Intl. */
export function formatMoney(amount: number, code: CurrencyCode): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${currencyDef(code).screenSymbol}${amount.toFixed(2)}`;
  }
}

/** ASCII/WinAnsi-safe formatting used inside the PDF (Helvetica cannot encode every symbol). */
export function formatMoneyPdf(amount: number, code: CurrencyCode): string {
  const decimals = code === "JPY" ? 0 : 2;
  const num = amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${currencyDef(code).pdfSymbol}${num}`;
}

export function toNumber(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

export function computeTotals(state: InvoiceState): InvoiceTotals {
  const subtotal = state.items.reduce(
    (sum, item) => sum + toNumber(item.qty) * toNumber(item.rate),
    0,
  );
  const discountAmount = subtotal * (toNumber(state.discountPct) / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (toNumber(state.taxRate) / 100);
  return { subtotal, discountAmount, taxAmount, total: afterDiscount + taxAmount };
}

export function formatDate(value: string): string {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
