const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// Период YYYY-MM (C-03, ADR-0002); лексикографический порядок = хронологический.
export class Period {
  private constructor(private readonly raw: string) {}
  static parse(value: string): Period {
    if (!PERIOD_RE.test(value)) {
      throw new RangeError(`Invalid period "${value}": expected YYYY-MM`);
    }
    return new Period(value);
  }

  next(): Period {
    return this.shift(1);
  }

  previous(): Period {
    return this.shift(-1);
  }
  compare(other: Period): number {
    if (this.raw === other.raw) return 0;
    return this.raw < other.raw ? -1 : 1;
  }
  equals(other: Period): boolean {
    return this.compare(other) === 0;
  }
  toString(): string {
    return this.raw;
  }
  private shift(months: number): Period {
    const [year, month] = this.raw.split('-').map(Number) as [number, number];
    const index = year * 12 + month - 1 + months;
    const nextYear = Math.floor(index / 12);
    if (nextYear < 0 || nextYear > 9999) {
      throw new RangeError('Period is out of the supported year range');
    }
    const nextMonth = String((index % 12) + 1).padStart(2, '0');
    return Period.parse(`${String(nextYear).padStart(4, '0')}-${nextMonth}`);
  }
}
