'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Controller,
  FormProvider as RHFProvider,
  useForm,
  useFormContext,
  type Control,
  type DefaultValues,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Form provider                                                               */
/* -------------------------------------------------------------------------- */

const RHFContext = React.createContext<{ control: Control<FieldValues> } | null>(null);

export interface UseZodFormOptions<T extends FieldValues> {
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  defaultValues: DefaultValues<T>;
  mode?: 'onSubmit' | 'onBlur' | 'onChange' | 'onTouched' | 'all';
}

/**
 * Creates a react-hook-form instance wired to a Zod schema.
 * The resolver is the single source of truth for client-side validation; the
 * backend remains authoritative and re-validates every submission.
 */
export function useZodForm<T extends FieldValues>({
  schema,
  defaultValues,
  mode = 'onSubmit',
}: UseZodFormOptions<T>): UseFormReturn<T> {
  return useForm<T>({
    resolver: zodResolver(schema as unknown as z.ZodType<T, z.ZodTypeDef, unknown>) as never,
    defaultValues,
    mode,
  });
}

/** Makes the form instance available to the field components below. */
export function FormProvider<T extends FieldValues>({
  form,
  children,
}: {
  form: UseFormReturn<T>;
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({ control: form.control as unknown as Control<FieldValues> }),
    [form.control],
  );
  return (
    <RHFContext.Provider value={value}>
      <RHFProvider {...form}>{children}</RHFProvider>
    </RHFContext.Provider>
  );
}

function useControl<T extends FieldValues>(explicit?: Control<T>): Control<T> {
  const context = React.useContext(RHFContext);
  if (explicit) return explicit;
  if (!context) {
    throw new Error('Form controls must be rendered inside <FormProvider>.');
  }
  return context.control as unknown as Control<T>;
}

/* -------------------------------------------------------------------------- */
/* Field wrappers                                                              */
/* -------------------------------------------------------------------------- */

interface BaseFieldProps<T extends FieldValues> {
  name: FieldPath<T>;
  label: string;
  description?: string;
  required?: boolean;
  className?: string;
  control?: Control<T>;
}

