/* =====================================================================
   Twin Tank Dive: the SAT sections, domains and skills.

   THIS IS THE ONE PLACE TO EDIT SKILL NAMES.
   `name` is what the game shows AND what it matches against College
   Board's skill labels (capital letters, spaces and punctuation are
   ignored when matching). If College Board words a label differently,
   change `name` here, or add the other wording to `aliases`, e.g.
     { id: "m-alg-lin1", name: "Linear equations in one variable",
       aliases: ["Linear equations in 1 variable"] }

   Never change an `id`: saved progress is stored under it.
   `code` is College Board's short code for the domain. It is used as a
   backup when no skill label matches.
   ===================================================================== */
var SAT_SKILLS = [
  {
    id: "rw", name: "Reading & Writing", short: "English", tank: "light", test: 1,
    domains: [
      { id: "rw-ii", name: "Information and Ideas", code: "INI", skills: [
        { id: "rw-ii-cid", name: "Central Ideas and Details" },
        { id: "rw-ii-coe-text", name: "Command of Evidence (Textual)", aliases: ["Command of Evidence"] },
        { id: "rw-ii-coe-quant", name: "Command of Evidence (Quantitative)", aliases: ["Command of Evidence"] },
        { id: "rw-ii-inf", name: "Inferences" },
      ] },
      { id: "rw-cs", name: "Craft and Structure", code: "CAS", skills: [
        { id: "rw-cs-wic", name: "Words in Context" },
        { id: "rw-cs-tsp", name: "Text Structure and Purpose" },
        { id: "rw-cs-ctc", name: "Cross-Text Connections" },
      ] },
      { id: "rw-ei", name: "Expression of Ideas", code: "EOI", skills: [
        { id: "rw-ei-rs", name: "Rhetorical Synthesis" },
        { id: "rw-ei-tr", name: "Transitions" },
      ] },
      { id: "rw-sec", name: "Standard English Conventions", code: "SEC", skills: [
        { id: "rw-sec-bnd", name: "Boundaries" },
        { id: "rw-sec-fss", name: "Form, Structure, and Sense" },
      ] },
    ],
  },
  {
    id: "math", name: "Math", short: "Math", tank: "engine", test: 2,
    domains: [
      { id: "m-alg", name: "Algebra", code: "H", skills: [
        { id: "m-alg-lin1", name: "Linear equations in one variable" },
        { id: "m-alg-linf", name: "Linear functions" },
        { id: "m-alg-lin2", name: "Linear equations in two variables" },
        { id: "m-alg-sys", name: "Systems of two linear equations", aliases: ["Systems of two linear equations in two variables"] },
        { id: "m-alg-ineq", name: "Linear inequalities", aliases: ["Linear inequalities in one or two variables"] },
      ] },
      { id: "m-adv", name: "Advanced Math", code: "P", skills: [
        { id: "m-adv-eq", name: "Equivalent expressions" },
        { id: "m-adv-nle", name: "Nonlinear equations and systems", aliases: ["Nonlinear equations in one variable and systems of equations in two variables"] },
        { id: "m-adv-nlf", name: "Nonlinear functions" },
      ] },
      { id: "m-psda", name: "Problem-Solving and Data Analysis", code: "Q", skills: [
        { id: "m-psda-rru", name: "Ratios, rates, and units", aliases: ["Ratios, rates, proportional relationships, and units"] },
        { id: "m-psda-pct", name: "Percentages" },
        { id: "m-psda-1v", name: "One-variable data", aliases: ["One-variable data: Distributions and measures of center and spread"] },
        { id: "m-psda-2v", name: "Two-variable data", aliases: ["Two-variable data: Models and scatterplots"] },
        { id: "m-psda-prob", name: "Probability", aliases: ["Probability and conditional probability"] },
        { id: "m-psda-inf", name: "Inference from sample statistics", aliases: ["Inference from sample statistics and margin of error"] },
        { id: "m-psda-claims", name: "Evaluating statistical claims", aliases: ["Evaluating statistical claims: Observational studies and experiments"] },
      ] },
      { id: "m-geo", name: "Geometry and Trigonometry", code: "S", skills: [
        { id: "m-geo-av", name: "Area and volume" },
        { id: "m-geo-lat", name: "Lines, angles, and triangles" },
        { id: "m-geo-rt", name: "Right triangles and trigonometry" },
        { id: "m-geo-cir", name: "Circles" },
      ] },
    ],
  },
];

if (typeof module !== "undefined" && module.exports) module.exports = SAT_SKILLS;
