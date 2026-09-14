import React from 'react';

export interface K8sInspectorEntry {
  id: string;
  name: string;
}

interface K8sResourceInspectorProps {
  entries: K8sInspectorEntry[];
  activeId: string;
  searchQuery: string;
  onActivate: (id: string) => void;
  onSearchChange: (value: string) => void;
  onClose: (id: string) => void;
  children: React.ReactNode;
}

/** Shared inspector chrome for all Kubernetes resource detail cards. */
export function K8sResourceInspector({
  entries,
  activeId,
  searchQuery,
  onActivate,
  onSearchChange,
  onClose,
  children,
}: K8sResourceInspectorProps) {
  return (
    <div className="k8s-inspector-shell">
      <div className="k8s-inspector-tabbar">
        <div className="k8s-inspector-tabs">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === activeId ? 'is-active' : ''}
              onClick={() => onActivate(entry.id)}
            >
              <span>{entry.name}</span>
              <b
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(entry.id);
                }}
                title="Close detail"
              >
                ×
              </b>
            </button>
          ))}
        </div>
        <div className="k8s-card-search-box">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search card details"
            aria-label="Search card details"
          />
          {searchQuery && (
            <button type="button" onClick={() => onSearchChange('')} aria-label="Clear card search">
              ×
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

interface K8sInspectorErrorBoundaryProps {
  children: React.ReactNode;
}

interface K8sInspectorErrorBoundaryState {
  error: Error | null;
}

export class K8sInspectorErrorBoundary extends React.Component<K8sInspectorErrorBoundaryProps, K8sInspectorErrorBoundaryState> {
  state: K8sInspectorErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): K8sInspectorErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div className="state-message error">Unable to render resource details: {this.state.error.message}</div>;
    }
    return this.props.children;
  }
}
