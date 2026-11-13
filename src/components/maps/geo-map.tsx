'use client';

import * as React from 'react';
import { Layers, MapPin, AlertTriangle, Pin } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { appConfig, hasMapboxToken } from '@/config/app';
import { cn } from '@/lib/utils';
import type { GeoPoint } from '@/types';

export interface GeoMarker {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind?: string;
  detail?: string;
  href?: string;
  /** Marker colour category for styling. */
  colorCategory?: 'mine' | 'inspection' | 'safety' | 'environment' | 'violation' | 'corrective-action';
  /** Operational status for status-based styling. */
  status?: string;
  /** Severity for risk-based styling. */
  severity?: 'low' | 'medium' | 'high' | 'critical';
  /** Selected state for visual highlight. */
  selected?: boolean;
}

/** Marker colour categories mapped to the CoalGuard palette. */
const MARKER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  mine: { bg: 'bg-copper-500', text: 'text-graphite-950', border: 'border-white/30' },
  inspection: { bg: 'bg-sage-500', text: 'text-ash-50', border: 'border-white/30' },
  safety: { bg: 'bg-amber-500', text: 'text-graphite-950', border: 'border-white/30' },
  environment: { bg: 'bg-primary', text: 'text-primary-foreground', border: 'border-white/30' },
  violation: { bg: 'bg-destructive', text: 'text-destructive-foreground', border: 'border-white/30' },
  'corrective-action': { bg: 'bg-warning', text: 'text-warning-foreground', border: 'border-white/30' },
};

/** Status-based fill for mine markers. */
const STATUS_COLORS: Record<string, string> = {
  operational: 'bg-sage-500',
  partial: 'bg-amber-500',
  suspended: 'bg-warning',
  decommissioned: 'bg-muted',
};

export interface GeoMapProps {
  markers: GeoMarker[];
  height?: number;
  emptyMessage?: string;
  /** Called when a marker is activated. */
  onSelect?: (marker: GeoMarker) => void;
  /** Currently selected marker id. */
  selectedId?: string | null;
  className?: string;
}

/**
 * Spatial view of the supplied markers.
 *
 * Mapbox GL is used when a public token is configured. When no token is
 * configured the component renders an explicit, accessible table fallback —
 * it never pretends to display a map.
 */
