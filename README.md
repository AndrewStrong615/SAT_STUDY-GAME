# Twin Tank Dive

An SAT practice game built on College Board's official question bank. You pilot
a submarine with two systems:

- **Engine = Math.** Math points fill the Engine tank and take you deeper.
- **Light = Reading & Writing.** English points fill the Light tank and widen
  the sub's light cone.

Your final score is **2 × the lower tank**, so you can't ignore either section.

## Play

Play online at https://andrewstrong615.github.io/SAT_STUDY-GAME/ or
double-click `index.html`. There is no install, no build step and no backend.

| File | What's in it |
| --- | --- |
| `index.html` | markup and styles |
| `game.js` | logic, scoring, live questions, visuals, sound, storage |
| `skills.js` | the list of SAT domains and skills |
| `test.js` | automated tests (`node test.js`) |

## A dive

Seven missions, always in this order: Math, English, Math, English, Math,
English, Fusion Boss. Each mission names a section, domain, skill and
difficulty, for example "Math · Algebra · Linear inequalities · Hard", and
shows a random question that fits it.

- **Skill choice:** about half the time one of your weakest skills, otherwise a
  skill you've tried least. "Change skill" swaps the assignment.
- **Difficulty:** one easy, one medium and one hard per section. After 5 dives,
  skills where you're over 80% shift toward medium and hard.
- **Daily Dive** uses assignments seeded by the date. **Free Dive** is random.
- **Fusion Boss:** two hard data questions back to back. Part A is Reading &
  Writing · Command of Evidence (Quantitative). Part B is Math ·
  Problem-Solving and Data Analysis.
- You can leave mid-dive and resume later.

## Scoring

Tier ladder: Plankton 10 · Shrimp 25 · Krill 40 · Squid 60 · Anglerfish 80 ·
One in a Krillion 100.

Missions 1 to 6: incorrect is 0. A correct answer starts at Plankton (easy),
Krill (medium) or Anglerfish (hard), and each bonus moves it up one tier, capped
at One in a Krillion:

- **Weak spot:** your stored accuracy in the skill is under 50% with at least 3
  past attempts.
- **Cross-current:** the previous mission in this dive was correct and from the
  other section.
- **No choices (Math only):** you solved it before looking at the choices. Math
  questions hide their choices until you say whether you've solved it.
  Typed-answer questions always count.

Fusion Boss: both parts correct is 100 points (50 to each tank). One part
correct is 50 points to that part's tank. No bonuses.

Every number above lives in the `CONFIG` object at the top of `game.js`.

## Where the questions come from

Your browser asks the public endpoints behind College Board's
[SAT Suite Question Bank](https://satsuite.collegeboard.org/practice/student-question-bank)
for one question at a time and shows it in the game.

- Nothing from College Board is stored in this repo, and the game never saves
  question text, choices or explanations. It stores only the question ID,
  section, domain, skill, difficulty and your result.
- A question you've answered never comes up again.
- The questions are © College Board. Use them for your own studying and don't
  republish them. The endpoints are undocumented and could change. This game
  isn't affiliated with College Board.

**If your browser can't load questions from College Board**, the start screen
says so and the game switches to companion mode: each mission tells you what
to filter for on College Board's site, and you log the Question ID and whether
you got it right. Scoring is identical.

## Editing skills

`skills.js` is the one place skill names live. The game matches each `name`
against College Board's skill labels, ignoring capitals and punctuation. If a
label is worded differently, change `name` or add the wording to `aliases`.
Don't change an `id`, because saved progress is stored under it.

## Your progress

Saved in your browser (localStorage): best score, daily streak, attempts and
correct counts per skill, logged question IDs and an unfinished dive. History
has Export and Import buttons that move it between devices as a JSON file. The
daily streak counts consecutive days with a finished Daily Dive.

## Tests

`node test.js` runs the scoring engine through the worked example (Engine 220,
Light 175, final score 350) plus the bonus rules, mission selection, duplicate
IDs and save data.
