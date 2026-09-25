import type { Network, NetworkInput, Stop, Trip, TripStop } from './types';

export interface ValidationSuccess {
  ok: true;
  network: Network;
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

export function validateNetwork(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['根节点必须是包含 stops 与 trips 的对象'] };
  }
  const root = input as Record<string, unknown>;
  if (!Array.isArray(root.stops)) {
    errors.push('stops 必须是数组');
  }
  if (!Array.isArray(root.trips)) {
    errors.push('trips 必须是数组');
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const rawStops = root.stops as unknown[];
  const rawTrips = root.trips as unknown[];
  const stopIds = new Set<string>();
  const stops: Stop[] = [];

  rawStops.forEach((raw, i) => {
    const base = `stops[${i}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`${base}: 站点必须是对象`);
      return;
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      errors.push(`${base}.id: 必须是非空字符串`);
    } else if (stopIds.has(item.id)) {
      errors.push(`${base}.id: 站点ID "${item.id}" 重复`);
    } else {
      stopIds.add(item.id);
    }
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      errors.push(`${base}.name: 必须是非空字符串`);
    }
    if (!isInt(item.minTransferMinutes)) {
      errors.push(`${base}.minTransferMinutes: 必须是整数分钟（数字）`);
    } else if (item.minTransferMinutes < 0) {
      errors.push(`${base}.minTransferMinutes: 不能为负数`);
    }
    if (typeof item.id === 'string' && typeof item.name === 'string' && isInt(item.minTransferMinutes) && item.minTransferMinutes >= 0) {
      stops.push({ id: item.id, name: item.name, minTransferMinutes: item.minTransferMinutes });
    }
  });

  const tripIds = new Set<string>();
  const trips: Trip[] = [];

  rawTrips.forEach((raw, i) => {
    const base = `trips[${i}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`${base}: 班次必须是对象`);
      return;
    }
    const item = raw as Record<string, unknown>;
    let idOk = false;
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      errors.push(`${base}.id: 必须是非空字符串`);
    } else if (tripIds.has(item.id)) {
      errors.push(`${base}.id: 班次ID "${item.id}" 重复`);
    } else {
      tripIds.add(item.id);
      idOk = true;
    }
    if (typeof item.routeName !== 'string' || item.routeName.trim() === '') {
      errors.push(`${base}.routeName: 必须是非空字符串`);
    }
    if (!Array.isArray(item.stops)) {
      errors.push(`${base}.stops: 必须是数组`);
      return;
    }
    const rawTripStops = item.stops as unknown[];
    if (rawTripStops.length < 2) {
      errors.push(`${base}.stops: 班次至少需要两个停站`);
    }
    const tripStops: TripStop[] = [];
    const seenInTrip = new Set<string>();
    let localOk = typeof item.routeName === 'string' && item.routeName.trim() !== '';

    rawTripStops.forEach((rs, j) => {
      const p = `${base}.stops[${j}]`;
      if (typeof rs !== 'object' || rs === null || Array.isArray(rs)) {
        errors.push(`${p}: 停站必须是对象`);
        localOk = false;
        return;
      }
      const st = rs as Record<string, unknown>;
      if (typeof st.stopId !== 'string' || st.stopId.trim() === '') {
        errors.push(`${p}.stopId: 必须是非空字符串`);
        localOk = false;
      } else if (!stopIds.has(st.stopId)) {
        errors.push(`${p}.stopId: 引用了未知站点 "${st.stopId}"`);
        localOk = false;
      } else if (seenInTrip.has(st.stopId)) {
        errors.push(`${p}.stopId: 站点 "${st.stopId}" 在该班次中重复出现`);
        localOk = false;
      } else {
        seenInTrip.add(st.stopId);
      }

      const isFirst = j === 0;
      const isLast = j === rawTripStops.length - 1;
      if (st.arrive === null || st.arrive === undefined) {
        if (!isFirst) errors.push(`${p}.arrive: 只有首站允许省略到达时刻`);
      } else if (!isInt(st.arrive)) {
        errors.push(`${p}.arrive: 必须是整数分钟或 null`);
        localOk = false;
      } else if (st.arrive < 0) {
        errors.push(`${p}.arrive: 不能为负数`);
        localOk = false;
      }
      if (st.depart === null || st.depart === undefined) {
        if (!isLast) errors.push(`${p}.depart: 只有末站允许省略发车时刻`);
      } else if (!isInt(st.depart)) {
        errors.push(`${p}.depart: 必须是整数分钟或 null`);
        localOk = false;
      } else if (st.depart < 0) {
        errors.push(`${p}.depart: 不能为负数`);
        localOk = false;
      }

      const arrive: number | null = isFirst
        ? (isInt(st.arrive) ? st.arrive : isInt(st.depart) ? st.depart : null)
        : isInt(st.arrive) ? st.arrive : null;
      const depart: number | null = isLast
        ? (isInt(st.depart) ? st.depart : isInt(st.arrive) ? st.arrive : null)
        : isInt(st.depart) ? st.depart : null;
      if (arrive !== null && depart !== null && depart < arrive) {
        errors.push(`${p}: 发车时刻（${depart}）早于到达时刻（${arrive}），时刻倒退`);
        localOk = false;
      }
      if (arrive !== null && depart !== null) {
        tripStops.push({ stopId: st.stopId as string, arrive, depart });
      } else {
        localOk = false;
      }
    });

    if (localOk && tripStops.length === rawTripStops.length && rawTripStops.length >= 2) {
      for (let j = 1; j < tripStops.length; j++) {
        const prev = tripStops[j - 1];
        const cur = tripStops[j];
        if (cur.arrive < prev.depart) {
          errors.push(`${base}.stops[${j}]: 到达时刻（${cur.arrive}）早于上一站发车时刻（${prev.depart}），时刻倒退`);
          localOk = false;
        } else if (cur.arrive === prev.depart) {
          errors.push(`${base}.stops[${j}]: 与上一站的行驶时间为 0，相邻停站行驶时间必须为正`);
          localOk = false;
        }
      }
    }
    if (idOk && localOk && tripStops.length === rawTripStops.length && rawTripStops.length >= 2) {
      trips.push({ id: item.id as string, routeName: item.routeName as string, stops: tripStops });
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, network: { stops, trips } };
}

export function parseNetworkJson(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [`JSON 语法错误：${msg}`] };
  }
  return validateNetwork(parsed);
}
