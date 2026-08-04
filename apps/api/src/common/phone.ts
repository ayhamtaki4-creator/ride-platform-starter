import { BadRequestException } from '@nestjs/common';

export function normalizeInternationalPhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  const normalizedDigits = digits.startsWith('00') ? digits.slice(2) : digits;

  if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) {
    throw new BadRequestException(
      'اكتب رقم الهاتف مع رمز الدولة، مثل +963 أو +961 أو +962.'
    );
  }

  if (normalizedDigits.length < 8 || normalizedDigits.length > 15) {
    throw new BadRequestException('رقم الهاتف الدولي غير صالح.');
  }

  return `+${normalizedDigits}`;
}

export function toWhatsAppRecipient(value: string) {
  return normalizeInternationalPhone(value).slice(1);
}
