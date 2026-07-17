
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Drag-and-drop + click-to-browse file input. Files never leave the browser;
 * the selected File objects are handed straight to the tool.
 */
export function FileDropzone({
  accept,
  multiple = false,
  onFiles,
  hint,
  className,
}: {
  /** e.g. "image/*" or ".pdf" or "video/*" */
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
        dragging
          ? "border-accent bg-accent-muted/30"
          : "border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/50",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
      </span>
      <span className="text-sm font-medium text-foreground">
        Drop {multiple ? "files" : "a file"} here or click to browse
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <span className="text-[11px] text-muted-foreground">
        Processed locally. Never uploaded.
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}
