import assert from 'node:assert/strict';
import {
  dateOnlyKey,
  isPastServiceDate,
  parseDateOnly,
  utcDayBounds,
  zonedDateKey
} from '../src/common/service-date';

const parsed = parseDateOnly('2026-08-09');
assert.ok(parsed);
assert.equal(parsed.toISOString(), '2026-08-09T00:00:00.000Z');
assert.equal(dateOnlyKey(parsed), '2026-08-09');

assert.equal(parseDateOnly('2026-02-30'), null);
assert.equal(parseDateOnly('09/08/2026'), null);

// 21:30 UTC is already the next calendar day in Damascus in August.
assert.equal(
  zonedDateKey(new Date('2026-08-08T21:30:00.000Z'), 'Asia/Damascus'),
  '2026-08-09'
);

const bounds = utcDayBounds(parsed);
assert.equal(bounds.start.toISOString(), '2026-08-09T00:00:00.000Z');
assert.equal(bounds.end.toISOString(), '2026-08-10T00:00:00.000Z');

assert.equal(
  isPastServiceDate(parsed, new Date('2026-08-09T20:59:59.000Z')),
  false
);
assert.equal(
  isPastServiceDate(parsed, new Date('2026-08-09T21:00:00.000Z')),
  true
);

console.log('service-date checks passed');
