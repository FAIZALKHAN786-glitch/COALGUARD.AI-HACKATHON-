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

interface InvestigationRecord {
  id: string;
  mine_id: string;
  anomaly_id?: string;
  prediction_id?: string;
  trigger_event_type: string;
  trigger_event_id?: string;
  correlation_id: string;
  current_stage: string;
  started_at: string;
  completed_at?: string;
  risk_assessment: any;
  model_version?: string;
  policy_version?: string;
  data_quality_status?: string;
  outstanding_questions: any[];
  recommended_actions: any[];
  executed_action_references: any[];
  human_review_required: boolean;
  human_review_completed: boolean;
  human_reviewed_by?: string;
  human_reviewed_at?: string;
  retry_count: number;
  final_outcome?: string;
}

export default function InvestigationsPage() {
  const services = useServices();
  const [stageFilter, setStageFilter] = React.useState<string>('all');

  const investigationsQuery = useApiQuery(['ai', 'investigations'], () =>
    services.ai.investigations({ pageSize: 100 })
  );
  const investigations = investigationsQuery.data?.items ?? [];

  const filtered = investigations.filter((i) => stageFilter === 'all' || i.current_stage === stageFilter);

  const stageCounts: Record<string, number> = investigations.reduce((acc, i) => {
    acc[i.current_stage] = (acc[i.current_stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const stageLabelMap: Record<string, string> = {
    received: 'Received',
    validating: 'Validating',
    context_gathering: 'Context Gathering',
    historical_analysis: 'Historical Analysis',
    predictive_assessment: 'Predictive Assessment',
    external_research: 'External Research',
    factor_correlation: 'Factor Correlation',
    risk_evaluation: 'Risk Evaluation',
    human_review_required: 'Human Review Required',
    action_pending: 'Action Pending',
    notification_pending: 'Notification Pending',
    monitoring: 'Monitoring',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };

  const stageBadgeVariant = (stage: string): string => {
    switch (stage) {
      case 'human_review_required': return 'warning';
      case 'completed': return 'success';
      case 'failed': return 'destructive';
      case 'cancelled': return 'secondary';
      default: return 'secondary';
    }
  };

  const riskBadgeVariant = (risk: string): string => {
    switch (risk) {
      case 'critical': return 'destructive';
      case 'high': return 'warning';
      case 'moderate': return 'warning';
      case 'low': return 'success';
      default: return 'secondary';
    }
  };

  return (
    <ListPage title='Investigation Workflows' description='AI-driven investigation workflows tracking anomalies, predictions, and risk assessments through review and resolution.' headerMeta={
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='destructive'>{investigations.length} active investigations</Badge>
        <Badge variant={investigations.filter((i) => i.current_stage === 'human_review_required').length > 0 ? 'warning' : 'success'}>{investigations.filter((i) => i.current_stage === 'human_review_required').length} awaiting review</Badge>
      </div>
    }>
      <ProvenanceNote tone='neutral' label='Investigation provenance'>
        Investigations are created automatically when anomalies or predictions exceed configured thresholds. Each investigation tracks evidence, risk assessment, factor comparison, and recommended actions through a documented workflow lifecycle.
      </ProvenanceNote>

      <div className='grid gap-4 lg:grid-cols-3'>
        {['critical', 'high', 'moderate', 'low'].map((severity) => (
          <Card key={severity} className='border-l-4 border-red-500/50'>
            <CardHeader>
              <CardTitle className='flex items-center justify-between'>
                {severity.charAt(0).toUpperCase() + severity.slice(1)}
                <Badge variant='destructive'>{stageCounts[severity] ?? 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-2xl font-bold'>{stageCounts[severity] ?? 0}</p>
              <p className='text-xs text-muted-foreground'>Investigations</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='grid gap-6'>
        <div className='col-span-1 lg:col-span-2'>
          <SectionCard title='Active Investigations'>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <th scope='col' className='py-3 pr-3 font-medium'>Investigation ID</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Mine ID</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Type</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Stage</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Risk</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Human Review</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Started</th>
                    <th scope='col' className='py-3 pr-3 font-medium'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className='py-8 text-center text-muted-foreground'>No investigations match the current filters.</td>
                    </tr>
                  ) : (
                    filtered.map((inv) => (
                      <tr key={inv.id} className='border-b border-border/60 hover:bg-muted/50'>
                        <td className='py-3 pr-3'>
                          <p className='text-sm font-medium truncate'>{inv.id}</p>
                          <p className='text-xs text-muted-foreground'>{inv.correlation_id}</p>
                        </td>
                        <td className='py-3 pr-3 text-sm'>{inv.mine_id}</td>
                        <td className='py-3 pr-3 text-xs text-muted-foreground'>{inv.trigger_event_type.replace(/_/g, ' ').toUpperCase()}</td>
                        <td className='py-3 pr-3'>
                          <Badge variant={stageBadgeVariant(inv.current_stage)}>
                            {inv.current_stage.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className='py-3 pr-3'>
                          <Badge variant={riskBadgeVariant(inv.risk_assessment?.operational_risk_band ?? '')}>
                            {inv.risk_assessment?.operational_risk_band ?? 'N/A'}
                          </Badge>
                        </td>
                        <td className='py-3 pr-3 text-xs text-muted-foreground'>{inv.human_review_required ? 'Required' : inv.human_review_completed ? 'Done' : 'N/A'}</td>
                        <td className='py-3 pr-3 text-xs text-muted-foreground'>{inv.started_at ? formatDateTime(inv.started_at) : '-'}</td>
                        <td className='py-3 pr-3'>
                          <Button variant='outline' size='sm'><ArrowRight className='h-3.5 w-3.5 mr-1' /> View</Button>
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
          <SectionCard title='Workflow Stages'>
            <div className='space-y-2'>
              {['received', 'validating', 'context_gathering', 'historical_analysis', 'predictive_assessment', 'external_research', 'factor_correlation', 'risk_evaluation', 'human_review_required', 'action_pending', 'notification_pending', 'monitoring', 'completed'].map((stage) => (
                <div key={stage} className='flex items-center justify-between p-2 rounded-md border border-border/70'>
                  <div className='flex items-center gap-2'>
                    <span className={`text-xs ${stage === stageFilter ? 'font-medium' : 'text-muted-foreground'}`}>{stageLabelMap[stage]}</span>
                    <Badge variant={stage === stageFilter ? 'secondary' : 'outline'}>{stageCounts[stage] ?? 0}</Badge>
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