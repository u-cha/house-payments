// Порт времени (core-modules §8): use case зависит от Clock, а не от Date.now().
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = {
  now: () => new Date(),
};

export class FixedClock implements Clock {
  private instantMs: number;
  constructor(instant: Date | string | number = Date.now()) {
    this.instantMs = typeof instant === 'number' ? instant : new Date(instant).getTime();
  }
  now(): Date {
    return new Date(this.instantMs);
  }
  advance(milliseconds: number): void {
    this.instantMs += milliseconds;
  }
}
