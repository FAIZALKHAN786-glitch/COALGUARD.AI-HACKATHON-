'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, ShieldAlert, TrendingUp, Clock, RefreshCw } from 'lucide-react';

import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionCard } from '@/components/data-display/detail-list';
import { ListPage } from '@/components/shared/page-shell';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { formatDateTime } from '@/lib/formatting/dates';
import { hasPermission } from '@/lib/auth/permissions';

interface AnomalyFinding {
  id: string;
  mine_id: string;
  category: string;
  severity: string;
  detection_method: string;
  rule_id?: string;
  detected_at: string;
  observation_period_start?: string;
  observation_period_end?: string;
  observed_values: any;
  expected_baseline: any;
  deviation_magnitude?: number;
  confidence?: number;
  supporting_evidence: any[];
  data_quality_warnings: string[];
  investigation_status: string;
  linked_investigation_id?: string;
}

interface MineSummary {
  id: string;
  name: string;
}

export default function AnomalyDetectionPage() {
  const services = useServices();
  const [severityFilter, setSeverityFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');

  const minesQuery = useApiQuery(['map', 'mines'], () =>
    services.mines.list({ pageSize: 200 })
  );
  const mines = minesQuery.data?.items ?? [] as Array<{ id: string; name: string }>;

  const anomaliesQuery = useApiQuery(['ai', 'anomalies'], () =>
    services.ai.anomalies({
      pageSize: 100,
      filters: {
        severity: severityFilter === 'all' ? undefined : severityFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        investigation_status: statusFilter === 'all' ? undefined : statusFilter,
      },
    })
  );
  const anomalies = anomaliesQuery.data?.items ?? [] as AnomalyFinding[];

  const filteredAnomalies = anomalies.filter((a) => {
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    if (statusFilter !== 'all' && a.investigation_status !== statusFilter) return false;
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    return true;
  });

  const severityCounts: Record<string, number> = anomalies.reduce(
    (acc, a) => {
      acc[a.severity] = (acc[a.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const statusCounts: Record<string, number> = anomalies.reduce(
    (acc, a) => {
      acc[a.investigation_status] = (acc[a.investigation_status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const createAnomalyMutation = useAppMutation({
    mutationFn: async (input: {
      mineId: string;
      category: string;
      severity: string;
      detectionMethod: string;
      ruleId?: string;
      observationPeriodStart?: string;
      observationPeriodEnd?: string;
      observedValues: any;
      expectedBaseline: any;
      deviationMagnitude?: number;
      confidence?: number;
    }) => {
      return services.ai.detectAnomalies([
        {
          mineId: input.mineId,
          category: input.category,
          severity: input.severity,
          detectionMethod: input.detectionMethod,
          observedValues: input.observedValues,
        },
      ]);
    },
    invalidates: [['ai', 'anomalies']],
  });

  const severityColor: Record<string, string> = {
    low: 'bg-green-100 text-green-700',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <ListPage
      title="Anomaly Detection"
      description="AI-detected anomalies across inspections, safety, environment, production, and compliance records."
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="danger">{anomalies.length} active anomalies</Badge>
          <Badge variant={anomalies.filter((a) => a.investigation_status === 'critical').length > 0 ? 'destructive' : 'success'}>
            {anomalies.filter((a) => a.investigation_status === 'critical').length} critical
          </Badge>
        </div>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="severity-filter">Severity</Label>
            <select
              id="severity-filter"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="border border-input bg-input px-3 py-2 text-sm rounded-md"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="status-filter">Status</Label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-input bg-input px-3 py-2 text-sm rounded-md"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="under_investigation">Under Investigation</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="false_positive">False Positive</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="category-filter">Category</Label>
            <select
              id="category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-input bg-input px-3 py-2 text-sm rounded-md"
            >
              <option value="all">All categories</option>
              <option value="mine_safety">Mine Safety</option>
              <option value="environment">Environment</option>
              <option value="production">Production</option>
              <option value="compliance">Compliance</option>
              <option value="equipment">Equipment</option>
              <option value="labour">Labour</option>
              <option value="contractor">Contractor</option>
            </select>
          </div>
          <Button variant="outline" onClick={() => createAnomalyMutation.mutate({} as any)}>
            <ShieldAlert className="h-3.5 w-3.5 mr-2" />
            Simulate Anomaly
          </Button>
        </div>
      }
    >
      <ProvenanceNote tone="neutral" label="Anomaly provenance">
        Each anomaly is detected by the AI engine from patterns in historical data. Severity reflects the
        deviation magnitude and business impact. All anomalies require human review before action.
      </ProvenanceNote>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Severity cards */}
        {['critical', 'high', 'medium', 'low'].map((sev) => (
          <Card key={sev} className="border-l-4 border-red-500/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {sev.charAt(0).toUpperCase() + sev.slice(1)}
                <Badge variant="destructive">{severityCounts[sev] ?? 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{severityCounts[sev] ?? 0}</p>
              <p className="text-xs text-muted-foreground">Anomalies detected</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6">
        <div className="col-span-1 lg:col-span-2">
          <SectionCard title="Anomaly Findings">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-3 pr-3 font-medium">Mine</th>
                    <th className="py-3 pr-3 font-medium">Category</th>
                    <th className="py-3 pr-3 font-medium">Severity</th>
                    <th className="py-3 pr-3 font-medium">Method</th>
                    <th className="py-3 pr-3 font-medium">Status</th>
                    <th className="py-3 pr-3 font-medium text-right">Deviation</th>
                    <th className="py-3 pr-3 font-medium">Detected</th>
                    <th className="py-3 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnomalies.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        No anomalies match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredAnomalies.map((a) => (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="py-3 pr-3">
                          <p className="text-sm font-medium">
                            {mines.find((m) => m.id === a.mine_id)?.name ?? a.mine_id}
                          </p>
                          <p className="text-xs text-muted-foreground">{a.code ?? '-'}</p>
                        </td>
                        <td className="py-3 pr-3 text-xs">{a.category}</td>
                        <td className="py-3 pr-3">
                          <Badge variant={
                            a.severity === 'critical' ? 'destructive' :
                            a.severity === 'high' ? 'warning' :
                            a.severity === 'medium' ? 'warning' : 'secondary'
                          }>
                            {a.severity}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          {a.detectionMethod.replace('_', ' ').toUpperCase()}
                        </td>
                        <td className="py-3 pr-3">
                          <Badge variant={
                            a.investigation_status === 'open' ? 'warning' :
                            a.investigation_status === 'under_investigation' ? 'info' :
                            a.investigation_status === 'resolved' ? 'success' :
                            a.investigation_status === 'dismissed' ? 'secondary' :
                            'destructive'
                          }>
                            {a.investigation_status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {a.deviationMagnitude?.toFixed(2) ?? '-'}
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          {formatDateTime(a.detected_at)}
                        </td>
                        <td className="py-3 pr-3">
                          <Button variant="outline" size="sm">
                            <ArrowRight className="h-3.5 w-3.5 mr-1" />
                            View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
        <div className="col-span-1 lg:col-span-1">
          <SectionCard title="Severity Distribution">
            <div className="space-y-4">
              {['critical', 'high', 'medium', 'low'].map((sev) => (
                <div key={sev} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      sev === 'critical' ? 'destructive' :
                      sev === 'high' ? 'warning' :
                      sev === 'medium' ? 'warning' : 'secondary'
                    } className="w-20">
                      {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </Badge>
                    <span className="font-medium">{severityCounts[sev] ?? 0}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full">
                    <div
                      className={`h-full rounded-full ${severityColor[sev]}`}
                      style={{ width: `${Math.max(5, (severityCounts[sev] ?? 0) / Math.max(1, Math.max(...Object.values(severityCounts)))) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </ListPage>
  );
}