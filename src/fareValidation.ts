import type { FareScheme, FareSchemeInput, PassFare } from './types';
import type { Network } from './types';

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
    return { ok: false, errors: ['根节点必须是包含 singleFares 与 passes 的对象'] };
  }
  const root = input as FareSchemeInput;

  if (root.singleFares !== undefined && (typeof root.singleFares !== 'object' || root.singleFares === null || Array.isArray(root.singleFares))) {
    errors.push('singleFares: 必须是以班次ID为键、整数分票价为值的对象');
  }
  if (!Array.isArray(root.passes)) {
    errors.push('passes: 必须是数组');
  }
  if (errors.length > 0) return { ok: false, errors };

  const tripIds = new Set(network.trips.map((t) => t.id));
  const singleFares: Record<string, number> = {};
  const rawSingles = root.singleFares ?? {};
  for (const key of Object.keys(rawSingles)) {
    const value = (rawSingles as Record<string, unknown>)[key];
    if (!tripIds.has(key)) {
      errors.push(`singleFares.${key}: 未知班次ID`);
      continue;
    }
    if (!isInt(value)) {
      errors.push(`singleFares.${key}: 票价必须是非负整数分（数字）`);
    } else if (value < 0) {
      errors.push(`singleFares.${key}: 票价不能为负数`);
    } else {
      singleFares[key] = value;
    }
  }

  const passes: PassFare[] = [];
  const passIds = new Set<string>();
  (root.passes as unknown[]).forEach((raw, i) => {
    const base = `passes[${i}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`${base}: 联票必须是对象`);
      return;
    }
    const item = raw as Record<string, unknown>;
    let localOk = true;
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      errors.push(`${base}.id: 必须是非空字符串`);
      localOk = false;
    } else if (passIds.has(item.id)) {
      errors.push(`${base}.id: 联票ID "${item.id}" 重复`);
      localOk = false;
    } else {
      passIds.add(item.id);
    }
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      errors.push(`${base}.name: 必须是非空字符串`);
      localOk = false;
    }
    if (!isInt(item.price)) {
      errors.push(`${base}.price: 必须是非负整数分（数字）`);
      localOk = false;
    } else if (item.price < 0) {
      errors.push(`${base}.price: 不能为负数`);
      localOk = false;
    }
    if (!isInt(item.validMinutes)) {
      errors.push(`${base}.validMinutes: 必须是正整数分钟（数字）`);
      localOk = false;
    } else if (item.validMinutes <= 0) {
      errors.push(`${base}.validMinutes: 必须大于 0`);
      localOk = false;
    }
    if (!Array.isArray(item.applicableTripIds)) {
      errors.push(`${base}.applicableTripIds: 必须是班次ID数组`);
      localOk = false;
    } else {
      const list = item.applicableTripIds as unknown[];
      const seen = new Set<string>();
      list.forEach((tid, j) => {
        const p = `${base}.applicableTripIds[${j}]`;
        if (typeof tid !== 'string' || tid.trim() === '') {
          errors.push(`${p}: 班次ID必须是非空字符串`);
          localOk = false;
        } else if (!tripIds.has(tid)) {
          errors.push(`${p}: 未知班次ID "${tid}"`);
          localOk = false;
        } else if (seen.has(tid)) {
          errors.push(`${p}: 班次ID "${tid}" 在适用列表中重复`);
          localOk = false;
        } else {
          seen.add(tid);
        }
      });
    }
    if (localOk) {
      passes.push({
        id: item.id as string,
        name: item.name as string,
        price: item.price as number,
        validMinutes: item.validMinutes as number,
        applicableTripIds: [...(item.applicableTripIds as string[])].sort(),
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  passes.sort((a, b) => a.id.localeCompare(b.id));
  return { ok: true, scheme: { singleFares, passes } };
}

export function parseFareJson(text: string, network: Network): FareValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [`JSON 语法错误：${msg}`] };
  }
  return validateFareScheme(parsed, network);
}
