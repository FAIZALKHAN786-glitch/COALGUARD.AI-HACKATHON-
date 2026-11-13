/**
 * Deterministic development dataset for CoalGuard.AI.
 *
 * IMPORTANT: every record produced here is *demonstration* data. It is clearly
 * labelled as such in the UI and must never be presented as operational
 * records of a real mine. Statutory references, thresholds and dates in this
 * file are placeholders used to exercise the interface; they are not legal
 * advice and do not represent any real regulatory requirement.
 */

import { createSeededRandom } from '@/lib/utils';
import type {
  AiInsight,
  AppNotification,
  AttendanceRecord,
  AuditEvent,
  ComplianceRecord,
  Contract,
  Contractor,
  CorrectiveAction,
  DocumentRecord,
  EnvironmentalMeasurement,
  EnvironmentalThresholdRegister,
  Incident,
  Inspection,
  Mine,
  NearMiss,
  ProductionAnomaly,
  ProductionRecord,
  ReportDefinition,
  SafetyRecord,
  Subsidiary,
  User,
  Violation,
  WorkflowRule,
} from '@/types';

const SEED = 20260115;

export interface DevDatabase {
  generatedAt: string;
  subsidiaries: Subsidiary[];
  mines: Mine[];
  users: User[];
  compliance: ComplianceRecord[];
  inspections: Inspection[];
  safetyRecords: SafetyRecord[];
  incidents: Incident[];
  nearMisses: NearMiss[];
  violations: Violation[];
  environmental: EnvironmentalMeasurement[];
  production: ProductionRecord[];
  productionAnomalies: ProductionAnomaly[];
  contractors: Contractor[];
  contracts: Contract[];
  attendance: AttendanceRecord[];
  correctiveActions: CorrectiveAction[];
  documents: DocumentRecord[];
  insights: AiInsight[];
  notifications: AppNotification[];
  audit: AuditEvent[];
  workflows: WorkflowRule[];
  reports: ReportDefinition[];
  environmentalThresholds: EnvironmentalThresholdRegister;
  documentContent: Record<string, string>;
}

const SUBSIDIARIES: Subsidiary[] = [
  { id: 'sub-01', code: 'RMCF', name: 'Rajmahal Coalfields Ltd.', region: 'Jharkhand', headquarters: 'Dhanbad' },
  { id: 'sub-02', code: 'CVRD', name: 'Chandrapur Valley Resources Dev.', region: 'Maharashtra', headquarters: 'Chandrapur' },
  { id: 'sub-03', code: 'SVCL', name: 'Sone Valley Coal Ltd.', region: 'Madhya Pradesh', headquarters: 'Singrauli' },
  { id: 'sub-04', code: 'KMC', name: 'Khanpur Collieries Pvt. Ltd.', region: 'West Bengal', headquarters: 'Asansol' },
];

interface MineSeed {
  code: string;
  name: string;
  subsidiaryId: string;
  region: string;
  district: string;
  state: string;
  lat: number;
  lng: number;
  status: Mine['operationalStatus'];
  capacity: number;
}

const MINE_SEEDS: MineSeed[] = [
  { code: 'RMC-JDH-01', name: 'Rajmahal Pit 01', subsidiaryId: 'sub-01', region: 'Jharkhand', district: 'Dhanbad', state: 'Jharkhand', lat: 23.796, lng: 86.430, status: 'operational', capacity: 12_000_000 },
  { code: 'RMC-JDH-02', name: 'Rajmahal Pit 02', subsidiaryId: 'sub-01', region: 'Jharkhand', district: 'Dhanbad', state: 'Jharkhand', lat: 23.842, lng: 86.392, status: 'operational', capacity: 8_500_000 },
  { code: 'RMC-JDH-03', name: 'Bhojudih Open Cast', subsidiaryId: 'sub-01', region: 'Jharkhand', district: 'Dhanbad', state: 'Jharkhand', lat: 23.751, lng: 86.481, status: 'partial', capacity: 6_200_000 },
  { code: 'CVR-MH-01', name: 'Wani Open Cast', subsidiaryId: 'sub-02', region: 'Maharashtra', district: 'Chandrapur', state: 'Maharashtra', lat: 19.953, lng: 79.296, status: 'operational', capacity: 9_800_000 },
  { code: 'CVR-MH-02', name: 'Ballarpahalli UG', subsidiaryId: 'sub-02', region: 'Maharashtra', district: 'Chandrapur', state: 'Maharashtra', lat: 20.012, lng: 79.341, status: 'operational', capacity: 3_400_000 },
  { code: 'CVR-MH-03', name: 'Ghodgaon Reclamation', subsidiaryId: 'sub-02', region: 'Maharashtra', district: 'Yavatmal', state: 'Maharashtra', lat: 20.104, lng: 79.402, status: 'suspended', capacity: 1_900_000 },
  { code: 'SVC-MP-01', name: 'Singrauli Main Pit', subsidiaryId: 'sub-03', region: 'Madhya Pradesh', district: 'Singrauli', state: 'Madhya Pradesh', lat: 24.199, lng: 82.675, status: 'operational', capacity: 15_500_000 },
  { code: 'SVC-MP-02', name: 'Dudhichua Extension', subsidiaryId: 'sub-03', region: 'Madhya Pradesh', district: 'Singrauli', state: 'Madhya Pradesh', lat: 24.233, lng: 82.711, status: 'operational', capacity: 10_100_000 },
  { code: 'SVC-MP-03', name: 'Nigahi West Block', subsidiaryId: 'sub-03', region: 'Madhya Pradesh', district: 'Singrauli', state: 'Madhya Pradesh', lat: 24.161, lng: 82.646, status: 'operational', capacity: 11_700_000 },
  { code: 'KMC-WB-01', name: 'Khanpur Open Cast', subsidiaryId: 'sub-04', region: 'West Bengal', district: 'Paschim Bardhaman', state: 'West Bengal', lat: 23.589, lng: 87.210, status: 'operational', capacity: 5_300_000 },
  { code: 'KMC-WB-02', name: 'Balmuri Shaft', subsidiaryId: 'sub-04', region: 'West Bengal', district: 'Paschim Bardhaman', state: 'West Bengal', lat: 23.632, lng: 87.178, status: 'operational', capacity: 2_800_000 },
  { code: 'KMC-WB-03', name: 'Kulti Legacy Site', subsidiaryId: 'sub-04', region: 'West Bengal', district: 'Paschim Bardhaman', state: 'West Bengal', lat: 23.548, lng: 87.244, status: 'decommissioned', capacity: 0 },
];

const USER_SEEDS: {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  title: string;
  mineIds: string[];
  subsidiaryIds: string[];
}[] = [
  { id: 'usr-01', name: 'Anita Deshmukh', email: 'anita.deshmukh@example.invalid', role: 'compliance_officer', title: 'Head of Compliance', mineIds: [], subsidiaryIds: [] },
  { id: 'usr-02', name: 'Ravinder Singh', email: 'ravinder.singh@example.invalid', role: 'mine_manager', title: 'Mine Manager, Rajmahal', mineIds: ['mine-01', 'mine-02', 'mine-03'], subsidiaryIds: ['sub-01'] },
  { id: 'usr-03', name: 'Meera Nair', email: 'meera.nair@example.invalid', role: 'safety_officer', title: 'Safety Officer, Sone Valley', mineIds: ['mine-07', 'mine-08', 'mine-09'], subsidiaryIds: ['sub-03'] },
  { id: 'usr-04', name: 'Suresh Kumar', email: 'suresh.kumar@example.invalid', role: 'field_inspector', title: 'Field Inspector (Contract)', mineIds: ['mine-01', 'mine-04', 'mine-07', 'mine-10'], subsidiaryIds: [] },
  { id: 'usr-05', name: 'Priya Iyer', email: 'priya.iyer@example.invalid', role: 'environmental_officer', title: 'Environmental Officer', mineIds: [], subsidiaryIds: [] },
  { id: 'usr-06', name: 'Deepak Mishra', email: 'deepak.mishra@example.invalid', role: 'contractor_manager', title: 'Contractor Relationship Manager', mineIds: [], subsidiaryIds: [] },
  { id: 'usr-07', name: 'Nandini Rao', email: 'nandini.rao@example.invalid', role: 'corporate_management', title: 'Head of Operations', mineIds: [], subsidiaryIds: [] },
  { id: 'usr-08', name: 'Vikram Chatterjee', email: 'vikram.chatterjee@example.invalid', role: 'regulatory_user', title: 'Regional Inspector', mineIds: [], subsidiaryIds: [] },
  { id: 'usr-09', name: 'Aarti Bhosale', email: 'aarti.bhosale@example.invalid', role: 'mine_admin', title: 'Mine Administrator, Wani', mineIds: ['mine-04', 'mine-05', 'mine-06'], subsidiaryIds: ['sub-02'] },
  { id: 'usr-10', name: 'Rohit Saxena', email: 'rohit.saxena@example.invalid', role: 'system_admin', title: 'Platform Administrator', mineIds: [], subsidiaryIds: [] },
  { id: 'usr-11', name: 'Kavita Reddy', email: 'kavita.reddy@example.invalid', role: 'mine_manager', title: 'Mine Manager, Sone Valley', mineIds: ['mine-07', 'mine-08', 'mine-09'], subsidiaryIds: ['sub-03'] },
  { id: 'usr-12', name: 'Imran Sheikh', email: 'imran.sheikh@example.invalid', role: 'safety_officer', title: 'Safety Officer, Khanpur', mineIds: ['mine-10', 'mine-11'], subsidiaryIds: ['sub-04'] },
];

