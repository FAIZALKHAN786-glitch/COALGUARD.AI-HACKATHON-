import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  FormProvider,
  NumberInput,
  SelectInput,
  TextInput,
  useZodForm,
} from '@/components/forms/form';

const schema = z.object({
  name: z.string().trim().min(3, 'Enter at least three characters.'),
  quantity: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce
      .number({
        required_error: 'Enter a quantity greater than zero.',
        invalid_type_error: 'Enter a quantity greater than zero.',
      })
      .positive('Enter a quantity greater than zero.'),
  ),
  category: z.enum(['safety', 'environment']),
});

type Values = z.input<typeof schema>;

function Harness({ onSubmit }: { onSubmit: (values: Values) => void }) {
  const form = useZodForm<Values>({
    schema,
    defaultValues: {
      name: '',
      quantity: '' as unknown as number,
      category: 'safety',
    },
  });

  return (
    <FormProvider form={form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <TextInput name="name" label="Name" required />
        <NumberInput name="quantity" label="Quantity" />
        <SelectInput
          name="category"
          label="Category"
          options={[
            { value: 'safety', label: 'Safety' },
            { value: 'environment', label: 'Environment' },
          ]}
        />
        <button type="submit">Save</button>
      </form>
    </FormProvider>
  );
}

describe('form primitives', () => {
  it('blocks submission and announces validation errors', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('Enter at least three characters.')).toBeInTheDocument();
    expect(screen.getByText('Enter a quantity greater than zero.')).toBeInTheDocument();
  });

  it('submits parsed values once every field is valid', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/Name/), 'Dust sampling');
    await userEvent.type(screen.getByLabelText('Quantity'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: 'Dust sampling',
      quantity: 12,
      category: 'safety',
    });
  });

  it('associates the error with the invalid input for assistive technology', async () => {
    render(<Harness onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Name/), 'ab');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const nameInput = screen.getByLabelText(/Name/);
    const error = await screen.findByText('Enter at least three characters.');
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput.getAttribute('aria-describedby')).toBe(error.id);
  });
});
