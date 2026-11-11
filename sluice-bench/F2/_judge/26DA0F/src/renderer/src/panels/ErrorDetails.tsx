// Understanding a failure (decided 2026-10-07): any error message can expand to its network details.
// That's the HTTP status and what it means, the endpoint, ADO's code and message, throttling, and
// attempts. Inside those, the literal response. Native disclosures, so the keyboard works.
import { classify, type NetError } from '@shared/contracts/neterror';

const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${ms} ms`);

export function ErrorDetails({ net }: { net: NetError }) {
  const c = classify(net);
  const rows: [string, string][] = [
    ['Status', net.status === 0 ? 'No response' : String(net.status)],
    ['Request', `${net.method} ${net.endpoint}`],
    ['Kind of call', net.family],
    ...(net.code ? [['ADO code', net.code] as [string, string]] : []),
    ...(net.message ? [['ADO says', net.message] as [string, string]] : []),
    ['Attempts', net.attempts > 1 ? `${net.attempts} (waited ${secs(net.waitedMs)} between retries)` : '1'],
    ...(net.retryAfter ? [['Retry-After', `${net.retryAfter} s`] as [string, string]] : []),
    ...(net.rateLimit ? [['Rate limit', Object.entries(net.rateLimit).map(([k, v]) => `${k} ${v}`).join(' · ')] as [string, string]] : []),
    ['When', new Date(net.at).toLocaleTimeString()],
  ];
  return (
    <details className="error-details">
      <summary>Details <span className="error-details__label">{c.label}</span></summary>
      <p className="error-details__meaning">{c.meaning}</p>
      <p className="error-details__advice">{c.advice}</p>
      <dl className="error-details__rows">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === 'Request' ? 'mono' : undefined}>{v}</dd></div>)}
      </dl>
      <details className="error-details__response">
        <summary>Response</summary>
        <pre>{net.body || '(empty)'}</pre>
      </details>
    </details>
  );
}