function FieldShell({
  id,
  label,
  description,
  required,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {description && !error && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function errorMessage<T extends FieldValues>(
  errors: FieldErrors<T>,
  name: FieldPath<T>,
): string | undefined {
  const error = errors[name];
  if (!error) return undefined;
  if (typeof error.message === 'string') return error.message;
  return 'This value is invalid.';
}

/* -------------------------------------------------------------------------- */
/* Text input                                                                  */
/* -------------------------------------------------------------------------- */

export interface TextInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
  autoComplete?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}

export function TextInput<T extends FieldValues>({
  name,
  label,
  description,
  required,
  className,
  control: explicitControl,
  placeholder,
  type = 'text',
  autoComplete,
  disabled,
  inputMode,
}: TextInputProps<T>) {
  useControl<T>(explicitControl);
  const id = React.useId();
  const {
    register,
    formState: { errors },
  } = useFormContext<T>();

  const error = errorMessage(errors, name);

  return (
    <FieldShell
      id={id}
      label={label}
      description={description}
      required={required}
      error={error}
      className={className}
    >
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        disabled={disabled}
        invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...register(name)}
      />
    </FieldShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Textarea                                                                    */
/* -------------------------------------------------------------------------- */

export interface TextAreaInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export function TextAreaInput<T extends FieldValues>({
  name,
  label,
  description,
  required,
  className,
  control: explicitControl,
  placeholder,
  rows = 4,
  disabled,
}: TextAreaInputProps<T>) {
  useControl<T>(explicitControl);
  const id = React.useId();
  const {
    register,
    formState: { errors },
  } = useFormContext<T>();
  const error = errorMessage(errors, name);

  return (
    <FieldShell
      id={id}
      label={label}
      description={description}
      required={required}
      error={error}
      className={className}
    >
      <Textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...register(name)}
      />
    </FieldShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Number input                                                                */
/* -------------------------------------------------------------------------- */

export interface NumberInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export function NumberInput<T extends FieldValues>({
  name,
  label,
  description,
  required,
  className,
  control: explicitControl,
  placeholder,
  min,
  max,
  step,
  disabled,
}: NumberInputProps<T>) {
  useControl<T>(explicitControl);
  const id = React.useId();
  const {
    register,
    formState: { errors },
  } = useFormContext<T>();
  const error = errorMessage(errors, name);

  return (
    <FieldShell
      id={id}
      label={label}
      description={description}
      required={required}
      error={error}
      className={className}
    >
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...register(name, { valueAsNumber: true })}
      />
    </FieldShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Date / datetime input                                                       */
/* -------------------------------------------------------------------------- */

export interface DateInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  type?: 'date' | 'datetime-local';
  min?: string;
  max?: string;
  disabled?: boolean;
}

export function DateInput<T extends FieldValues>({
  name,
  label,
  description,
  required,
  className,
  control: explicitControl,
  type = 'date',
  min,
  max,
  disabled,
}: DateInputProps<T>) {
  useControl<T>(explicitControl);
  const id = React.useId();
  const {
    register,
    formState: { errors },
  } = useFormContext<T>();
  const error = errorMessage(errors, name);

  return (
    <FieldShell
      id={id}
      label={label}
      description={description}
      required={required}
      error={error}
      className={className}
    >
      <Input
        id={id}
        type={type}
        min={min}
        max={max}
        disabled={disabled}
        invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...register(name)}
      />
    </FieldShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Select input                                                                */
/* -------------------------------------------------------------------------- */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

export function SelectInput<T extends FieldValues>({
  name,
  label,
  description,
  required,
  className,
  control: explicitControl,
  options,
  placeholder = 'Select…',
  disabled,
}: SelectInputProps<T>) {
  const control = useControl<T>(explicitControl);
  const id = React.useId();
  const {
    formState: { errors },
  } = useFormContext<T>();
  const error = errorMessage(errors, name);

  return (
    <FieldShell
      id={id}
      label={label}
      description={description}
      required={required}
      error={error}
      className={className}
    >
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={typeof field.value === 'string' ? field.value : ''}
            onValueChange={field.onChange}
            disabled={disabled}
          >
            <SelectTrigger
              id={id}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={cn(error && 'border-destructive')}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </FieldShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Checkbox group (multi-select)                                               */
/* -------------------------------------------------------------------------- */

export interface CheckboxGroupInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  options: SelectOption[];
  disabled?: boolean;
  emptyLabel?: string;
}

export function CheckboxGroupInput<T extends FieldValues>({
  name,
  label,
  description,
  required,
  className,
  control: explicitControl,
  options,
  disabled,
  emptyLabel = 'No options are available.',
}: CheckboxGroupInputProps<T>) {
  const control = useControl<T>(explicitControl);
  const id = React.useId();
  const {
    formState: { errors },
  } = useFormContext<T>();
  const error = errorMessage(errors, name);

  return (
    <fieldset className={cn('space-y-1.5', className)} aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="text-sm font-medium leading-none text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </legend>
      {description && !error && <p className="text-xs text-muted-foreground">{description}</p>}
      {options.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{emptyLabel}</p>
      ) : (
        <Controller
          control={control}
          name={name}
          render={({ field }) => {
            const selected = Array.isArray(field.value) ? (field.value as string[]) : [];
            return (
              <div className="grid gap-1.5 rounded-md border border-border/80 bg-white/60 p-2 sm:grid-cols-2">
                {options.map((option) => {
                  const optionId = `${id}-${option.value}`;
                  const checked = selected.includes(option.value);
                  return (
                    <div key={option.value} className="flex items-start gap-2">
                      <Checkbox
                        id={optionId}
                        checked={checked}
                        disabled={disabled || option.disabled}
                        onCheckedChange={(state) => {
                          const next =
                            state === true
                              ? [...selected, option.value]
                              : selected.filter((entry) => entry !== option.value);
                          field.onChange(next);
                        }}
                      />
                      <Label htmlFor={optionId} className="font-normal leading-snug">
                        {option.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* Single checkbox                                                             */
/* -------------------------------------------------------------------------- */

export interface CheckboxInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  disabled?: boolean;
}

export function CheckboxInput<T extends FieldValues>({
  name,
  label,
  description,
  className,
  control: explicitControl,
  disabled,
}: CheckboxInputProps<T>) {
  const control = useControl<T>(explicitControl);
  const id = React.useId();

  return (
    <div className={cn('flex items-start gap-2', className)}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Checkbox
            id={id}
            checked={Boolean(field.value)}
            disabled={disabled}
            onCheckedChange={(state) => field.onChange(state === true)}
          />
        )}
      />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="font-normal leading-snug">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form error summary                                                          */
/* -------------------------------------------------------------------------- */

/** Renders a live summary of validation failures. */
export function FormErrorSummary<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  const errors = form.formState.errors;
  const entries = Object.entries(errors).filter(([, value]) => Boolean(value));
  if (entries.length === 0) return null;

  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>
        {entries.length === 1 ? 'One field needs attention' : `${entries.length} fields need attention`}
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {entries.map(([key, value]) => {
            const message =
              value && typeof value === 'object' && 'message' in value
                ? String((value as { message?: unknown }).message ?? 'Invalid value.')
                : 'Invalid value.';
            return <li key={key}>{message}</li>;
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
