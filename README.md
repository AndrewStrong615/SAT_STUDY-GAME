# SAT Streak

A one-file SAT study game. Answer real SAT questions in a row.
Every right answer adds 1 to your streak, and the longer the streak, the more
epic the world gets: Spark, Flame, Ocean, Storm, Galaxy, Supernova, Legendary.

**The rules.** Each level is a checkpoint. A wrong answer (or running out of
time) shows you the right answer and the explanation, then sends you back to
the start of the level you are in: miss at 13 in Ocean and you are back at 10,
not at 0. In the last level, Legendary, you play until your first miss. That
miss ends the run, and the end screen shows your accuracy over the whole run
(right answers out of all questions answered). The same count is shown under
the streak number while you play.

## Play

Open `index.html` in any browser while you're online. There is nothing to
install or build.

- Tap an answer or press `1`–`4` (or `A`–`D`). `Enter` continues after a miss, and starts a new run from the start or end
  screen.
- Settings on the start screen: Mixed / Math / Reading & Writing, an optional
  timer (20, 40 or 75 seconds), and sound. Mixed gives an even split: each
  question's section is a coin flip, but neither section can get more than two
  questions ahead of the other in a run.
- Your best streak and highest tier are saved in your browser.

## Where the questions come from

Every question is drawn at random, live, from the public JSON endpoints behind
the College Board
[SAT Suite Question Bank](https://satsuitequestionbank.collegeboard.org/).
There is no built-in question bank.

- A question you have been shown does not come back, in this streak or a
  later one, until you have seen all the others. Your browser remembers the
  ids of the questions you have seen (only the ids, never the questions).
- College Board's Easy / Medium / Hard ratings follow the tiers: mostly easy
  at the start, mostly hard from Supernova on.
- Only multiple-choice questions are used, since the game has four buttons.
  Answers stay in A–D order because the explanations refer to the letters.
- The start screen says "Live from College Board" when it's working, with how
  many questions the bank lists and how many you have seen. You need to be
  online.

**If the start screen says it couldn't reach College Board** while you are
online, your browser is blocking the page from calling College Board directly.
The fallback is the small helper in this folder: run `node server.mjs`
(Node.js 18 or newer) and open http://localhost:8080. The game finds the
helper by itself.

The questions are © College Board. Nothing from College Board is stored in
this repo or saved to disk: each question is fetched by your own browser when
it's needed. Use them for your own studying and don't republish them. The
endpoints are undocumented and could change at any time. This game isn't
affiliated with College Board.

## Add your own questions (optional)

`const QUESTIONS = []` near the top of the script is empty. Anything you add
there is used only when College Board can't be reached:

```js
{ id: "my-1", section: "Math", topic: "Algebra", difficulty: 2,
  passage: "Optional short text shown above the question.",
  question: "If 3x = 12, what is x?",
  choices: ["2", "3", "4", "6"],   // always four, in A B C D order
  answer: "C",                      // the correct letter
  explanation: "Divide both sides by 3: x = 4." },
```

`section` must be exactly `"Math"` or `"Reading & Writing"`, and `difficulty`
is 1 (easy), 2 (medium) or 3 (hard).

## How questions are checked

College Board's replies are cleaned up before they are shown:

- Each blank arrives with the word "blank" meant for screen readers. However it
  is written (hidden element, plain element or loose text), a "blank" that
  directly follows a drawn blank is no longer printed.
- Brackets in math written the old `<mfenced>` way are not drawn by current
  browsers, so `(x + 2)(x - 3)` used to show as `x + 2x - 3`. They are
  rewritten so every browser draws them.
- A question is only used when the answer letter, the answer id and the
  explanation all point at the same choice. Anything unclear is skipped, as are
  typed-answer questions and questions without exactly four choices.

Open `index.html?selftest` to run 25 made-up sample replies through this code
and see a pass or fail for each. The game-over card shows a question number, so
a question that still looks wrong can be reported.

## Test tools

- **Highlighter:** select text in a passage or question to mark it yellow. With
  a mouse it is marked as soon as you let go; on a touch screen a Highlight
  button appears next to the selection. Tap a highlight to remove it. The next
  question starts clean.
- **Cross-out:** the ~~ABC~~ button shows a small control beside each choice.
  Use it to cross out choices you have ruled out. A crossed-out choice cannot
  be picked by tap or key; tapping it (or Undo) brings it back.

## Versions

The start screen shows a version number at the bottom (`BUILD` in the script;
raise it with every change). The hosted site lets browsers keep an old copy of
the page for a few minutes, so on the web the page checks for a newer copy of
itself and loads it.

## The Desmos calculator

Math questions show a **Desmos** button. It splits the screen: the Desmos
graphing calculator on one half and the question on the other (side by side on
a laptop, stacked on a phone). It opens when you tap the button, and after
that it stays on: it steps aside on Reading & Writing questions and comes back
on the next math question, until you close it with the ✕.

Out of the box the panel shows the Desmos website in a frame, so there is
nothing to set up. If you would rather have the calculator built into the page,
get a key from <https://www.desmos.com/my-api> and paste it into
`DESMOS_API_KEY` near the top of the script in `index.html`. Desmos is a
separate product; this project is not affiliated with it.

## Add or change tiers

Find `const TIERS = [` in the script. Each tier is one object:

```js
{ name: "Aurora", min: 75,                       // starts at a streak of 75
  colors: { bg: ["#001510", "#003b2f", "#02101f"],  // background gradient
            accent: "#5effc3", accent2: "#9ec5ff",  // UI colors
            glow: "rgba(94,255,195,.7)" },
  bgSpeed: 0.05,                                  // gradient motion (0 = still)
  effects: [{ type: "nebula" }, { type: "stars", count: 250, speed: 0.2 }],
  ui: { burst: true, glowBorder: true },          // also: shake, fireCounter
  difficulty: [0.05, 0.25, 0.7] },                // easy / medium / hard odds
```

Keep tiers in order of `min`. Available effect types: `float`, `orbs`,
`embers`, `heat`, `bubbles`, `waves`, `rays`, `school`, `rain`, `clouds`,
`lightning`, `stars`, `nebula`, `planet`, `shooting`, `pulse`, `rings`, `aura`,
`godrays`, `confetti`, `fireworks`. To invent a new effect, add an entry to the
`EFFECTS` object with `init`, `update` and `draw` functions, then use its name
in a tier. Milestone messages live in `MILESTONES` right below the tiers.
