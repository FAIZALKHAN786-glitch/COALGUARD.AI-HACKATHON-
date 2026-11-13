'use client';

import * as React from 'react';
import Link from 'next/link';
import { MapPin, Clock, ShieldAlert, TrendingUp, Activity } from 'lucide-react';

import { useApiQuery, useServices } from '@/lib/api/use-services';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionCard } from '@/components/data-display/detail-list';
import { ListPage } from '@/components/shared/page-shell';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { formatDateTime } from '@/lib/formatting/dates';

interface PredictionRecord {
  id: string;
  mine_id: string;
  predicted_at: string;
  horizon_start: string;
  horizon_end: string;
  estimated_probability?: number;
  probability_calibrated: boolean;
  risk_band: string;
  model_version: string;
  input_data_freshness?: string;
  data_completeness?: number;
  contributing_factors: any[];
  explanation?: string;
  limitations?: string;
  insufficient_evidence: boolean;
  linked_investigation_id?: string;
}

export default function MapPage() {
  const services = useServices();
  const [modelFilter, setModelFilter] = React.useState<string>('all');

  const modelsQuery = useApiQuery(['ai', 'models'], () =>
    services.ai.models({ pageSize: 100 })
  );
  const models: Array<{
    id: string;
    model_name: string;
    model_type: string;
    prediction_target: string;
    description?: string;
    owner?: string;
    status: string;
    created_at: string;
  }> = modelsQuery.data?.items ?? [];

  const filtered = models.filter((m) => modelFilter === 'all' || m.model_type === modelFilter);

  const statusCounts: Record<string, number> = models.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <ListPage title='AI Model Registry' description='Registered ML models for anomaly detection and predictive risk scoring. Models can be staged, promoted to production, or retired.' headerMeta={
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='destructive'>{models.length} registered models</Badge>
        <Badge variant='success'>{models.filter((m) => m.status === 'production').length} production</Badge>
        <Badge variant='warning'>{models.filter((m) => m.status === 'development').length} development</Badge>
      </div>
    }>
      <ProvenanceNote tone='neutral' label='Model provenance'>
        Models are trained on historical CoalGuard data and evaluated against held-out test sets. Only models in 'production' status are used for live predictions. All predictions reference their source model version for full auditability.
      </ProvenanceNote>

      <div className='grid gap-4 lg:grid-cols-3'>
        {['production', 'staging', 'development', 'archived', 'rejected'].map((status) => (
          <Card key={status} className='border-l-4 border-red-500/50'>
            <CardHeader>
              <CardTitle className='flex items-center justify-between'>
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <Badge variant={status === 'production' ? 'success' : status === 'staging' ? 'warning' : m.status === 'development' ? 'info' : m.status === 'archived' ? 'secondary' : 'destructive'}>
                  {count}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-sm text-muted-foreground'>{count} model(s)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='grid gap-6'>
        <div className='col-span-1 lg:col-span-2'>
          <SectionCard title='Model Registry'>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <th scope='col' className='py-3 pr-3 font-medium'>Model</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Type</th>
                    <th className='py-3 pr-3 font-medium'>Target</th>
                    <th className='py-3 pr-3 font-medium'>Status</th>
                    <th className='py-3 pr-3 font-medium'>Owner</th>
                    <th className='py-3 pr-3 font-medium'>Created</th>
                    <th className='py-3 pr-3 font-medium'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className='py-8 text-center text-muted-foreground'>No models found.</td>
                    </tr>
                  ) : (
                    filtered.map((m) => (
                      <tr key={m.id} className='border-b border-border/60 hover:bg-muted/50'>
                        <td className='py-3 pr-3'>
                          <div className='flex items-center gap-2'>
                            <div className='w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center'>
                              <ShieldCheck className='h-3.5 w-3.5 text-gray-600' />
                            </div>
                            <div className='flex-1 truncate'>
                              <p className='text-sm font-medium'>{m.model_name}</p>
                              <p className='text-xs text-muted-foreground'>{m.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className='py-3 pr-3 text-sm'>
                          <Badge variant='outline'>{m.model_type.replace(/_/g, ' ').toUpperCase()}</Badge>
                        </td>
                        <td className='py-3 pr-3 text-sm tabular-nums'>{m.prediction_target}</td>
                        <td className='py-3 pr-3'>
                          <Badge variant={
                            m.status === 'production' ? 'success' :
                            m.status === 'staging' ? 'warning' :
                            m.status === 'development' ? 'info' :
                            m.status === 'archived' ? 'secondary' : 'destructive'
                          }>
                            {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                          </Badge>
                        </td>
                        <td className='py-3 pr-3 text-sm text-muted-foreground'>{m.owner ?? '-'}</td>
                        <td className='py-3 pr-3 text-xs text-muted-foreground'>{m.created_at ? formatDateTime(m.created_at) : '-'}</td>
                        <td className='py-3 pr-3'>
                          <div className='flex gap-1'>
                            <Button variant='outline' size='sm'><Play className='h-3.5 w-3.5' aria-hidden='true' /></Button>
                            <Button variant='outline' size='sm'><RefreshCw className='h-3.5 w-3.5' aria-hidden='true' /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
          <div className='col-span-1 lg:col-span-1'>
            <SectionCard title='Model Health'>
              <div className='space-y-4'>
                <div className='flex items-center justify-between p-3 rounded-lg border border-border'>
                  <div className='flex items-center gap-2'>
                    <div className='w-8 h-8 rounded-full bg-green-100 flex items-center justify-center'>
                      <ShieldCheck className='h-3.5 w-3.5 text-green-600' />
                    </div>
                    <div className='flex-1'>
                      <p className='text-sm font-medium'>Production Models</p>
                      <p className='text-xs text-muted-foreground'>Active production models</p>
                    </div>
                    <Badge variant='success'>Active</Badge>
                  </div>
                  <div className='flex items-center justify-between p-3 rounded-lg border border-border mt-3'>
                    <div className='flex items-center gap-2'>
                      <div className='w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center'>
                        <TrendingUp className='h-4 w-4 text-blue-600' />
                      </div>
                      <div className='flex-1'>
                        <p className='text-sm font-medium'>Last Retrained</p>
                        <p className='text-xs text-muted-foreground'>2026-10-20</p>
                      </div>
                      <Badge variant='warning'>Due soon</Badge>
                    </div>
                  </div>
                  <div className='flex items-center justify-between p-3 rounded-lg border border-border'>
                    <div className='flex items-center gap-2'>
                      <div className='w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center'>
                        <Activity className='h-4 w-4 text-purple-600' />
                      </div>
                      <div className='flex-1'>
                        <p className='text-sm font-medium'>Model Version</p>
                        <p className='text-xs text-muted-foreground'>Current production model</p>
                      </div>
                      <Badge variant='outline'>v1.2.3</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </ListPage>
  );
}