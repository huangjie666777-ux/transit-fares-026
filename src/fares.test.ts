import { describe, expect, it } from 'vitest';
import { parseNetworkJson } from './validation';
import { parseFareSchemeJson, computeFareQuote, missingSingleFares } from './fares';
import type { FareScheme } from './fares';
import { planJourney } from './planner';
import { sampleNetwork, passSaverFareSample, singleSaverFareSample } from './sampleData';
import type { RideSegment } from './types';

function sample() {
  const r = parseNetworkJson(JSON.stringify(sampleNetwork));
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.network;
}

function schemeOf(json: unknown): FareScheme {
  const r = parseFareSchemeJson(JSON.stringify(json), sample());
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scheme;
}

function seg(tripId: string, boardDepart: number, alightArrive: number): RideSegment {
  return { tripId, routeName: tripId, boardStopId: 'A', alightStopId: 'B', boardDepart, alightArrive };
}

describe('parseFareSchemeJson', () => {
  it('accepts a valid scheme', () => {
    const r = parseFareSchemeJson(JSON.stringify(passSaverFareSample), sample());
    expect(r.ok).toBe(true);
  });

  it('locates unknown trip in singleFares', () => {
    const r = parseFareSchemeJson(JSON.stringify({ singleFares: { T9: 100 }, passes: [] }), sample());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain('singleFares.T9');
  });

  it('locates negative or non-integer amounts', () => {
    const r = parseFareSchemeJson(JSON.stringify({ singleFares: { T1: -5, T2: 1.5 }, passes: [] }), sample());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.startsWith('singleFares.T1'))).toBe(true);
      expect(r.errors.some((e) => e.startsWith('singleFares.T2'))).toBe(true);
    }
  });

  it('locates duplicate pass ids, unknown pass trips and invalid validity', () => {
    const bad = {
      singleFares: {},
      passes: [
        { id: 'P1', name: 'a', price: 100, validMinutes: 60, trips: ['T1'] },
        { id: 'P1', name: 'b', price: 100, validMinutes: 60, trips: ['T2'] },
        { id: 'P2', name: 'c', price: 100, validMinutes: 0, trips: ['T9'] },
      ],
    };
    const r = parseFareSchemeJson(JSON.stringify(bad), sample());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('passes[1].id'))).toBe(true);
      expect(r.errors.some((e) => e.includes('passes[2].validMinutes'))).toBe(true);
      expect(r.errors.some((e) => e.includes('passes[2].trips[0]'))).toBe(true);
    }
  });

  it('reports JSON syntax errors', () => {
    const r = parseFareSchemeJson('{ not json', sample());
    expect(r.ok).toBe(false);
  });
});

