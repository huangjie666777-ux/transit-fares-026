import type { NetworkInput } from './types';

export const sampleNetwork: NetworkInput = {
  stops: [
    { id: 'A', name: '中央公园', minTransferMinutes: 3 },
    { id: 'B', name: '人民广场', minTransferMinutes: 5 },
    { id: 'C', name: '火车站', minTransferMinutes: 4 },
    { id: 'D', name: '大学城', minTransferMinutes: 2 },
    { id: 'E', name: '机场', minTransferMinutes: 6 },
    { id: 'F', name: '滨江码头', minTransferMinutes: 3 },
  ],
  trips: [
    {
      id: 'T1',
      routeName: '1路 直达快线',
      stops: [
        { stopId: 'A', arrive: null, depart: 360 },
        { stopId: 'B', arrive: 380, depart: 385 },
        { stopId: 'C', arrive: 410, depart: null },
      ],
    },
    {
      id: 'T2',
      routeName: '2路 市区线',
      stops: [
        { stopId: 'A', arrive: null, depart: 480 },
        { stopId: 'B', arrive: 500, depart: 502 },
        { stopId: 'D', arrive: 530, depart: 532 },
        { stopId: 'E', arrive: 590, depart: null },
      ],
    },
    {
      id: 'T3',
      routeName: '3路 夜间线',
      stops: [
        { stopId: 'C', arrive: null, depart: 1380 },
        { stopId: 'B', arrive: 1410, depart: 1415 },
        { stopId: 'D', arrive: 1460, depart: null },
      ],
    },
    {
      id: 'T4',
      routeName: '4路 滨江线',
      stops: [
        { stopId: 'D', arrive: null, depart: 600 },
        { stopId: 'F', arrive: 630, depart: 632 },
        { stopId: 'E', arrive: 680, depart: null },
      ],
    },
    {
      id: 'T5',
      routeName: '5路 跨午夜线',
      stops: [
        { stopId: 'B', arrive: null, depart: 1400 },
        { stopId: 'C', arrive: 1450, depart: 1455 },
        { stopId: 'F', arrive: 1500, depart: null },
      ],
    },
  ],
};
