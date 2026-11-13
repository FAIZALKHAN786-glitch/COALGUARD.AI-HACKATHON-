const d = require('../seed/dev-seed.json');
const ids = (k) => new Set(d[k].map((x) => x.id));
const sets = {
  mines: ids('mines'), users: ids('users'), compliance: ids('compliance'),
  inspections: ids('inspections'), safetyRecords: ids('safetyRecords'),
  incidents: ids('incidents'), violations: ids('violations'),
  actions: ids('correctiveActions'), documents: ids('documents'),
  contractors: ids('contractors'), contracts: ids('contracts'),
  nearMisses: ids('nearMisses'), subsidiaries: ids('subsidiaries'),
};
const bad = [];
const chk = (arr, set, label) => {
  if (!arr) return;
  for (const id of arr) if (id && !set.has(id)) bad.push(`${label}:${id}`);
};
d.mines.forEach((m) => chk([m.mineManagerId, m.complianceOfficerId, m.environmentalOfficerId, m.safetyOfficerId], sets.users, `mine user ${m.id}`));
d.users.forEach((u) => chk(u.mineIds, sets.mines, `user mine ${u.id}`));
d.compliance.forEach((c) => {
  chk(c.applicableMineIds, sets.mines, `compliance mine ${c.id}`);
  chk(c.evidenceDocumentIds, sets.documents, `compliance doc ${c.id}`);
  chk(c.linkedViolationIds, sets.violations, `compliance vio ${c.id}`);
  chk(c.linkedCorrectiveActionIds, sets.actions, `compliance act ${c.id}`);
  chk([c.responsibleOfficerId, c.updatedBy], sets.users, `compliance user ${c.id}`);
});
d.inspections.forEach((i) => {
  chk([i.mineId], sets.mines, `insp mine ${i.id}`);
  chk([i.inspectorId, i.createdBy, i.reviewerId], sets.users, `insp user ${i.id}`);
  chk(i.evidenceDocumentIds, sets.documents, `insp doc ${i.id}`);
  chk(i.complianceRecordIds, sets.compliance, `insp cmp ${i.id}`);
  chk(i.correctiveActionIds, sets.actions, `insp act ${i.id}`);
  i.findings.forEach((f) => chk(f.complianceRecordIds, sets.compliance, `finding cmp ${f.id}`));
});
d.safetyRecords.forEach((s) => {
  chk([s.mineId], sets.mines, `saf mine ${s.id}`);
  chk([s.reportedBy, s.assignedTo], sets.users, `saf user ${s.id}`);
  chk(s.correctiveActionIds, sets.actions, `saf act ${s.id}`);
  chk(s.evidenceDocumentIds, sets.documents, `saf doc ${s.id}`);
  chk([s.relatedInspectionId], sets.inspections, `saf insp ${s.id}`);
});
d.incidents.forEach((s) => {
  chk([s.mineId], sets.mines, `inc mine ${s.id}`);
  chk([s.reportedBy, s.assignedTo], sets.users, `inc user ${s.id}`);
  chk(s.correctiveActionIds, sets.actions, `inc act ${s.id}`);
  chk(s.evidenceDocumentIds, sets.documents, `inc doc ${s.id}`);
});
d.nearMisses.forEach((s) => {
  chk([s.mineId], sets.mines, `nm mine ${s.id}`);
  chk([s.reportedBy], sets.users, `nm user ${s.id}`);
});
d.violations.forEach((s) => {
  chk([s.mineId], sets.mines, `vio mine ${s.id}`);
  chk([s.raisedBy, s.verifiedBy], sets.users, `vio user ${s.id}`);
  chk(s.correctiveActionIds, sets.actions, `vio act ${s.id}`);
});
d.environmental.forEach((e) => {
  chk([e.mineId], sets.mines, `env mine ${e.id}`);
  chk([e.inspectionId], sets.inspections, `env insp ${e.id}`);
  chk(e.evidenceDocumentIds, sets.documents, `env doc ${e.id}`);
});
d.production.forEach((p) => {
  chk([p.mineId], sets.mines, `prod mine ${p.id}`);
  chk([p.shiftSupervisorId], sets.users, `prod user ${p.id}`);
  chk(p.sourceDocumentIds, sets.documents, `prod doc ${p.id}`);
});
d.contractors.forEach((c) => {
  chk(c.mineIds, sets.mines, `con mine ${c.id}`);
  chk(c.requiredDocumentIds, sets.documents, `con reqdoc ${c.id}`);
  chk(c.verifiedDocumentIds, sets.documents, `con verdoc ${c.id}`);
  chk(c.safetyRecordIds, sets.safetyRecords, `con saf ${c.id}`);
  chk(c.inspectionIds, sets.inspections, `con insp ${c.id}`);
  chk(c.openCorrectiveActionIds, sets.actions, `con act ${c.id}`);
});
d.contracts.forEach((c) => {
  chk([c.contractorId], sets.contractors, `ctr con ${c.id}`);
  chk([c.mineId], sets.mines, `ctr mine ${c.id}`);
  chk([c.approvedBy], sets.users, `ctr user ${c.id}`);
  chk(c.documentIds, sets.documents, `ctr doc ${c.id}`);
});
d.correctiveActions.forEach((a) => {
  chk([a.mineId], sets.mines, `ca mine ${a.id}`);
  chk([a.assignedTo, a.createdBy, a.verifiedBy], sets.users, `ca user ${a.id}`);
  chk(a.evidenceDocumentIds, sets.documents, `ca doc ${a.id}`);
});
d.documents.forEach((x) => {
  chk([x.mineId], sets.mines, `doc mine ${x.id}`);
  chk([x.uploadedBy], sets.users, `doc user ${x.id}`);
  chk(x.linkedComplianceIds, sets.compliance, `doc cmp ${x.id}`);
});
d.insights.forEach((x) => {
  chk([x.mineId], sets.mines, `ins mine ${x.id}`);
  chk([x.subsidiaryId], sets.subsidiaries, `ins sub ${x.id}`);
  chk([x.reviewedBy], sets.users, `ins user ${x.id}`);
  chk(x.relatedEntityIds, new Set([...sets.compliance, ...sets.inspections, ...sets.safetyRecords, ...sets.incidents, ...sets.actions, ...sets.documents]), `ins rel ${x.id}`);
});
d.notifications.forEach((x) => chk([x.recipientId], sets.users, `ntf user ${x.id}`));
d.audit.forEach((x) => chk([x.actorId], sets.users, `aud user ${x.id}`));
console.log('bad', bad.length);
console.log(bad.slice(0, 50));
