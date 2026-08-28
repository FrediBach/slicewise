import { Checkbox, ValueControl } from '../../controls/FormControls';

export function TileShuffleControls() {
  return (
    <>
      <Checkbox id="tileShuffle" randomizable>
        Tile shuffle
      </Checkbox>
      <div className="effect-controls">
        <ValueControl
          id="tileShuffleRows"
          label="Tile rows"
          min="2"
          max="8"
          step="1"
          value="4"
          disabled
          disabledReason="Turn on Tile shuffle to edit this parameter."
        />
        <ValueControl
          id="tileShuffleColumns"
          label="Tile columns"
          min="2"
          max="8"
          step="1"
          value="4"
          disabled
          disabledReason="Turn on Tile shuffle to edit this parameter."
        />
        <ValueControl
          id="tileShuffleExtent"
          label="Shuffle region extent"
          min="10"
          max="100"
          step="1"
          value="80"
          unit="%"
          disabled
          disabledReason="Turn on Tile shuffle to edit this parameter."
        />
        <ValueControl
          id="tileShuffleAffected"
          label="Affected tiles"
          min="5"
          max="100"
          step="1"
          value="50"
          unit="%"
          disabled
          disabledReason="Turn on Tile shuffle to edit this parameter."
        />
        <ValueControl
          id="tileShuffleSeed"
          label="Shuffle seed"
          min="0"
          max="9999"
          step="1"
          value="4"
          morphable={false}
          randomizable
          disabled
          disabledReason="Turn on Tile shuffle to edit this parameter."
        />
        <p className="gradient-note blueprint-note">
          Permutes selected equal-size cells inside a centred region without rasterizing paths.
        </p>
      </div>
    </>
  );
}
