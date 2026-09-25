import type { FareSchemeInput } from './types';

// 示例一：联票更省钱（A→E 行程 T2+T4，单买共 300+250=550 分，联票 400 分覆盖两次）
export const passCheaperFare: FareSchemeInput = {
  singleFares: { T1: 200, T2: 300, T3: 200, T4: 250, T5: 350 },
  passes: [
    {
      id: 'PASS_T2T4',
      name: '市区·滨江 90 分钟联票',
      price: 400,
      validMinutes: 90,
      applicableTripIds: ['T2', 'T4'],
    },
  ],
};

// 示例二：单次票更省钱（联票 600 分，高于两次单买 550 分）
export const singleCheaperFare: FareSchemeInput = {
  singleFares: { T1: 200, T2: 300, T3: 200, T4: 250, T5: 350 },
  passes: [
    {
      id: 'PASS_EXPENSIVE',
      name: '观光高价联票',
      price: 600,
      validMinutes: 90,
      applicableTripIds: ['T2', 'T4'],
    },
  ],
};