describe('computeFareQuote', () => {
  it('returns zero quote for zero-ride journey', () => {
    const q = computeFareQuote([], schemeOf(passSaverFareSample));
    expect(q).toMatchObject({ totalCost: 0, ticketCount: 0, singleTotal: 0, savings: 0 });
  });

  it('picks a pass when it is cheaper than singles', () => {
    const segs = [seg('T2', 480, 530), seg('T4', 600, 630)];
    const q = computeFareQuote(segs, schemeOf(passSaverFareSample))!;
    expect(q.totalCost).toBe(600);
    expect(q.ticketCount).toBe(1);
    expect(q.tickets[0]).toMatchObject({ kind: 'pass', passId: 'P1', purchaseTime: 480, coveredSegments: [0, 1] });
    expect(q.tickets[0].expiryTime).toBe(480 + 150);
    expect(q.singleTotal).toBe(750);
    expect(q.savings).toBe(150);
  });

  it('picks singles when the pass is more expensive', () => {
    const segs = [seg('T2', 480, 530), seg('T4', 600, 630)];
    const q = computeFareQuote(segs, schemeOf(singleSaverFareSample))!;
    expect(q.totalCost).toBe(750);
    expect(q.ticketCount).toBe(2);
    expect(q.tickets.every((t) => t.kind === 'single')).toBe(true);
    expect(q.savings).toBe(0);
  });

  it('pass validity is start-inclusive end-exclusive and spans midnight', () => {
    const segs = [seg('T3', 1380, 1460), seg('T5', 1500, 1560)];
    const atBoundary = schemeOf({
      singleFares: { T3: 500, T5: 600 },
      passes: [{ id: 'N', name: 'night', price: 800, validMinutes: 120, trips: ['T3', 'T5'] }],
    });
    const q = computeFareQuote(segs, atBoundary)!;
    expect(q.totalCost).toBe(1100);
    expect(q.tickets.every((t) => t.kind === 'single')).toBe(true);
    const oneMore = schemeOf({
      singleFares: { T3: 500, T5: 600 },
      passes: [{ id: 'N', name: 'night', price: 800, validMinutes: 121, trips: ['T3', 'T5'] }],
    });
    const q2 = computeFareQuote(segs, oneMore)!;
    expect(q2.totalCost).toBe(800);
    expect(q2.tickets[0].coveredSegments).toEqual([0, 1]);
    expect(q2.tickets[0].expiryTime).toBe(1501);
  });

  it('skips non-applicable segments and keeps using the pass afterwards', () => {
    const scheme = schemeOf({
      singleFares: { T1: 100, T2: 200, T4: 300 },
      passes: [{ id: 'P', name: 'p', price: 350, validMinutes: 300, trips: ['T1', 'T4'] }],
    });
    const segs = [seg('T1', 100, 150), seg('T2', 200, 250), seg('T4', 300, 350)];
    const q = computeFareQuote(segs, scheme)!;
    expect(q.totalCost).toBe(550);
    expect(q.tickets).toHaveLength(2);
    expect(q.tickets[0]).toMatchObject({ kind: 'pass', coveredSegments: [0, 2] });
    expect(q.tickets[1]).toMatchObject({ kind: 'single', coveredSegments: [1] });
  });

  it('buys the same pass twice when cheaper than one long pass', () => {
    const scheme = schemeOf({
      singleFares: { T1: 500, T2: 500 },
      passes: [{ id: 'P', name: 'p', price: 300, validMinutes: 60, trips: ['T1', 'T2'] }],
    });
    const segs = [seg('T1', 100, 150), seg('T2', 500, 550)];
    const q = computeFareQuote(segs, scheme)!;
    expect(q.totalCost).toBe(600);
    expect(q.ticketCount).toBe(2);
    expect(q.tickets.map((t) => t.purchaseTime)).toEqual([100, 500]);
  });

  it('prefers fewer tickets on price tie', () => {
    const scheme = schemeOf({
      singleFares: { T1: 200, T2: 200 },
      passes: [{ id: 'P', name: 'p', price: 400, validMinutes: 600, trips: ['T1', 'T2'] }],
    });
    const segs = [seg('T1', 100, 150), seg('T2', 200, 250)];
    const q = computeFareQuote(segs, scheme)!;
    expect(q.totalCost).toBe(400);
    expect(q.ticketCount).toBe(1);
    expect(q.tickets[0].kind).toBe('pass');
  });

  it('returns null when a segment has no single fare and no pass applies', () => {
    const scheme = schemeOf({ singleFares: { T1: 100 }, passes: [] });
    expect(computeFareQuote([seg('T2', 100, 150)], scheme)).toBeNull();
  });

  it('flags missing single fares', () => {
    const scheme = schemeOf({ singleFares: { T1: 100 }, passes: [] });
    expect(missingSingleFares([seg('T1', 1, 2), seg('T3', 3, 4)], scheme)).toEqual(['T3']);
  });
});

describe('fare quote on planned journey', () => {
  it('quotes the A to F journey without changing the route', () => {
    const net = sample();
    const j = planJourney(net, 'A', 'F', 480, 2);
    expect(j.segments.map((s) => s.tripId)).toEqual(['T2', 'T4']);
    const q = computeFareQuote(j.segments, schemeOf(passSaverFareSample))!;
    expect(q.totalCost).toBe(600);
    expect(q.singleTotal).toBe(750);
    expect(q.savings).toBe(150);
  });
});
