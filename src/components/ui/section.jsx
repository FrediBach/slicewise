export function Section({ title, badge, children }) {
  return (
    <section className="control-section">
      <div className="section-heading"><h2>{title}</h2>{badge ? <span>{badge}</span> : null}</div>
      {children}
    </section>
  );
}
