export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface Deck {
  id: string;
  name: string;
  cards: Flashcard[];
  createdAt: number;
}

export const STORAGE_KEY = "omnitools.flashcards.v1";

let counter = 0;
export function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function makeSampleDeck(): Deck {
  const pairs: Array<[string, string]> = [
    ["hola", "hello"],
    ["gracias", "thank you"],
    ["por favor", "please"],
    ["buenos dias", "good morning"],
    ["la biblioteca", "the library"],
    ["el ordenador", "the computer"],
    ["aprender", "to learn"],
    ["la manzana", "the apple"],
  ];
  return {
    id: makeId("deck"),
    name: "Spanish basics",
    createdAt: Date.now(),
    cards: pairs.map(([front, back]) => ({ id: makeId("card"), front, back })),
  };
}

/** Defensive parse of whatever is in localStorage. Returns [] on anything unexpected. */
export function parseDecks(raw: string | null): Deck[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as { decks?: unknown };
    if (!data || !Array.isArray(data.decks)) return [];
    return data.decks
      .filter(
        (d): d is Deck =>
          !!d &&
          typeof d === "object" &&
          typeof (d as Deck).id === "string" &&
          typeof (d as Deck).name === "string" &&
          Array.isArray((d as Deck).cards),
      )
      .map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
        cards: d.cards
          .filter(
            (c): c is Flashcard =>
              !!c &&
              typeof c === "object" &&
              typeof (c as Flashcard).front === "string" &&
              typeof (c as Flashcard).back === "string",
          )
          .map((c) => ({
            id: typeof c.id === "string" ? c.id : makeId("card"),
            front: c.front,
            back: c.back,
          })),
      }));
  } catch {
    return [];
  }
}
