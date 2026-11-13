import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';

import { DataTable } from '@/components/data-display/data-table';

interface Row {
  id: string;
  name: string;
  region: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Mine', meta: { label: 'Mine' } },
  { accessorKey: 'region', header: 'Region', meta: { label: 'Region' } },
];

const rows: Row[] = [
  { id: 'mine-1', name: 'Rajmahal Open Cast', region: 'Jharkhand' },
  { id: 'mine-2', name: 'Ballarpahalli Underground', region: 'Karnataka' },
];

describe('DataTable', () => {
  it('renders a semantic table with a caption and rows', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Mine register"
      />,
    );
    expect(screen.getByRole('table', { name: 'Mine register' })).toBeInTheDocument();
    expect(screen.getAllByText('Rajmahal Open Cast').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Karnataka').length).toBeGreaterThan(0);
  });

  it('shows a busy loading state instead of an empty message', () => {
    const { container } = render(
      <DataTable columns={columns} data={[]} getRowId={(row) => row.id} loading />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('No records found')).toBeNull();
  });

  it('renders an error state with a working retry control', async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[]}
        getRowId={(row) => row.id}
        error={new Error('The service is unavailable.')}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('The service is unavailable.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders a configurable empty state', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        getRowId={(row) => row.id}
        emptyTitle="No mines yet"
        emptyDescription="Add the first mine to begin monitoring."
      />,
    );
    expect(screen.getByText('No mines yet')).toBeInTheDocument();
    expect(screen.getByText('Add the first mine to begin monitoring.')).toBeInTheDocument();
  });

  it('reports the visible slice and pages forward and backward', async () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        page={2}
        pageSize={1}
        total={2}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByText('Showing 2–2 of 2 records')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

    const next = screen.getByRole('button', { name: 'Next page' });
    const previous = screen.getByRole('button', { name: 'Previous page' });
    expect(next).toBeDisabled();
    expect(previous).toBeEnabled();

    await userEvent.click(previous);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('makes rows keyboard-activatable when a row handler is supplied', () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={onRowClick}
      />,
    );
    const row = container.querySelector('tbody tr[role="button"]');
    expect(row).not.toBeNull();
    if (!row) return;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});
