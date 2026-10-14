import { BadRequestException } from '@nestjs/common';

export const INTERNATIONAL_PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;
export const INTERNATIONAL_PHONE_MESSAGE =
  'أدخل رقم هاتف دوليًا صحيحًا مع رمز الدولة، مثل +963944000000 أو +96171123456. يجب أن يتكون من 8 إلى 15 رقمًا.';

/**
 * Normalize formatting before DTO validation. The previous booking DTO
 * rejected numbers containing parentheses or Arabic numerals *before* the
 * service could normalize them, and exposed an English regular-expression
 * validation error to passengers.
 *
 * Keep invalid characters intact so they are rejected by the pattern rather
 * than silently accepted (e.g. do not turn "+963abc944..." into a real phone).
 */
export function canonicalizeInternationalPhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const asciiDigits = value
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  const compact = asciiDigits.trim().replace(/[\s().-]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

export function normalizeInternationalPhone(value: string) {
  const normalized = canonicalizeInternationalPhone(value);
  if (typeof normalized !== 'string' || !INTERNATIONAL_PHONE_PATTERN.test(normalized)) {
    throw new BadRequestException(INTERNATIONAL_PHONE_MESSAGE);
  }
  return normalized;
}

export function toWhatsAppRecipient(value: string) {
  return normalizeInternationalPhone(value).slice(1);
}
