import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Check, Lock, LockOpen } from "lucide-react";
import { Button } from "../ui/button";

type CustomDetail = Record<string, any>;

type RandomLockProps = { id: string; label: string };
type ValueControlProps = {
  id: string;
  label: string;
  min: string | number;
  max: string | number;
  step: string | number;
  value: string | number;
  unit?: string;
  disabled?: boolean;
  morphable?: boolean;
  randomizable?: boolean;
};

function MorphIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h7m0 0L7 2m2 2L7 6M14 12H7m0 0 2-2m-2 2 2 2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RandomLock({ id, label }: RandomLockProps) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const update = (event: CustomEvent<CustomDetail>) => {
      const locks = event.detail?.locks;
      const next = Array.isArray(locks) ? locks.includes(id) : Boolean(event.detail?.locked);
      setLocked(next);
      document.dispatchEvent(new CustomEvent("randomlockchange", { detail: { id, locked: next, source: "bulk" } }));
    };
    document.addEventListener("randomlockbulk", update);
    return () => document.removeEventListener("randomlockbulk", update);
  }, [id]);
  const toggle = () => {
    const next = !locked;
    setLocked(next);
    document.dispatchEvent(new CustomEvent("randomlockchange", { detail: { id, locked: next, source: "individual" } }));
  };
  return (
    <button type="button" className="random-lock" data-random-lock-id={id} aria-pressed={locked}
      aria-label={`${locked ? "Unlock" : "Lock"} ${label} randomization`}
      title={locked ? "Include in randomization" : "Exclude from randomization"} onClick={toggle}>
      {locked ? <Lock size={11} /> : <LockOpen size={11} />}
    </button>
  );
}

function RandomLockActions() {
  const [temporaryMode, setTemporaryMode] = useState<"lock" | "unlock" | null>(null);
  const previousLocks = useRef<string[]>([]);

  useEffect(() => {
    const individualChange = (event: CustomEvent<CustomDetail>) => {
      if (event.detail?.source !== "individual") return;
      previousLocks.current = [];
      setTemporaryMode(null);
    };
    document.addEventListener("randomlockchange", individualChange);
    return () => document.removeEventListener("randomlockchange", individualChange);
  }, []);

  const apply = (mode: "lock" | "unlock") => {
    if (temporaryMode === mode) {
      document.dispatchEvent(new CustomEvent("randomlockbulk", { detail: { locks: previousLocks.current } }));
      previousLocks.current = [];
      setTemporaryMode(null);
      return;
    }
    if (!temporaryMode) {
      previousLocks.current = Array.from(document.querySelectorAll<HTMLButtonElement>(".random-lock[aria-pressed=true]"), button => button.dataset.randomLockId || "");
    }
    document.dispatchEvent(new CustomEvent("randomlockbulk", { detail: { locked: mode === "lock" } }));
    setTemporaryMode(mode);
  };

  return (
    <div className="lock-actions" aria-label="Bulk randomization locks">
      <Button type="button" variant="outline" className={`bulk-lock-button${temporaryMode === "lock" ? " active" : ""}`}
        aria-pressed={temporaryMode === "lock"} title={temporaryMode === "lock" ? "Restore previous locks" : "Temporarily lock every randomizable value"}
        onClick={() => apply("lock")}><Lock size={12} />{temporaryMode === "lock" ? "Restore locks" : "Lock all"}</Button>
      <Button type="button" variant="outline" className={`bulk-lock-button${temporaryMode === "unlock" ? " active" : ""}`}
        aria-pressed={temporaryMode === "unlock"} title={temporaryMode === "unlock" ? "Restore previous locks" : "Temporarily unlock every randomizable value"}
        onClick={() => apply("unlock")}><LockOpen size={12} />{temporaryMode === "unlock" ? "Restore locks" : "Unlock all"}</Button>
    </div>
  );
}

