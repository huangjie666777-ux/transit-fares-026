import type { FareQuote, FareScheme, RideSegment, TicketQuote } from './types';

interface ActivePass {
  passIndex: number;
  expiry: number;
}

interface DpState {
  total: number;
  count: number;
  passes: ActivePass[];
  tickets: TicketQuote[];
  actionCode: string;
}

function stateKey(passes: ActivePass[]): string {
  return JSON.stringify(passes);
}

function pruneExpired(passes: ActivePass[], boardTime: number): ActivePass[] {
  return passes.filter((p) => p.expiry > boardTime);
}

function addPass(passes: ActivePass[], next: ActivePass): ActivePass[] {
  const kept = passes.filter((p) => p.passIndex !== next.passIndex || p.expiry >= next.expiry);
  const result = kept.filter((p) => !(p.passIndex === next.passIndex && p.expiry < next.expiry));
  result.push(next);
  result.sort((a, b) => a.passIndex - b.passIndex || a.expiry - b.expiry);
  return result;
}

function better(a: DpState, b: DpState): boolean {
  if (a.total !== b.total) return a.total < b.total;
  if (a.count !== b.count) return a.count < b.count;
  return a.actionCode < b.actionCode;
}

export function quoteFare(segments: RideSegment[], scheme: FareScheme): FareQuote {
  if (segments.length === 0) {
    return {
      feasible: true,
      tickets: [],
      totalPrice: 0,
      ticketCount: 0,
      singleTotal: 0,
      missingSingleTripIds: [],
      uncoveredTripIds: [],
    };
  }

  const missingSingleTripIds = segments
    .map((s) => s.tripId)
    .filter((id, i, arr) => scheme.singleFares[id] === undefined && arr.indexOf(id) === i);
  let singleTotal = 0;
  for (const seg of segments) {
    const price = scheme.singleFares[seg.tripId];
    if (price === undefined) {
      singleTotal = -1;
      break;
    }
    singleTotal += price;
  }

  const applicability = scheme.passes.map((p) => new Set(p.applicableTripIds));
  let frontier = new Map<string, DpState>();
  frontier.set(stateKey([]), { total: 0, count: 0, passes: [], tickets: [], actionCode: '' });

  segments.forEach((seg, segIndex) => {
    const next = new Map<string, DpState>();
    const consider = (state: DpState) => {
      const key = stateKey(state.passes);
      const existing = next.get(key);
      if (!existing || better(state, existing)) next.set(key, state);
    };

    for (const state of frontier.values()) {
      const livePasses = pruneExpired(state.passes, seg.boardDepart);

      const singlePrice = scheme.singleFares[seg.tripId];
      if (singlePrice !== undefined) {
        const ticket: TicketQuote = {
          kind: 'single',
          ticketId: seg.tripId,
          name: `单次票 · ${seg.routeName}（${seg.tripId}）`,
          price: singlePrice,
          purchaseMinute: seg.boardDepart,
          expiryMinute: seg.boardDepart,
          coveredSegmentIndexes: [segIndex],
        };
        consider({
          total: state.total + singlePrice,
          count: state.count + 1,
          passes: livePasses,
          tickets: state.tickets.concat(ticket),
          actionCode: state.actionCode + (state.actionCode === '' ? '' : ',') + 'S',
        });
      }

      livePasses.forEach((active) => {
        if (!applicability[active.passIndex].has(seg.tripId)) return;
        const tickets = state.tickets.map((t) =>
          t.kind === 'pass' && t.ticketId === `${scheme.passes[active.passIndex].id}@${segIndex}`
            ? t
            : t,
        );
        const usedTickets = tickets.map((t) => {
          if (t.kind !== 'pass') return t;
          if (t.purchaseMinute !== findPurchase(state.tickets, scheme.passes[active.passIndex].id, active.expiry)) return t;
          if (t.coveredSegmentIndexes.includes(segIndex)) return t;
          return { ...t, coveredSegmentIndexes: t.coveredSegmentIndexes.concat(segIndex) };
        });
        consider({
          total: state.total,
          count: state.count,
          passes: livePasses,
          tickets: usedTickets,
          actionCode: state.actionCode + (state.actionCode === '' ? '' : ',') + `U${active.passIndex}`,
        });
      });

      scheme.passes.forEach((pass, pi) => {
        if (!applicability[pi].has(seg.tripId)) return;
        if (livePasses.some((p) => p.passIndex === pi)) return;
        const expiry = seg.boardDepart + pass.validMinutes;
        const ticket: TicketQuote = {
          kind: 'pass',
          ticketId: pass.id,
          name: pass.name,
          price: pass.price,
          purchaseMinute: seg.boardDepart,
          expiryMinute: expiry,
          coveredSegmentIndexes: [segIndex],
        };
        consider({
          total: state.total + pass.price,
          count: state.count + 1,
          passes: addPass(livePasses, { passIndex: pi, expiry }),
          tickets: state.tickets.concat(ticket),
          actionCode: state.actionCode + (state.actionCode === '' ? '' : ',') + `B${pi}`,
        });
      });
    }
    frontier = next;
  });

  const states = [...frontier.values()];
  if (states.length === 0) {
    const uncovered = segments
      .map((s) => s.tripId)
      .filter((id, i, arr) => arr.indexOf(id) === i && scheme.singleFares[id] === undefined);
    return {
      feasible: false,
      tickets: [],
      totalPrice: 0,
      ticketCount: 0,
      singleTotal: singleTotal === -1 ? null : singleTotal,
      missingSingleTripIds,
      uncoveredTripIds: uncovered,
    };
  }

  states.sort((a, b) => better(a, b) ? -1 : better(b, a) ? 1 : 0);
  const best = states[0];
  return {
    feasible: true,
    tickets: best.tickets,
    totalPrice: best.total,
    ticketCount: best.count,
    singleTotal: singleTotal === -1 ? null : singleTotal,
    missingSingleTripIds,
    uncoveredTripIds: [],
  };
}

function findPurchase(tickets: TicketQuote[], passId: string, expiry: number): number {
  for (const t of tickets) {
    if (t.kind === 'pass' && t.ticketId === passId && t.expiryMinute === expiry) return t.purchaseMinute;
  }
  return -1;
}
