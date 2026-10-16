// ─────────────────────────────────────────────────────────────
//  Edit this file to customize the app for your talk.
// ─────────────────────────────────────────────────────────────
module.exports = {
  eventName: 'Palm Beach State College · CyberWeek Conference',
  gameTitle: 'MONEY MAZE',
  talkTitle: 'Financial Dashboard Configuration and Web Development Using AI',
  speakerName: 'Pricila Modesto',

  // Optional: your LinkedIn profile. Leave '' to hide the "Follow me" card.
  linkedinUrl: '',

  // "You are…" options on the phone form (shown as role tags on the leaderboard).
  roles: ['Student', 'Faculty / Staff', 'Guest'],

  // Each new question unlocks the next one on screen (max 6 fits the layout best).
  fundamentals: [
    { key: 'P', label: 'Prompt' },
    { key: 'I', label: 'Interface' },
    { key: 'D', label: 'Database' },
    { key: 'S', label: 'Storage' },
    { key: 'T', label: 'Testing' },
    { key: 'A', label: 'Automation' },
  ],

  // The "enemies" wandering the maze. Piggy banks bust them when they collide.
  ghosts: ['DATA LEAKS', 'BIAS', 'HALLUCINATIONS'],

  pointsPerQuestion: 100,
  spotlightBonus: 150,      // extra points when you put someone's question on screen
  maxQuestionLength: 280,
  cooldownSeconds: 15,      // minimum time between questions from the same phone
  mazeSeed: 2026,           // change for a different maze layout
};
