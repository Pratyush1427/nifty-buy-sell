// The game is end-of-day only: picks enter and exit at a session's closing price.

const IST_OFFSET_MS = 5.5 * 3600e3;
const CLOSE_MINUTES = 15 * 60 + 30; // NSE closes at 15:30 IST
// Daily bars and NAVs are treated as final this long after the close.
const FINAL_MINUTES = 16 * 60 + 30;

/** Date (YYYY-MM-DD) and minutes past midnight in India. */
export function istClock(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    date: ist.toISOString().slice(0, 10),
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    weekday: ist.getUTCDay(), // 0 = Sunday
  };
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isWeekend = (iso) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

/**
 * The trading day whose close prices an action taken `now`: today if it's a
 * weekday before 15:30 IST, otherwise the next weekday. Exchange holidays need
 * no list, because the fill uses the first close on or after this date.
 */
export function closingDay(now = new Date()) {
  const { date, minutes } = istClock(now);
  let day = !isWeekend(date) && minutes < CLOSE_MINUTES ? date : addDays(date, 1);
  while (isWeekend(day)) day = addDays(day, 1);
  return day;
}

/** Latest date whose close counts as final: today after 16:30 IST, else yesterday. */
export function lastFinalDay(now = new Date()) {
  const { date, minutes } = istClock(now);
  return minutes >= FINAL_MINUTES ? date : addDays(date, -1);
}

// ------------------------------------------------------------- US market
// US stocks and gold (COMEX) close in New York: 16:00 Eastern. Daily bars are
// dated by the New York trading day.

const US_CLOSE_MINUTES = 16 * 60;
const US_FINAL_MINUTES = 17 * 60 + 30;

/** Date and minutes past midnight in New York (handles daylight saving). */
export function nyClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** closingDay() for a market: 'IN' (NSE, default) or 'US' (New York). */
export function closingDayFor(market, now = new Date()) {
  if (market !== 'US') return closingDay(now);
  const { date, minutes } = nyClock(now);
  let day = !isWeekend(date) && minutes < US_CLOSE_MINUTES ? date : addDays(date, 1);
  while (isWeekend(day)) day = addDays(day, 1);
  return day;
}

/** lastFinalDay() for a market: 'IN' (default) or 'US'. */
export function lastFinalDayFor(market, now = new Date()) {
  if (market !== 'US') return lastFinalDay(now);
  const { date, minutes } = nyClock(now);
  return minutes >= US_FINAL_MINUTES ? date : addDays(date, -1);
}
