'use client';

import * as React from 'react';
import Link from 'next/link';
import { Layers, MapPinOff, Pin, ShieldAlert, BarChart3 } from 'lucide-react';

import { SectionCard } from '@/components/data-display/detail-list';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
import { GeoMap, type GeoMarker } from '@/components/maps/geo-map';
import { ExportButton } from '@/components/shared/export-button';
import { ListPage } from '@/components/shared/page-shell';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { hasMapboxToken } from '@/config/app';
import { OPERATIONAL_STATUS_LABELS, OPERATIONAL_STATUS_OPTIONS } from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type LayerId =
  | 'mines'
  | 'inspections'
  | 'safety'
  | 'environment'
  | 'violations'
  | 'corrective-actions'
  | 'risk';

interface LayerDefinition {
  id: LayerId;
  label: string;
  description: string;
  color: string;
}

const LAYERS: LayerDefinition[] = [
  {
    id: 'mines',
    label: 'Mines',
    description: 'Registered mine locations and operational status.',
    color: 'bg-copper-500',
  },
  {
    id: 'inspections',
    label: 'Inspections',
    description: 'Inspections with a recorded position.',
    color: 'bg-sage-500',
  },
  {
    id: 'safety',
    label: 'Safety records',
    description: 'Observations and hazards with a recorded position.',
    color: 'bg-amber-500',
  },
  {
    id: 'environment',
    label: 'Environmental samples',
    description: 'Monitoring readings with a recorded sampling position.',
    color: 'bg-primary',
  },
  {
    id: 'violations',
    label: 'Open violations',
    description: 'Unresolved compliance violations.',
    color: 'bg-destructive',
  },
  {
    id: 'corrective-actions',
    label: 'Corrective actions',
    description: 'Open and overdue remediation actions.',
    color: 'bg-warning',
  },
  {
    id: 'risk',
    label: 'Risk heatmap',
    description: 'Per-mine risk score based on open violations, actions, and critical incidents.',
    color: 'bg-destructive/20',
  },
];

interface MineMapMarker {
  id: string;
  code: string;
  name: string;
  subsidiaryId: string;
  subsidiaryName?: string;
  region: string;
  district: string;
  state: string;
  operationalStatus: string;
  location?: { lat: number; lng: number; accuracyM?: number; source?: string; capturedAt?: string };
}

interface MineSummary {
  id: string;
  code: string;
  name: string;
  subsidiaryId: string;
  subsidiaryName?: string;
  region: string;
  district: string;
  state: string;
  operationalStatus: string;
  approvedCapacityTPA?: number;
  commissionedOn?: string;
  location?: { lat: number; lng: number; accuracyM?: number; source?: string; capturedAt?: string };
  openViolations: Array<{
    id: string; code: string; severity: string; category: string; status: string; dueDate?: string; sourceCode?: string;
  }>;
  openCorrectiveActions: Array<{
    id: string; code: string; priority: string; status: string; dueDate?: string; sourceCode?: string;
  }>;
  latestIncidents: Array<{
    id: string; code: string; title: string; severity: string; status: string; occurredAt?: string;
  }>;
  latestInspections: Array<{
    id: string; code: string; type: string; status: string; scheduledDate?: string;
  }>;
}

interface MapViolation {
  id: string;
  code: string;
  mineId: string;
  mineName: string;
  mineCode: string;
  severity: string;
  category: string;
  status: string;
  dueDate?: string;
  raisedAt?: string;
  sourceCode?: string;
  location?: { lat: number; lng: number };
}

interface MapCorrectiveAction {
  id: string;
  code: string;
  mineId: string;
  mineName: string;
  mineCode: string;
  priority: string;
  status: string;
  dueDate?: string;
  description: string;
  sourceCode?: string;
  location?: { lat: number; lng: number };
}

interface MapRiskSummary {
  id: string;
  code: string;
  name: string;
  region: string;
  location?: { lat: number; lng: number };
  openViolations: number;
  openActions: number;
  criticalIncidents: number;
  riskScore: number;
}

