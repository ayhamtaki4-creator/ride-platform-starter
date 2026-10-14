import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BookingType, VehicleClass } from '@prisma/client';
import { CreateBookingDto } from '../src/bookings/dto/create-booking.dto';
import { normalizeInternationalPhone } from '../src/common/phone';

const payload = {
  clientRequestId: randomUUID(),
  routeId: randomUUID(),
  bookingType: BookingType.PRIVATE_CAR,
  vehicleClass: VehicleClass.SMALL,
  travelDate: '2027-01-10',
  pickupAddress: 'شارع الحمرا بيروت',
  dropoffAddress: 'مدينة دمشق',
  passengerName: 'مسافر اختبار التحقق',
};

function validatePhone(input: string) {
  const dto = plainToInstance(CreateBookingDto, { ...payload, passengerPhone: input });
  return { dto, errors: validateSync(dto) };
}

for (const [input, expected] of [
  ['+963944000000', '+963944000000'],
  ['+963 (944) 000-000', '+963944000000'],
  ['00963 944 000 000', '+963944000000'],
  ['+٩٦٣٩٤٤٠٠٠٠٠٠', '+963944000000'],
  ['+961 71 123 456', '+96171123456'],
] as const) {
  const { dto, errors } = validatePhone(input);
  assert.equal(errors.length, 0, `Expected valid phone: ${input}, errors=${JSON.stringify(errors)}`);
  assert.equal(dto.passengerPhone, expected);
  assert.equal(normalizeInternationalPhone(input), expected);
}

for (const input of [
  '+963',
  '0994000000',
  '+963abcdef944000000',
  '+963 9',
  'random',
]) {
  const { errors } = validatePhone(input);
  const phone = errors.find((error) => error.property === 'passengerPhone');
  assert.ok(phone, `Invalid phone should be rejected: ${input}`);
  assert.ok(Object.values(phone.constraints ?? {}).some((value) => value.includes('أدخل رقم هاتف دوليًا صحيحًا')),
    `Expected helpful Arabic phone error for: ${input}`);
}

// A route without flights must accept missing optional time/flight number.
const noFlightDto = plainToInstance(CreateBookingDto, {
  ...payload,
  passengerPhone: '+963944000000',
});
assert.equal(validateSync(noFlightDto).length, 0);
console.log('Booking international phone normalization + Arabic validation passed.');
