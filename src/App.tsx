import { useEffect } from 'react';
import { Clipboard, Dices, Download, Redo2, Rotate3d, Undo2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { RandomLockActions } from './components/controls/FormControls';
import { SourcePanel } from './components/panels/SourcePanel';
import { MorphPanel } from './components/panels/MorphPanel';
import { ViewPanel } from './components/panels/ViewPanel';
import { ContoursPanel } from './components/panels/ContoursPanel';
import { OutputPanel } from './components/panels/OutputPanel';

export default function App() {
  useEffect(() => {
    globalThis.slicewiseParseSVG = async (...args) => {
      const { parseSVG } = await import('./lib/svg-mesh');
      return parseSVG(...args);
    };
    import('./lib/slicer');
    return () => {
      delete globalThis.slicewiseParseSVG;
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="rail">
        <header className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1>Slicewise</h1>
            <p>Mesh to contour studio</p>
          </div>
          <span className="version">01</span>
        </header>

        <div className="rail-scroll">
          <div className="intro">
            <p>Transform a 3D model into precise, plotter-ready contour lines.</p>
            <span>Local processing · SVG + G-code output</span>
          </div>

          <SourcePanel />
          <MorphPanel />
          <ViewPanel />
          <ContoursPanel />
          <OutputPanel />
        </div>

        <footer className="actions">
          <RandomLockActions />
          <div className="parameter-actions">
            <Button
              id="undo"
              variant="outline"
              className="history-button"
              disabled
              aria-label="Undo parameter change"
              title="Undo · Ctrl/⌘ Z"
            >
              <Undo2 size={14} />
              Undo
            </Button>
            <Button
              id="redo"
              variant="outline"
              className="history-button"
              disabled
              aria-label="Redo parameter change"
              title="Redo · Ctrl/⌘ Shift Z"
            >
              <Redo2 size={14} />
              Redo
            </Button>
            <Button id="randomize" variant="outline" className="randomize-button">
              <Dices size={15} />
              Randomize parameters
            </Button>
          </div>
          <div className="action-buttons">
            <Button id="save">
              <Download size={15} />
              <span id="exportLabel">Export SVG</span>
            </Button>
            <Button id="copy" variant="outline" aria-label="Copy SVG markup">
              <Clipboard size={15} />
            </Button>
          </div>
          <p>
            © 2026 Fredi Bach <span aria-hidden="true">·</span>{' '}
            <a href="https://github.com/FrediBach/slicewise" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </p>
        </footer>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="workspace-title">
            <span className="live-dot" />
            Preview <span>/ contour study</span>
          </div>
          <div className="readout">
            <span>
              Paths <b id="rPaths">0</b>
            </span>
            <span>
              Nodes <b id="rPts">0</b>
            </span>
            <span>
              File <b id="rSize">0 kB</b>
            </span>
            <span>
              Render <b id="rMs">0 ms</b>
            </span>
          </div>
        </header>
        <div className="bedwrap" id="bedwrap">
          <div className="canvas-grid" />
          <div className="canvas-label canvas-label--top" id="artboardDimensions">
            210 × 210 MM
          </div>
          <div className="canvas-label canvas-label--side">VECTOR PREVIEW</div>
          <div className="bed" id="bed" aria-label="Contour SVG preview" />
          <div className="orbit-hint">
            <Rotate3d size={14} />
            Drag to orbit <kbd>Shift</kbd> + drag to roll <kbd>Space</kbd> + drag to pan ·
            Double-click to fit
          </div>
          <div className="toast" id="toast" />
        </div>
      </main>
    </div>
  );
}
