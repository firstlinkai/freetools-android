import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Play, RotateCcw, RotateCw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Deck, Flashcard } from "./flashcard-types";

type Phase = "setup" | "run" | "done";

function shuffleCards(cards: Flashcard[]): Flashcard[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function StudyMode({ deck, onExit }: { deck: Deck; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [shuffle, setShuffle] = useState(false);
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [repeats, setRepeats] = useState(0);
  const [instant, setInstant] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const cards = useMemo(
    () => deck.cards.filter((c) => c.front.trim() || c.back.trim()),
    [deck.cards],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const start = useCallback(() => {
    setQueue(shuffle ? shuffleCards(cards) : [...cards]);
    setIndex(0);
    setFlipped(false);
    setRepeats(0);
    setPhase("run");
  }, [cards, shuffle]);

  /** Skip the flip-back animation while the next card slides in. */
  const advance = useCallback(() => {
    setInstant(true);
    setFlipped(false);
    window.setTimeout(() => setInstant(false), 50);
    setIndex((i) => i + 1);
  }, []);

  const gotIt = useCallback(() => {
    advance();
  }, [advance]);

  const again = useCallback(() => {
    setRepeats((r) => r + 1);
    setQueue((q) => {
      const current = q[index];
      return current ? [...q, current] : q;
    });
    advance();
  }, [advance, index]);

  const flip = useCallback(() => setFlipped((f) => !f), []);

  // Session end detection.
  useEffect(() => {
    if (phase === "run" && queue.length > 0 && index >= queue.length) {
      setPhase("done");
    }
  }, [phase, index, queue.length]);

  // Keyboard controls: Space flips, arrows answer once flipped.
  useEffect(() => {
    if (phase !== "run") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowRight" && flipped) {
        e.preventDefault();
        gotIt();
      } else if (e.key === "ArrowLeft" && flipped) {
        e.preventDefault();
        again();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, flipped, flip, gotIt, again]);

  const card = queue[index];
  const progress = queue.length > 0 ? Math.min(1, index / queue.length) : 0;

  if (phase === "setup") {
    return (
      <Panel title={`Study: ${deck.name}`}>
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {cards.length} {cards.length === 1 ? "card" : "cards"} in this deck. Space flips,
            ArrowRight keeps, ArrowLeft repeats.
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className="h-4 w-4 accent-current"
            />
            Shuffle cards
          </label>
          <div className="flex gap-2">
            <Button variant="outline" size="md" onClick={onExit}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="primary" size="md" onClick={start} disabled={cards.length === 0}>
              <Play className="h-4 w-4" />
              Start studying
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  if (phase === "done") {
    return (
      <Panel title={`Study: ${deck.name}`}>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Check className="h-10 w-10 text-accent" />
          <p className="text-lg font-semibold">
            {cards.length} of {cards.length} learned, {repeats}{" "}
            {repeats === 1 ? "repeat" : "repeats"}
          </p>
          <p className="text-sm text-muted-foreground">
            Every card ended on a Got it. Nice work.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="md" onClick={onExit}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="primary" size="md" onClick={start}>
              <RotateCcw className="h-4 w-4" />
              Restart
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={`Study: ${deck.name}`}
      actions={
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft className="h-3.5 w-3.5" />
          End session
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-5 py-6">
        <div className="flex w-full max-w-md items-center gap-3">
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            Card {Math.min(index + 1, queue.length)} of {queue.length}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {card && (
          <button
            type="button"
            onClick={flip}
            aria-label={flipped ? "Show front" : "Show back"}
            className="w-full max-w-md focus-visible:outline-none [perspective:1200px]"
          >
            {reducedMotion ? (
              <div
                className={cn(
                  "flex aspect-[3/2] w-full items-center justify-center rounded-xl border border-border p-6",
                  flipped ? "bg-accent-muted" : "bg-card",
                )}
              >
                <span className="text-balance text-center text-lg font-medium">
                  {flipped ? card.back : card.front}
                </span>
              </div>
            ) : (
              <div
                className={cn(
                  "relative aspect-[3/2] w-full duration-500 [transform-style:preserve-3d]",
                  instant ? "transition-none" : "transition-transform",
                  flipped && "[transform:rotateY(180deg)]",
                )}
              >
                <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-border bg-card p-6 [backface-visibility:hidden]">
                  <span className="text-balance text-center text-lg font-medium">
                    {card.front}
                  </span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-border bg-accent-muted p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <span className="text-balance text-center text-lg font-medium">
                    {card.back}
                  </span>
                </div>
              </div>
            )}
          </button>
        )}

        <div className="flex h-10 items-center gap-2">
          {!flipped ? (
            <Button variant="secondary" size="md" onClick={flip}>
              <RotateCw className="h-4 w-4" />
              Flip
            </Button>
          ) : (
            <>
              <Button variant="outline" size="md" onClick={again}>
                Again
              </Button>
              <Button variant="primary" size="md" onClick={gotIt}>
                <Check className="h-4 w-4" />
                Got it
              </Button>
            </>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Space to flip. ArrowRight for got it, ArrowLeft to see it again later.
        </p>
      </div>
    </Panel>
  );
}
