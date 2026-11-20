# SAT Streak

A one-file SAT study game. Answer real SAT questions in a row without missing.
Every right answer adds 1 to your streak, and the longer the streak, the more
epic the world gets: Spark, Flame, Ocean, Storm, Galaxy, Supernova, Legendary.
One wrong answer shatters the streak and drops you back to tier 1.

## Play

Open `index.html` in any browser while you're online. There is nothing to
install or build.

- Tap an answer or press `1`–`4` (or `A`–`D`). `Enter` starts a new streak.
- Settings on the start screen: Mixed / Math / Reading & Writing, an optional
  timer (20, 40 or 75 seconds), and sound.
- Your best streak and highest tier are saved in your browser.

## Where the questions come from

Every question is drawn at random, live, from the public JSON endpoints behind
the College Board
[SAT Suite Question Bank](https://satsuitequestionbank.collegeboard.org/).
There is no built-in question bank.

- Questions never repeat within a streak.
- College Board's Easy / Medium / Hard ratings follow the tiers: mostly easy
  at the start, mostly hard from Supernova on.
- Only multiple-choice questions are used, since the game has four buttons.
  Answers stay in A–D order because the explanations refer to the letters.
- The start screen shows "College Board connected" when it's working. You need
  to be online.

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

Keep tiers in order of `min`. Available effect types: `float`, `embers`,
`bubbles`, `waves`, `rays`, `rain`, `lightning`, `stars`, `nebula`, `shooting`,
`pulse`, `aura`, `fireworks`. To invent a new effect, add an entry to the
`EFFECTS` object with `init`, `update` and `draw` functions, then use its name
in a tier. Milestone messages live in `MILESTONES` right below the tiers.
