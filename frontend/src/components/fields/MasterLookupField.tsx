import { useEffect, useMemo, useState } from 'react';
import { getMasterPlants, MasterPlant } from '../../api/masterData';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface MasterLookupValue {
  plant: string;
  plantCode: string;
  area: string;
  areaCode: string;
  unit: string;
}

// Ports the ReferenceLookup ("Master data lookup") field type: the whole Plant->Area->Unit tree is
// fetched once and cascaded client-side, same as the old app's embedded data-master JSON blob
// (just fetched over the network here instead of inlined into the page).
export function MasterLookupField({ value, onChange, disabled }: Props) {
  const [plants, setPlants] = useState<MasterPlant[]>([]);
  const parsed: Partial<MasterLookupValue> = useMemo(() => {
    if (!value) return {};
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }, [value]);

  useEffect(() => {
    getMasterPlants().then(setPlants);
  }, []);

  const plant = plants.find((p) => p.name === parsed.plant);
  const area = plant?.areas.find((a) => a.name === parsed.area);

  if (disabled) {
    if (!parsed.plant || !parsed.area || !parsed.unit) return <p className="text-muted small mb-0">No selection.</p>;
    return (
      <div className="row gy-1">
        <div className="col-3 eyebrow">Plant</div>
        <div className="col-9">
          {parsed.plant} ({parsed.plantCode})
        </div>
        <div className="col-3 eyebrow">Area</div>
        <div className="col-9">
          {parsed.area} ({parsed.areaCode})
        </div>
        <div className="col-3 eyebrow">Functional unit</div>
        <div className="col-9">{parsed.unit}</div>
      </div>
    );
  }

  function update(next: Partial<MasterLookupValue>) {
    const merged = { ...parsed, ...next };
    onChange(JSON.stringify(merged));
  }

  function selectPlant(name: string) {
    const p = plants.find((x) => x.name === name);
    if (!p) return onChange('');
    update({ plant: p.name, plantCode: p.code, area: undefined, areaCode: undefined, unit: undefined });
  }

  function selectArea(name: string) {
    const a = plant?.areas.find((x) => x.name === name);
    if (!a || !plant) return;
    update({ plant: plant.name, plantCode: plant.code, area: a.name, areaCode: a.code, unit: undefined });
  }

  function selectUnit(name: string) {
    if (!plant || !area) return;
    update({ plant: plant.name, plantCode: plant.code, area: area.name, areaCode: area.code, unit: name });
  }

  return (
    <div>
      <div className="row g-2">
        <div className="col-4">
          <label className="eyebrow d-block mb-1">Plant</label>
          <select className="form-select" value={parsed.plant ?? ''} onChange={(e) => selectPlant(e.target.value)}>
            <option value="">Select plant...</option>
            {plants.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-4">
          <label className="eyebrow d-block mb-1">Area</label>
          <select className="form-select" disabled={!plant} value={parsed.area ?? ''} onChange={(e) => selectArea(e.target.value)}>
            <option value="">Select area...</option>
            {plant?.areas.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-4">
          <label className="eyebrow d-block mb-1">Functional unit</label>
          <select className="form-select" disabled={!area} value={parsed.unit ?? ''} onChange={(e) => selectUnit(e.target.value)}>
            <option value="">Select unit...</option>
            {area?.units.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {parsed.plant && parsed.area && parsed.unit && (
        <div className="mt-3">
          <div className="eyebrow mb-2">Values saved to the form</div>
          <div className="row gy-1">
            <div className="col-3 eyebrow">Plant</div>
            <div className="col-9">
              {parsed.plant} ({parsed.plantCode})
            </div>
            <div className="col-3 eyebrow">Area</div>
            <div className="col-9">
              {parsed.area} ({parsed.areaCode})
            </div>
            <div className="col-3 eyebrow">Functional unit</div>
            <div className="col-9">{parsed.unit}</div>
          </div>
          <p className="hint mb-0">
            The code in parentheses (e.g. HDP-POL) is the master data system code — used for dashboard filtering,
            area-based permissions, and blocking deletion of a node that's still referenced.
          </p>
        </div>
      )}
    </div>
  );
}