export function GeoMap({
  markers,
  height = 420,
  emptyMessage = 'No records with a recorded location match the current filters.',
  onSelect,
  selectedId,
  className,
}: GeoMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<{
    remove: () => void;
    addMarker: (marker: GeoMarker) => void;
    fit: () => void;
    selectMarker: (id: string) => void;
  } | null>(null);
  const [mapError, setMapError] = React.useState<string | null>(null);
  const [mapReady, setMapReady] = React.useState(false);

  React.useEffect(() => {
    if (!hasMapboxToken || markers.length === 0) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = appConfig.mapboxToken;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: appConfig.mapboxStyle,
          center: [markers[0]?.lng ?? 78.9629, markers[0]?.lat ?? 22.5937],
          zoom: 6,
          attributionControl: true,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        // Simple grid-based clustering: group markers within 40px at current zoom.
        const CLUSTER_DISTANCE = 40;
        const clusters = new Map<string, GeoMarker[]>();
        const markerElements = new Map<string, mapboxgl.Marker>();

        const addMarker = (marker: GeoMarker) => {
          const element = document.createElement('button');
          element.type = 'button';
          element.className = markerButtonClass(marker, selectedId === marker.id);
          element.textContent = marker.label.slice(0, 2).toUpperCase();
          element.setAttribute(
            'aria-label',
            `${marker.label} — ${marker.kind ?? 'record'}${selectedId === marker.id ? ', selected' : ''}`,
          );
          element.addEventListener('click', () => {
            onSelect?.(marker);
            mapRef.current?.selectMarker(marker.id);
          });
          const popup = new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
            popupHtml(marker),
          );
          const mbMarker = new mapboxgl.Marker({ element })
            .setLngLat([marker.lng, marker.lat])
            .setPopup(popup)
            .addTo(map);
          markerElements.set(marker.id, mbMarker);
        };

        for (const marker of markers) {
          addMarker(marker);
        }

        const bounds = new mapboxgl.LngLatBounds();
        for (const marker of markers) bounds.extend([marker.lng, marker.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 12 });

        map.on('error', (event) => {
          const message = event?.error?.message ?? 'The map could not be loaded.';
          if (!cancelled) setMapError(message);
        });
        map.on('load', () => {
          if (!cancelled) setMapReady(true);
        });

        mapRef.current = {
          remove: () => map.remove(),
          addMarker: (marker) => addMarker(marker),
          fit: () => {
            const next = new mapboxgl.LngLatBounds();
            for (const marker of markers) next.extend([marker.lng, marker.lat]);
            map.fitBounds(next, { padding: 48, maxZoom: 12 });
          },
          selectMarker: (id: string) => {
            for (const [markerId, mbMarker] of markerElements) {
              const el = mbMarker.getElement() as HTMLButtonElement | null;
              if (!el) continue;
              const marker = markers.find((m) => m.id === markerId);
              if (!marker) continue;
              el.className = markerButtonClass(marker, selectedId === markerId);
              el.setAttribute(
                'aria-label',
                `${marker.label} — ${marker.kind ?? 'record'}${selectedId === markerId ? ', selected' : ''}`,
              );
            }
          },
        };
        cleanup = () => {
          map.remove();
        };
      } catch (error) {
        if (!cancelled) {
          setMapError(
            error instanceof Error
              ? error.message
              : 'The map library could not be initialised.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, onSelect, selectedId]);

  if (markers.length === 0) {
    return (
      <div className={cn('rounded-lg border border-border/80 bg-card p-6 text-center', className)}>
        <MapPin className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const showFallback = !hasMapboxToken || Boolean(mapError);

  return (
    <div className={cn('space-y-3', className)}>
      {showFallback ? (
        <Alert variant="warning">
          <Layers className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>
            Interactive map unavailable
          </AlertTitle>
          <AlertDescription>
            {mapError
              ? `The interactive map could not be displayed: ${mapError} The records below carry the same coordinates.`
              : 'Interactive mapping is not available in this environment, so records are shown in an accessible table with their stored coordinates.'}
          </AlertDescription>
        </Alert>
      ) : (
        <div
          ref={containerRef}
          className="w-full overflow-hidden rounded-lg border border-border/80"
          style={{ height }}
          role="application"
          aria-label={`Map showing ${markers.length} located records. The table below lists the same records.`}
        />
      )}

      <div className="overflow-hidden rounded-lg border border-border/80">
        <Table>
          <caption className="sr-only">
            Records plotted on the map, with their recorded coordinates
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Record</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Latitude</TableHead>
              <TableHead>Longitude</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {markers.map((marker) => (
              <TableRow key={marker.id} className={selectedId === marker.id ? 'bg-accent/30' : ''}>
                <TableCell>
                  {marker.href ? (
                    <a
                      href={marker.href}
                      className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {marker.label}
                    </a>
                  ) : (
                    <span className="font-medium">{marker.label}</span>
                  )}
                  {marker.detail && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{marker.detail}</p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{marker.kind ?? 'record'}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">{marker.lat.toFixed(5)}</TableCell>
                <TableCell className="tabular-nums">{marker.lng.toFixed(5)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!mapReady && !showFallback && <p className="sr-only" aria-live="polite">Loading map…</p>}
    </div>
  );
}

function markerButtonClass(
  marker: GeoMarker,
  selected: boolean,
): string {
  const base =
    'grid h-7 w-7 place-items-center rounded-full border-2 text-[10px] font-semibold shadow-soft transition-all duration-150';
  const colorKey = marker.colorCategory ?? 'mine';
  const color = MARKER_COLORS[colorKey] ?? MARKER_COLORS.mine;
  // For mines, use status-based colour if available.
  const bg =
    marker.colorCategory === 'mine' && marker.status
      ? STATUS_COLORS[marker.status] || color!.bg
      : color!.bg;
  const border = selected ? 'border-copper-500' : color!.border;
  const ring = selected ? 'ring-2 ring-copper-500 ring-offset-2 ring-offset-background' : '';
  return `${base} ${bg} ${color!.text} ${border} ${ring}`.trim();
}

function popupHtml(marker: GeoMarker): string {
  const escape = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const detailLine = marker.detail ? `<p class="text-xs text-muted-foreground mt-0.5">${escape(marker.detail)}</p>` : '';
  const coordsLine = `<p class="text-[10px] text-muted-foreground mt-1">${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}</p>`;
  const hrefLine = marker.href
    ? `<p class="mt-1"><a href="${escape(marker.href)}" class="text-copper-600 underline underline-offset-2 text-[10px] hover:no-underline">View record →</a></p>`
    : '';

  return `
    <div class="p-2 max-w-[200px] font-sans">
      <h3 class="text-sm font-semibold text-foreground mb-1">${escape(marker.label)}</h3>
      <p class="text-[10px] text-muted-foreground mb-1">${escape(marker.kind ?? 'record')}</p>
      ${detailLine}
      ${coordsLine}
      ${hrefLine}
    </div>
  `;
}