const RISK_LEVELS = [
  { min: 0, max: 4, label: 'Low', color: 'bg-sage-500' },
  { min: 5, max: 9, label: 'Moderate', color: 'bg-amber-500' },
  { min: 10, max: 100, label: 'High', color: 'bg-warning' },
  { min: 101, max: 9999, label: 'Critical', color: 'bg-destructive' },
];

function riskLevel(score: number) {
  const found = RISK_LEVELS.find((level) => score >= level.min && score <= level.max);
  return found ?? RISK_LEVELS[RISK_LEVELS.length - 1]!;
}

export default function MapPage() {
  const services = useServices();
  const [region, setRegion] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [mineId, setMineId] = React.useState('all');
  const [severity, setSeverity] = React.useState('all');
  const [activeLayers, setActiveLayers] = React.useState<Record<LayerId, boolean>>({
    mines: true,
    inspections: true,
    safety: true,
    environment: false,
    violations: false,
    'corrective-actions': false,
    risk: false,
  });
  const [selectedMarker, setSelectedMarker] = React.useState<GeoMarker | null>(null);
  const [mineSummary, setMineSummary] = React.useState<MineSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(false);

  const minesQuery = useApiQuery(['map', 'mines'], () =>
    services.map.mines({ pageSize: 500, filters: { region, operationalStatus: status === 'all' ? undefined : status } }),
  );
  const inspectionsQuery = useApiQuery(['map', 'inspections'], () =>
    services.inspections.list({ pageSize: 500 }),
  );
  const safetyQuery = useApiQuery(['map', 'safety'], () =>
    services.safety.observations({ pageSize: 500 }),
  );
  const environmentQuery = useApiQuery(['map', 'environment'], () =>
    services.environment.measurements({ pageSize: 500 }),
  );
  const violationsQuery = useApiQuery(['map', 'violations'], () =>
    services.map.violations({ pageSize: 500, filters: { severity: severity === 'all' ? undefined : severity } }),
  );
  const correctiveActionsQuery = useApiQuery(['map', 'corrective-actions'], () =>
    services.map.correctiveActions({ pageSize: 500 }),
  );
  const riskSummaryQuery = useApiQuery(['map', 'risk-summary'], () => services.map.riskSummary());

  const mines = React.useMemo(() => minesQuery.data?.items ?? [], [minesQuery.data]);
  const inspections = React.useMemo(
    () => inspectionsQuery.data?.items ?? [],
    [inspectionsQuery.data],
  );
  const safetyRecords = React.useMemo(() => safetyQuery.data?.items ?? [], [safetyQuery.data]);
  const measurements = React.useMemo(
    () => environmentQuery.data?.items ?? [],
    [environmentQuery.data],
  );
  const violations = React.useMemo(() => violationsQuery.data?.items ?? [], [violationsQuery.data]);
  const correctiveActions = React.useMemo(
    () => correctiveActionsQuery.data?.items ?? [],
    [correctiveActionsQuery.data],
  );
  const riskSummaries = React.useMemo(() => riskSummaryQuery.data ?? [], [riskSummaryQuery.data]);

  const mineNameById = React.useMemo(
    () => new Map(mines.map((mine) => [mine.id, mine.name])),
    [mines],
  );

  const regions = React.useMemo(
    () => Array.from(new Set(mines.map((mine) => mine.region))).sort(),
    [mines],
  );

  const filteredMines = React.useMemo(
    () =>
      mines.filter((mine) => {
        if (region !== 'all' && mine.region !== region) return false;
        if (status !== 'all' && mine.operationalStatus !== status) return false;
        if (mineId !== 'all' && mine.id !== mineId) return false;
        return true;
      }),
    [mines, region, status, mineId],
  );

  const allowedMineIds = React.useMemo(
    () => new Set(filteredMines.map((mine) => mine.id)),
    [filteredMines],
  );

  const scopeIsUnfiltered = region === 'all' && status === 'all' && mineId === 'all';

  const scopedInspections = React.useMemo(
    () =>
      scopeIsUnfiltered
        ? inspections
        : inspections.filter((inspection) => allowedMineIds.has(inspection.mineId)),
    [allowedMineIds, inspections, scopeIsUnfiltered],
  );

  const scopedSafety = React.useMemo(
    () =>
      scopeIsUnfiltered
        ? safetyRecords
        : safetyRecords.filter((record) => allowedMineIds.has(record.mineId)),
    [allowedMineIds, safetyRecords, scopeIsUnfiltered],
  );

  const scopedMeasurements = React.useMemo(
    () =>
      scopeIsUnfiltered
        ? measurements
        : measurements.filter((measurement) => allowedMineIds.has(measurement.mineId)),
    [allowedMineIds, measurements, scopeIsUnfiltered],
  );

  const scopedViolations = React.useMemo(
    () =>
      scopeIsUnfiltered
        ? violations
        : violations.filter((v) => allowedMineIds.has(v.mineId)),
    [allowedMineIds, violations, scopeIsUnfiltered],
  );

  const scopedCorrectiveActions = React.useMemo(
    () =>
      scopeIsUnfiltered
        ? correctiveActions
        : correctiveActions.filter((a) => allowedMineIds.has(a.mineId)),
    [allowedMineIds, correctiveActions, scopeIsUnfiltered],
  );

  const scopedRisk = React.useMemo(
    () =>
      scopeIsUnfiltered
        ? riskSummaries
        : riskSummaries.filter((r) => allowedMineIds.has(r.id)),
    [allowedMineIds, riskSummaries, scopeIsUnfiltered],
  );

  const markers = React.useMemo<GeoMarker[]>(() => {
    const result: GeoMarker[] = [];

    if (activeLayers.mines) {
      for (const mine of filteredMines) {
        if (!mine.location) continue;
        result.push({
          id: `mine-${mine.id}`,
          label: mine.name,
          lat: mine.location.lat,
          lng: mine.location.lng,
          kind: 'Mine',
          colorCategory: 'mine',
          status: mine.operationalStatus,
          detail: `${mine.code} / ${OPERATIONAL_STATUS_LABELS[mine.operationalStatus as keyof typeof OPERATIONAL_STATUS_LABELS] ?? mine.operationalStatus}`,
          href: `/mines/${mine.id}`,
        });
      }
    }

    if (activeLayers.inspections) {
      for (const inspection of scopedInspections) {
        if (!inspection.location) continue;
        result.push({
          id: `inspection-${inspection.id}`,
          label: inspection.code,
          lat: inspection.location.lat,
          lng: inspection.location.lng,
          kind: 'Inspection',
          colorCategory: 'inspection',
          detail: `${mineNameById.get(inspection.mineId) ?? inspection.mineId} / ${inspection.status}`,
          href: `/inspections/${inspection.id}`,
        });
      }
    }

    if (activeLayers.safety) {
      for (const record of scopedSafety) {
        if (!record.location) continue;
        result.push({
          id: `safety-${record.id}`,
          label: record.code,
          lat: record.location.lat,
          lng: record.location.lng,
          kind: 'Safety record',
          colorCategory: 'safety',
          severity: record.severity,
          detail: `${record.title} / ${mineNameById.get(record.mineId) ?? record.mineId}`,
          href: `/safety/${record.id}`,
        });
      }
    }

    if (activeLayers.environment) {
      for (const measurement of scopedMeasurements) {
        if (!measurement.location) continue;
        result.push({
          id: `environment-${measurement.id}`,
          label: `${measurement.indicator} ${measurement.value} ${measurement.unit}`,
          lat: measurement.location.lat,
          lng: measurement.location.lng,
          kind: 'Environmental sample',
          colorCategory: 'environment',
          detail: `${mineNameById.get(measurement.mineId) ?? measurement.mineId} / ${formatDateTime(measurement.measuredAt)}`,
          href: '/environment',
        });
      }
    }

    if (activeLayers.violations) {
      for (const violation of scopedViolations) {
        if (!violation.location) continue;
        result.push({
          id: `violation-${violation.id}`,
          label: violation.code,
          lat: violation.location.lat,
          lng: violation.location.lng,
          kind: 'Violation',
          colorCategory: 'violation',
          severity: violation.severity as 'low' | 'medium' | 'high' | 'critical',
          detail: `${violation.mineName} / ${violation.category} / ${violation.status}`,
          href: `/compliance`,
        });
      }
    }

    if (activeLayers['corrective-actions']) {
      for (const action of scopedCorrectiveActions) {
        if (!action.location) continue;
        result.push({
          id: `action-${action.id}`,
          label: action.code,
          lat: action.location.lat,
          lng: action.location.lng,
          kind: 'Corrective action',
          colorCategory: 'corrective-action',
          detail: `${action.mineName} / ${action.status}`,
          href: `/corrective-actions/${action.id}`,
        });
      }
    }

    if (activeLayers.risk) {
      for (const risk of scopedRisk) {
        if (!risk.location) continue;
        const level = riskLevel(risk.riskScore);
        result.push({
          id: `risk-${risk.id}`,
          label: `${risk.code} — ${risk.name}`,
          lat: risk.location.lat,
          lng: risk.location.lng,
          kind: 'Risk zone',
          colorCategory: 'mine',
          detail: `${level.label} risk (score ${risk.riskScore}) — ${risk.openViolations} open violations, ${risk.openActions} open actions`,
          href: `/mines/${risk.id}`,
        });
      }
    }

    return result;
  }, [
    activeLayers,
    filteredMines,
    mineNameById,
    scopedInspections,
    scopedMeasurements,
    scopedSafety,
    scopedViolations,
    scopedCorrectiveActions,
    scopedRisk,
  ]);

  const withoutCoordinates = React.useMemo(() => {
    const missing: { id: string; label: string; href: string; kind: string }[] = [];
    for (const mine of filteredMines) {
      if (!mine.location) {
        missing.push({
          id: `mine-${mine.id}`,
          label: mine.name,
          href: `/mines/${mine.id}`,
          kind: 'Mine',
        });
      }
    }
    return missing;
  }, [filteredMines]);

  const loading =
    minesQuery.isLoading ||
    inspectionsQuery.isLoading ||
    safetyQuery.isLoading ||
    environmentQuery.isLoading ||
    violationsQuery.isLoading ||
    correctiveActionsQuery.isLoading ||
    riskSummaryQuery.isLoading;
  const error =
    minesQuery.error ??
    inspectionsQuery.error ??
    safetyQuery.error ??
    environmentQuery.error ??
    violationsQuery.error ??
    correctiveActionsQuery.error ??
    riskSummaryQuery.error;

  const layerCounts: Record<LayerId, number> = {
    mines: activeLayers.mines ? filteredMines.filter((mine) => mine.location).length : 0,
    inspections: activeLayers.inspections
      ? scopedInspections.filter((inspection) => inspection.location).length
      : 0,
    safety: activeLayers.safety
      ? scopedSafety.filter((record) => record.location).length
      : 0,
    environment: activeLayers.environment
      ? scopedMeasurements.filter((measurement) => measurement.location).length
      : 0,
    violations: activeLayers.violations
      ? scopedViolations.filter((v) => v.location).length
      : 0,
    'corrective-actions': activeLayers['corrective-actions']
      ? scopedCorrectiveActions.filter((a) => a.location).length
      : 0,
    risk: activeLayers.risk ? scopedRisk.filter((r) => r.location).length : 0,
  };

  const selectedMineId = selectedMarker?.id?.replace(/^mine-/, '') ?? null;

  const handleMarkerSelect = React.useCallback((marker: GeoMarker) => {
    setSelectedMarker(marker);
    if (marker.id.startsWith('mine-')) {
      const id = marker.id.replace(/^mine-/, '');
      setSummaryLoading(true);
      services.map
        .getMineSummary(id)
        .then((summary) => {
          setMineSummary(summary);
          setSummaryLoading(false);
        })
        .catch(() => {
          setMineSummary(null);
          setSummaryLoading(false);
        });
    } else {
      setMineSummary(null);
      setSummaryLoading(false);
    }
  }, [services.map]);

  const handleClose = React.useCallback(() => {
    setSelectedMarker(null);
    setMineSummary(null);
  }, []);

  return (
    <ListPage
      title="GIS map"
      description="Spatial view of mine locations and records that carry a captured position. Coordinates are shown exactly as stored - the interface never interpolates or invents a location."
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={hasMapboxToken ? 'success' : 'warning'}>
            {hasMapboxToken ? 'Map enabled' : 'Map fallback'}
          </Badge>
          <Badge variant="outline">{markers.length} located records</Badge>
        </div>
      }
      headerActions={
        <ExportButton
          rows={markers}
          fileName="coalguard-map-markers"
          columns={[
            { key: 'kind', label: 'Record type', value: (row) => row.kind ?? '' },
            { key: 'label', label: 'Record', value: (row) => row.label },
            { key: 'lat', label: 'Latitude', value: (row) => row.lat },
            { key: 'lng', label: 'Longitude', value: (row) => row.lng },
            { key: 'detail', label: 'Detail', value: (row) => row.detail ?? '' },
          ]}
        />
      }
      toolbar={
        <FilterBar
          onReset={() => {
            setRegion('all');
            setStatus('all');
            setMineId('all');
            setSeverity('all');
            setActiveLayers({
              mines: true,
              inspections: true,
              safety: true,
              environment: false,
              violations: false,
              'corrective-actions': false,
              risk: false,
            });
          }}
          resultCount={{
            from: markers.length === 0 ? 0 : 1,
            to: markers.length,
            total: markers.length,
          }}
        >
          <FilterSelect
            label="Region"
            value={region}
            onValueChange={setRegion}
            options={regions.map((entry) => ({ value: entry, label: entry }))}
            allLabel="All regions"
          />
          <FilterSelect
            label="Mine"
            value={mineId}
            onValueChange={setMineId}
            options={mines.map((mine) => ({ value: mine.id, label: mine.name }))}
            allLabel="All mines"
          />
          <FilterSelect
            label="Operational status"
            value={status}
            onValueChange={setStatus}
            options={OPERATIONAL_STATUS_OPTIONS}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Severity"
            value={severity}
            onValueChange={setSeverity}
            options={[
              { value: 'all', label: 'All severities' },
              { value: 'critical', label: 'Critical' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
            allLabel="All severities"
          />
        </FilterBar>
      }
    >
      <ProvenanceNote tone="neutral" label="Location provenance">
        Each marker is a record with a stored location. A filter that hides a mine also hides the records that
        belong to it. Risk scores are computed from open violations (×3), open corrective actions (×2), and
        critical incidents (×5). When the map renderer is unavailable, the same data is presented as an
        accessible table — no map is simulated.
      </ProvenanceNote>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <SectionCard title="Layers" description="Choose which record types appear on the map.">
          <ul className="space-y-2">
            {LAYERS.map((layer) => (
              <li key={layer.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border/70 p-2 hover:bg-accent/40">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-primary"
                    checked={activeLayers[layer.id]}
                    onChange={(event) =>
                      setActiveLayers((previous) => ({
                        ...previous,
                        [layer.id]: event.target.checked,
                      }))
                    }
                  />
                  <span className="min-w-0">
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {layer.label}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {layerCounts[layer.id]}
                      </span>
                    </span>
                    <span className="block text-xs text-muted-foreground">{layer.description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Layer counts include only records with a stored position.
          </p>
        </SectionCard>

        <SectionCard
          title="Record locations"
          description={
            error
              ? 'Some record layers could not be loaded. The map shows only the layers that resolved.'
              : undefined
          }
          actions={
            error ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void minesQuery.refetch();
                  void inspectionsQuery.refetch();
                  void safetyQuery.refetch();
                  void environmentQuery.refetch();
                  void violationsQuery.refetch();
                  void correctiveActionsQuery.refetch();
                  void riskSummaryQuery.refetch();
                }}
              >
                Retry layers
              </Button>
            ) : undefined
          }
        >
          {error && (
            <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              {error.message}
            </p>
          )}
          <GeoMap
            markers={markers}
            height={460}
            selectedId={selectedMarker?.id ?? null}
            onSelect={handleMarkerSelect}
            emptyMessage="No record with a stored position matches the current filters and layers."
          />
          {loading && <p className="mt-2 text-xs text-muted-foreground">Loading record layers...</p>}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Located records"
          description="The same markers, listed for keyboard and screen-reader access."
        >
          {markers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No located records match the current selection.
            </p>
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Located records with coordinates</caption>
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Record
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Type
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Coordinates
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {markers.map((marker) => (
                    <tr
                      key={marker.id}
                      className={`border-b border-border/60 last:border-0 ${selectedMarker?.id === marker.id ? 'bg-accent/30' : ''}`}
                    >
                      <td className="py-2 pr-3">
                        {marker.href ? (
                          <Link
                            href={marker.href}
                            className="underline-offset-2 hover:underline"
                            onClick={() => handleMarkerSelect(marker)}
                          >
                            {marker.label}
                          </Link>
                        ) : (
                          <span
                            onClick={() => handleMarkerSelect(marker)}
                            className="cursor-pointer underline-offset-2 hover:underline"
                          >
                            {marker.label}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{marker.kind}</td>
                      <td className="py-2 text-xs tabular-nums">
                        {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Records without a recorded position"
          description="These records exist but cannot be placed on a map. The platform does not guess coordinates for them."
        >
          {withoutCoordinates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every record in the selected layers has a stored position.
            </p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-auto text-sm">
              {withoutCoordinates.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={entry.href}
                    className="min-w-0 truncate underline-offset-2 hover:underline"
                    onClick={() => handleMarkerSelect({ id: entry.id, label: entry.label, lat: 0, lng: 0, kind: entry.kind })}
                  >
                    {entry.label}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{entry.kind}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Capture a position from the record screen where the workflow allows it.
          </p>
        </SectionCard>
      </div>

      {/* Mine details panel */}
      {selectedMarker && mineSummary && (
        <div className="fixed inset-0 z-50 flex items-end" aria-label="Mine details panel">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />
          <div
            className="w-full max-w-md bg-card border border-border rounded-t-2xl shadow-2xl flex flex-col animate-in duration-200 slide-in-from-bottom"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <CardTitle className="text-base">{mineSummary.name}</CardTitle>
              <Button variant="ghost" size="icon-sm" onClick={handleClose}>
                <Pin className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Code</CardTitle>
                  <p className="text-sm font-medium">{mineSummary.code}</p>
                </div>
                <div>
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Status</CardTitle>
                  <Badge
                    variant={
                      mineSummary.operationalStatus === 'operational'
                        ? 'success'
                        : mineSummary.operationalStatus === 'partial'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {mineSummary.operationalStatus}
                  </Badge>
                </div>
                <div>
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Region</CardTitle>
                  <p className="text-sm">{mineSummary.region}</p>
                </div>
                <div>
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">District / State</CardTitle>
                  <p className="text-sm">
                    {mineSummary.district}, {mineSummary.state}
                  </p>
                </div>
              </div>

              {mineSummary.location && (
                <div className="mb-4 rounded-md border border-border/70 bg-muted/40 p-3">
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Location</CardTitle>
                  <p className="text-sm tabular-nums">
                    {mineSummary.location.lat.toFixed(5)}, {mineSummary.location.lng.toFixed(5)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Source: {mineSummary.location.source ?? 'not recorded'}
                  </p>
                </div>
              )}

              <div className="mb-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Open violations</CardTitle>
                {mineSummary.openViolations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-1">
                    {mineSummary.openViolations.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{v.code}</span>
                        <Badge variant="outline" className="shrink-0">{v.severity}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mb-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Corrective actions</CardTitle>
                {mineSummary.openCorrectiveActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-1">
                    {mineSummary.openCorrectiveActions.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{a.code}</span>
                        <Badge variant="outline" className="shrink-0">{a.priority}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid gap-2">
                {mineSummary.latestIncidents.length > 0 && (
                  <div className="col-span-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Latest incidents</CardTitle>
                    <ul className="space-y-1">
                      {mineSummary.latestIncidents.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{i.code}</span>
                          <span className="text-muted-foreground">{i.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {mineSummary.latestInspections.length > 0 && (
                  <div className="col-span-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Latest inspections</CardTitle>
                    <ul className="space-y-1">
                      {mineSummary.latestInspections.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{i.code}</span>
                          <span className="text-muted-foreground">{i.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-border/60 flex items-center gap-2">
                <Link
                  href={`/mines/${mineSummary.id}`}
                  className="text-sm font-medium text-copper-600 underline-offset-2 hover:underline"
                >
                  View mine record <ShieldAlert className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </ListPage>
  );
}
