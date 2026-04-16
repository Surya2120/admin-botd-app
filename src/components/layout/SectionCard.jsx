export function SectionCard({ title, subtitle, actions, children }) {
  return (
    <section className="section-card">
      <div className="section-card-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        <div className="section-actions">{actions}</div>
      </div>
      {children}
    </section>
  );
}
