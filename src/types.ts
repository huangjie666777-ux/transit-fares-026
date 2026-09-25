export interface StopInput {
  id: string;
  name: string;
  minTransferMinutes: number;
}

export interface TripStopInput {
  stopId: string;
  arrive: number | null;
  depart: number | null;
}

export interface TripInput {
  id: string;
  routeName: string;
  stops: TripStopInput[];
}

export interface NetworkInput {
  stops: StopInput[];
  trips: TripInput[];
}

export interface Stop {
  id: string;
  name: string;
  minTransferMinutes: number;
}

export interface TripStop {
  stopId: string;
  arrive: number;
  depart: number;
}

export interface Trip {
  id: string;
  routeName: string;
  stops: TripStop[];
}

export interface Network {
  stops: Stop[];
  trips: Trip[];
}

export interface RideSegment {
  tripId: string;
  routeName: string;
  boardStopId: string;
  alightStopId: string;
  boardDepart: number;
  alightArrive: number;
}

export interface JourneyResult {
  feasible: boolean;
  origin: string;
  destination: string;
  departureTime: number;
  arrivalTime: number | null;
  transfers: number;
  initialWait: number | null;
  segments: RideSegment[];
  transferWaits: { stopId: string; wait: number }[];
}
