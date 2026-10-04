import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrice, maxPointsRedemption, type PricingInput } from './pricing';

const settings = { vatRate: 0.18, autoDiscountMinHours: 4, autoDiscountPercent: 10 };

function input(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    space: { type: 'meetingRoom', hourlyPrice: 10_000, dayPassPrice: null },
    durationMinutes: 120,
    seats: 1,
    isDayPass: false,
    addons: [],
    coupon: null,
    settings,
    ...overrides,
  };
}

test('P1 base = hours x hourly price', () => {
  const p = calculatePrice(input());
  assert.equal(p.base, 20_000);
  assert.equal(p.total, 20_000);
  assert.equal(p.discountSource, null);
});

test('P2 hot desk multiplies by seats; other types ignore seats', () => {
  const desk = calculatePrice(input({ space: { type: 'hotDesk', hourlyPrice: 2_000, dayPassPrice: null }, seats: 3 }));
  assert.equal(desk.base, 12_000);
  const room = calculatePrice(input({ seats: 5 }));
  assert.equal(room.seats, 1);
  assert.equal(room.base, 20_000);
});

test('P3 day pass uses the fixed price only for private offices', () => {
  const office = { type: 'privateOffice' as const, hourlyPrice: 5_000, dayPassPrice: 30_000 };
  const p = calculatePrice(input({ space: office, durationMinutes: 600, isDayPass: true }));
  assert.equal(p.base, 30_000);
  assert.equal(p.hourlyEquivalent, 50_000);
  assert.equal(p.autoDiscount, 0, 'no automatic discount on a day pass');

  const room = calculatePrice(input({ isDayPass: true, space: { type: 'meetingRoom', hourlyPrice: 10_000, dayPassPrice: 1 } }));
  assert.equal(room.base, 20_000);
});

test('P4 automatic discount from the minimum hours, rooms and offices only', () => {
  const long = calculatePrice(input({ durationMinutes: 240 }));
  assert.equal(long.autoDiscount, 4_000);
  assert.equal(long.discountSource, 'auto');
  assert.equal(long.total, 36_000);

  const short = calculatePrice(input({ durationMinutes: 210 }));
  assert.equal(short.autoDiscount, 0);

  const desk = calculatePrice(input({ space: { type: 'hotDesk', hourlyPrice: 2_000, dayPassPrice: null }, durationMinutes: 480 }));
  assert.equal(desk.autoDiscount, 0);
});

test('P5 discounts never stack: the highest one wins, ties keep the coupon', () => {
  const coupon = calculatePrice(input({ durationMinutes: 240, coupon: { discountType: 'percent', value: 15 } }));
  assert.equal(coupon.discount, 6_000);
  assert.equal(coupon.discountSource, 'coupon');

  const autoWins = calculatePrice(input({ durationMinutes: 240, coupon: { discountType: 'percent', value: 5 } }));
  assert.equal(autoWins.discountSource, 'auto');

  const tie = calculatePrice(input({ durationMinutes: 240, coupon: { discountType: 'fixed', value: 4_000 } }));
  assert.equal(tie.discountSource, 'coupon');
});

test('P6 coupon is capped at the base and cannot go negative', () => {
  const huge = calculatePrice(input({ coupon: { discountType: 'fixed', value: 999_999 } }));
  assert.equal(huge.discount, 20_000);
  assert.equal(huge.total, 0);

  const over = calculatePrice(input({ coupon: { discountType: 'percent', value: 250 } }));
  assert.equal(over.discount, 20_000);

  const negative = calculatePrice(input({ coupon: { discountType: 'fixed', value: -5_000 } }));
  assert.equal(negative.discount, 0);
  assert.equal(negative.total, 20_000);
});

test('P7 add-ons are full price: per hour x hours, per booking once', () => {
  const p = calculatePrice(
    input({
      coupon: { discountType: 'percent', value: 100 },
      addons: [
        { id: 'a', name: 'קפה', price: 1_500, pricingMode: 'perHour' },
        { id: 'b', name: 'מסך', price: 3_000, pricingMode: 'perBooking' },
      ],
    }),
  );
  assert.equal(p.addonsTotal, 6_000);
  assert.equal(p.total, 6_000, 'the coupon applies to the base only');
});

test('P8 points: whole 100-point blocks worth 5 ILS, capped at half of the base', () => {
  assert.deepEqual(maxPointsRedemption(20_000, 250), { points: 200, discount: 1_000 });
  assert.deepEqual(maxPointsRedemption(2_000, 10_000), { points: 200, discount: 1_000 });
  assert.deepEqual(maxPointsRedemption(20_000, -50), { points: 0, discount: 0 });
});

test('P9 points are spent only when they beat the other discount', () => {
  const beats = calculatePrice(input({ pointsAvailable: 5_000 }));
  assert.equal(beats.discountSource, 'points');
  assert.equal(beats.pointsRedeemed, 2_000);
  assert.equal(beats.discount, 10_000);

  const loses = calculatePrice(input({ durationMinutes: 240, pointsAvailable: 100 }));
  assert.equal(loses.discountSource, 'auto');
  assert.equal(loses.pointsRedeemed, 0);
});

test('P10 VAT is included in the total, not added on top', () => {
  const p = calculatePrice(input({ space: { type: 'meetingRoom', hourlyPrice: 11_800, dayPassPrice: null }, durationMinutes: 60 }));
  assert.equal(p.total, 11_800);
  assert.equal(p.vatIncluded, 1_800);
});

test('P11 all amounts are whole agorot', () => {
  const p = calculatePrice(
    input({
      space: { type: 'meetingRoom', hourlyPrice: 3_333, dayPassPrice: null },
      durationMinutes: 90,
      coupon: { discountType: 'percent', value: 7 },
      addons: [{ id: 'a', name: 'x', price: 333, pricingMode: 'perHour' }],
    }),
  );
  for (const n of [p.base, p.discount, p.addonsTotal, p.total, p.vatIncluded]) assert.ok(Number.isInteger(n), String(n));
});
