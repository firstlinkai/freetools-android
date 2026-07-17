import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  computeTotals,
  formatDate,
  formatMoneyPdf,
  toNumber,
  type InvoiceState,
} from "./invoice-types";

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const BOTTOM = 80;

const COL_QTY_R = 380;
const COL_RATE_R = 465;
const COL_AMOUNT_R = PAGE_W - MARGIN;

const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.85, 0.85, 0.88);

/**
 * Helvetica uses WinAnsi encoding; anything outside it would throw at draw
 * time. Normalize smart punctuation and replace unsupported glyphs.
 */
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u20AC]/g, "?");
}

/** Naive word wrap by character count (Helvetica at 9pt fits ~48 chars in the description column). */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    let w = word;
    // Hard-break pathological unbroken strings.
    while (w.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
    }
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < BOTTOM) {
    ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    ctx.y = PAGE_H - MARGIN;
  }
}

function drawRight(ctx: Ctx, text: string, rightX: number, y: number, size: number, font: PDFFont, color = INK) {
  const w = font.widthOfTextAtSize(text, size);
  ctx.page.drawText(text, { x: rightX - w, y, size, font, color });
}

function hairline(ctx: Ctx, y: number) {
  ctx.page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color: LINE,
  });
}

export async function generateInvoicePdf(state: InvoiceState): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { doc, page, y: PAGE_H - MARGIN, font, bold };

  const totals = computeTotals(state);
  const cur = state.currency;

  // ── Header: business block (left) ──────────────────────────────────
  let leftY = PAGE_H - MARGIN - 14;
  ctx.page.drawText(safe(state.business.name || "Your business"), {
    x: MARGIN,
    y: leftY,
    size: 15,
    font: bold,
    color: INK,
  });
  leftY -= 16;
  const bizLines = [
    state.business.email,
    state.business.phone,
    ...state.business.address.split("\n"),
  ]
    .map((l) => safe(l.trim()))
    .filter((l) => l.length > 0);
  for (const line of bizLines) {
    ctx.page.drawText(line, { x: MARGIN, y: leftY, size: 9, font, color: MUTED });
    leftY -= 12;
  }

  // ── Header: INVOICE + meta (right) ─────────────────────────────────
  let rightY = PAGE_H - MARGIN - 18;
  drawRight(ctx, "INVOICE", COL_AMOUNT_R, rightY, 20, bold, INK);
  rightY -= 18;
  drawRight(ctx, safe(state.invoiceNumber || "INV-001"), COL_AMOUNT_R, rightY, 10, bold, INK);
  rightY -= 14;
  if (state.issueDate) {
    drawRight(ctx, `Issued: ${safe(formatDate(state.issueDate))}`, COL_AMOUNT_R, rightY, 9, font, MUTED);
    rightY -= 12;
  }
  if (state.dueDate) {
    drawRight(ctx, `Due: ${safe(formatDate(state.dueDate))}`, COL_AMOUNT_R, rightY, 9, font, MUTED);
    rightY -= 12;
  }

  ctx.y = Math.min(leftY, rightY) - 26;

  // ── Bill to ─────────────────────────────────────────────────────────
  ctx.page.drawText("BILL TO", { x: MARGIN, y: ctx.y, size: 8, font: bold, color: MUTED });
  ctx.y -= 14;
  ctx.page.drawText(safe(state.client.name || "Client name"), {
    x: MARGIN,
    y: ctx.y,
    size: 10,
    font: bold,
    color: INK,
  });
  ctx.y -= 13;
  const clientLines = [state.client.email, ...state.client.address.split("\n")]
    .map((l) => safe(l.trim()))
    .filter((l) => l.length > 0);
  for (const line of clientLines) {
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size: 9, font, color: MUTED });
    ctx.y -= 12;
  }
  ctx.y -= 16;

  // ── Items table header ──────────────────────────────────────────────
  ensure(ctx, 30);
  ctx.page.drawText("DESCRIPTION", { x: MARGIN, y: ctx.y, size: 8, font: bold, color: MUTED });
  drawRight(ctx, "QTY", COL_QTY_R, ctx.y, 8, bold, MUTED);
  drawRight(ctx, "RATE", COL_RATE_R, ctx.y, 8, bold, MUTED);
  drawRight(ctx, "AMOUNT", COL_AMOUNT_R, ctx.y, 8, bold, MUTED);
  ctx.y -= 7;
  hairline(ctx, ctx.y);
  ctx.y -= 15;

  // ── Rows ────────────────────────────────────────────────────────────
  for (const item of state.items) {
    const qty = toNumber(item.qty);
    const rate = toNumber(item.rate);
    const descLines = wrap(safe(item.description) || "Item", 48);
    const lines = descLines.length > 0 ? descLines : ["Item"];
    const rowHeight = lines.length * 12 + 8;
    ensure(ctx, rowHeight + 6);

    ctx.page.drawText(lines[0], { x: MARGIN, y: ctx.y, size: 9, font, color: INK });
    drawRight(ctx, String(qty), COL_QTY_R, ctx.y, 9, font, INK);
    drawRight(ctx, formatMoneyPdf(rate, cur), COL_RATE_R, ctx.y, 9, font, INK);
    drawRight(ctx, formatMoneyPdf(qty * rate, cur), COL_AMOUNT_R, ctx.y, 9, font, INK);
    for (let i = 1; i < lines.length; i++) {
      ctx.y -= 12;
      ctx.page.drawText(lines[i], { x: MARGIN, y: ctx.y, size: 9, font, color: INK });
    }
    ctx.y -= 10;
    hairline(ctx, ctx.y + 3);
    ctx.y -= 10;
  }

  // ── Totals ──────────────────────────────────────────────────────────
  ensure(ctx, 90);
  ctx.y -= 4;
  const totalRow = (label: string, value: string, big = false) => {
    const size = big ? 11 : 9;
    const f = big ? bold : font;
    drawRight(ctx, label, COL_RATE_R, ctx.y, size, f, big ? INK : MUTED);
    drawRight(ctx, value, COL_AMOUNT_R, ctx.y, size, f, INK);
    ctx.y -= big ? 18 : 15;
  };
  totalRow("Subtotal", formatMoneyPdf(totals.subtotal, cur));
  if (totals.discountAmount > 0) {
    totalRow(`Discount (${toNumber(state.discountPct)}%)`, `-${formatMoneyPdf(totals.discountAmount, cur)}`);
  }
  if (totals.taxAmount > 0) {
    totalRow(`Tax (${toNumber(state.taxRate)}%)`, formatMoneyPdf(totals.taxAmount, cur));
  }
  ctx.page.drawLine({
    start: { x: COL_RATE_R - 70, y: ctx.y + 10 },
    end: { x: COL_AMOUNT_R, y: ctx.y + 10 },
    thickness: 0.5,
    color: LINE,
  });
  ctx.y -= 4;
  totalRow("Total", formatMoneyPdf(totals.total, cur), true);

  // ── Notes ───────────────────────────────────────────────────────────
  const notes = state.notes.trim();
  if (notes) {
    ctx.y -= 14;
    ensure(ctx, 40);
    ctx.page.drawText("NOTES", { x: MARGIN, y: ctx.y, size: 8, font: bold, color: MUTED });
    ctx.y -= 13;
    for (const para of notes.split("\n")) {
      const lines = wrap(safe(para), 95);
      if (lines.length === 0) {
        ctx.y -= 6;
        continue;
      }
      for (const line of lines) {
        ensure(ctx, 12);
        ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size: 9, font, color: MUTED });
        ctx.y -= 12;
      }
    }
  }

  return doc.save();
}
