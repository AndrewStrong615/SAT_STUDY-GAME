// Cars you can buy. power: distance multiplier for a correct answer.
// grip: share of ground kept on a miss. nitro: bonus per streak step.
// requires: the league you must unlock before the car is for sale.
window.CARS = [
  { id: 'rust', name: 'Rustbucket', price: 0, power: 1.0, grip: 1.0, nitro: 5, color: '#a3a8b0', accent: '#5d6168', requires: 'rookie', blurb: 'It starts. Usually.' },
  { id: 'coupe', name: 'Street Coupe', price: 350, power: 1.1, grip: 1.15, nitro: 6, color: '#3fa7ff', accent: '#1b5e9e', requires: 'rookie', blurb: 'A reliable daily driver with a bit of kick.' },
  { id: 'rally', name: 'Rally GT', price: 900, power: 1.2, grip: 1.35, nitro: 8, color: '#2ecc71', accent: '#167a43', requires: 'pro', blurb: 'Shrugs off mistakes and keeps rolling.' },
  { id: 'viper', name: 'Turbo Viper', price: 1800, power: 1.32, grip: 1.45, nitro: 10, color: '#ff4d4d', accent: '#9e1f1f', requires: 'pro', blurb: 'Streaks turn into rocket launches.' },
  { id: 'quantum', name: 'Quantum X', price: 3500, power: 1.45, grip: 1.6, nitro: 12, color: '#b26bff', accent: '#5b2a99', requires: 'champ', blurb: 'The fastest thing on four wheels. Earn it.' },
];

// The career ladder. Win `winsToUnlock` races in the league before it to open the next one.
window.LEAGUES = [
  { id: 'rookie', name: 'Rookie Cup', short: 'Rookie', tier: 1, winsToUnlock: 0, rivalAcc: [0.45, 0.6], rivalPower: 1.0, prizes: [250, 100, 40, 0], perCorrect: 10 },
  { id: 'pro', name: 'Pro Circuit', short: 'Pro', tier: 2, winsToUnlock: 3, rivalAcc: [0.62, 0.75], rivalPower: 1.15, prizes: [550, 220, 90, 0], perCorrect: 15 },
  { id: 'champ', name: 'Champion Grand Prix', short: 'Champion', tier: 3, winsToUnlock: 3, rivalAcc: [0.78, 0.9], rivalPower: 1.3, prizes: [1000, 400, 150, 0], perCorrect: 20 },
];

// Career goals. Each pays a one-time cash reward when you reach it.
window.GOALS = [
  { id: 'first_win', text: 'Win your first race', reward: 100 },
  { id: 'streak5', text: 'Get 5 answers right in a row', reward: 150 },
  { id: 'buy', text: 'Buy your first new car', reward: 100 },
  { id: 'q50', text: 'Answer 50 questions', reward: 200 },
  { id: 'perfect', text: 'Finish a race with 100% accuracy', reward: 250 },
  { id: 'pro', text: 'Unlock the Pro Circuit', reward: 300 },
  { id: 'pro_win', text: 'Win a Pro Circuit race', reward: 300 },
  { id: 'q200', text: 'Answer 200 questions', reward: 500 },
  { id: 'champ', text: 'Unlock the Champion Grand Prix', reward: 600 },
  { id: 'title', text: 'Win 3 Champion races to become SAT Champion', reward: 1500 },
  { id: 'garage', text: 'Own every car', reward: 1000 },
];
