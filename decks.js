// Deck definitions. A deck is a list of cards: { id, prompt, answer }.
// Cards are listed in the order new ones should be introduced.
//
// Card ids are the permanent key for review history, so they describe the
// fact itself rather than the deck ("mul:7x8", not "deck1:42"). Never reuse an
// id for a different fact; if an id must change, add a storage migration.

const Decks = {
  multiplication: (() => {
    const MIN = 2;
    const MAX = 12;
    const cards = [];
    for (let a = MIN; a <= MAX; a++) {
      for (let b = MIN; b <= MAX; b++) {
        cards.push({ id: `mul:${a}x${b}`, a, b, prompt: `${a} × ${b}`, answer: String(a * b) });
      }
    }
    // Introduce small tables first: order by the larger factor, then the smaller.
    cards.sort((p, q) =>
      Math.max(p.a, p.b) - Math.max(q.a, q.b) ||
      Math.min(p.a, p.b) - Math.min(q.a, q.b) ||
      p.a - q.a);
    const at = (a, b) => cards.find(c => c.a === a && c.b === b);
    return { id: "mult-2-12", name: "Multiplication 2–12", min: MIN, max: MAX, cards, at };
  })(),
};
