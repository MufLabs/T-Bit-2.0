export type AllocationRange = [number, number];

export type AllocationRegion = {
  clave: string;
  ranges: AllocationRange[];
};

export class AllocationMap {
  private regions = new Map<string, AllocationRange[]>();

  constructor(private readonly lowerBound: number, private readonly upperBound: number) {}

  load(regions: AllocationRegion[]): void {
    this.regions.clear();

    for (const region of regions) {
      this.regions.set(region.clave, region.ranges);
    }
  }

  canAllocate(clave: string, ranges: AllocationRange[]): boolean {
    for (const [existingKey, existingRanges] of this.regions) {
      if (existingKey === clave) {
        continue;
      }

      for (const candidate of ranges) {
        for (const existing of existingRanges) {
          if (this.overlaps(candidate, existing)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  allocate(clave: string, ranges: AllocationRange[]): void {
    this.regions.set(clave, ranges);
  }

  remove(clave: string): void {
    this.regions.delete(clave);
  }

  circularRanges(start: number, length: number): AllocationRange[] {
    const normalizedStart = this.normalize(start);
    const end = normalizedStart + length;

    if (end <= this.upperBound) {
      return [[normalizedStart, end]];
    }

    return [
      [normalizedStart, this.upperBound],
      [this.lowerBound, this.lowerBound + (end - this.upperBound)]
    ];
  }

  private normalize(offset: number): number {
    const size = this.upperBound - this.lowerBound;
    return this.lowerBound + ((offset - this.lowerBound) % size + size) % size;
  }

  private overlaps(left: AllocationRange, right: AllocationRange): boolean {
    return Math.max(left[0], right[0]) < Math.min(left[1], right[1]);
  }
}