const COMPLIANCE_TEMPLATES: {
  title: string;
  description: string;
  category: ComplianceRecord['category'];
  priority: ComplianceRecord['priority'];
  frequency: NonNullable<ComplianceRecord['submissionFrequency']>;
  ref: string;
}[] = [
  { title: 'Statutory return submission — mine safety', description: 'Periodic safety return compiled from the site register and submitted to the designated authority.', category: 'mine_safety', priority: 'high', frequency: 'monthly', ref: 'CG-REG-SAF-001' },
  { title: 'Statutory return submission — environment', description: 'Environmental return covering monitoring stations, abatement equipment status and incident reporting.', category: 'environment', priority: 'high', frequency: 'monthly', ref: 'CG-REG-ENV-002' },
  { title: 'Production dispatch reporting', description: 'Period-wise production and dispatch reconciliation submitted against the approved plan.', category: 'production', priority: 'medium', frequency: 'monthly', ref: 'CG-REG-PRD-003' },
  { title: 'Labour welfare record review', description: 'Review of shift rosters, welfare facility usage and hours-of-work records.', category: 'labour', priority: 'medium', frequency: 'monthly', ref: 'CG-REG-LAB-004' },
  { title: 'Contractor obligation register review', description: 'Review of contractor documentation, validity, insurance and safety induction records.', category: 'contractor', priority: 'high', frequency: 'quarterly', ref: 'CG-REG-CON-005' },
  { title: 'Statutory inspection record reconciliation', description: 'Reconciliation of inspection observations with the compliance register.', category: 'mine_safety', priority: 'critical', frequency: 'monthly', ref: 'CG-REG-SAF-006' },
  { title: 'Abatement equipment maintenance certification', description: 'Certification record for dust suppression, water spraying and monitoring equipment.', category: 'environment', priority: 'medium', frequency: 'monthly', ref: 'CG-REG-ENV-007' },
  { title: 'Emergency response plan exercise record', description: 'Record of the scheduled emergency response exercise including participant attendance.', category: 'mine_safety', priority: 'high', frequency: 'quarterly', ref: 'CG-REG-SAF-008' },
  { title: 'Worker grievance disposition summary', description: 'Summary of grievances raised, acknowledged and closed within the reporting period.', category: 'labour', priority: 'medium', frequency: 'monthly', ref: 'CG-REG-LAB-009' },
  { title: 'Land reclamation and rehabilitation progress', description: 'Progress report against the approved reclamation plan including area-wise status.', category: 'environment', priority: 'medium', frequency: 'quarterly', ref: 'CG-REG-ENV-010' },
  { title: 'Third-party weightment reconciliation', description: 'Reconciliation of dispatch weighment against receiving records.', category: 'production', priority: 'medium', frequency: 'monthly', ref: 'CG-REG-PRD-011' },
  { title: 'Competency certification index', description: 'Index of competency certifications for statutory and appointed roles.', category: 'mine_safety', priority: 'high', frequency: 'annual', ref: 'CG-REG-SAF-012' },
];

const INSPECTION_SCOPES: Record<string, string[]> = {
  statutory_safety: [
    'Ground control and working-section inspection',
    'Shotfiring and explosives storage inspection',
    'Ventilation adequacy check',
    'Electrical installation and earthing inspection',
  ],
  environment: [
    'Abatement plant operational check',
    'Monitoring station calibration review',
    'Water treatment plant walkthrough',
    'Boundary dust deposition survey review',
  ],
  production: ['Face bench and dragline inspection', 'Crusher and conveyor walkdown', 'Stockpile and dispatch yard check'],
  labour: ['Shift roster verification', 'Welfare facility inspection', 'Hours-of-work record audit'],
  contractor: ['Contractor workface inspection', 'Contractor camp and store audit', 'Contractor vehicle and operator checks'],
  ad_hoc: ['Special investigation visit', 'Follow-up verification visit', 'Complaint-based inspection'],
};

const HAZARD_TEMPLATES = [
  { title: 'Inadequate illumination at loading ramp', description: 'Loading ramp lighting is below the standard specified in the site plan; two workers reported reduced visibility during the night shift.' },
  { title: 'Water seepage observed near 3rd level gallery', description: 'Seepage noticed at the face after rainfall; pumping capacity appears insufficient for the inflow rate.' },
  { title: 'Conveyor belt tracking guard missing', description: 'Return side tracking guard removed on the CV-4 section; risk of belt mistracking.' },
  { title: 'Fire extinguishers not verified on surface stores', description: 'Monthly verification tags on extinguishers in the surface stores were found expired.' },
  { title: 'Overhead power line clearance not marked', description: 'Clearance markers absent along the overhead line crossing used by the dumper fleet.' },
  { title: 'Dust suppression nozzle not delivering', description: 'One water spraying nozzle on the haul road was blocked, reducing suppression coverage.' },
  { title: 'Unused drill rods stored in access drift', description: 'Drill rods left in a disused access drift create an obstruction for escape routes.' },
  { title: 'First aid box inventory incomplete', description: 'Surface first aid box was missing dressings and a sterilised water bottle.' },
  { title: 'Trip wire and guard removed on crusher', description: 'Interlock guard on the crusher feed was found disconnected during a maintenance activity.' },
  { title: 'Barricading absent at abandoned incline', description: 'Abandoned incline lacks barricades and warning signage.' },
];

const INCIDENT_TEMPLATES = [
  { title: 'Haul road vehicle collision near dispatch yard', description: 'A dumper and a light vehicle came into contact at the dispatch yard crossing during a shift change.', injuries: 1, downtime: 6 },
  { title: 'Conveyor belt misalignment leading to spillage', description: 'Belt tracking deviation on CV-2 caused spillage and a stoppage pending re-tensioning.', injuries: 0, downtime: 14 },
  { title: 'Minor roof fall at panel 4 working face', description: 'A small cavity fall at the face was cleared; no personnel were in the affected zone.', injuries: 0, downtime: 4 },
  { title: 'PPE non-use escalated during third-party audit', description: 'Two personnel were observed without helmets in the loading area; the observation was escalated.', injuries: 0, downtime: 2 },
  { title: 'Electrical supply interruption to crusher house', description: 'Supply trip caused an unplanned stoppage of the crusher house; root cause under investigation.', injuries: 0, downtime: 9 },
];

const ENV_THRESHOLDS: EnvironmentalThresholdRegister = {
  provenance:
    'Development adapter placeholder thresholds. In production these values are supplied by the configured environmental reference register maintained by the environmental officer.',
  lastConfiguredAt: '2026-01-05T09:00:00.000Z',
  thresholds: [
    { indicator: 'air_quality_pm10', unit: 'µg/m³', limit: 100, comparison: 'above', label: 'PM10 — ambient concentration', configuredBy: 'usr-05' },
    { indicator: 'air_quality_pm25', unit: 'µg/m³', limit: 60, comparison: 'above', label: 'PM2.5 — ambient concentration', configuredBy: 'usr-05' },
    { indicator: 'dust_deposition', unit: 'mg/m²/day', limit: 30, comparison: 'above', label: 'Dust deposition rate', configuredBy: 'usr-05' },
    { indicator: 'water_quality_ph', unit: 'pH', limit: 6.5, comparison: 'below', label: 'Water pH — lower bound', configuredBy: 'usr-05' },
    { indicator: 'water_quality_tds', unit: 'mg/l', limit: 1000, comparison: 'above', label: 'Water TDS — upper bound', configuredBy: 'usr-05' },
    { indicator: 'noise_level', unit: 'dB(A)', limit: 85, comparison: 'above', label: 'Noise level at boundary', configuredBy: 'usr-05' },
    { indicator: 'stack_emission', unit: 'mg/Nm³', limit: 50, comparison: 'above', label: 'Stack emission particulate', configuredBy: 'usr-05' },
    { indicator: 'waste_generation', unit: 'tonnes/day', limit: 12, comparison: 'above', label: 'Daily waste generation', configuredBy: 'usr-05' },
  ],
};

