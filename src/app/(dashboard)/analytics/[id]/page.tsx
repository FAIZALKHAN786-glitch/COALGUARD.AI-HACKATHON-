'use client';

import * as React from 'react';
import Link from 'next/link';

import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ErrorState, LoadingState } from '@/components/data-display/states';
import { DetailPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import {
  FormErrorSummary,
  FormProvider,
  SelectInput,
  TextAreaInput,
  useZodForm,
} from '@/components/forms/form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useMineOptions, useUserOptions } from '@/lib/hooks/use-mine-options';
import {
  INSIGHT_CATEGORY_LABELS,
  INSIGHT_REVIEW_STATUS_LABELS,
  INSIGHT_REVIEW_STATUS_OPTIONS,
  RISK_LEVEL_LABELS,
} from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { formatPercent } from '@/lib/formatting/numbers';
import { insightReviewSchema, type InsightReviewFormValues } from '@/lib/validation/schemas';
import type { InsightEvidence } from '@/types';

const EVIDENCE_KIND_LABELS: Record<InsightEvidence['kind'], string> = {
  observed_fact: 'Observed fact',
  statistical_indicator: 'Statistical indicator',
  prediction: 'Prediction',
  recommendation: 'Recommendation',
};

const EVIDENCE_KIND_VARIANT: Record<InsightEvidence['kind'], 'info' | 'outline' | 'warning' | 'success'> = {
  observed_fact: 'info',
  statistical_indicator: 'outline',
  prediction: 'warning',
  recommendation: 'success',
};

export default function InsightDetailPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const insight = useApiQuery(['analytics', 'detail', params.id], () =>
    services.analytics.get(params.id),
  );
  const { mines } = useMineOptions();
  const { users } = useUserOptions();

  const form = useZodForm<InsightReviewFormValues>({
    schema: insightReviewSchema,
    defaultValues: { reviewStatus: 'acknowledged', note: '' },
  });

  React.useEffect(() => {
    if (!insight.data) return;
    form.reset({
      reviewStatus:
        insight.data.reviewStatus === 'unreviewed' ? 'acknowledged' : insight.data.reviewStatus,
      note: insight.data.reviewNote ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight.data?.id, insight.data?.reviewStatus, insight.data?.reviewNote]);

  const mutation = useAppMutation({
    mutationFn: (values: InsightReviewFormValues) => {
      const parsed = insightReviewSchema.parse(values);
      return services.analytics.review(params.id, parsed.reviewStatus, parsed.note || undefined);
    },
    successMessage: (updated) =>
      `Insight marked as ${INSIGHT_REVIEW_STATUS_LABELS[updated.reviewStatus].toLowerCase()}.`,
    invalidates: [
      ['analytics', 'detail', params.id],
      ['analytics', 'list'],
      ['analytics', 'risk-distribution'],
      ['audit', 'list'],
    ],
  });

  if (insight.isLoading) return <LoadingState label="Loading insight" />;
  if (insight.error) {
    return (
      <ErrorState
        title="This insight could not be loaded"
        description={insight.error.message}
        onRetry={() => void insight.refetch()}
      />
    );
  }
  if (!insight.data) return null;

  const item = insight.data;
  const reviewerName = item.reviewedBy
    ? (users.find((user) => user.id === item.reviewedBy)?.name ?? item.reviewedBy)
    : undefined;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      await insight.refetch();
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <DetailPage
      title={item.title}
      description={`${item.code} · ${INSIGHT_CATEGORY_LABELS[item.category]}`}
      backHref="/analytics"
      backLabel="Back to AI analytics"
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="risk" value={item.riskLevel} />
          <Badge variant={item.reviewStatus === 'unreviewed' ? 'warning' : 'outline'}>
            {INSIGHT_REVIEW_STATUS_LABELS[item.reviewStatus]}
          </Badge>
          {item.isPrediction && <Badge variant="muted">Prediction, not a finding</Badge>}
        </div>
      }
    >
      <ProvenanceNote tone="warning" label="What this record is">
        This is an analytical prediction produced by {item.modelSource}. It does not establish that a breach
        occurred and it does not change the status of any compliance, inspection or safety record. Treat it as a
        prompt for human review.
      </ProvenanceNote>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Finding" className="lg:col-span-2">
          <p className="whitespace-pre-line text-sm">{item.explanation}</p>
          {item.recommendation && (
            <div className="mt-4 rounded-md border border-border/70 bg-accent/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recommended action from the model
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{item.recommendation}</p>
            </div>
          )}
          {item.limitations && item.limitations.length > 0 && (
            <div className="mt-4 rounded-md border border-warning/40 bg-warning/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-warning-strong">
                Stated limitations
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {item.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </div>
          )}

          <h3 className="mt-6 text-sm font-medium">Evidence used</h3>
          {item.evidence.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No evidence items were supplied with this insight.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {item.evidence.map((entry, index) => (
                <li
                  key={`${entry.label}-${index}`}
                  className="rounded-md border border-border/80 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{entry.label}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={EVIDENCE_KIND_VARIANT[entry.kind]}>
                        {EVIDENCE_KIND_LABELS[entry.kind]}
                      </Badge>
                      {entry.weight !== undefined && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          weight {entry.weight}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm">{entry.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Provenance">
            <DetailList
              columns={1}
              items={[
                { label: 'Model / rule source', value: item.modelSource },
                { label: 'Generated at', value: formatDateTime(item.generatedAt) },
                {
                  label: 'Data freshness at generation',
                  value:
                    item.dataFreshnessHours !== undefined
                      ? `${item.dataFreshnessHours} hour(s)`
                      : 'Not reported',
                },
                {
                  label: 'Model confidence',
                  value:
                    item.confidence !== undefined
                      ? formatPercent(item.confidence * 100)
                      : 'Not reported',
                  hint: 'As reported by the model. Not a probability that the risk is real.',
                },
                { label: 'Risk band', value: RISK_LEVEL_LABELS[item.riskLevel] },
                {
                  label: 'Mine',
                  value: item.mineId ? (
                    <Link href={`/mines/${item.mineId}`} className="underline-offset-2 hover:underline">
                      {mines.find((mine) => mine.id === item.mineId)?.name ?? item.mineId}
                    </Link>
                  ) : (
                    'Organisation-wide'
                  ),
                },
              ]}
            />
          </SectionCard>

          <SectionCard
            title="Human review"
            description="A review records a decision about the insight, not about the underlying records."
          >
            <PermissionGate
              permission="analytics.review"
              fallback={
                <p className="text-sm text-muted-foreground">
                  Your role can read insights but cannot record a review decision.
                </p>
              }
            >
              <FormProvider form={form}>
                <form onSubmit={onSubmit} className="space-y-3" noValidate>
                  <FormErrorSummary form={form} />
                  <SelectInput
                    name="reviewStatus"
                    label="Decision"
                    required
                    options={INSIGHT_REVIEW_STATUS_OPTIONS.filter(
                      (option) => option.value !== 'unreviewed',
                    )}
                  />
                  <TextAreaInput
                    name="note"
                    label="Review note"
                    rows={3}
                    description="Explain the decision. It is visible to anyone who can see this insight."
                  />
                  <Button type="submit" loading={mutation.isPending} className="w-full">
                    Record review
                  </Button>
                </form>
              </FormProvider>
            </PermissionGate>

            {item.reviewedAt && (
              <div className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                <p>
                  Last reviewed {formatDateTime(item.reviewedAt)}
                  {reviewerName ? ` by ${reviewerName}` : ''}.
                </p>
                {item.reviewNote && <p className="mt-1 text-sm text-foreground">{item.reviewNote}</p>}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Related records" description="Entities the pipeline used or referenced.">
        {item.relatedEntityIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No related record is recorded.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {item.relatedEntityIds.map((id) => (
              <li key={id}>
                <Badge variant="outline">{id}</Badge>
              </li>
            ))}
          </ul>
        )}
        <ProvenanceNote className="mt-3" tone="neutral" label="Traceability">
          Related records are listed as identifiers. Following them opens the record itself, where you can judge
          the evidence independently of the model&apos;s conclusion.
        </ProvenanceNote>
      </SectionCard>
    </DetailPage>
  );
}
