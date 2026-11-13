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

  const predictionsQuery = useApiQuery(['ai', 'predictions'], () =>
    services.ai.predictions({ pageSize: 100 })
  );
  const predictions: PredictionRecord[] = predictionsQuery.data?.items ?? [];

  const riskCounts: Record<string, number> = predictions.reduce((acc, p) => {
    acc[p.risk_band] = (acc[p.risk_band] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <ListPage title='Predictive Risk Engine' description='AI-powered risk predictions for mines based on historical patterns. All predictions include uncertainty estimates and require human review.' headerMeta={
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='destructive'>{predictions.length} active predictions</Badge>
        <Badge variant={predictions.filter((p) => p.risk_band === 'critical').length > 0 ? 'destructive' : 'success'}>{predictions.filter((p) => p.risk_band === 'critical').length} critical</Badge>
      </div>
    }>
      <ProvenanceNote tone='warning' label='Prediction provenance'>
        Predictions are model-generated estimates based on historical patterns. They are not confirmed incidents and require human review before any action is taken. All predictions include uncertainty estimates and model limitations.
      </ProvenanceNote>

      <div className='grid gap-4 lg:grid-cols-3'>
        {['critical', 'high', 'moderate', 'low'].map((band) => (
          <Card key={severity} className='border-l-4 border-red-500/50'>
            <CardHeader>
              <CardTitle className='flex items-center justify-between'>
                <ShieldAlert className='h-4 w-4 text-red-600' />
                {band.charAt(0).toUpperCase() + band.slice(1)}
              </CardTitle>
              <Badge variant='destructive'>{riskCounts[band] ?? 0}</Badge>
            </CardHeader>
            <CardContent>
              <p className='text-2xl font-bold'>{riskCounts[band] ?? 0}</p>
              <p className='text-xs text-muted-foreground'>Active predictions</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='grid gap-6'>
        <div className='col-span-1 lg:col-span-2'>
          <SectionCard title='Active Predictions'>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <th scope='col' className='py-3 pr-3 font-medium'>Mine ID</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Target</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Risk Band</th>
                    <th scope='col' className='py-3 pr-3 font-medium text-right'>Probability</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Horizon End</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Model</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className='py-8 text-center text-muted-foreground'>No predictions match the current filters.</td>
                    </tr>
                  ) : (
                    predictions.map((p) => (
                      <tr key={p.id} className='border-b border-border/60 hover:bg-muted/50'>
                        <td className='py-3 pr-3 text-sm font-medium truncate'>{p.mine_id}</td>
                        <td className='py-3 pr-3 text-sm'>{p.target_id}</td>
                        <td className='py-3 pr-3'>
                          <Badge variant={
                            p.risk_band === 'critical' ? 'destructive' :
                            p.risk_band === 'high' ? 'warning' :
                            p.risk_band === 'moderate' ? 'warning' :
                            p.risk_band === 'low' ? 'success' :
                              'secondary'
                          }>
                            {p.risk_band}
                          </Badge>
                        </td>
                        <td className='py-3 pr-3 text-right tabular-nums text-sm'>
                          {p.estimated_probability !== undefined ? (p.estimated_probability * 100).toFixed(1) + '%' : 'N/A'}
                        </td>
                        <td className='py-3 pr-3 text-xs text-muted-foreground'>{p.horizon_end ? p.horizon_end.slice(0, 10) : '-'}</td>
                        <td className='py-3 pr-3 text-xs text-muted-foreground'>{p.model_version}</td>
                        <td className='py-3 pr-3'>
                          <Badge variant={p.insufficient_evidence ? 'warning' : 'success'}>
                            {p.insufficient_evidence ? 'Low confidence' : 'Available'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  )}
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
            </SectionCard>
          </div>
        </div>
      </div>
    </ListPage>
  );
}