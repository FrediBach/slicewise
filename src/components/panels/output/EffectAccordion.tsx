import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export function EffectAccordion({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="effect-accordion">
      <summary>
        {title}
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="effect-accordion-content">{children}</div>
    </details>
  );
}
