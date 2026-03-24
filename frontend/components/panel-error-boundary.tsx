'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  panelName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`PanelErrorBoundary [${this.props.panelName}] caught:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center h-full w-full">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-error/10 border border-error/20">
            <AlertTriangle size={18} className="text-error" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {this.props.panelName} crashed
            </p>
            {this.state.error && (
              <p className="mt-1 text-xs text-text-tertiary font-mono max-w-md truncate">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-1 border border-border-default rounded-lg text-text-secondary hover:text-text-primary hover:border-border-focus cursor-pointer transition-colors"
          >
            <RotateCcw size={12} />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