function ValueControl({ id, label, min, max, step, value, unit, disabled = false, morphable = true, randomizable = morphable }: ValueControlProps) {
  const [morphMode, setMorphMode] = useState(0);
  const [morphValue, setMorphValue] = useState(Number(value));
  const [morphValueY, setMorphValueY] = useState(Number(value));
  const announceMorph = (dimension: number, active: boolean, nextValue: string | number) => {
    document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension, active, value: Number(nextValue) } }));
  };
  const toggleMorph = () => {
    const secondEnabled = Boolean((document.getElementById("morphSecondEnabled") as HTMLInputElement | null)?.checked);
    const nextMode = (morphMode + 1) % (secondEnabled ? 3 : 2);
    const mainValue = Number((document.getElementById(id) as HTMLInputElement | null)?.value ?? value);
    if (nextMode === 1 && morphMode === 0) {
      setMorphValue(mainValue);
      announceMorph(1, true, mainValue);
    } else if (nextMode === 2) {
      setMorphValueY(mainValue);
      announceMorph(2, true, mainValue);
    } else if (nextMode === 0) {
      announceMorph(1, false, morphValue);
      announceMorph(2, false, morphValueY);
    }
    setMorphMode(nextMode);
  };
  const changeMorphValue = (dimension: number, next: string | number) => {
    const parsed = Math.min(Number(max), Math.max(Number(min), Number(next)));
    if (!Number.isFinite(parsed)) return;
    if (dimension === 1) setMorphValue(parsed);
    else setMorphValueY(parsed);
    announceMorph(dimension, true, parsed);
  };

  useEffect(() => {
    const update = (event: CustomEvent<CustomDetail>) => {
      const dimension = event.detail?.dimension || 1;
      if (event.detail?.id !== id || morphMode < dimension) return;
      const parsed = Math.min(Number(max), Math.max(Number(min), Number(event.detail.value)));
      if (!Number.isFinite(parsed)) return;
      if (dimension === 1) setMorphValue(parsed);
      else setMorphValueY(parsed);
      document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension, active: true, value: parsed } }));
    };
    document.addEventListener("randomizemorph", update);
    const secondDimension = (event: CustomEvent<CustomDetail>) => {
      if (event.detail?.enabled || morphMode < 2) return;
      setMorphMode(1);
      document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension: 2, active: false, value: morphValueY } }));
    };
    document.addEventListener("morphseconddimension", secondDimension);
    const restore = (event: CustomEvent<CustomDetail>) => {
      if (!morphable) return;
      const targetsX = event.detail?.morphTargetsById || {};
      const targetsY = event.detail?.morphTargets2ById || {};
      const hasX = Object.hasOwn(targetsX, id);
      const hasY = Object.hasOwn(targetsY, id);
      setMorphMode(hasY ? 2 : hasX ? 1 : 0);
      if (hasX) setMorphValue(targetsX[id]);
      if (hasY) setMorphValueY(targetsY[id]);
    };
    document.addEventListener("restoreparameters", restore);
    return () => {
      document.removeEventListener("randomizemorph", update);
      document.removeEventListener("morphseconddimension", secondDimension);
      document.removeEventListener("restoreparameters", restore);
    };
  }, [id, max, min, morphMode, morphValueY, morphable]);

  const morphInputs = (dimension: number, targetValue: number) => (
    <div className="control-inputs morph-inputs" data-dimension={dimension}>
      <span className="morph-axis" aria-hidden="true">{dimension === 1 ? "X" : "Y"}</span>
      <input type="range" id={`${id}Morph${dimension}`} min={min} max={max} step={step} value={targetValue}
        aria-label={`${label} morph ${dimension === 1 ? "X" : "Y"} target`} onChange={event => changeMorphValue(dimension, event.target.value)} />
      <span className={`value-field${unit ? " has-unit" : ""}`}>
        <input type="number" id={`${id}Morph${dimension}N`} min={min} max={max} step={step} value={targetValue}
          aria-label={`${label} morph ${dimension === 1 ? "X" : "Y"} target${unit ? ` in ${unit}` : ""}`} onChange={event => changeMorphValue(dimension, event.target.value)} />
        <span className="unit" aria-hidden="true">{unit || ""}</span>
      </span>
    </div>
  );

  return (
    <div className={`control-row${disabled ? " is-disabled" : ""}${morphMode ? " is-morphing" : ""}`} id={`${id}Control`}>
      <div className="control-label">
        <label htmlFor={id}>{label}</label>
        {morphable && <button type="button" className="morph-toggle" aria-pressed={morphMode > 0} data-morph-dimension={morphMode}
          aria-label={`${label} morph mode: ${morphMode === 0 ? "none" : morphMode === 1 ? "X only" : "X and Y"}`} title="Cycle morph mode: none, X, X + Y"
          onClick={toggleMorph}><MorphIcon /></button>}
        {randomizable && <RandomLock id={id} label={label} />}
      </div>
      <div className="control-stack">
        <div className="control-inputs">
          <input type="range" id={id} min={min} max={max} step={step} defaultValue={value} disabled={disabled} />
          <span className={`value-field${unit ? " has-unit" : ""}`}>
            <input type="number" id={`${id}N`} min={min} max={max} step={step} defaultValue={value} disabled={disabled}
              aria-label={`${label}${unit ? ` in ${unit}` : ""}`} />
            <span className="unit" aria-hidden="true">{unit || ""}</span>
          </span>
        </div>
        {morphMode >= 1 && morphInputs(1, morphValue)}
        {morphMode >= 2 && morphInputs(2, morphValueY)}
      </div>
    </div>
  );
}

