// The request scheduler (decided 2026-10-08): the work behind a scope, in priority order. Time to
// first look comes first; the rest of the view fills in after, then its context, then the idle extras.
// It's a tile-streaming queue: what the user is looking at rises, what they left falls back, and work
// not yet started is dropped when they move away. Started work always finishes (its cache writes are
// one transaction each, so everything done is durable). 04 §5b.

/** `look` blocks a transition; `fill` completes the view; `context` is its parent's other members; `idle` the extras. */
export type TaskClass = 'look' | 'fill' | 'context' | 'idle';
const CLASS_RANK: Record<TaskClass, number> = { look: 0, fill: 1, context: 2, idle: 3 };

export interface TaskSpec {
  /** One task per key: a second request for it joins the first (coalescing). */
  key: string;
  /** What the task serves (a pod, an item): focus ranks by it. */
  group: string;
  cls: TaskClass;
  run: (signal: AbortSignal) => Promise<void>;
}

interface Queued extends TaskSpec { seq: number; done: Promise<void>; resolve: () => void; reject: (e: unknown) => void }

/** Shared pause while ADO throttles (04 §6): the whole queue waits, not just the one request. */
export const throttleGate = { until: 0 };

export class Scheduler {
  private queue: Queued[] = [];
  private running = new Map<string, Queued>();
  private seq = 0;
  private rank: (t: TaskSpec) => number = () => 0;
  private idleWaiters: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly ac = new AbortController();

  constructor(private readonly opts: { concurrency?: number; now?: () => number; onError?: (key: string, e: unknown) => void } = {}) {}

  private get concurrency() { return this.opts.concurrency ?? 4; }
  private now() { return (this.opts.now ?? Date.now)(); }

  /** Queue a task, or join the one already queued or running under its key (raising its class if needed). */
  add(spec: TaskSpec): Promise<void> {
    const live = this.running.get(spec.key) ?? this.queue.find((q) => q.key === spec.key);
    if (live) {
      if (CLASS_RANK[spec.cls] < CLASS_RANK[live.cls]) live.cls = spec.cls;
      return live.done;
    }
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const done = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    done.catch(() => undefined); // a caller that doesn't wait still sees nothing unhandled
    this.queue.push({ ...spec, seq: this.seq++, done, resolve, reject });
    this.pump();
    return done;
  }

  /** Re-rank the queue: lower is sooner, within a class. Called when the view's focus moves. */
  focus(rank: (t: TaskSpec) => number): void {
    this.rank = rank;
    this.pump();
  }

  /** Drop tasks not yet started (their promises reject with `reason`). */
  cancel(pred: (t: TaskSpec) => boolean, reason: unknown = new Error('Cancelled')): number {
    const gone = this.queue.filter(pred);
    this.queue = this.queue.filter((q) => !pred(q));
    for (const q of gone) q.reject(reason);
    this.settle();
    return gone.length;
  }

  /** Stop: drop everything queued and abort what's running. */
  close(reason: unknown = new Error('Cancelled')): void {
    this.cancel(() => true, reason);
    this.ac.abort(reason);
  }

  /** Resolves when nothing is queued or running. */
  idle(): Promise<void> {
    if (!this.queue.length && !this.running.size) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  get pending(): number { return this.queue.length + this.running.size; }
  /** The queue in the order it would run, for tests and the dev log. */
  order(): string[] { return this.sorted().map((q) => q.key); }

  private sorted(): Queued[] {
    return [...this.queue].sort((a, b) => CLASS_RANK[a.cls] - CLASS_RANK[b.cls] || this.rank(a) - this.rank(b) || a.seq - b.seq);
  }

  private pump(): void {
    if (this.ac.signal.aborted) return;
    const wait = throttleGate.until - this.now();
    if (wait > 0) {
      if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.pump(); }, wait);
      return;
    }
    while (this.running.size < this.concurrency && this.queue.length) {
      const next = this.sorted()[0]!;
      // Idle work runs only when nothing else is waiting or running.
      if (next.cls === 'idle' && [...this.running.values()].some((r) => r.cls !== 'idle')) break;
      this.queue.splice(this.queue.indexOf(next), 1);
      this.running.set(next.key, next);
      void next.run(this.ac.signal).then(next.resolve, (e) => { this.opts.onError?.(next.key, e); next.reject(e); }).finally(() => {
        this.running.delete(next.key);
        this.pump();
        this.settle();
      });
    }
  }

  private settle(): void {
    if (this.queue.length || this.running.size) return;
    for (const w of this.idleWaiters.splice(0)) w();
  }
}
