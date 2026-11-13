import { Component, type ReactNode } from "react";

/** A render crash shows a reload card instead of a blank white page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("render crash:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-2xl border border-risk bg-paper p-5 text-sm">
          <p className="font-semibold text-risk">Something went wrong on this page.</p>
          <p className="mt-1 text-muted">Your payments and records are safe on the blockchain.</p>
          <button
            onClick={() => location.reload()}
            className="mt-4 h-12 w-full rounded-[14px] bg-gold font-bold text-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
