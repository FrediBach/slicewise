import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download } from 'lucide-react';
import { type AnimationExportSettings } from '../../lib/animation-project';
import { Button } from '../ui/button';
import { AnimationExportControls } from './AnimationExportControls';

type Props = {
  settings: AnimationExportSettings;
  durationMs: number;
  fps: number;
  disabled: boolean;
  supportKnown: boolean;
  supported: boolean;
  onOpen: () => void;
  onConfirm: () => void;
  onResolution: (longEdge: number) => void;
  onBitrate: (bitrate: number) => void;
};

function AnimationExportDialog({ onDismiss, ...props }: Props & { onDismiss: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="animation-export-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <h2 id={titleId}>Export video</h2>
      <p id={descriptionId}>
        Choose the quality for your WebM video. Your quality settings are remembered.
      </p>
      <AnimationExportControls
        settings={props.settings}
        durationMs={props.durationMs}
        disabled={props.disabled}
        onResolution={props.onResolution}
        onBitrate={props.onBitrate}
      />
      <p className="animation-export-summary">
        {props.durationMs / 1000} s · {props.fps} FPS · Silent WebM
      </p>
      <p className="animation-export-support" role="status">
        {!props.supportKnown
          ? 'Checking video encoder support…'
          : props.supported
            ? 'Ready to export. Higher quality can take longer and produce a larger file.'
            : 'Video export unavailable for these settings. Try a lower resolution or bitrate, or a browser with WebCodecs VP9/VP8 support.'}
      </p>
      <div className="animation-export-dialog-actions">
        <Button variant="outline" onClick={onDismiss}>
          Cancel
        </Button>
        <Button
          disabled={props.disabled || !props.supportKnown || !props.supported}
          onClick={() => {
            onDismiss();
            props.onConfirm();
          }}
        >
          <Download size={14} /> Start export
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}

export function AnimationExportAction(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="animation-export-button"
        aria-label="Export video"
        aria-haspopup="dialog"
        onClick={() => {
          props.onOpen();
          setOpen(true);
        }}
      >
        <Download size={14} /> Export video
      </button>
      {open && <AnimationExportDialog {...props} onDismiss={() => setOpen(false)} />}
    </>
  );
}
