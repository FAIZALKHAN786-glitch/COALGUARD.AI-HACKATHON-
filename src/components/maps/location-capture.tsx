'use client';

import * as React from 'react';
import { Crosshair, MapPin, RotateCcw, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateTime } from '@/lib/formatting/dates';
import type { GeoPoint } from '@/types';

export type CaptureOutcome =
  | { status: 'idle' }
  | { status: 'capturing' }
  | { status: 'captured'; point: GeoPoint }
  | { status: 'denied'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'timeout'; message: string }
  | { status: 'failed'; message: string };

export interface LocationCaptureProps {
  value?: GeoPoint | null;
  onChange: (point: GeoPoint | null) => void;
  /** Shown under the controls. */
  description?: string;
  disabled?: boolean;
  /** Called with the raw outcome so the caller can record provenance. */
  onOutcome?: (outcome: CaptureOutcome) => void;
}

const GEOLOCATION_TIMEOUT_MS = 12_000;

function toPoint(
  position: GeolocationPosition,
  source: GeoPoint['source'] = 'device_gps',
): GeoPoint {
  return {
    lat: Number(position.coords.latitude.toFixed(6)),
    lng: Number(position.coords.longitude.toFixed(6)),
    accuracyM: Math.round(position.coords.accuracy),
    source,
    capturedAt: new Date(position.timestamp ?? Date.now()).toISOString(),
  };
}

/**
 * Captures a coordinate for a field record.
 *
 * Three outcomes are handled explicitly and never silently:
 *  - permission denied,
 *  - position unavailable (no signal / hardware error),
 *  - timeout.
 *
 * The user can always fall back to manual coordinate entry, and the provenance
 * of the coordinate (`device_gps` or `manual_entry`) is always recorded.
 */
export function LocationCapture({
  value,
  onChange,
  description,
  disabled,
  onOutcome,
}: LocationCaptureProps) {
  const [outcome, setOutcome] = React.useState<CaptureOutcome>({ status: 'idle' });
  const [manualLat, setManualLat] = React.useState(value?.lat?.toString() ?? '');
  const [manualLng, setManualLng] = React.useState(value?.lng?.toString() ?? '');
  const [manualError, setManualError] = React.useState<string | null>(null);

  const capture = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      const message =
        'This browser does not expose a geolocation API. Enter the coordinates manually instead.';
      const next: CaptureOutcome = { status: 'unavailable', message };
      setOutcome(next);
      onOutcome?.(next);
      return;
    }
    const next: CaptureOutcome = { status: 'capturing' };
    setOutcome(next);
    onOutcome?.(next);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = toPoint(position);
        const captured: CaptureOutcome = { status: 'captured', point };
        setOutcome(captured);
        setManualLat(String(point.lat));
        setManualLng(String(point.lng));
        onChange(point);
        onOutcome?.(captured);
      },
      (error) => {
        let failed: CaptureOutcome;
        if (error.code === error.PERMISSION_DENIED) {
          failed = {
            status: 'denied',
            message:
              'Location permission was denied. Enable it in your browser settings, or enter the coordinates manually.',
          };
        } else if (error.code === error.TIMEOUT) {
          failed = {
            status: 'timeout',
            message:
              'The device did not return a position in time. Move to an area with a clearer signal or enter the coordinates manually.',
          };
        } else {
          failed = {
            status: 'unavailable',
            message:
              error.message ||
              'The device could not determine a position. Enter the coordinates manually.',
          };
        }
        setOutcome(failed);
        onOutcome?.(failed);
      },
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 0 },
    );
  }, [onChange, onOutcome]);

  const applyManual = React.useCallback(() => {
    const lat = Number.parseFloat(manualLat);
    const lng = Number.parseFloat(manualLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setManualError('Enter a latitude between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setManualError('Enter a longitude between -180 and 180.');
      return;
    }
    setManualError(null);
    const point: GeoPoint = {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      source: 'manual_entry',
      capturedAt: new Date().toISOString(),
    };
    const captured: CaptureOutcome = { status: 'captured', point };
    setOutcome(captured);
    onChange(point);
    onOutcome?.(captured);
  }, [manualLat, manualLng, onChange, onOutcome]);

  const clear = React.useCallback(() => {
    setOutcome({ status: 'idle' });
    setManualLat('');
    setManualLng('');
    setManualError(null);
    onChange(null);
  }, [onChange]);

  const busy = outcome.status === 'capturing';

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-white/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
          Geo-tagged location
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={capture}
            disabled={disabled || busy}
            loading={busy}
            loadingLabel="Locating…"
          >
            {!busy && <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />}
            Use device GPS
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={disabled}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      {outcome.status === 'denied' || outcome.status === 'timeout' || outcome.status === 'unavailable' || outcome.status === 'failed' ? (
        <Alert variant="warning">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>
            {outcome.status === 'denied'
              ? 'Location permission denied'
              : outcome.status === 'timeout'
                ? 'Location capture timed out'
                : 'Location unavailable'}
          </AlertTitle>
          <AlertDescription>{outcome.message}</AlertDescription>
        </Alert>
      ) : null}

      {value ? (
        <dl className="grid grid-cols-2 gap-2 rounded-md border border-border/70 bg-card p-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Latitude</dt>
            <dd className="font-medium tabular-nums">{value.lat.toFixed(6)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Longitude</dt>
            <dd className="font-medium tabular-nums">{value.lng.toFixed(6)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Accuracy</dt>
            <dd className="font-medium tabular-nums">
              {value.accuracyM !== undefined ? `±${value.accuracyM} m` : 'Not recorded'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="font-medium">
              {value.source === 'device_gps' ? 'Device GPS' : 'Manual entry'}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="capture-lat">Latitude</Label>
          <Input
            id="capture-lat"
            inputMode="decimal"
            placeholder="-90 … 90"
            value={manualLat}
            onChange={(event) => setManualLat(event.target.value)}
            disabled={disabled}
            invalid={Boolean(manualError) && !Number.isFinite(Number.parseFloat(manualLat))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="capture-lng">Longitude</Label>
          <Input
            id="capture-lng"
            inputMode="decimal"
            placeholder="-180 … 180"
            value={manualLng}
            onChange={(event) => setManualLng(event.target.value)}
            disabled={disabled}
            invalid={Boolean(manualError) && !Number.isFinite(Number.parseFloat(manualLng))}
          />
        </div>
        <Button type="button" variant="secondary" onClick={applyManual} disabled={disabled}>
          Use these coordinates
        </Button>
      </div>

      {manualError && (
        <p className="text-xs font-medium text-destructive" role="alert">
          {manualError}
        </p>
      )}

      {value?.capturedAt && (
        <p className="text-[11px] text-muted-foreground">
          Captured {formatDateTime(value.capturedAt)} · provenance: {value.source}
        </p>
      )}
    </div>
  );
}
