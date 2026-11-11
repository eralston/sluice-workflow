// A render error anywhere in the UI (decided 2026-10-07) shows a recoverable panel instead of a blank
// window, and is logged (dev runs) by its error class and file:line stack only.
import { Component, type ReactNode } from 'react';
import { rlog } from '../devlog';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(e: unknown): void {
    const stack = e instanceof Error ? (e.stack ?? '').split('\n').slice(1, 6).map((l) => (/([\w.-]+\.[jt]sx?):(\d+)/.exec(l) ?? []).slice(1, 3).join(':')).filter(Boolean).join(' < ') : null;
    rlog('error', { level: 'render', errorClass: e instanceof Error ? e.name : typeof e, stack });
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1 className="cosmos__title">Something went wrong</h1>
        <p className="cosmos__line">The chart hit an unexpected error. Your data and settings are safe.</p>
        <button type="button" className="cosmos__cta" onClick={() => window.location.reload()}>Reload the chart</button>
      </div>
    );
  }
}
