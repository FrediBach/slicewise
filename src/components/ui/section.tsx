import { ChevronDown, Lock } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

type SectionProps = {
  title: string;
  description: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

function MorphIndicator() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 4h7m0 0L7 2m2 2L7 6M14 12H7m0 0 2-2m-2 2 2 2"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Section({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: SectionProps) {
  const sectionRef = useRef<HTMLDetailsElement>(null);
  const [activeControls, setActiveControls] = useState({ locks: 0, morphs: 0 });

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const update = () => {
      const locks = section.querySelectorAll('.random-lock[aria-pressed="true"]').length;
      const morphs = section.querySelectorAll('.morph-toggle[aria-pressed="true"]').length;
      setActiveControls((current) =>
        current.locks === locks && current.morphs === morphs ? current : { locks, morphs },
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(section, {
      attributes: true,
      attributeFilter: ['aria-pressed'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return (
    <details ref={sectionRef} className="control-section" open={defaultOpen}>
      <summary className="section-heading">
        <span className="section-heading-copy">
          <span className="section-heading-meta">
            <span className="section-title">{title}</span>
            {badge ? <span className="section-badge">{badge}</span> : null}
          </span>
          <span className="section-description">{description}</span>
        </span>
        <span className="section-heading-actions">
          {activeControls.locks > 0 ? (
            <span
              className="section-indicator section-indicator--lock"
              aria-label={`${activeControls.locks} locked ${activeControls.locks === 1 ? 'parameter' : 'parameters'} in this group`}
              title={`${activeControls.locks} randomization ${activeControls.locks === 1 ? 'lock' : 'locks'} set`}
            >
              <Lock size={11} aria-hidden="true" />
            </span>
          ) : null}
          {activeControls.morphs > 0 ? (
            <span
              className="section-indicator section-indicator--morph"
              aria-label={`${activeControls.morphs} active morph ${activeControls.morphs === 1 ? 'target' : 'targets'} in this group`}
              title={`${activeControls.morphs} morph ${activeControls.morphs === 1 ? 'target' : 'targets'} set`}
            >
              <MorphIndicator />
            </span>
          ) : null}
          <ChevronDown className="section-chevron" size={17} aria-hidden="true" />
        </span>
      </summary>
      <div className="section-content">{children}</div>
    </details>
  );
}
