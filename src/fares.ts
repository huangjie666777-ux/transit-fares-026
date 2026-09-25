import type { Network, RideSegment } from './types';

export interface Pass {
  id: string;
  name: string;
  price: number;
  validMinutes: number;
  trips: string[];
}

export interface FareScheme {
  singleFares: Record<string, number>;
  passes: Pass[];
}

export interface FareValidationSuccess {
  ok: true;
  scheme: FareScheme;
}

export interface FareValidationFailure {
  ok: false;
  errors: string[];
}

export type FareValidationResult = FareValidationSuccess | FareValidationFailure;

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

export function validateFareScheme(input: unknown, network: Network): FareValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['\u6839\u8282\u70b9\u5fc5\u987b\u662f\u5305\u542b singleFares \u4e0e passes \u7684\u5bf9\u8c61'] };
  }
  const root = input as Record<string, unknown>;
  const tripIds = new Set(network.trips.map((t) => t.id));

  if (typeof root.singleFares !== 'object' || root.singleFares === null || Array.isArray(root.singleFares)) {
    errors.push('singleFares \u5fc5\u987b\u662f\u4ee5\u73ed\u6b21ID\u4e3a\u952e\u7684\u5bf9\u8c61');
  }
  if (root.passes !== undefined && !Array.isArray(root.passes)) {
    errors.push('passes \u5fc5\u987b\u662f\u6570\u7ec4');
  }
  if (errors.length > 0) return { ok: false, errors };

  const singleFares: Record<string, number> = {};
  const rawFares = root.singleFares as Record<string, unknown>;
  for (const key of Object.keys(rawFares)) {
    const value = rawFares[key];
    if (!tripIds.has(key)) {
      errors.push('singleFares.' + key + ': \u672a\u77e5\u73ed\u6b21 "' + key + '"');
      continue;
    }
    if (!isInt(value) || value < 0) {
      errors.push('singleFares.' + key + ': \u91d1\u989d\u5fc5\u987b\u662f\u975e\u8d1f\u6574\u6570\u5206');
      continue;
    }
    singleFares[key] = value;
  }

  const passes: Pass[] = [];
  const passIds = new Set<string>();
  const rawPasses = (root.passes ?? []) as unknown[];
  rawPasses.forEach((raw, i) => {
    const base = 'passes[' + i + ']';
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(base + ': \u8054\u7968\u5fc5\u987b\u662f\u5bf9\u8c61');
      return;
    }
    const item = raw as Record<string, unknown>;
    let ok = true;
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      errors.push(base + '.id: \u5fc5\u987b\u662f\u975e\u7a7a\u5b57\u7b26\u4e32');
      ok = false;
    } else if (passIds.has(item.id)) {
      errors.push(base + '.id: \u8054\u7968ID "' + item.id + '" \u91cd\u590d');
      ok = false;
    } else {
      passIds.add(item.id);
    }
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      errors.push(base + '.name: \u5fc5\u987b\u662f\u975e\u7a7a\u5b57\u7b26\u4e32');
      ok = false;
    }
    if (!isInt(item.price) || item.price < 0) {
      errors.push(base + '.price: \u91d1\u989d\u5fc5\u987b\u662f\u975e\u8d1f\u6574\u6570\u5206');
      ok = false;
    }
    if (!isInt(item.validMinutes) || item.validMinutes <= 0) {
      errors.push(base + '.validMinutes: \u6709\u6548\u5206\u949f\u6570\u5fc5\u987b\u662f\u6b63\u6574\u6570');
      ok = false;
    }
    let trips: string[] = [];
    if (!Array.isArray(item.trips) || item.trips.length === 0) {
      errors.push(base + '.trips: \u5fc5\u987b\u662f\u975e\u7a7a\u73ed\u6b21ID\u6570\u7ec4');
      ok = false;
    } else {
      const seen = new Set<string>();
      let tripsOk = true;
      (item.trips as unknown[]).forEach((t, j) => {
        if (typeof t !== 'string' || t.trim() === '') {
          errors.push(base + '.trips[' + j + ']: \u73ed\u6b21ID\u5fc5\u987b\u662f\u975e\u7a7a\u5b57\u7b26\u4e32');
          tripsOk = false;
        } else if (!tripIds.has(t)) {
          errors.push(base + '.trips[' + j + ']: \u672a\u77e5\u73ed\u6b21 "' + t + '"');
          tripsOk = false;
        } else if (seen.has(t)) {
          errors.push(base + '.trips[' + j + ']: \u73ed\u6b21 "' + t + '" \u5728\u9002\u7528\u5217\u8868\u4e2d\u91cd\u590d');
          tripsOk = false;
        } else {
          seen.add(t);
        }
      });
      if (tripsOk) trips = item.trips as string[];
      ok = ok && tripsOk;
    }
    if (ok) {
      passes.push({
        id: item.id as string,
        name: item.name as string,
        price: item.price as number,
        validMinutes: item.validMinutes as number,
        trips,
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, scheme: { singleFares, passes } };
}

export function parseFareSchemeJson(text: string, network: Network): FareValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: ['JSON \u8bed\u6cd5\u9519\u8bef\uff1a' + msg] };
  }
  return validateFareScheme(parsed, network);
}

