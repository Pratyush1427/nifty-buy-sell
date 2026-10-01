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
