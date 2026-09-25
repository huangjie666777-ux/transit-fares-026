import type { JourneyResult, Network, RideSegment } from './types';

interface WaitLabel {
  time: number;
  transfers: number;
  tripSeq: string[];
  path: PathItem[];
}

interface PathItem {
  kind: 'ride' | 'wait' | 'transfer';
  stopId?: string;
  fromTime?: number;
  toTime?: number;
  tripId?: string;
  routeName?: string;
  boardStopId?: string;
  alightStopId?: string;
  boardDepart?: number;
  alightArrive?: number;
  boardTransfers?: number;
}

interface OnboardLabel extends WaitLabel {
  boardIndex: number;
}

type QueueItem =
  | { kind: 'wait'; stop: string; time: number; label: WaitLabel }
  | { kind: 'on'; trip: number; index: number; label: OnboardLabel };

function dominates(a: WaitLabel, b: WaitLabel): boolean {
  if (a.time > b.time || a.transfers > b.transfers) return false;
  if (a.time < b.time || a.transfers < b.transfers) return true;
  const sa = a.tripSeq.join('\u0000');
  const sb = b.tripSeq.join('\u0000');
  return sa < sb;
}

export function planJourney(
  network: Network,
  originId: string,
  destinationId: string,
  departureTime: number,
  maxTransfers: number,
): JourneyResult {
  const noJourney = (): JourneyResult => ({
    feasible: false,
    origin: originId,
    destination: destinationId,
    departureTime,
    arrivalTime: null,
    transfers: 0,
    initialWait: null,
    segments: [],
    transferWaits: [],
  });

  if (!network.stops.some((s) => s.id === originId) || !network.stops.some((s) => s.id === destinationId)) {
    return noJourney();
  }
  if (originId === destinationId) {
    return {
      feasible: true,
      origin: originId,
      destination: destinationId,
      departureTime,
      arrivalTime: departureTime,
      transfers: 0,
      initialWait: 0,
      segments: [],
      transferWaits: [],
    };
  }

  const waitLabels = new Map<string, WaitLabel[]>();
  const onboardBest = new Map<string, OnboardLabel>();
  const queue: QueueItem[] = [];

  const originLabel: WaitLabel = { time: departureTime, transfers: 0, tripSeq: [], path: [] };
  waitLabels.set(originId, [originLabel]);
  queue.push({ kind: 'wait', stop: originId, time: departureTime, label: originLabel });

  const stopIndex = new Map(network.stops.map((s) => [s.id, s]));
  const candidates: WaitLabel[] = [];

  const tryWait = (stop: string, label: WaitLabel) => {
    const list = waitLabels.get(stop) ?? [];
    if (list.some((l) => dominates(l, label) || (l.time === label.time && l.transfers === label.transfers && l.tripSeq.join('\u0000') === label.tripSeq.join('\u0000') && l !== label))) {
      return;
    }
    const kept = list.filter((l) => !dominates(label, l));
    kept.push(label);
    kept.sort((a, b) => a.time - b.time || a.transfers - b.transfers || a.tripSeq.join('\u0000').localeCompare(b.tripSeq.join('\u0000')));
    waitLabels.set(stop, kept);
    queue.push({ kind: 'wait', stop, time: label.time, label });
  };

  while (queue.length > 0) {
    let qi = 0;
    for (let i = 1; i < queue.length; i++) {
      const itemTime = (x: QueueItem): number => (x.kind === 'wait' ? x.time : x.label.time);
      const ti = itemTime(queue[i]);
      const tq = itemTime(queue[qi]);
      if (ti < tq) qi = i;
    }
    const item = queue.splice(qi, 1)[0];

    if (item.kind === 'wait') {
      const { stop, label } = item;
      const alive = waitLabels.get(stop)?.includes(label) ?? false;
      if (!alive) continue;
      if (stop === destinationId) candidates.push(label);

      for (let ti = 0; ti < network.trips.length; ti++) {
        const trip = network.trips[ti];
        for (let j = 0; j < trip.stops.length; j++) {
          const ts = trip.stops[j];
          if (ts.stopId !== stop) continue;
          if (ts.depart < label.time) continue;
          const lastTrip = label.tripSeq[label.tripSeq.length - 1];
          let readyTime = label.time;
          let newTransfers = label.transfers;
          let path = label.path;
          if (lastTrip !== undefined) {
            if (lastTrip === trip.id) continue;
            const transferTime = stopIndex.get(stop)!.minTransferMinutes;
            readyTime = label.time + transferTime;
            if (ts.depart < readyTime) continue;
            newTransfers = label.transfers + 1;
            if (newTransfers > maxTransfers) continue;
            path = path.concat({
              kind: 'transfer',
              stopId: stop,
              fromTime: label.time,
              toTime: readyTime,
            });
          }
          const onboard: OnboardLabel = {
            time: ts.depart,
            transfers: newTransfers,
            tripSeq: label.tripSeq.concat(trip.id),
            path: path.concat({
              kind: 'ride',
              tripId: trip.id,
              routeName: trip.routeName,
              boardStopId: stop,
              boardDepart: ts.depart,
              boardTransfers: newTransfers,
            }),
            boardIndex: j,
          };
          const key = `${ti}:${j}`;
          const existing = onboardBest.get(key);
          if (!existing || dominates(onboard, existing)) {
            onboardBest.set(key, onboard);
            queue.push({ kind: 'on', trip: ti, index: j, label: onboard });
          }
        }
      }
    } else {
      const { trip: ti, index, label } = item;
      if (onboardBest.get(`${ti}:${index}`) !== label) continue;
      const trip = network.trips[ti];
      for (let k = index + 1; k < trip.stops.length; k++) {
        const ts = trip.stops[k];
        const alight: WaitLabel = {
          time: ts.arrive,
          transfers: label.transfers,
          tripSeq: label.tripSeq,
          path: label.path,
        };
        tryWait(ts.stopId, alight);
      }
    }
  }

  if (candidates.length === 0) return noJourney();
  candidates.sort((a, b) => a.time - b.time || a.transfers - b.transfers || a.tripSeq.join('\u0000').localeCompare(b.tripSeq.join('\u0000')));
  const best = candidates[0];

  const segments: RideSegment[] = [];
  let current: PathItem | null = null;
  for (const p of best.path) {
    if (p.kind === 'ride') {
      current = { ...p };
    } else if (p.kind === 'transfer' && current) {
      current.alightStopId = p.stopId;
      current.alightArrive = p.fromTime;
      segments.push({
        tripId: current.tripId!,
        routeName: current.routeName!,
        boardStopId: current.boardStopId!,
        alightStopId: current.alightStopId!,
        boardDepart: current.boardDepart!,
        alightArrive: current.alightArrive!,
      });
      current = null;
    }
  }
  if (current) {
    segments.push({
      tripId: current.tripId!,
      routeName: current.routeName!,
      boardStopId: current.boardStopId!,
      alightStopId: destinationId,
      boardDepart: current.boardDepart!,
      alightArrive: best.time,
    });
  }

  const transferWaits = segments.slice(1).map((seg, i) => ({
    stopId: seg.boardStopId,
    wait: seg.boardDepart - segments[i].alightArrive,
  }));
  const initialWait = segments.length > 0 ? segments[0].boardDepart - departureTime : 0;
  return {
    feasible: true,
    origin: originId,
    destination: destinationId,
    departureTime,
    arrivalTime: best.time,
    transfers: best.transfers,
    initialWait,
    segments,
    transferWaits,
  };
}