export interface TicketPurchase {
  kind: 'single' | 'pass';
  name: string;
  passId?: string;
  price: number;
  purchaseTime: number;
  expiryTime: number;
  coveredSegments: number[];
}

export interface FareQuote {
  totalCost: number;
  ticketCount: number;
  tickets: TicketPurchase[];
  singleTotal: number;
  savings: number;
}

interface ActivePass {
  passIndex: number;
  expiry: number;
  ticketIndex: number;
}

interface State {
  segIndex: number;
  active: ActivePass[];
  cost: number;
  count: number;
  tickets: TicketPurchase[];
}

function stateKey(s: State): string {
  const act = s.active
    .map((a) => a.passIndex + ':' + a.expiry + ':' + a.ticketIndex)
    .sort()
    .join('|');
  return s.segIndex + '#' + act;
}

function better(a: { cost: number; count: number }, b: { cost: number; count: number }): number {
  return a.cost - b.cost || a.count - b.count;
}

export function computeFareQuote(segments: RideSegment[], scheme: FareScheme): FareQuote | null {
  const singleTotal = segments.reduce((sum, seg) => sum + (scheme.singleFares[seg.tripId] ?? 0), 0);
  if (segments.length === 0) {
    return { totalCost: 0, ticketCount: 0, tickets: [], singleTotal: 0, savings: 0 };
  }
  const passApplies = scheme.passes.map((p) => new Set(p.trips));

  const initial: State = { segIndex: 0, active: [], cost: 0, count: 0, tickets: [] };
  const best = new Map<string, State>();
  best.set(stateKey(initial), initial);
  const queue: State[] = [initial];
  let finalState: State | null = null;

  while (queue.length > 0) {
    let qi = 0;
    for (let i = 1; i < queue.length; i++) {
      if (better(queue[i], queue[qi]) < 0) qi = i;
    }
    const cur = queue.splice(qi, 1)[0];
    if (best.get(stateKey(cur)) !== cur) continue;
    if (cur.segIndex === segments.length) {
      if (!finalState || better(cur, finalState) < 0) finalState = cur;
      continue;
    }

    const seg = segments[cur.segIndex];
    const t = seg.boardDepart;
    const active = cur.active.filter((a) => a.expiry > t);
    const base: State = { ...cur, active };
    const push = (next: State) => {
      const key = stateKey(next);
      const existing = best.get(key);
      if (!existing || better(next, existing) < 0) {
        best.set(key, next);
        queue.push(next);
      }
    };

    const singlePrice = scheme.singleFares[seg.tripId];
    if (singlePrice !== undefined) {
      push({
        segIndex: cur.segIndex + 1,
        active,
        cost: base.cost + singlePrice,
        count: base.count + 1,
        tickets: base.tickets.concat({
          kind: 'single',
          name: '\u5355\u6b21\u7968\uff08' + seg.tripId + '\uff09',
          price: singlePrice,
          purchaseTime: t,
          expiryTime: t,
          coveredSegments: [cur.segIndex],
        }),
      });
    }

    active.forEach((a) => {
      if (!passApplies[a.passIndex].has(seg.tripId)) return;
      const tickets = base.tickets.map((tk, idx) =>
        idx === a.ticketIndex ? { ...tk, coveredSegments: tk.coveredSegments.concat(cur.segIndex) } : tk,
      );
      push({ segIndex: cur.segIndex + 1, active, cost: base.cost, count: base.count, tickets });
    });

    scheme.passes.forEach((p, pi) => {
      if (!passApplies[pi].has(seg.tripId)) return;
      const ticketIndex = base.tickets.length;
      push({
        segIndex: cur.segIndex + 1,
        active: active.concat({ passIndex: pi, expiry: t + p.validMinutes, ticketIndex }),
        cost: base.cost + p.price,
        count: base.count + 1,
        tickets: base.tickets.concat({
          kind: 'pass',
          passId: p.id,
          name: p.name,
          price: p.price,
          purchaseTime: t,
          expiryTime: t + p.validMinutes,
          coveredSegments: [cur.segIndex],
        }),
      });
    });
  }

  if (!finalState) return null;
  return {
    totalCost: finalState.cost,
    ticketCount: finalState.count,
    tickets: finalState.tickets,
    singleTotal,
    savings: singleTotal - finalState.cost,
  };
}

export function missingSingleFares(segments: RideSegment[], scheme: FareScheme): string[] {
  const missing = new Set<string>();
  for (const seg of segments) {
    if (scheme.singleFares[seg.tripId] === undefined) missing.add(seg.tripId);
  }
  return [...missing];
}

export function formatFen(fen: number): string {
  return (fen / 100).toFixed(2) + ' \u5143';
}
