'use client';

import * as React from 'react';
import Link from 'next/link';
import { MapPin, ShieldCheck, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/formatting/dates';
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';

interface AttendanceRecord {
  id: string;
  worker_ref: string;
  display_name: string;
  mine_name: string;
  date: string;
  shift: string;
  status: string;
  check_in_geofence_valid?: boolean | null;
  recorded_at: string;
}

export default function AttendancePage() {
  const { options: mineOptions } = useMineOptions();
  const [addOpen, setAddOpen] = React.useState(false);
  const [workerId, setWorkerId] = React.useState('');
  const [mineId, setMineId] = React.useState('');
  const [date, setDate] = React.useState('');
  const [shift, setShift] = React.useState('');
  const [status, setStatus] = React.useState('');

  const addMutation = useAppMutation({
    mutationFn: async (values: { workerId: string; mineId: string; date: string; shift: string; status: string }) => {
      throw new Error('Attendance creation endpoint not yet wired to frontend service');
    },
    successMessage: 'Attendance recorded successfully',
    invalidates: [['attendance', 'records']],
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'present': return <Badge variant="success">Present</Badge>;
      case 'absent': return <Badge variant="destructive">Absent</Badge>;
      case 'leave': return <Badge variant="warning">Leave</Badge>;
      case 'half_day': return <Badge variant="warning">Half Day</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Attendance & Geofencing</h1>
          <p className="text-muted-foreground">
            Track field worker attendance with geofence verification. All location data is validated server-side.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Record Attendance
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="col-span-3">
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="worker-search">Worker Search</Label>
                <Input
                  id="worker-search"
                  placeholder="Search by worker name or ref..."
                />
              </div>
              <select
                value={mineId}
                onChange={(e) => setMineId(e.target.value)}
                className="w-48 rounded-md border border-input bg-input px-3 py-2 text-sm"
              >
                <option value="">All mines</option>
                {mineOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="w-32 rounded-md border border-input bg-input px-3 py-2 text-sm"
              >
                <option value="">Shift</option>
                <option value="day">Day</option>
                <option value="swing">Swing</option>
                <option value="night">Night</option>
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-32 rounded-md border border-input bg-input px-3 py-2 text-sm"
              >
                <option value="">Status</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="leave">Leave</option>
                <option value="half_day">Half Day</option>
                <option value="not_recorded">Not Recorded</option>
              </select>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-48 rounded-md border border-input bg-input px-3 py-2 text-sm"
              />
              <Button onClick={() => { /* apply filters */ }}>
                Apply
              </Button>
              <Button variant="outline" onClick={() => { /* reset filters */ }}>
                Reset
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-3 px-4">Worker</th>
                    <th className="py-3 px-4">Mine</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Shift</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Geo-fence</th>
                    <th className="py-3 px-4">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No attendance records found.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => setAddOpen(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Record Attendance
              </Button>
              <Button variant="outline" className="w-full">
                <MapPin className="h-4 w-4 mr-2" />
                Manage Geofences
              </Button>
              <Button variant="outline" className="w-full">
                <ShieldCheck className="h-4 w-4 mr-2" />
                Attendance Report
              </Button>
              <Button variant="outline" className="w-full">
                <ShieldCheck className="h-4 w-4 mr-2" />
                Geofence Compliance
              </Button>
            </CardContent>
          </Card>

          <Card className="mt-4 h-full">
            <CardHeader>
              <CardTitle>Geofence Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">No geofences configured.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Attendance Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="fixed inset-0 bg-black/50"
          onClick={() => setAddOpen(false)}
          aria-hidden="true"
        />
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Record Attendance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={(e) => {
                e.preventDefault();
                addMutation.mutate({
                  workerId,
                  mineId,
                  date,
                  shift,
                  status: status as any,
                });
              }}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Worker</Label>
                    <input
                      type="text"
                      value={workerId}
                      onChange={(e) => setWorkerId(e.target.value)}
                      placeholder="Worker ID or name"
                      className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mine</Label>
                    <select
                      value={mineId}
                      onChange={(e) => setMineId(e.target.value)}
                      className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
                    >
                      <option value="">Select mine</option>
                      {mineOptions.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Date</Label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <Label>Shift</Label>
                      <select
                        value={shift}
                        onChange={(e) => setShift(e.target.value)}
                        className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
                      >
                        <option value="day">Day</option>
                        <option value="swing">Swing</option>
                        <option value="night">Night</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="leave">Leave</option>
                      <option value="half_day">Half Day</option>
                      <option value="not_recorded">Not Recorded</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" onClick={() => {
                      setAddOpen(false);
                      setWorkerId('');
                      setMineId('');
                      setDate('');
                      setShift('');
                      setStatus('');
                    }}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={addMutation.isPending}>
                      {addMutation.isPending ? 'Recording...' : 'Record Attendance'}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}