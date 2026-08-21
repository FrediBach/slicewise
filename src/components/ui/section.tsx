import type { ReactNode } from "react";

type SectionProps = {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
};

export function Section({ title, badge, children }: SectionProps) {
  return (
    <section className="control-section">
      <div className="section-heading"><h2>{title}</h2>{badge ? <span>{badge}</span> : null}</div>
      {children}
    </section>
  );
}
