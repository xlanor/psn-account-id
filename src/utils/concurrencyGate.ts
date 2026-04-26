export class ConcurrencyGate {
  private activeCount = 0;

  constructor(private readonly maxConcurrent: number) {}

  tryAcquire(): boolean {
    if (this.activeCount >= this.maxConcurrent) {
      return false;
    }

    this.activeCount += 1;
    return true;
  }

  release(): void {
    if (this.activeCount > 0) {
      this.activeCount -= 1;
    }
  }
}