type ColorControlProps = RandomLockProps & { defaultValue: string; swatchId: string; morphable?: boolean };

function ColorControl({ id, label, defaultValue, swatchId, morphable = true }: ColorControlProps) {
  const [morphMode, setMorphMode] = useState(0);
  const [target, setTarget] = useState(defaultValue);
  const [targetText, setTargetText] = useState(defaultValue);
  const [targetY, setTargetY] = useState(defaultValue);
  const [targetTextY, setTargetTextY] = useState(defaultValue);
  const announce = (dimension: number, active: boolean, value: string) => {
    document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension, active, value } }));
  };
  const toggle = () => {
    const secondEnabled = Boolean((document.getElementById("morphSecondEnabled") as HTMLInputElement | null)?.checked);
    const nextMode = (morphMode + 1) % (secondEnabled ? 3 : 2);
    const main = (document.getElementById(id) as HTMLInputElement | null)?.value || defaultValue;
    if (nextMode === 1 && morphMode === 0) {
      setTarget(main);
      setTargetText(main);
      announce(1, true, main);
    } else if (nextMode === 2) {
      setTargetY(main);
      setTargetTextY(main);
      announce(2, true, main);
    } else if (nextMode === 0) {
      announce(1, false, target);
      announce(2, false, targetY);
    }
    setMorphMode(nextMode);
  };
  const setValidTarget = (dimension: number, value: string) => {
    const valid = /^#[0-9a-f]{6}$/i.test(value);
    if (!valid) return;
    if (dimension === 1) setTarget(value);
    else setTargetY(value);
    announce(dimension, true, value);
  };

  useEffect(() => {
    const update = (event: CustomEvent<CustomDetail>) => {
      const dimension = event.detail?.dimension || 1;
      if (event.detail?.id !== id || morphMode < dimension) return;
      const value = event.detail.value;
      if (dimension === 1) { setTarget(value); setTargetText(value); }
      else { setTargetY(value); setTargetTextY(value); }
      document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension, active: true, value } }));
    };
    document.addEventListener("randomizemorph", update);
    const secondDimension = (event: CustomEvent<CustomDetail>) => {
      if (event.detail?.enabled || morphMode < 2) return;
      setMorphMode(1);
      document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension: 2, active: false, value: targetY } }));
    };
    document.addEventListener("morphseconddimension", secondDimension);
    const restore = (event: CustomEvent<CustomDetail>) => {
      if (!morphable) return;
      const targetsX = event.detail?.morphTargetsById || {};
      const targetsY = event.detail?.morphTargets2ById || {};
      const hasX = Object.hasOwn(targetsX, id);
      const hasY = Object.hasOwn(targetsY, id);
      setMorphMode(hasY ? 2 : hasX ? 1 : 0);
      if (hasX) {
        setTarget(targetsX[id]);
        setTargetText(targetsX[id]);
      }
      if (hasY) {
        setTargetY(targetsY[id]);
        setTargetTextY(targetsY[id]);
      }
    };
    document.addEventListener("restoreparameters", restore);
    return () => {
      document.removeEventListener("randomizemorph", update);
      document.removeEventListener("morphseconddimension", secondDimension);
      document.removeEventListener("restoreparameters", restore);
    };
  }, [id, morphMode, morphable, targetY]);

  const colorTarget = (dimension: number, value: string, text: string, setText: Dispatch<SetStateAction<string>>) => (
    <div className="color-control morph-color-control" data-dimension={dimension}>
      <span className="morph-axis" aria-hidden="true">{dimension === 1 ? "X" : "Y"}</span>
      <span className="swatch" style={{ background: value }}><input type="color" id={`${id}Morph${dimension}`} value={value}
        aria-label={`${label} morph ${dimension === 1 ? "X" : "Y"} target`} onChange={event => { setText(event.target.value); setValidTarget(dimension, event.target.value); }} /></span>
      <input type="text" id={`${id}Morph${dimension}Hex`} value={text} spellCheck="false" aria-label={`${label} morph ${dimension === 1 ? "X" : "Y"} target hex value`}
        onChange={event => { setText(event.target.value); setValidTarget(dimension, event.target.value); }} />
    </div>
  );

  return (
    <div className={`control-row color-row${morphMode ? " is-morphing" : ""}`} id={`${id}Control`}>
      <div className="control-label">
        <label htmlFor={`${id}Hex`}>{label}</label>
        {morphable && <button type="button" className="morph-toggle" aria-pressed={morphMode > 0} data-morph-dimension={morphMode}
          aria-label={`${label} morph mode: ${morphMode === 0 ? "none" : morphMode === 1 ? "X only" : "X and Y"}`}
          title="Cycle morph mode: none, X, X + Y" onClick={toggle}><MorphIcon /></button>}
        <RandomLock id={id} label={label} />
      </div>
      <div className="control-stack">
        <div className="color-control">
          <span className="swatch" id={swatchId} style={{ background: defaultValue }}><input type="color" id={id} defaultValue={defaultValue} /></span>
          <input type="text" id={`${id}Hex`} defaultValue={defaultValue} spellCheck="false" />
        </div>
        {morphable && morphMode >= 1 && colorTarget(1, target, targetText, setTargetText)}
        {morphable && morphMode >= 2 && colorTarget(2, targetY, targetTextY, setTargetTextY)}
      </div>
    </div>
  );
}

function InkColorControl() {
  return <ColorControl id="color" label="Ink colour" defaultValue="#15181a" swatchId="swatch" />;
}

function BackgroundColorControl() {
  return <ColorControl id="backgroundColor" label="Background colour" defaultValue="#ffffff" swatchId="backgroundSwatch" morphable={false} />;
}

function FieldGroup({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`field-group ${className}`}>
      <div className="field-group-title"><span>{title}</span></div>
      <div className="field-group-body">{children}</div>
    </div>
  );
}

function Checkbox({ id, children, defaultChecked = false, randomizable = false }: { id: string; children: ReactNode; defaultChecked?: boolean; randomizable?: boolean }) {
  return (
    <div className="checkbox-control">
      <label className="checkbox-row">
        <input type="checkbox" id={id} defaultChecked={defaultChecked} />
        <span className="checkbox-box"><Check size={11} strokeWidth={3} /></span>
        <span>{children}</span>
      </label>
      {randomizable && <RandomLock id={id} label={String(children)} />}
    </div>
  );
}

export {
  BackgroundColorControl,
  Checkbox,
  FieldGroup,
  InkColorControl,
  RandomLock,
  RandomLockActions,
  ValueControl,
};