const CONTRACTOR_SEEDS: {
  code: string;
  name: string;
  type: Contractor['type'];
  contact: string;
  email: string;
  phone: string;
  address: string;
}[] = [
  { code: 'CON-001', name: 'Deep Rock Drilling Services', type: 'drilling', contact: 'Sanjay Verma', email: 'sanjay.verma@example.invalid', phone: '+91 90000 11001', address: 'Dhanbad, Jharkhand' },
  { code: 'CON-002', name: 'Sagar Blasting & Explosives', type: 'blasting', contact: 'Nitin Gupta', email: 'nitin.gupta@example.invalid', phone: '+91 90000 11002', address: 'Singrauli, Madhya Pradesh' },
  { code: 'CON-003', name: 'Konkan Haulage Carriers', type: 'hauling', contact: 'Farida Sayyed', email: 'farida.sayyed@example.invalid', phone: '+91 90000 11003', address: 'Chandrapur, Maharashtra' },
  { code: 'CON-004', name: 'Bharat Mine Maintenance Works', type: 'maintenance', contact: 'Ganesh Patil', email: 'ganesh.patil@example.invalid', phone: '+91 90000 11004', address: 'Nagpur, Maharashtra' },
  { code: 'CON-005', name: 'Ter civil & earthworks', type: 'civil_works', contact: 'Manoj Yadav', email: 'manoj.yadav@example.invalid', phone: '+91 90000 11005', address: 'Asansol, West Bengal' },
  { code: 'CON-006', name: 'Sunrise Security Services', type: 'security', contact: 'Rakesh Pillai', email: 'rakesh.pillai@example.invalid', phone: '+91 90000 11006', address: 'Dhanbad, Jharkhand' },
  { code: 'CON-007', name: 'Eastern Coal Transport Co.', type: 'transport', contact: 'Biswanath Das', email: 'biswanath.das@example.invalid', phone: '+91 90000 11007', address: 'Asansol, West Bengal' },
  { code: 'CON-008', name: 'Sahyogri Shaft Services', type: 'maintenance', contact: 'Kavita More', email: 'kavita.more@example.invalid', phone: '+91 90000 11008', address: 'Chandrapur, Maharashtra' },
  { code: 'CON-009', name: 'Urja Reclamation Services', type: 'civil_works', contact: 'Rakesh Ranjan', email: 'rakesh.ranjan@example.invalid', phone: '+91 90000 11009', address: 'Singrauli, Madhya Pradesh' },
  { code: 'CON-010', name: 'Vaishno Exploration Drilling', type: 'drilling', contact: 'Anil Pradhan', email: 'anil.pradhan@example.invalid', phone: '+91 90000 11010', address: 'Asansol, West Bengal' },
];

const DOC_TYPES: DocumentRecord['type'][] = [
  'compliance_evidence',
  'inspection_report',
  'contract',
  'worker_record',
  'environment_log',
  'production_report',
];

