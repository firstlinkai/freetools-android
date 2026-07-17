import { ToolPage } from "@/components/tool/tool-page";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  GraduationCap,
  Import,
  Layers,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StudyMode } from "./study-mode";
import {
  STORAGE_KEY,
  makeId,
  makeSampleDeck,
  parseDecks,
  type Deck,
} from "./flashcard-types";

type View =
  | { mode: "list" }
  | { mode: "edit"; deckId: string }
  | { mode: "study"; deckId: string };

export function FlashcardsClient() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [view, setView] = useState<View>({ mode: "list" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState("");
  const [importReport, setImportReport] = useState("");
  const [aiNote, setAiNote] = useState(false);
  const loadedRef = useRef(false);

  // Load decks once, SSR-safe.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    setDecks(parseDecks(stored));
    loadedRef.current = true;
  }, []);

  // Save on change.
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ decks }));
    } catch {
      // Storage blocked or full: keep working in memory.
    }
  }, [decks]);

  const updateDeck = (id: string, patch: Partial<Deck>) =>
    setDecks((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const openEditor = (deckId: string) => {
    setQuickAdd("");
    setImportReport("");
    setAiNote(false);
    setView({ mode: "edit", deckId });
  };

  const createDeck = () => {
    const deck: Deck = {
      id: makeId("deck"),
      name: "New deck",
      cards: [{ id: makeId("card"), front: "", back: "" }],
      createdAt: Date.now(),
    };
    setDecks((ds) => [...ds, deck]);
    openEditor(deck.id);
  };

  const loadSample = () => {
    const deck = makeSampleDeck();
    setDecks((ds) => [...ds, deck]);
    setView({ mode: "list" });
  };

  const deleteDeck = (id: string) => {
    setDecks((ds) => ds.filter((d) => d.id !== id));
    setConfirmDeleteId(null);
  };

  const runImport = (deck: Deck) => {
    const lines = quickAdd.split("\n");
    let imported = 0;
    let skipped = 0;
    const newCards = [...deck.cards];
    for (const line of lines) {
      if (!line.trim()) continue;
      const sep = line.indexOf("::");
      const front = sep >= 0 ? line.slice(0, sep).trim() : "";
      const back = sep >= 0 ? line.slice(sep + 2).trim() : "";
      if (sep < 0 || !front || !back) {
        skipped += 1;
        continue;
      }
      newCards.push({ id: makeId("card"), front, back });
      imported += 1;
    }
    updateDeck(deck.id, { cards: newCards });
    setImportReport(
      `Imported ${imported} ${imported === 1 ? "card" : "cards"}, skipped ${skipped}`,
    );
    if (imported > 0) setQuickAdd("");
  };

  // ── Study mode ────────────────────────────────────────────────────
  if (view.mode === "study") {
    const deck = decks.find((d) => d.id === view.deckId);
    if (!deck || deck.cards.length === 0) {
      setView({ mode: "list" });
      return null;
    }
    return <StudyMode deck={deck} onExit={() => setView({ mode: "list" })} />;
  }

  // ── Deck editor ───────────────────────────────────────────────────
  if (view.mode === "edit") {
    const deck = decks.find((d) => d.id === view.deckId);
    if (!deck) {
      setView({ mode: "list" });
      return null;
    }
    const studyable = deck.cards.some((c) => c.front.trim() || c.back.trim());
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setView({ mode: "list" })}>
            <ArrowLeft className="h-3.5 w-3.5" />
            All decks
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!studyable}
            onClick={() => setView({ mode: "study", deckId: deck.id })}
          >
            <Play className="h-3.5 w-3.5" />
            Study
          </Button>
        </div>

        <Panel title="Deck">
          <Label htmlFor="deck-name">Deck name</Label>
          <Input
            id="deck-name"
            value={deck.name}
            onChange={(e) => updateDeck(deck.id, { name: e.target.value })}
            className="mt-1"
          />
        </Panel>

        <Panel
          title={`Cards (${deck.cards.length})`}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                updateDeck(deck.id, {
                  cards: [...deck.cards, { id: makeId("card"), front: "", back: "" }],
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add card
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="flex-1">Front</span>
              <span className="flex-1">Back</span>
              <span className="w-8" />
            </div>
            {deck.cards.map((card) => (
              <div key={card.id} className="flex items-center gap-2">
                <Input
                  value={card.front}
                  onChange={(e) =>
                    updateDeck(deck.id, {
                      cards: deck.cards.map((c) =>
                        c.id === card.id ? { ...c, front: e.target.value } : c,
                      ),
                    })
                  }
                  placeholder="Question or term"
                  className="h-8 flex-1 text-xs"
                />
                <Input
                  value={card.back}
                  onChange={(e) =>
                    updateDeck(deck.id, {
                      cards: deck.cards.map((c) =>
                        c.id === card.id ? { ...c, back: e.target.value } : c,
                      ),
                    })
                  }
                  placeholder="Answer"
                  className="h-8 flex-1 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label="Delete card"
                  onClick={() =>
                    updateDeck(deck.id, {
                      cards: deck.cards.filter((c) => c.id !== card.id),
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {deck.cards.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No cards yet. Add one above or paste a batch below.
              </p>
            )}
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Quick add">
            <p className="mb-2 text-xs text-muted-foreground">
              One card per line in the format front :: back
            </p>
            <Textarea
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              rows={5}
              placeholder={"la casa :: the house\nel perro :: the dog"}
              className="font-mono text-xs"
            />
            <div className="mt-2 flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => runImport(deck)}
                disabled={!quickAdd.trim()}
              >
                <Import className="h-3.5 w-3.5" />
                Import
              </Button>
              {importReport && (
                <span className="text-xs text-muted-foreground">{importReport}</span>
              )}
            </div>
          </Panel>

          <Panel title="AI generation">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="opacity-60"
                onClick={() => setAiNote(true)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate with AI
              </Button>
              <Badge>Phase 2</Badge>
            </div>
            {aiNote && (
              <p className="mt-3 text-xs text-muted-foreground">
                AI generation arrives in Phase 2. FreeTools stays fully offline until then.
              </p>
            )}
          </Panel>
        </div>
      </div>
    );
  }

  // ── Deck list ─────────────────────────────────────────────────────
  if (decks.length === 0) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-4 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted">
            <Layers className="h-6 w-6 text-accent" />
          </span>
          <div>
            <p className="text-sm font-semibold">No decks yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Build a deck of flashcards and study it with 3D flip cards. Everything is saved
              in your browser.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" size="md" onClick={createDeck}>
              <Plus className="h-4 w-4" />
              Create your first deck
            </Button>
            <Button variant="outline" size="md" onClick={loadSample}>
              <GraduationCap className="h-4 w-4" />
              Load sample deck
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {decks.length} {decks.length === 1 ? "deck" : "decks"}, saved in your browser.
        </p>
        <Button variant="primary" size="sm" onClick={createDeck}>
          <Plus className="h-3.5 w-3.5" />
          New deck
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((deck) => (
          <div
            key={deck.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{deck.name || "Untitled deck"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {deck.cards.length} {deck.cards.length === 1 ? "card" : "cards"}
              </p>
            </div>
            <div className="mt-auto flex items-center gap-1.5">
              <Button
                variant="primary"
                size="sm"
                disabled={deck.cards.length === 0}
                onClick={() => setView({ mode: "study", deckId: deck.id })}
              >
                <Play className="h-3.5 w-3.5" />
                Study
              </Button>
              <Button variant="outline" size="sm" onClick={() => openEditor(deck.id)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <div className="ml-auto">
                {confirmDeleteId === deck.id ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    Delete?
                    <Button variant="danger" size="sm" onClick={() => deleteDeck(deck.id)}>
                      Yes
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                      No
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    aria-label={`Delete ${deck.name}`}
                    onClick={() => setConfirmDeleteId(deck.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="flashcards">
      <FlashcardsClient />
    </ToolPage>
  );
}
