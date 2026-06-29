import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 40,
            color: "#c43030",
            background: "#fcfaf7",
            minHeight: "100vh",
            fontFamily: "monospace",
          }}
        >
          <h2 style={{ marginBottom: 16, color: "#1a1a2e" }}>React Error Caught</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#4a4550" }}>
            {this.state.error?.message}
          </pre>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              marginTop: 16,
              color: "#8a8588",
              opacity: 0.8,
            }}
          >
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              background: "linear-gradient(135deg, #e24b4a, #c43030)",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            重试 Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
