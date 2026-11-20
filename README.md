# SAT Racer 🏁

A browser racing game for SAT practice. You race three rivals, and your car only
moves when you answer SAT questions:

- **Correct answer:** a burst of speed. Answer several in a row and your nitro
  stacks for even bigger boosts.
- **Wrong answer:** you spin out and only creep forward. The explanation opens so
  you can learn from it.
- **Finish:** after the last question everyone sprints to the line, and your
  place depends on the ground you earned.

Every race pays prize money (the most for a win, plus a bonus for each correct
answer). Spend it in the **Garage & shop** on faster cars with more power, grip
and nitro, then move up from the Rookie league to Pro and Champion, where rivals
get more questions right. Your money, cars and stats are saved in your browser.

## Play

The simplest way, with live College Board questions:

```bash
node scripts/serve.mjs      # needs Node.js 18 or newer
# then open http://localhost:8080
```

You can also just open `index.html` in a browser. It works without a server, but
then it can only use a downloaded bank or the built-in questions (see below).

Keyboard: `A`–`D` (or `1`–`4`) to answer, `Enter` for the next question.

## Where the questions come from

The game can pull questions from three places. "Best available" picks the first
one that works.

1. **College Board, live.** `scripts/serve.mjs` serves the game and passes
   requests through to the public JSON endpoints behind the
   [SAT Suite Question Bank](https://satsuitequestionbank.collegeboard.org/), so
   each race draws random questions from the whole bank (Math and Reading &
   Writing, filterable by difficulty). A browser can't call College Board
   directly from another site, which is why the small local server is needed.
2. **Downloaded bank.** `node scripts/fetch-questions.mjs` saves questions to
   `data/cb-bank.js` on your computer so you can play offline. Options:
   `--limit 300` for a random subset, `--section math` or `--section rw`.
   The full bank is a few thousand questions and takes several minutes.
3. **Built-in practice.** About 40 original SAT-style questions written for this
   game, so it always works even if College Board's site changes.

Questions you've already seen are saved and shown last, so you keep getting new
ones.

### About College Board's content

The Question Bank's questions are © College Board. This repo does **not**
include any of them: they are fetched on your own computer when you play or
run the fetch script, and `data/cb-bank.js` is in `.gitignore`. Use them for
your own studying, and don't commit, publish or host the downloaded file. The
endpoints are undocumented and could change; if they do, the game falls back to
the built-in questions. This game isn't affiliated with College Board.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css` | Page and styles |
| `js/game.js` | Screens, save data, shop, question flow |
| `js/race.js` | Race rules and the canvas track |
| `js/questions.js` | Question sources, answer checking, HTML cleaning |
| `data/cars.js` | Cars, prices and leagues (tweak the balance here) |
| `data/sample-questions.js` | Built-in original questions |
| `scripts/serve.mjs` | Local server with the live College Board proxy |
| `scripts/fetch-questions.mjs`, `scripts/cb-lib.mjs` | Downloader and API helpers |
