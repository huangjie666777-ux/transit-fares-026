import { describe, expect, it } from 'vitest';
import { parseNetworkJson } from './validation';
import { sampleNetwork } from './sampleData';

describe('parseNetworkJson', () => {
  it('accepts the bundled sample network', () => {
    const r = parseNetworkJson(JSON.stringify(sampleNetwork));
    expect(r.ok).toBe(true);
  });

  it('reports json syntax errors', () => {
    const r = parseNetworkJson('{ bad json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('JSON 语法错误');
  });

  it('locates duplicate, unknown and negative fields', () => {
    const bad = {
      stops: [
        { id: 'A', name: '甲', minTransferMinutes: 1 },
        { id: 'A', name: '乙', minTransferMinutes: -2 },
      ],
      trips: [
        {
          id: 'T1', routeName: '一线',
          stops: [
            { stopId: 'A', arrive: null, depart: 100 },
            { stopId: 'Z', arrive: 120, depart: null },
          ],
        },
      ],
    };
    const r = parseNetworkJson(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const text = r.errors.join('\n');
      expect(text).toContain('stops[1].id');
      expect(text).toContain('stops[1].minTransferMinutes');
      expect(text).toContain('trips[0].stops[1].stopId');
    }
  });

  it('rejects backwards dwell time and non-positive driving time', () => {
    const backwards = {
      stops: [
        { id: 'A', name: '甲', minTransferMinutes: 0 },
        { id: 'B', name: '乙', minTransferMinutes: 0 },
        { id: 'C', name: '丙', minTransferMinutes: 0 },
      ],
      trips: [
        { id: 'T1', routeName: '一线', stops: [{ stopId: 'A', arrive: null, depart: 100 }, { stopId: 'B', arrive: 90, depart: 95 }, { stopId: 'C', arrive: 120, depart: null }] },
      ],
    };
    const r1 = parseNetworkJson(JSON.stringify(backwards));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors.join()).toMatch(/倒退/);

    const zeroDrive = {
      stops: [
        { id: 'A', name: '甲', minTransferMinutes: 0 },
        { id: 'B', name: '乙', minTransferMinutes: 0 },
      ],
      trips: [
        { id: 'T1', routeName: '一线', stops: [{ stopId: 'A', arrive: null, depart: 100 }, { stopId: 'B', arrive: 100, depart: null }] },
      ],
    };
    const r2 = parseNetworkJson(JSON.stringify(zeroDrive));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors.join()).toContain('行驶时间必须为正');
  });

  it('rejects duplicate trip ids and trips with too few stops', () => {
    const bad = {
      stops: [{ id: 'A', name: '甲', minTransferMinutes: 0 }],
      trips: [
        { id: 'T1', routeName: '一线', stops: [{ stopId: 'A', arrive: null, depart: 1 }] },
        { id: 'T1', routeName: '二线', stops: [{ stopId: 'A', arrive: null, depart: 2 }] },
      ],
    };
    const r = parseNetworkJson(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join()).toContain('班次至少需要两个停站');
      expect(r.errors.join()).toContain('trips[1].id');
    }
  });
});
