/** Russian phone input mask: any input -> "+7 (921) 123-45-67". */
export function maskPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (!digits) return '';
  if (digits[0] === '8') digits = '7' + digits.slice(1);
  if (digits[0] !== '7') digits = '7' + digits;
  digits = digits.slice(0, 11);

  const p = digits.slice(1);
  let out = '+7';
  if (p.length) out += ` (${p.slice(0, 3)}`;
  if (p.length >= 3) out += ')';
  if (p.length > 3) out += ` ${p.slice(3, 6)}`;
  if (p.length > 6) out += `-${p.slice(6, 8)}`;
  if (p.length > 8) out += `-${p.slice(8, 10)}`;
  return out;
}

export const isCompletePhone = (masked: string): boolean => masked.replace(/\D/g, '').length === 11;

/** "+79211234567" -> "+7 921 123-45-67" for display. */
export function prettyPhone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.length !== 11) return e164;
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}
