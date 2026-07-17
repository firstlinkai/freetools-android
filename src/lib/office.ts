/**
 * Minimal, dependency-light readers for Office Open XML files (.docx, .xlsx,
 * .pptx). These extract the TEXT content only — enough to convert to a clean,
 * readable PDF — not full visual fidelity (styles, images, and exact layout are
 * not reproduced). Everything runs client-side via JSZip; no uploads.
 */
import JSZip from "jszip";

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

async function loadZip(file: File): Promise<JSZip> {
  return JSZip.loadAsync(await file.arrayBuffer());
}

/** Extract paragraphs of text from a .docx (one string per <w:p>). */
export async function docxToParagraphs(file: File): Promise<string[]> {
  const zip = await loadZip(file);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Not a valid .docx file.");
  const paragraphs: string[] = [];
  // Each <w:p> ... </w:p> is a paragraph; text lives in <w:t> runs.
  for (const block of xml.split(/<w:p[\s>]/).slice(1)) {
    const runs = [...block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
      decodeXml(m[1]),
    );
    paragraphs.push(runs.join(""));
  }
  return paragraphs.length ? paragraphs : [""];
}

const colToIndex = (ref: string): number => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Extract the first worksheet of an .xlsx as a grid of string cells. */
export async function xlsxToRows(file: File): Promise<string[][]> {
  const zip = await loadZip(file);

  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const shared: string[] = [];
  if (sharedXml) {
    for (const si of sharedXml.split(/<si[\s>]/).slice(1)) {
      const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
      shared.push(texts.join(""));
    }
  }

  // Prefer sheet1.xml; fall back to the first worksheet present.
  let sheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
  if (!sheetXml) {
    const first = zip.file(/xl\/worksheets\/sheet\d+\.xml/)[0];
    sheetXml = first ? await first.async("string") : undefined;
  }
  if (!sheetXml) throw new Error("Not a valid .xlsx file.");

  const rows: string[][] = [];
  for (const rowBlock of sheetXml.split(/<row[\s>]/).slice(1)) {
    const cells: string[] = [];
    for (const c of rowBlock.split(/<c[\s>]/).slice(1)) {
      const ref = /r="([A-Z]+\d+)"/.exec(c)?.[1];
      const col = ref ? colToIndex(ref) : cells.length;
      const isShared = /t="s"/.test(c);
      const isInline = /t="(?:inlineStr|str)"/.test(c);
      const v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(c)?.[1];
      const inlineT = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c)?.[1];
      let value = "";
      if (isShared && v != null) value = shared[Number(v)] ?? "";
      else if (isInline && inlineT != null) value = decodeXml(inlineT);
      else if (v != null) value = decodeXml(v);
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** Extract text lines per slide from a .pptx, in slide order. */
export async function pptxToSlides(file: File): Promise<string[][]> {
  const zip = await loadZip(file);
  const slideFiles = zip
    .file(/ppt\/slides\/slide\d+\.xml/)
    .sort((a, b) => {
      const na = Number(/slide(\d+)\.xml/.exec(a.name)?.[1] ?? 0);
      const nb = Number(/slide(\d+)\.xml/.exec(b.name)?.[1] ?? 0);
      return na - nb;
    });
  if (slideFiles.length === 0) throw new Error("Not a valid .pptx file.");

  const slides: string[][] = [];
  for (const f of slideFiles) {
    const xml = await f.async("string");
    const lines = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((m) => decodeXml(m[1]))
      .filter((t) => t.trim().length > 0);
    slides.push(lines.length ? lines : ["(no text on this slide)"]);
  }
  return slides;
}
