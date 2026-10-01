// Matches the Supabase Auth settings (min 8, letters and digits), checked before sending.
export const PASSWORD_RULE = 'At least 8 characters, with letters and numbers.';
export const passwordOk = (p) => p.length >= 8 && /[a-z]/i.test(p) && /\d/.test(p);
