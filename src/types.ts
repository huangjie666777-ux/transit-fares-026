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

export interface FareSchemeInput {
  singleFares?: Record<string, number>;
  passes?: PassFareInput[];
}

export interface PassFareInput {
  id: string;
  name: string;
  price: number;
  validMinutes: number;
  applicableTripIds: string[];
}

export interface PassFare {
  id: string;
  name: string;
  price: number;
  validMinutes: number;
  applicableTripIds: string[];
}

export interface FareScheme {
  singleFares: Record<string, number>;
  passes: PassFare[];
}

export interface TicketQuote {
  kind: 'single' | 'pass';
  ticketId: string;
  name: string;
  price: number;
  purchaseMinute: number;
  expiryMinute: number;
  coveredSegmentIndexes: number[];
}

export interface FareQuote {
  feasible: boolean;
  tickets: TicketQuote[];
  totalPrice: number;
  ticketCount: number;
  singleTotal: number | null;
  missingSingleTripIds: string[];
  uncoveredTripIds: string[];
}
