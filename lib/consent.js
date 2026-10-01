// What every user must acknowledge before using the app. Shown as checkboxes
// on /welcome and checked again by /api/profile/accept.
export const ACKNOWLEDGEMENTS = [
  {
    key: 'educational',
    text: 'Nifty Signals is a personal learning project and a game. Buckets are pretend: no real money, trades or orders are involved.',
  },
  {
    key: 'not-advice',
    text: 'Nothing here is investment advice, a recommendation or a research report. The builder is not registered with SEBI as an investment adviser or research analyst.',
  },
  {
    key: 'not-reliable',
    text: 'Model outlooks, prices and data may be wrong, delayed or incomplete. Nothing here is factual or dependable, and past model results say nothing about the future.',
  },
  {
    key: 'adult',
    text: 'I am 18 or older.',
  },
  {
    key: 'own-risk',
    text: 'I won’t rely on this app for any real investment decision. Any decision I make is my own responsibility.',
  },
];
