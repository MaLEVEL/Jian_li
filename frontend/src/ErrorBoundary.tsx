import { AlertTriangle } from "lucide-react";
import { Component, ReactNode } from "react";
import type { ErrorInfo } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("职启云帆 crashed while rendering", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary" role="alert">
          <div className="error-boundary__panel">
            <AlertTriangle size={28} />
            <h1>页面遇到异常</h1>
            <p>数据仍保存在当前浏览器。你可以刷新页面恢复；如果问题持续出现，先导出备份再清空本地数据。</p>
            <button className="primary-button" type="button" onClick={() => window.location.reload()}>
              刷新页面
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
