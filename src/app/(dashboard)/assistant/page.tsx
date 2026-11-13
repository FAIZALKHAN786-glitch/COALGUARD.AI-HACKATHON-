'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bot, Eraser, Send, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FormErrorSummary,
  FormProvider,
  TextAreaInput,
  useZodForm,
} from '@/components/forms/form';
import { SectionCard } from '@/components/data-display/detail-list';
import { ListPage } from '@/components/shared/page-shell';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { useServices } from '@/lib/api/use-services';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import { formatDateTime } from '@/lib/formatting/dates';
import { cn } from '@/lib/utils';
import {
  assistantQuerySchema,
  type AssistantQueryFormValues,
} from '@/lib/validation/schemas';
import type { AssistantAnswer } from '@/services/types';

interface ConversationTurn {
  id: string;
  question: string;
  mineScope: string[];
  answer?: AssistantAnswer;
  error?: string;
  askedAt: string;
}

const SUGGESTED_QUESTIONS = [
  'Which compliance requirements are overdue?',
  'What inspections are open at each mine?',
  'Summarise unresolved corrective actions by priority.',
  'Which safety observations are still under investigation?',
];

export default function AssistantPage() {
  const services = useServices();
  const { options: mineOptions, mines } = useMineOptions();
  const [mineScope, setMineScope] = React.useState<string[]>([]);
  const [turns, setTurns] = React.useState<ConversationTurn[]>([]);
  const endRef = React.useRef<HTMLLIElement | null>(null);

  const form = useZodForm<AssistantQueryFormValues>({
    schema: assistantQuerySchema,
    defaultValues: { query: '' },
  });

  const mutation = useAppMutation({
    mutationFn: async (input: { query: string; mineIds: string[] }) => {
      const parsed = assistantQuerySchema.parse({ query: input.query });
      return services.assistant.ask({ query: parsed.query, mineIds: input.mineIds });
    },
    showErrorToast: false,
    onSuccess: (answer, variables) => {
      setTurns((previous) => {
        const next = [...previous];
        const last = next[next.length - 1];
        if (last && last.question === variables.query && !last.answer) {
          next[next.length - 1] = {
            ...last,
            answer,
            mineScope: variables.mineIds,
          };
        }
        return next;
      });
    },
    onError: (error, variables) => {
      setTurns((previous) => {
        const next = [...previous];
        const last = next[next.length - 1];
        if (last && last.question === variables.query && !last.answer) {
          next[next.length - 1] = { ...last, error: error.message };
        }
        return next;
      });
    },
  });

  React.useEffect(() => {
    if (turns.length === 0) return;
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turns.length, mutation.isPending]);

  const ask = React.useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      setTurns((previous) => [
        ...previous,
        {
          id: `turn-${Date.now().toString(36)}-${previous.length}`,
          question: trimmed,
          mineScope,
          askedAt: new Date().toISOString(),
        },
      ]);
      form.reset({ query: '' });
      await mutation.mutateAsync({ query: trimmed, mineIds: mineScope }).catch(() => undefined);
    },
    [form, mineScope, mutation],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    await ask(values.query);
  });

  return (
    <ListPage
      title="Assistant"
      description="Ask a question about the records you are permitted to see. Answers cite the records they were built from; when the assistant cannot ground an answer, it says so instead of guessing."
    >
      <ProvenanceNote tone="warning" label="How this assistant works">
        Answers are assembled from stored records by retrieval matching. This environment does not call a
        generative model, and the assistant never predicts a legal outcome or supplies a statutory deadline.
        Verify every answer against the cited record before acting on it.
      </ProvenanceNote>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <SectionCard
            title="Conversation"
            description="This conversation exists only in this browser tab. Reloading the page clears it."
            actions={
              turns.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTurns([])}
                  disabled={mutation.isPending}
                >
                  <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear conversation
                </Button>
              ) : undefined
            }
          >
            {turns.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No question has been asked yet. Start with one of the suggestions below, or write your own.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <li key={question}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto w-full justify-start whitespace-normal py-2 text-left text-xs"
                        onClick={() => void ask(question)}
                        disabled={mutation.isPending}
                      >
                        {question}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ol className="space-y-4" aria-label="Conversation turns">
                {turns.map((turn) => (
                  <li key={turn.id} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{turn.question}</p>
                        <p className="text-xs text-muted-foreground">
                          Asked {formatDateTime(turn.askedAt)}
                          {turn.mineScope.length > 0
                            ? ` / scoped to ${turn.mineScope
                                .map(
                                  (id) => mines.find((mine) => mine.id === id)?.name ?? id,
                                )
                                .join(', ')}`
                            : ' / all mines in your scope'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 pl-8">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                        <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        {turn.answer ? (
                          <>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={turn.answer.retrievalBased ? 'info' : 'warning'}>
                                {turn.answer.retrievalBased
                                  ? 'Retrieval-based answer'
                                  : 'Model-generated answer'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(turn.answer.generatedAt)}
                              </span>
                            </div>
                            <p className="whitespace-pre-line text-sm">{turn.answer.answer}</p>

                            {turn.answer.limitation && (
                              <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">
                                <span className="font-medium">Limitation: </span>
                                {turn.answer.limitation}
                              </p>
                            )}

                            {turn.answer.citations.length > 0 && (
                              <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Sources
                                </p>
                                <ul className="mt-1 space-y-1">
                                  {turn.answer.citations.map((citation, index) => (
                                    <li
                                      key={`${citation.entityType}-${citation.entityId}-${index}`}
                                      className="rounded-md border border-border/70 p-2 text-xs"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-medium">{citation.label}</span>
                                        <Badge variant="outline">{citation.entityType}</Badge>
                                      </div>
                                      {citation.detail && (
                                        <p className="mt-0.5 text-muted-foreground">
                                          {citation.detail}
                                        </p>
                                      )}
                                      {citation.href && (
                                        <Link
                                          href={citation.href}
                                          className="mt-1 inline-block font-medium underline-offset-2 hover:underline"
                                        >
                                          Open record
                                        </Link>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        ) : turn.error ? (
                          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                            The question could not be answered: {turn.error}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground" role="status">
                            Searching stored records...
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
                <li ref={endRef} aria-hidden="true" />
              </ol>
            )}
          </SectionCard>

          <SectionCard title="Ask a question">
            <FormProvider form={form}>
              <form onSubmit={onSubmit} className="space-y-3" noValidate>
                <FormErrorSummary form={form} />
                <TextAreaInput
                  name="query"
                  label="Your question"
                  rows={3}
                  required
                  placeholder="e.g. Which corrective actions are overdue at Rajmahal Pit 04?"
                  description="Ask about records, not about the law. The assistant will not answer a legal question it cannot ground in stored records."
                />
                {mineScope.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Scope: {mineScope.length} selected mine(s).{' '}
                    <button
                      type="button"
                      className="font-medium underline underline-offset-2"
                      onClick={() => setMineScope([])}
                    >
                      Clear scope
                    </button>
                  </p>
                )}
                <div className="flex justify-end">
                  <Button type="submit" loading={mutation.isPending} loadingLabel="Retrieving">
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    Ask
                  </Button>
                </div>
              </form>
            </FormProvider>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Mine scope"
            description="Narrow the records the assistant may search. No selection searches every mine you can access."
          >
            {mineOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No mine is available in your scope.</p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-auto">
                {mineOptions.map((option) => {
                  const checked = mineScope.includes(option.value);
                  return (
                    <li key={option.value}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md p-1 text-sm hover:bg-accent/40">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={checked}
                          onChange={(event) =>
                            setMineScope((previous) =>
                              event.target.checked
                                ? [...previous, option.value]
                                : previous.filter((id) => id !== option.value),
                            )
                          }
                        />
                        <span className={cn('min-w-0 truncate', checked && 'font-medium')}>
                          {option.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="What the assistant can answer">
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Counts and lists drawn from compliance, inspection, safety and corrective action records.</li>
              <li>Only records your role and mine scope permit you to read.</li>
              <li>No estimated legal outcome, no invented deadline, and no prediction presented as fact.</li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </ListPage>
  );
}
