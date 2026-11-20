// Cars you can buy. power: distance multiplier for a correct answer.
// grip: share of ground kept on a miss. nitro: bonus per streak step.
window.CARS = [
  { id: 'rust', name: 'Rustbucket', price: 0, power: 1.0, grip: 1.0, nitro: 5, color: '#a3a8b0', accent: '#5d6168', blurb: 'It starts. Usually.' },
  { id: 'coupe', name: 'Street Coupe', price: 350, power: 1.1, grip: 1.15, nitro: 6, color: '#3fa7ff', accent: '#1b5e9e', blurb: 'A reliable daily driver with a bit of kick.' },
  { id: 'rally', name: 'Rally GT', price: 900, power: 1.2, grip: 1.35, nitro: 8, color: '#2ecc71', accent: '#167a43', blurb: 'Shrugs off mistakes and keeps rolling.' },
  { id: 'viper', name: 'Turbo Viper', price: 1800, power: 1.32, grip: 1.45, nitro: 10, color: '#ff4d4d', accent: '#9e1f1f', blurb: 'Streaks turn into rocket launches.' },
  { id: 'quantum', name: 'Quantum X', price: 3500, power: 1.45, grip: 1.6, nitro: 12, color: '#b26bff', accent: '#5b2a99', blurb: 'The fastest thing on four wheels. Earn it.' },
];

// Leagues set how sharp your rivals are, and how much a win pays.
window.LEAGUES = [
  { id: 'rookie', name: 'Rookie', rivalAcc: [0.45, 0.6], rivalPower: 1.0, prizes: [250, 100, 40, 0], perCorrect: 10 },
  { id: 'pro', name: 'Pro', rivalAcc: [0.62, 0.75], rivalPower: 1.15, prizes: [550, 220, 90, 0], perCorrect: 15 },
  { id: 'champ', name: 'Champion', rivalAcc: [0.78, 0.9], rivalPower: 1.3, prizes: [1000, 400, 150, 0], perCorrect: 20 },
];
