import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

type SectionProps = {
  title: string;
  description: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function Section({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: SectionProps) {
  return (
    <details className="control-section" open={defaultOpen}>
      <summary className="section-heading">
        <span className="section-heading-copy">
          <span className="section-heading-meta">
            <span className="section-title">{title}</span>
            {badge ? <span className="section-badge">{badge}</span> : null}
          </span>
          <span className="section-description">{description}</span>
        </span>
        <ChevronDown className="section-chevron" size={17} aria-hidden="true" />
      </summary>
      <div className="section-content">{children}</div>
    </details>
  );
}
