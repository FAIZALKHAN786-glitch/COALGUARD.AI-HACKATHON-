import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bell,
  BarChart3,
  Building2,
  ClipboardCheck,
  FileStack,
  FileText,
  Gauge,
  HardHat,
  LayoutDashboard,
  Map,
  MessagesSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Siren,
  TrendingUp,
  Users,
} from 'lucide-react';

import type { Permission } from '@/lib/auth/permissions';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  description?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        title: 'Governance dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        permission: 'dashboard.view',
        description: 'Organisation-wide compliance and operational posture.',
      },
    ],
  },
  {
    label: 'Governance',
    items: [
      {
        title: 'Statutory compliance',
        href: '/compliance',
        icon: ClipboardCheck,
        permission: 'compliance.view',
        description: 'Compliance register, submissions and verification.',
      },
      {
        title: 'Inspections',
        href: '/inspections',
        icon: ShieldCheck,
        permission: 'inspection.view',
        description: 'Inspection lifecycle, findings and closure.',
      },
      {
        title: 'Corrective actions',
        href: '/corrective-actions',
        icon: Activity,
        permission: 'corrective_action.view',
        description: 'Remediation, verification and closure.',
      },
      {
        title: 'Audit trail',
        href: '/audit',
        icon: ScrollText,
        permission: 'audit.view',
        description: 'Chronological record of every recorded action.',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        title: 'Safety & incidents',
        href: '/safety',
        icon: Siren,
        permission: 'safety.view',
        description: 'Observations, hazards, near misses and incidents.',
      },
      {
        title: 'Environment',
        href: '/environment',
        icon: Gauge,
        permission: 'environment.view',
        description: 'Monitoring stations, thresholds and alerts.',
      },
      {
        title: 'Production',
        href: '/production',
        icon: TrendingUp,
        permission: 'production.view',
        description: 'Dispatch reporting against configured targets.',
      },
      {
        title: 'Contractors',
        href: '/contractors',
        icon: HardHat,
        permission: 'contractor.view',
        description: 'Contractor registry, contracts and compliance.',
      },
      {
        title: 'Workforce records',
        href: '/workforce',
        icon: Users,
        permission: 'workforce.view',
        description: 'Attendance and labour-related governance records.',
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        title: 'GIS map',
        href: '/map',
        icon: Map,
        permission: 'map.view',
        description: 'Spatial view of mines, inspections and incidents.',
      },
      {
        title: 'AI risk analytics',
        href: '/analytics',
        icon: BarChart3,
        permission: 'analytics.view',
        description: 'Model-generated risk insights and anomalies.',
      },
      {
        title: 'Documents & OCR',
        href: '/documents',
        icon: FileStack,
        permission: 'document.view',
        description: 'Document library, extraction review and linking.',
      },
      {
        title: 'AI anomaly detection',
        href: '/ai/anomalies',
        icon: ShieldAlert,
        permission: 'anomaly.view',
        description: 'Detect anomalies in inspections, safety, environment, and production data.',
      },
      {
        title: 'AI predictions',
        href: '/ai/predictions',
        icon: Activity,
        permission: 'prediction.view',
        description: 'Risk predictions and forecasting from historical data.',
      },
      {
        title: 'AI investigations',
        href: '/ai/investigations',
        icon: ShieldAlert,
        permission: 'investigation.view',
        description: 'Autonomous investigation workflows and risk assessments.',
      },
      {
        title: 'AI models',
        href: '/ai/models',
        icon: Settings,
        permission: 'model.view',
        description: 'Model registry, evaluation, and lifecycle management.',
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        title: 'Reporting centre',
        href: '/reports',
        icon: FileText,
        permission: 'report.view',
        description: 'Generate, track and download governance reports.',
      },
      {
        title: 'Notifications',
        href: '/notifications',
        icon: Bell,
        permission: 'notification.view',
        description: 'Alerts, deadlines, escalations and approvals.',
      },
      {
        title: 'Assistant',
        href: '/assistant',
        icon: MessagesSquare,
        permission: 'assistant.use',
        description: 'Conversational assistance over authorised records.',
      },
      {
        title: 'Administration',
        href: '/admin',
        icon: Settings,
        permission: 'admin.access',
        description: 'Users, reference data, workflows and integrations.',
      },
    ],
  },
];

/** Flat list of every navigable route with its required permission. */
export const NAV_INDEX: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const ORGANISATION_LINKS = [
  { title: 'Mines', href: '/mines', icon: Building2, permission: 'mine.view' as Permission },
];