export function createSeedDatabase(now: Date = new Date()): DevDatabase {
  const random = createSeededRandom(SEED);
  const anchor = new Date(now.getTime());
  anchor.setHours(0, 0, 0, 0);

  const iso = (daysOffset: number, hour = 9, minute = 0): string => {
    const date = new Date(anchor.getTime());
    date.setDate(date.getDate() + daysOffset);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const dayOnly = (daysOffset: number): string => {
    const date = new Date(anchor.getTime());
    date.setDate(date.getDate() + daysOffset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const users: User[] = USER_SEEDS.map((seed, index) => ({
    ...seed,
    developmentIdentity: true,
    lastLoginAt: iso(-index, 8, 30),
  }));

  const mines: Mine[] = MINE_SEEDS.map((seed, index) => {
    const id = `mine-${String(index + 1).padStart(2, '0')}`;
    return {
      id,
      code: seed.code,
      name: seed.name,
      subsidiaryId: seed.subsidiaryId,
      region: seed.region,
      district: seed.district,
      state: seed.state,
      operationalStatus: seed.status,
      approvedCapacityTPA: seed.capacity > 0 ? seed.capacity : undefined,
      commissionedOn: dayOnly(-2200 + index * 90),
      mineManagerId: users.find((u) => u.role === 'mine_manager' && u.mineIds.includes(id))?.id,
      safetyOfficerId: users.find((u) => u.role === 'safety_officer' && u.mineIds.includes(id))?.id,
      complianceOfficerId: 'usr-01',
      environmentalOfficerId: 'usr-05',
      contactPhone: `+91 90000 2${String(index + 1).padStart(4, '0')}`,
      note:
        'Location is an illustrative district centroid from the development dataset, not a surveyed mine boundary.',
      location: {
        lat: seed.lat,
        lng: seed.lng,
        source: 'mine_registry',
        capturedAt: iso(-2200 + index * 90, 0, 0),
      },
    };
  });

  const operationalMines = mines.filter((m) => m.operationalStatus === 'operational');
  const minePool = [...operationalMines, ...mines.filter((m) => m.operationalStatus !== 'operational')];

  /* ---------------------------------------------------------------------- */
  /* Compliance records                                                     */
  /* ---------------------------------------------------------------------- */
  const complianceStatuses: ComplianceRecord['status'][] = [
    'compliant',
    'compliant',
    'non_compliant',
    'awaiting_verification',
    'under_review',
    'submitted',
    'pending_submission',
    'overdue',
    'draft',
  ];
  const compliance: ComplianceRecord[] = [];
  let complianceCounter = 0;
  for (const template of COMPLIANCE_TEMPLATES) {
    const targetMines = minePool.filter(() => random() > 0.45).slice(0, 3);
    const applicable = (targetMines.length ? targetMines : [minePool[0]!]).map((m) => m.id);
    for (const mineId of applicable) {
      complianceCounter += 1;
      const status = complianceStatuses[Math.floor(random() * complianceStatuses.length)]!;
      const dueOffset = Math.floor(random() * 60) - 25;
      const mine = mines.find((m) => m.id === mineId)!;
      compliance.push({
        id: `cmp-${String(complianceCounter).padStart(3, '0')}`,
        code: `${template.ref}-${String(complianceCounter).padStart(3, '0')}`,
        title: `${template.title} — ${mine.name}`,
        description: template.description,
        category: template.category,
        applicableMineIds: [mineId],
        responsibleOfficerId: mine.complianceOfficerId ?? 'usr-01',
        sourceReference: `${template.ref} (development register placeholder)`,
        effectiveFrom: dayOnly(-120),
        dueDate: dayOnly(dueOffset),
        status,
        priority: template.priority,
        submissionFrequency: template.frequency,
        lastSubmittedAt: status === 'draft' || status === 'pending_submission' ? undefined : iso(dueOffset - 3, 17, 10),
        lastVerifiedAt: status === 'compliant' || status === 'non_compliant' ? iso(dueOffset + 2, 11, 0) : undefined,
        verificationStatus:
          status === 'compliant'
            ? 'verified'
            : status === 'non_compliant'
              ? 'rejected'
              : status === 'awaiting_verification'
                ? 'pending'
                : 'not_required',
        evidenceDocumentIds: [],
        linkedViolationIds: [],
        linkedCorrectiveActionIds: [],
        updatedAt: iso(dueOffset - 2, 12, 30),
        updatedBy: 'usr-01',
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Inspections                                                            */
  /* ---------------------------------------------------------------------- */
  const inspections: Inspection[] = [];
  const inspectionTypes: Inspection['type'][] = ['statutory_safety', 'environment', 'production', 'labour', 'contractor', 'ad_hoc'];
  for (let i = 0; i < 42; i += 1) {
    const mine = minePool[Math.floor(random() * minePool.length)]!;
    const type = inspectionTypes[Math.floor(random() * inspectionTypes.length)]!;
    const scheduledOffset = Math.floor(random() * 80) - 45;
    const statusRoll = random();
    const status: Inspection['status'] =
      scheduledOffset > 0
        ? 'scheduled'
        : statusRoll < 0.42
          ? 'completed'
          : statusRoll < 0.6
            ? 'submitted'
            : statusRoll < 0.72
              ? 'under_review'
              : statusRoll < 0.88
                ? 'in_progress'
                : 'cancelled';
    const findings: Inspection['findings'] = [];
    const findingCount = status === 'completed' || status === 'submitted' || status === 'under_review' ? Math.floor(random() * 4) : 0;
    for (let f = 0; f < findingCount; f += 1) {
      const template = HAZARD_TEMPLATES[Math.floor(random() * HAZARD_TEMPLATES.length)]!;
      findings.push({
        id: `fnd-${i}-${f}`,
        description: template.description,
        category: type === 'environment' ? 'environment' : 'mine_safety',
        severity: random() > 0.8 ? 'critical' : random() > 0.55 ? 'high' : random() > 0.3 ? 'medium' : 'low',
        isViolation: random() > 0.6,
        complianceRecordIds: [],
        raisedAt: iso(scheduledOffset, 11, f * 7),
        recordedBy: 'usr-04',
      });
    }
    const inspector = users.find((u) => u.role === 'field_inspector')!.id;
    const reviewHistory: Inspection['reviewHistory'] = [];
    if (status === 'submitted' || status === 'under_review' || status === 'completed') {
      reviewHistory.push({
        id: `rev-${i}-1`,
        at: iso(scheduledOffset + 1, 10, 0),
        actorId: inspector,
        actorName: users.find((u) => u.id === inspector)!.name,
        fromStatus: 'in_progress',
        toStatus: 'submitted',
        comment: 'Inspection submitted for review.',
      });
    }
    if (status === 'under_review' || status === 'completed') {
      reviewHistory.push({
        id: `rev-${i}-2`,
        at: iso(scheduledOffset + 2, 15, 30),
        actorId: 'usr-01',
        actorName: 'Anita Deshmukh',
        fromStatus: 'submitted',
        toStatus: 'under_review',
        comment: 'Under compliance review.',
      });
    }
    if (status === 'completed') {
      reviewHistory.push({
        id: `rev-${i}-3`,
        at: iso(scheduledOffset + 3, 11, 45),
        actorId: 'usr-01',
        actorName: 'Anita Deshmukh',
        fromStatus: 'under_review',
        toStatus: 'completed',
        comment: 'Findings dispositioned and corrective actions raised.',
      });
    }
    inspections.push({
      id: `insp-${String(i + 1).padStart(3, '0')}`,
      code: `INS-2026-${String(i + 1).padStart(4, '0')}`,
      mineId: mine.id,
      type,
      inspectorId: inspector,
      scheduledDate: dayOnly(scheduledOffset),
      actualDate: scheduledOffset <= 0 && status !== 'scheduled' && status !== 'cancelled' ? dayOnly(scheduledOffset) : undefined,
      startedAt: status !== 'scheduled' && status !== 'cancelled' ? iso(scheduledOffset, 9, 30) : undefined,
      submittedAt: reviewHistory.length ? iso(scheduledOffset + 1, 10, 0) : undefined,
      completedAt: status === 'completed' ? iso(scheduledOffset + 3, 11, 45) : undefined,
      status,
      scope: INSPECTION_SCOPES[type]![Math.floor(random() * INSPECTION_SCOPES[type]!.length)],
      findings,
      evidenceDocumentIds: [],
      complianceRecordIds: compliance.filter((c) => c.category === (type === 'environment' ? 'environment' : 'mine_safety')).slice(0, 2).map((c) => c.id),
      correctiveActionIds: [],
      reviewerId: status === 'under_review' || status === 'completed' ? 'usr-01' : undefined,
      reviewHistory,
      location: mine.location ? { ...mine.location } : undefined,
      createdAt: iso(scheduledOffset - 6, 12, 0),
      createdBy: 'usr-01',
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Violations — derived from flagged inspection findings                 */
  /* ---------------------------------------------------------------------- */
  const violations: Violation[] = [];
  for (const inspection of inspections) {
    for (const finding of inspection.findings) {
      if (!finding.isViolation) continue;
      const index = violations.length + 1;
      const raisedOffset = -Math.floor(random() * 55);
      const dueOffset = raisedOffset + 10 + Math.floor(random() * 20);
      const statusRoll = random();
      const status: Violation['status'] =
        statusRoll < 0.4 ? 'open' : statusRoll < 0.62 ? 'under_remediation' : statusRoll < 0.82 ? 'awaiting_verification' : 'closed';
      violations.push({
        id: `vio-${String(index).padStart(4, '0')}`,
        code: `VIO-2026-${String(index).padStart(4, '0')}`,
        mineId: inspection.mineId,
        sourceType: 'inspection',
        sourceId: inspection.id,
        sourceCode: inspection.code,
        description: finding.description,
        severity: finding.severity,
        category: finding.category,
        raisedAt: finding.raisedAt,
        raisedBy: finding.recordedBy ?? 'usr-04',
        dueDate: dayOnly(dueOffset),
        status,
        correctiveActionIds: [],
        verifiedAt: status === 'closed' ? iso(dueOffset + 1, 11, 0) : undefined,
        verifiedBy: status === 'closed' ? 'usr-01' : undefined,
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Safety records, incidents and near misses                              */
  /* ---------------------------------------------------------------------- */
  const safetyRecords: SafetyRecord[] = [];
  const safetyTypes: SafetyRecord['type'][] = ['observation', 'observation', 'hazard', 'near_miss'];
  for (let i = 0; i < 48; i += 1) {
    const mine = minePool[Math.floor(random() * minePool.length)]!;
    const template = HAZARD_TEMPLATES[Math.floor(random() * HAZARD_TEMPLATES.length)]!;
    const type = safetyTypes[Math.floor(random() * safetyTypes.length)]!;
    const reportedOffset = Math.floor(random() * 70) - 50;
    const statusRoll = random();
    const status: SafetyRecord['status'] =
      statusRoll < 0.32 ? 'open' : statusRoll < 0.5 ? 'under_investigation' : statusRoll < 0.75 ? 'action_assigned' : statusRoll < 0.9 ? 'resolved' : 'closed';
    const jitter = () => (random() - 0.5) * 0.012;
    safetyRecords.push({
      id: `saf-${String(i + 1).padStart(3, '0')}`,
      code: `OBS-2026-${String(i + 1).padStart(4, '0')}`,
      type,
      mineId: mine.id,
      title: template.title,
      description: template.description,
      severity: random() > 0.85 ? 'critical' : random() > 0.6 ? 'high' : random() > 0.3 ? 'medium' : 'low',
      status,
      reportedBy: 'usr-04',
      reportedAt: iso(reportedOffset, 8 + Math.floor(random() * 10), Math.floor(random() * 60)),
      location: mine.location
        ? { lat: mine.location.lat + jitter(), lng: mine.location.lng + jitter(), accuracyM: 12 + Math.floor(random() * 40), source: 'device_gps', capturedAt: iso(reportedOffset, 8, 30) }
        : undefined,
      locationDescription: `${mine.name} — workface area`,
      assignedTo: status === 'open' ? undefined : 'usr-03',
      investigationOpenedAt: status !== 'open' ? iso(reportedOffset + 1, 10, 0) : undefined,
      investigationClosedAt: status === 'closed' ? iso(reportedOffset + 12, 16, 0) : undefined,
      correctiveActionIds: [],
      evidenceDocumentIds: [],
      relatedInspectionId: random() > 0.6 ? inspections[Math.floor(random() * inspections.length)]!.id : undefined,
    });
  }

  const incidents: Incident[] = INCIDENT_TEMPLATES.map((template, index) => {
    const mine = minePool[index % minePool.length]!;
    const occurredOffset = -Math.floor(random() * 55) - 2;
    const jitter = () => (random() - 0.5) * 0.01;
    return {
      id: `inc-${String(index + 1).padStart(3, '0')}`,
      code: `INC-2026-${String(index + 1).padStart(4, '0')}`,
      mineId: mine.id,
      title: template.title,
      description: template.description,
      severity: template.injuries > 0 ? 'critical' : template.downtime >= 8 ? 'high' : 'medium',
      occurredAt: iso(occurredOffset, 14, 20),
      reportedAt: iso(occurredOffset, 15, 5),
      reportedBy: 'usr-04',
      status: index === 0 ? 'under_investigation' : index === 1 ? 'action_assigned' : index === 2 ? 'resolved' : 'open',
      location: mine.location
        ? { lat: mine.location.lat + jitter(), lng: mine.location.lng + jitter(), accuracyM: 18 + Math.floor(random() * 30), source: 'device_gps', capturedAt: iso(occurredOffset, 14, 20) }
        : undefined,
      locationDescription: `${mine.name}`,
      injuriesReported: template.injuries,
      downtimeHours: template.downtime,
      assignedTo: 'usr-03',
      correctiveActionIds: [],
      evidenceDocumentIds: [],
      relatedInspectionId: undefined,
      investigationSummary:
        index === 0
          ? 'Investigation opened. Root cause analysis in progress; findings not yet concluded.'
          : 'Investigation closed with a documented cause and preventive measure.',
    } satisfies Incident;
  });

  const nearMisses: NearMiss[] = Array.from({ length: 9 }, (_, index) => {
    const mine = minePool[index % minePool.length]!;
    const template = HAZARD_TEMPLATES[(index + 3) % HAZARD_TEMPLATES.length]!;
    return {
      id: `nm-${String(index + 1).padStart(3, '0')}`,
      code: `NM-2026-${String(index + 1).padStart(4, '0')}`,
      mineId: mine.id,
      title: `Near miss — ${template.title.toLowerCase()}`,
      description: `${template.description} No injury or damage resulted.`,
      reportedBy: 'usr-04',
      reportedAt: iso(-index * 6 - 3, 13, 10),
      location: mine.location
        ? { lat: mine.location.lat + 0.004, lng: mine.location.lng - 0.003, accuracyM: 20, source: 'device_gps', capturedAt: iso(-index * 6 - 3, 13, 10) }
        : undefined,
      preventiveActions: ['Re-briefed the team on the standard operating procedure.', 'Added the check to the pre-shift checklist.'],
    };
  });

  /* ---------------------------------------------------------------------- */
  /* Environmental measurements                                             */
  /* ---------------------------------------------------------------------- */
  const environmental: EnvironmentalMeasurement[] = [];
  const envSources: EnvironmentalMeasurement['source'][] = ['sensor', 'sensor', 'manual', 'imported', 'sample'];
  for (let i = 0; i < 96; i += 1) {
    const mine = minePool[Math.floor(random() * minePool.length)]!;
    const threshold = ENV_THRESHOLDS.thresholds[Math.floor(random() * ENV_THRESHOLDS.thresholds.length)]!;
    const source = envSources[Math.floor(random() * envSources.length)]!;
    const exceeds = random() > 0.78;
    const base = threshold.limit ? threshold.limit * (0.5 + random() * 0.45) : 10;
    const value = Number(
      (exceeds ? (threshold.limit ?? base) * (1.05 + random() * 0.5) : base).toFixed(2),
    );
    const measuredOffset = -Math.floor(random() * 40);
    const stale = random() > 0.85;
    environmental.push({
      id: `env-${String(i + 1).padStart(4, '0')}`,
      mineId: mine.id,
      indicator: threshold.indicator,
      value,
      unit: threshold.unit,
      measuredAt: iso(measuredOffset, 6 + Math.floor(random() * 12), Math.floor(random() * 60)),
      location: mine.location ? { ...mine.location } : undefined,
      locationDescription: `${mine.name} — monitoring station ${Math.ceil(random() * 4)}`,
      source,
      thresholdId: threshold.indicator,
      status: !threshold.limit ? 'unknown' : exceeds ? 'exceeds_limit' : 'within_limit',
      sampleId: source === 'sample' ? `SMP-${1000 + i}` : undefined,
      inspectionId: random() > 0.85 ? inspections[Math.floor(random() * inspections.length)]!.id : undefined,
      evidenceDocumentIds: [],
      stale,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Production records                                                     */
  /* ---------------------------------------------------------------------- */
  const production: ProductionRecord[] = [];
  const productionAnomalies: ProductionAnomaly[] = [];
  let productionCounter = 0;
  for (const mine of operationalMines) {
    const baseline = 1800 + Math.floor(random() * 2600);
    for (let d = 0; d < 21; d += 1) {
      const date = dayOnly(-d);
      for (const shift of ['day', 'swing', 'night'] as const) {
        productionCounter += 1;
        const missing = random() > 0.94;
        if (missing) continue;
        const noise = (random() - 0.5) * baseline * 0.22;
        let tonnes = Math.round(baseline + noise);
        const target = Math.round(baseline * 1.02);
        const anomaly = Math.abs(tonnes - baseline) > baseline * 0.28;
        if (anomaly) {
          tonnes = Math.round(baseline * (tonnes > baseline ? 1.45 : 0.52));
          productionAnomalies.push({
            id: `anom-${productionCounter}`,
            mineId: mine.id,
            recordId: `prd-${String(productionCounter).padStart(5, '0')}`,
            date,
            metric: 'production_tonnes',
            direction: tonnes > baseline ? 'above' : 'below',
            zScore: Number(((tonnes - baseline) / (baseline * 0.12)).toFixed(2)),
            severity: Math.abs(tonnes - baseline) > baseline * 0.5 ? 'high' : 'medium',
            explanation: `Recorded dispatch deviated from the trailing shift median for ${mine.name}.`,
            detectedAt: iso(-d, 23, 30),
            detector: 'rule:rolling-median-v1',
            reviewStatus: 'unreviewed',
          });
        }
        const valueKind: ProductionRecord['valueKind'] = random() > 0.92 ? 'estimated' : random() > 0.15 ? 'approved' : 'reported';
        production.push({
          id: `prd-${String(productionCounter).padStart(5, '0')}`,
          mineId: mine.id,
          date,
          shift,
          productionTonnes: tonnes,
          targetTonnes: target,
          valueKind,
          estimateReason: valueKind === 'estimated' ? 'Weighment data not reconciled at the time of submission.' : undefined,
          shiftSupervisorId: mine.mineManagerId,
          sourceDocumentIds: [],
          anomalyIds: [],
          notes: undefined,
        });
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Contractors and contracts                                               */
  /* ---------------------------------------------------------------------- */
  const contractors: Contractor[] = CONTRACTOR_SEEDS.map((seed, index) => {
    const mineAssignments = minePool.filter((_, i) => i % 3 === index % 3).map((m) => m.id);
    const complianceRoll = random();
    return {
      id: `con-${String(index + 1).padStart(3, '0')}`,
      code: seed.code,
      name: seed.name,
      type: seed.type,
      contactPerson: seed.contact,
      contactEmail: seed.email,
      contactPhone: seed.phone,
      registeredAddress: seed.address,
      mineIds: mineAssignments.length ? mineAssignments : [minePool[0]!.id],
      complianceStatus:
        complianceRoll < 0.55 ? 'compliant' : complianceRoll < 0.7 ? 'non_compliant' : complianceRoll < 0.88 ? 'under_review' : 'unassessed',
      requiredDocumentIds: [],
      verifiedDocumentIds: [],
      safetyRecordIds: [],
      inspectionIds: inspections.filter((i) => mineAssignments.includes(i.mineId)).map((i) => i.id),
      openCorrectiveActionIds: [],
      registeredOn: dayOnly(-700 + index * 40),
      panNumber: `AA${String(100000 + index * 731)}X`,
      gstNumber: `19${String(100000 + index * 731)}A1Z${index}`,
    };
  });

  const contracts: Contract[] = [];
  let contractCounter = 0;
  for (const contractor of contractors) {
    const count = 1 + Math.floor(random() * 2);
    for (let c = 0; c < count; c += 1) {
      contractCounter += 1;
      const endOffset = Math.floor(random() * 200) - 60;
      const status: Contract['status'] =
        endOffset < 0 ? 'expired' : endOffset <= 45 ? 'expiring' : 'active';
      contracts.push({
        id: `ctr-${String(contractCounter).padStart(3, '0')}`,
        code: `CTR-${2024 + (contractCounter % 3)}-${String(contractCounter).padStart(4, '0')}`,
        contractorId: contractor.id,
        mineId: contractor.mineIds[contractCounter % contractor.mineIds.length]!,
        title: `${contractor.type.replace('_', ' ')} services — ${contractor.name}`,
        scope: `Scope of work as recorded in the executed agreement for ${contractor.type.replace('_', ' ')} activities.`,
        startDate: dayOnly(endOffset - 365),
        endDate: dayOnly(endOffset),
        valueInrLakhs: 50 + Math.floor(random() * 900),
        status,
        approvedBy: 'usr-07',
        documentIds: [],
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Workforce attendance                                                   */
  /* ---------------------------------------------------------------------- */
  const attendance: AttendanceRecord[] = [];
  let attendanceCounter = 0;
  for (const mine of operationalMines) {
    for (let d = 0; d < 7; d += 1) {
      const crewSize = 6 + Math.floor(random() * 5);
      for (let w = 0; w < crewSize; w += 1) {
        attendanceCounter += 1;
        const isContractor = random() > 0.55;
        const contractor = contractors.find((c) => c.mineIds.includes(mine.id));
        const roll = random();
        const status: AttendanceRecord['status'] =
          roll < 0.78 ? 'present' : roll < 0.86 ? 'absent' : roll < 0.93 ? 'leave' : roll < 0.97 ? 'half_day' : 'not_recorded';
        const corrections: AttendanceRecord['corrections'] = [];
        if (random() > 0.88) {
          corrections.push({
            id: `cor-${attendanceCounter}`,
            at: iso(-d, 19, 0),
            originalStatus: 'not_recorded',
            correctedStatus: 'present',
            reason: 'Attendance was missed during shift handover; confirmed against the gate register.',
            requestedBy: 'usr-02',
            approvedBy: random() > 0.5 ? 'usr-02' : undefined,
            approvedAt: random() > 0.5 ? iso(-d + 1, 9, 0) : undefined,
            status: random() > 0.5 ? 'approved' : 'pending',
          });
        }
        attendance.push({
          id: `att-${String(attendanceCounter).padStart(5, '0')}`,
          workerRef: `WKR-${String(1000 + attendanceCounter)}`,
          workerDisplayName: `Worker ${String(1000 + attendanceCounter).slice(-4)}`,
          mineId: mine.id,
          contractorId: isContractor && contractor ? contractor.id : undefined,
          date: dayOnly(-d),
          shift: (['day', 'swing', 'night'] as const)[Math.floor(random() * 3)]!,
          status,
          recordedAt: iso(-d, 7, 30),
          evidenceDocumentIds: [],
          corrections,
        });
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Documents                                                              */
  /* ---------------------------------------------------------------------- */
  const documents: DocumentRecord[] = [];
  const documentContent: Record<string, string> = {};
  for (let i = 0; i < 28; i += 1) {
    const mine = minePool[Math.floor(random() * minePool.length)]!;
    const type = DOC_TYPES[i % DOC_TYPES.length]!;
    const statusRoll = random();
    const status: DocumentRecord['status'] =
      statusRoll < 0.28 ? 'processed' : statusRoll < 0.45 ? 'needs_review' : statusRoll < 0.6 ? 'processing' : statusRoll < 0.72 ? 'queued' : statusRoll < 0.86 ? 'uploaded' : 'failed';
    const id = `doc-${String(i + 1).padStart(3, '0')}`;
    const name = `${type.replace('_', '-')}-${mine.code}-${String(i + 1).padStart(3, '0')}.pdf`;
    const extractedFields: DocumentRecord['extractedFields'] =
      status === 'processed' || status === 'needs_review'
        ? [
            { id: `${id}-f1`, label: 'Mine name', value: mine.name, confidence: 0.94, pageNumber: 1, confirmed: false },
            { id: `${id}-f2`, label: 'Reporting period', value: dayOnly(-20), confidence: 0.87, pageNumber: 1, confirmed: false },
            { id: `${id}-f3`, label: 'Responsible officer', value: 'Ravinder Singh', confidence: 0.72, pageNumber: 2, confirmed: false },
            { id: `${id}-f4`, label: 'Total quantity (tonnes)', value: String(1200 + Math.floor(random() * 8000)), confidence: 0.81, pageNumber: 2, confirmed: false },
          ]
        : [];
    documents.push({
      id,
      name,
      type,
      mimeType: 'application/pdf',
      sizeBytes: 120_000 + Math.floor(random() * 2_400_000),
      uploadedBy: 'usr-01',
      uploadedAt: iso(-Math.floor(random() * 40), 10, 15),
      status,
      mineId: mine.id,
      linkedComplianceIds: [],
      ocrEngine: status === 'processed' || status === 'needs_review' ? 'development-mock-ocr' : undefined,
      ocrConfidence: status === 'processed' || status === 'needs_review' ? 0.68 + random() * 0.3 : undefined,
      ocrProcessedAt: status === 'processed' || status === 'needs_review' ? iso(-Math.floor(random() * 30), 10, 40) : undefined,
      ocrError: status === 'failed' ? 'OCR processing failed: the document image could not be decoded (development simulation).' : undefined,
      extractedFields,
      extractedText:
        status === 'processed' || status === 'needs_review'
          ? `Demonstration OCR output for ${name}. Extracted text is a placeholder generated by the development adapter.`
          : undefined,
      detectedLanguage: 'en',
    });
    documentContent[id] = `Demonstration file content for ${name}.`;
  }

  /* ---------------------------------------------------------------------- */
  /* Corrective actions                                                     */
  /* ---------------------------------------------------------------------- */
  const correctiveActions: CorrectiveAction[] = [];
  const actionStatuses: CorrectiveAction['status'][] = [
    'proposed',
    'assigned',
    'in_progress',
    'submitted_for_verification',
    'verified',
    'rejected',
    'closed',
  ];
  for (let i = 0; i < 36; i += 1) {
    const sourceRoll = random();
    const sourceType: CorrectiveAction['sourceType'] =
      sourceRoll < 0.35 ? 'inspection' : sourceRoll < 0.6 ? 'violation' : sourceRoll < 0.82 ? 'observation' : 'incident';
    const source =
      sourceType === 'inspection'
        ? inspections[Math.floor(random() * inspections.length)]!
        : sourceType === 'violation'
          ? violations[Math.floor(random() * violations.length)] ?? inspections[0]!
          : sourceType === 'observation'
            ? safetyRecords[Math.floor(random() * safetyRecords.length)]!
            : incidents[Math.floor(random() * incidents.length)]!;
    const status = actionStatuses[Math.floor(random() * actionStatuses.length)]!;
    const createdOffset = -Math.floor(random() * 60);
    const dueOffset = createdOffset + 7 + Math.floor(random() * 25);
    const owner = users.find((u) => u.role === 'safety_officer')!.id;
    correctiveActions.push({
      id: `ca-${String(i + 1).padStart(3, '0')}`,
      code: `CA-2026-${String(i + 1).padStart(4, '0')}`,
      sourceType,
      sourceId: source.id,
      mineId: source.mineId,
      description: `Rectify the condition recorded in ${source.code}.`,
      assignedTo: status === 'proposed' ? undefined : owner,
      priority: random() > 0.82 ? 'critical' : random() > 0.55 ? 'high' : random() > 0.3 ? 'medium' : 'low',
      createdAt: iso(createdOffset, 11, 0),
      createdBy: 'usr-01',
      dueDate: dayOnly(dueOffset),
      status,
      evidenceDocumentIds: [],
      completionNotes: status === 'submitted_for_verification' || status === 'verified' || status === 'closed' ? 'Rectification completed and evidenced with dated photographs.' : undefined,
      submittedAt: ['submitted_for_verification', 'verified', 'closed'].includes(status) ? iso(dueOffset, 16, 0) : undefined,
      verificationStatus: status === 'verified' || status === 'closed' ? 'verified' : status === 'rejected' ? 'rejected' : status === 'submitted_for_verification' ? 'pending' : 'not_required',
      verifiedAt: status === 'verified' || status === 'closed' ? iso(dueOffset + 1, 10, 30) : undefined,
      verifiedBy: status === 'verified' || status === 'closed' ? 'usr-01' : undefined,
      rejectionReason: status === 'rejected' ? 'Evidence did not clearly demonstrate the rectification; resubmit with a dated site photograph.' : undefined,
      closedAt: status === 'closed' ? iso(dueOffset + 2, 12, 0) : undefined,
      auditHistory: [],
    });
  }

  // Link corrective actions back to the violations they remediate.
  for (const action of correctiveActions) {
    if (action.sourceType !== 'violation') continue;
    const violation = violations.find((v) => v.id === action.sourceId);
    if (violation && !violation.correctiveActionIds.includes(action.id)) {
      violation.correctiveActionIds.push(action.id);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* AI insights                                                            */
  /* ---------------------------------------------------------------------- */  const insightTemplates: { title: string; category: AiInsight['category']; explanation: string; recommendation: string }[] = [
    { title: 'Recurring road-edge lighting non-conformance', category: 'recurring_violations', explanation: 'Six lighting-related findings were raised at the same mine across three inspections in the last 45 days.', recommendation: 'Schedule a lighting upgrade and re-inspect after completion.' },
    { title: 'Overdue compliance submissions trend increasing', category: 'overdue_pattern', explanation: 'Overdue submissions for this mine rose for four consecutive reporting periods.', recommendation: 'Review the submission workflow and assign a backup responsible officer.' },
    { title: 'Repeated near-miss concentration on haul roads', category: 'safety_repeat_offences', explanation: 'Near-miss reports cluster on the same haul road segment during night shifts.', recommendation: 'Introduce a speed-control checkpoint and night-shift briefing.' },
    { title: 'Abatement plant uptime below expectation', category: 'environmental_anomaly', explanation: 'The dust suppression plant reported frequent stoppages across the last two weeks.', recommendation: 'Schedule preventive maintenance and verify spray coverage.' },
    { title: 'Dispatch volatility inconsistent with plan', category: 'production_anomaly', explanation: 'Shift-level dispatch shows higher variance than the trailing 30-day baseline.', recommendation: 'Reconcile weighment data and verify shift allocation.' },
    { title: 'Contractor documentation approaching expiry', category: 'contractor_risk', explanation: 'Multiple mandatory contractor documents for this mine expire within 45 days.', recommendation: 'Collect renewed documents before the expiry window.' },
    { title: 'High-risk concentration in one subsidiary', category: 'compliance_risk', explanation: 'Elevated risk scores are concentrated in a single subsidiary across several categories.', recommendation: 'Commission a focused governance review for the subsidiary.' },
  ];
  const insights: AiInsight[] = insightTemplates.map((template, index) => {
    const mine = minePool[index % minePool.length]!;
    const levelRoll = random();
    const riskLevel: AiInsight['riskLevel'] =
      levelRoll < 0.15 ? 'critical' : levelRoll < 0.35 ? 'high' : levelRoll < 0.6 ? 'elevated' : levelRoll < 0.82 ? 'moderate' : 'low';
    return {
      id: `ins-${String(index + 1).padStart(3, '0')}`,
      code: `AI-2026-${String(index + 1).padStart(3, '0')}`,
      title: template.title,
      category: template.category,
      mineId: mine.id,
      subsidiaryId: mine.subsidiaryId,
      riskLevel,
      modelSource: 'development-rules-v1',
      generatedAt: iso(-Math.floor(random() * 6), 4, 0),
      dataFreshnessHours: 2 + Math.floor(random() * 48),
      confidence: 0.55 + random() * 0.4,
      evidence: [
        { label: 'Related records', detail: `${3 + Math.floor(random() * 12)} matching records in the analysis window`, kind: 'observed_fact' },
        { label: 'Deviation measure', detail: `${(1.2 + random() * 3).toFixed(1)}× the trailing baseline`, kind: 'statistical_indicator' },
        { label: 'Projection', detail: 'Risk is projected to persist over the next reporting period if no corrective action is taken.', kind: 'prediction' },
        { label: 'Suggested action', detail: template.recommendation, kind: 'recommendation' },
      ],
      explanation: template.explanation,
      recommendation: template.recommendation,
      reviewStatus: index < 2 ? 'unreviewed' : index < 4 ? 'acknowledged' : index < 6 ? 'investigating' : 'dismissed',
      reviewedBy: index >= 2 ? 'usr-01' : undefined,
      reviewedAt: index >= 2 ? iso(-1, 10, 0) : undefined,
      relatedEntityIds: [],
      isPrediction: true,
      limitations: [
        'Produced by the development adapter using deterministic rules, not by a trained production model.',
        'Input completeness depends on records submitted during the analysis window.',
      ],
    };
  });

  /* ---------------------------------------------------------------------- */
  /* Notifications                                                          */
  /* ---------------------------------------------------------------------- */
  const notifications: AppNotification[] = [];
  for (let i = 0; i < 22; i += 1) {
    const mine = minePool[i % minePool.length]!;
    const typeRoll = random();
    const type: AppNotification['type'] =
      typeRoll < 0.22 ? 'compliance_overdue' : typeRoll < 0.4 ? 'compliance_deadline' : typeRoll < 0.55 ? 'inspection_assigned' : typeRoll < 0.68 ? 'review_request' : typeRoll < 0.8 ? 'corrective_action_reminder' : typeRoll < 0.9 ? 'contract_expiring' : typeRoll < 0.96 ? 'environmental_alert' : 'safety_observation';
    const severity: AppNotification['severity'] = type === 'compliance_overdue' || type === 'environmental_alert' ? 'critical' : type === 'safety_observation' ? 'warning' : 'info';
    const related =
      type === 'compliance_overdue' || type === 'compliance_deadline'
        ? compliance.find((c) => c.applicableMineIds.includes(mine.id)) ?? compliance[0]!
        : type === 'inspection_assigned'
          ? inspections.find((ins) => ins.mineId === mine.id) ?? inspections[0]!
          : type === 'environmental_alert'
            ? environmental.find((e) => e.mineId === mine.id) ?? environmental[0]!
            : type === 'contract_expiring'
              ? contractors.find((c) => c.mineIds.includes(mine.id)) ?? contractors[0]!
              : correctiveActions[0]!;
    const href =
      'relatedType' in related
        ? related.relatedType === 'compliance'
          ? `/compliance/${related.id}`
          : related.relatedType === 'inspection'
            ? `/inspections/${related.id}`
            : related.relatedType === 'environmental'
              ? `/environment/${related.id}`
              : related.relatedType === 'contractor'
                ? `/contractors/${related.id}`
                : `/corrective-actions/${related.id}`
        : '#';
    notifications.push({
      id: `ntf-${String(i + 1).padStart(3, '0')}`,
      type,
      severity,
      title: `${type.replace(/_/g, ' ')} — ${mine.name}`,
      message: `An item requires attention at ${mine.name}. Review the linked record and take the required action.`,
      createdAt: iso(-Math.floor(random() * 12), 7 + Math.floor(random() * 10), Math.floor(random() * 60)),
      read: random() > 0.6,
      recipientId: 'usr-01',
      relatedEntity: {
        type: 'record',
        id: related.id,
        label: mine.name,
        href,
      },
      deliveries: [
        { channel: 'in_app', status: 'delivered', at: iso(-Math.floor(random() * 12), 8, 0) },
        { channel: 'email', status: 'not_configured' },
        { channel: 'sms', status: 'not_configured' },
      ],
      actionLabel: 'Open record',
      actionHref: href,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Audit trail                                                            */
  /* ---------------------------------------------------------------------- */
  const audit: AuditEvent[] = [];
  const auditActions: AuditEvent['action'][] = ['create', 'update', 'status_change', 'assign', 'verify', 'submit', 'export', 'login'];
  for (let i = 0; i < 70; i += 1) {
    const actor = users[Math.floor(random() * users.length)]!;
    const entityRoll = random();
    const entityType = entityRoll < 0.3 ? 'compliance' : entityRoll < 0.55 ? 'inspection' : entityRoll < 0.72 ? 'corrective_action' : entityRoll < 0.85 ? 'safety_record' : entityRoll < 0.95 ? 'document' : 'mine';
    const entityId =
      entityType === 'compliance'
        ? compliance[Math.floor(random() * compliance.length)]!.id
        : entityType === 'inspection'
          ? inspections[Math.floor(random() * inspections.length)]!.id
          : entityType === 'corrective_action'
            ? correctiveActions[Math.floor(random() * correctiveActions.length)]!.id
            : entityType === 'safety_record'
              ? safetyRecords[Math.floor(random() * safetyRecords.length)]!.id
              : entityType === 'document'
                ? documents[Math.floor(random() * documents.length)]!.id
                : mines[Math.floor(random() * mines.length)]!.id;
    audit.push({
      id: `aud-${String(i + 1).padStart(4, '0')}`,
      timestamp: iso(-Math.floor(random() * 30), 6 + Math.floor(random() * 14), Math.floor(random() * 60)),
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: auditActions[Math.floor(random() * auditActions.length)]!,
      entityType,
      entityId,
      entityLabel: entityId,
      previousValue: random() > 0.6 ? { status: 'draft' } : undefined,
      updatedValue: random() > 0.6 ? { status: 'submitted' } : undefined,
      reason: random() > 0.75 ? 'Routine workflow transition recorded by the development adapter.' : undefined,
      workflow: entityType === 'compliance' ? 'compliance-submission' : entityType === 'inspection' ? 'inspection-lifecycle' : undefined,
      source: 'platform_log',
    });
  }
  audit.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  /* ---------------------------------------------------------------------- */
  /* Workflow rules                                                         */
  /* ---------------------------------------------------------------------- */
  const workflows: WorkflowRule[] = [
    {
      id: 'wf-01',
      name: 'Overdue compliance escalation',
      description: 'Escalates compliance submissions that remain unverified after the due date.',
      trigger: 'compliance.due_date_passed',
      enabled: true,
      stages: [
        { id: 'wf-01-s1', order: 1, label: 'Notify responsible officer', role: 'compliance_officer', afterHours: 0, notifyChannels: ['in_app'] },
        { id: 'wf-01-s2', order: 2, label: 'Notify mine manager', role: 'mine_manager', afterHours: 24, notifyChannels: ['in_app'] },
        { id: 'wf-01-s3', order: 3, label: 'Escalate to subsidiary head', role: 'corporate_management', afterHours: 72, notifyChannels: ['in_app'] },
      ],
      updatedAt: iso(-30, 12, 0),
      updatedBy: 'usr-10',
    },
    {
      id: 'wf-02',
      name: 'Critical safety observation escalation',
      description: 'Escalates critical safety observations that remain unresolved.',
      trigger: 'safety.observation.critical',
      enabled: true,
      stages: [
        { id: 'wf-02-s1', order: 1, label: 'Notify safety officer', role: 'safety_officer', afterHours: 0, notifyChannels: ['in_app'] },
        { id: 'wf-02-s2', order: 2, label: 'Notify mine manager', role: 'mine_manager', afterHours: 4, notifyChannels: ['in_app'] },
      ],
      updatedAt: iso(-18, 12, 0),
      updatedBy: 'usr-10',
    },
    {
      id: 'wf-03',
      name: 'Contract expiry reminder',
      description: 'Reminds contractor managers before contract and document validity ends.',
      trigger: 'contract.expiry_window',
      enabled: true,
      stages: [
        { id: 'wf-03-s1', order: 1, label: 'Notify contractor manager', role: 'contractor_manager', afterHours: 0, notifyChannels: ['in_app'] },
      ],
      updatedAt: iso(-9, 12, 0),
      updatedBy: 'usr-10',
    },
  ];

  /* ---------------------------------------------------------------------- */
  /* Report catalogue                                                       */
  /* ---------------------------------------------------------------------- */
  const reports: ReportDefinition[] = [
    {
      category: 'statutory_compliance',
      name: 'Statutory compliance status',
      description: 'Status of every configured compliance requirement for the selected period.',
      formats: ['csv', 'pdf'],
      groupBy: ['mine', 'subsidiary', 'category', 'none'],
      columns: [
        { key: 'code', label: 'Reference' },
        { key: 'title', label: 'Requirement' },
        { key: 'mineName', label: 'Mine' },
        { key: 'category', label: 'Category' },
        { key: 'status', label: 'Status' },
        { key: 'dueDate', label: 'Due date' },
        { key: 'lastVerifiedAt', label: 'Last verified' },
      ],
    },
    {
      category: 'inspection_summary',
      name: 'Inspection summary',
      description: 'Inspections performed, findings raised and corrective actions generated.',
      formats: ['csv', 'pdf'],
      groupBy: ['mine', 'category', 'month', 'none'],
      columns: [
        { key: 'code', label: 'Inspection' },
        { key: 'mineName', label: 'Mine' },
        { key: 'type', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'scheduledDate', label: 'Scheduled' },
        { key: 'findingCount', label: 'Findings' },
      ],
    },
    {
      category: 'safety_observations',
      name: 'Safety observations',
      description: 'Observations, hazards and near misses reported from the field.',
      formats: ['csv'],
      groupBy: ['mine', 'month', 'none'],
      columns: [
        { key: 'code', label: 'Reference' },
        { key: 'mineName', label: 'Mine' },
        { key: 'title', label: 'Observation' },
        { key: 'severity', label: 'Severity' },
        { key: 'status', label: 'Status' },
        { key: 'reportedAt', label: 'Reported' },
      ],
    },
    {
      category: 'incidents',
      name: 'Incident register',
      description: 'Reportable incidents with severity, downtime and investigation state.',
      formats: ['csv', 'pdf'],
      groupBy: ['mine', 'month', 'none'],
      columns: [
        { key: 'code', label: 'Reference' },
        { key: 'mineName', label: 'Mine' },
        { key: 'title', label: 'Incident' },
        { key: 'severity', label: 'Severity' },
        { key: 'injuriesReported', label: 'Injuries' },
        { key: 'occurredAt', label: 'Occurred' },
      ],
    },
    {
      category: 'corrective_actions',
      name: 'Corrective action register',
      description: 'Corrective actions with ownership, due dates and verification state.',
      formats: ['csv', 'pdf'],
      groupBy: ['mine', 'month', 'none'],
      columns: [
        { key: 'code', label: 'Reference' },
        { key: 'mineName', label: 'Mine' },
        { key: 'description', label: 'Action' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' },
        { key: 'dueDate', label: 'Due' },
      ],
    },
    {
      category: 'environmental_monitoring',
      name: 'Environmental monitoring',
      description: 'Measurements against configured thresholds with source attribution.',
      formats: ['csv', 'pdf'],
      groupBy: ['mine', 'none'],
      columns: [
        { key: 'indicator', label: 'Indicator' },
        { key: 'mineName', label: 'Mine' },
        { key: 'value', label: 'Value' },
        { key: 'unit', label: 'Unit' },
        { key: 'status', label: 'Threshold status' },
        { key: 'measuredAt', label: 'Measured' },
        { key: 'source', label: 'Source' },
      ],
    },
    {
      category: 'production',
      name: 'Production summary',
      description: 'Reported production against configured targets by mine and shift.',
      formats: ['csv', 'pdf'],
      groupBy: ['mine', 'month', 'none'],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'mineName', label: 'Mine' },
        { key: 'shift', label: 'Shift' },
        { key: 'productionTonnes', label: 'Production (t)' },
        { key: 'targetTonnes', label: 'Target (t)' },
        { key: 'valueKind', label: 'Value kind' },
      ],
    },
    {
      category: 'contractor_compliance',
      name: 'Contractor compliance',
      description: 'Contractor compliance status, contract validity and open actions.',
      formats: ['csv'],
      groupBy: ['mine', 'none'],
      columns: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Contractor' },
        { key: 'type', label: 'Type' },
        { key: 'complianceStatus', label: 'Compliance' },
        { key: 'registeredOn', label: 'Registered' },
      ],
    },
    {
      category: 'workforce',
      name: 'Workforce records',
      description: 'Attendance and correction records for the selected period.',
      formats: ['csv'],
      groupBy: ['mine', 'none'],
      columns: [
        { key: 'workerRef', label: 'Worker ref' },
        { key: 'mineName', label: 'Mine' },
        { key: 'date', label: 'Date' },
        { key: 'shift', label: 'Shift' },
        { key: 'status', label: 'Status' },
      ],
    },
    {
      category: 'audit_history',
      name: 'Audit history',
      description: 'Chronological record of platform actions taken on governance records.',
      formats: ['csv', 'pdf'],
      groupBy: ['none'],
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'actorName', label: 'Actor' },
        { key: 'action', label: 'Action' },
        { key: 'entityType', label: 'Entity' },
        { key: 'entityId', label: 'Entity id' },
      ],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    subsidiaries: SUBSIDIARIES,
    mines,
    users,
    compliance,
    inspections,
    safetyRecords,
    incidents,
    nearMisses,
    violations,
    environmental,
    production,
    productionAnomalies,
    contractors,
    contracts,
    attendance,
    correctiveActions,
    documents,
    insights,
    notifications,
    audit,
    workflows,
    reports,
    environmentalThresholds: ENV_THRESHOLDS,
    documentContent,
  };
}
