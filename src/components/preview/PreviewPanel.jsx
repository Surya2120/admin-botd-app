export function PreviewPanel({ title, children }) {
  return (
    <div className="preview-panel">
      <div className="preview-head">
        <h3>{title}</h3>
        <span className="preview-pill">Live Preview</span>
      </div>
      <div className="preview-body">{children}</div>
    </div>
  );
}
