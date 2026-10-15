import type { Step } from '../../core/model';

export function DetailsPanel({ step, onClose }: { step: Step; onClose: () => void }) {
  return (
    <aside className="details" aria-label="Step details">
      <button onClick={onClose} style={{ float: 'right' }}>Close</button>
      <p className="kind">{step.kind}{step.isError ? ' · error' : ''}{step.laneId !== 'main' ? ` · helper ${step.laneId}` : ''}</p>
      <h3 style={{ marginTop: 4 }}>{step.tool?.name ?? step.label}</h3>
      {step.timestamp && <p>{new Date(step.timestamp).toLocaleString()}</p>}
      {step.tokens && <p>Tokens: {step.tokens.input} in · {step.tokens.output} out · {step.tokens.cacheRead} cached</p>}
      <h4>{step.tool ? 'Input' : 'Content'}</h4>
      <pre>{step.detail}</pre>
      {step.tool && (
        <>
          <h4>Result</h4>
          <pre>{step.tool.result ?? '(no result yet)'}</pre>
        </>
      )}
    </aside>
  );
}
