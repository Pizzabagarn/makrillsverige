type State = 'closed' | 'open' | 'half_open';

export class CircuitBreaker {
  private state: State = 'closed';
  private failures: number = 0;
  private lastOpenedAt: number = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly windowMs = 30_000,
    private readonly pauseMs = 60_000
  ) {}

  public canRequest(): boolean {
    const now = Date.now();
    if (this.state === 'open') {
      if (now - this.lastOpenedAt > this.pauseMs) {
        this.state = 'half_open';
        return true;
      }
      return false;
    }
    return true;
  }

  public recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  public recordFailure(): void {
    const now = Date.now();
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.lastOpenedAt = now;
    }
  }
}


