import { describe, expect, it } from 'vitest';
import { parseNetworkJson } from './validation';
import { planJourney } from './planner';
import { sampleNetwork } from './sampleData';

function sample() {
  const r = parseNetworkJson(JSON.stringify(sampleNetwork));
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.network;
}

describe('planJourney on sample network', () => {
  it('returns zero-ride journey when origin equals destination', () => {
    const j = planJourney(sample(), 'A', 'A', 480, 2);
    expect(j.feasible).toBe(true);
    expect(j.segments).toHaveLength(0);
    expect(j.transfers).toBe(0);
    expect(j.arrivalTime).toBe(480);
  });

  it('finds direct trip with earliest arrival', () => {
    const j = planJourney(sample(), 'A', 'C', 300, 2);
    expect(j.feasible).toBe(true);
    expect(j.segments).toHaveLength(1);
    expect(j.segments[0].tripId).toBe('T1');
    expect(j.arrivalTime).toBe(410);
    expect(j.initialWait).toBe(60);
  });

  it('plans a one-transfer journey with required waiting', () => {
    const j = planJourney(sample(), 'A', 'F', 480, 2);
    expect(j.feasible).toBe(true);
    expect(j.segments.map((s) => s.tripId)).toEqual(['T2', 'T4']);
    expect(j.transfers).toBe(1);
    expect(j.segments[0]).toMatchObject({ boardStopId: 'A', alightStopId: 'D', boardDepart: 480, alightArrive: 530 });
    expect(j.segments[1]).toMatchObject({ boardStopId: 'D', boardDepart: 600, alightArrive: 630 });
    expect(j.transferWaits).toEqual([{ stopId: 'D', wait: 70 }]);
    expect(j.arrivalTime).toBe(630);
  });

  it('reports infeasible when transfers are not allowed', () => {
    const j = planJourney(sample(), 'A', 'F', 480, 0);
    expect(j.feasible).toBe(false);
    expect(j.arrivalTime).toBeNull();
  });

  it('uses a cross-midnight trip and marks next-day arrival', () => {
    const j = planJourney(sample(), 'B', 'F', 1390, 0);
    expect(j.feasible).toBe(true);
    expect(j.segments).toHaveLength(1);
    expect(j.segments[0].tripId).toBe('T5');
    expect(j.arrivalTime).toBe(1500);
    expect(j.arrivalTime! - 1390).toBe(110);
  });

  it('allows boarding exactly at arrival plus minimum transfer time', () => {
    const json = (gap: number) => JSON.stringify({
      stops: [
        { id: 'A', name: '甲', minTransferMinutes: 0 },
        { id: 'B', name: '乙', minTransferMinutes: gap },
        { id: 'C', name: '丙', minTransferMinutes: 0 },
      ],
      trips: [
        { id: 'X1', routeName: '一线', stops: [{ stopId: 'A', arrive: null, depart: 100 }, { stopId: 'B', arrive: 200, depart: 201 }, { stopId: 'C', arrive: 300, depart: null }] },
        { id: 'X2', routeName: '二线', stops: [{ stopId: 'B', arrive: null, depart: 205 }, { stopId: 'C', arrive: 250, depart: null }] },
      ],
    });
    const okNet = parseNetworkJson(json(5));
    if (!okNet.ok) throw new Error(okNet.errors.join('; '));
    const j = planJourney(okNet.network, 'A', 'C', 90, 1);
    expect(j.segments.map((s) => s.tripId)).toEqual(['X1', 'X2']);
    expect(j.transferWaits[0].wait).toBe(5);

    const tightNet = parseNetworkJson(json(6));
    if (!tightNet.ok) throw new Error(tightNet.errors.join('; '));
    const j2 = planJourney(tightNet.network, 'A', 'C', 90, 1);
    expect(j2.segments.map((s) => s.tripId)).toEqual(['X1']);
    expect(j2.arrivalTime).toBe(300);
  });

  it('keeps a direct state even when another path reaches an intermediate stop earlier', () => {
    const r = parseNetworkJson(JSON.stringify({
      stops: [
        { id: 'A', name: '甲', minTransferMinutes: 0 },
        { id: 'B', name: '乙', minTransferMinutes: 0 },
        { id: 'C', name: '丙', minTransferMinutes: 0 },
      ],
      trips: [
        { id: 'DIRECT', routeName: '直达', stops: [{ stopId: 'A', arrive: null, depart: 480 }, { stopId: 'B', arrive: 540, depart: 541 }, { stopId: 'C', arrive: 600, depart: null }] },
        { id: 'FAST', routeName: '快线', stops: [{ stopId: 'A', arrive: null, depart: 480 }, { stopId: 'B', arrive: 500, depart: null }] },
        { id: 'LATE', routeName: '晚班', stops: [{ stopId: 'B', arrive: null, depart: 620 }, { stopId: 'C', arrive: 660, depart: null }] },
      ],
    }));
    if (!r.ok) throw new Error(r.errors.join('; '));
    const j = planJourney(r.network, 'A', 'C', 480, 1);
    expect(j.segments.map((s) => s.tripId)).toEqual(['DIRECT']);
    expect(j.transfers).toBe(0);
    expect(j.arrivalTime).toBe(600);
  });

  it('ties on arrival prefer fewer transfers then lexicographic trip id sequence', () => {
    const r = parseNetworkJson(JSON.stringify({
      stops: [
        { id: 'A', name: '甲', minTransferMinutes: 0 },
        { id: 'B', name: '乙', minTransferMinutes: 0 },
        { id: 'C', name: '丙', minTransferMinutes: 0 },
      ],
      trips: [
        { id: 'Z_DIR', routeName: '直达Z', stops: [{ stopId: 'A', arrive: null, depart: 10 }, { stopId: 'B', arrive: 20, depart: 20 }, { stopId: 'C', arrive: 90, depart: null }] },
        { id: 'A_DIR', routeName: '直达A', stops: [{ stopId: 'A', arrive: null, depart: 10 }, { stopId: 'B', arrive: 20, depart: 20 }, { stopId: 'C', arrive: 90, depart: null }] },
      ],
    }));
    if (!r.ok) throw new Error(r.errors.join('; '));
    const j = planJourney(r.network, 'A', 'C', 0, 2);
    expect(j.segments).toHaveLength(1);
    expect(j.segments[0].tripId).toBe('A_DIR');
  });
});
