/**
 * Validates a 9-digit Israeli identifier (ת.ז / ח.פ / עוסק מורשה) using the Luhn-style
 * check digit shared by all three.
 */
export function isValidIsraeliId(value: string): boolean {
  if (!/^\d{5,9}$/.test(value)) return false;
  const padded = value.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let digit = Number(padded[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}
