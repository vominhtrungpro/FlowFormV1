// Ports FlowFormDemo/Data/SeedData.cs. Password hashing differs on purpose: the old app used
// ASP.NET Identity's PasswordHasher<User> (a specific PBKDF2 format) which a Node bcrypt
// reimplementation can't verify against — since this is a from-scratch seed, not a live data
// migration, the 4 seed users get fresh bcrypt hashes for the same password ("1").
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedUsers() {
  const seedUsers = [
    { email: 'admin@yopmail.com', role: 'admin', tag: 'admin' },
    { email: 'pm@yopmail.com', role: 'user', tag: 'project_manager' },
    { email: 'dev1@yopmail.com', role: 'user', tag: 'developer' },
    { email: 'dev2@yopmail.com', role: 'user', tag: 'developer' },
  ];
  const passwordHash = await bcrypt.hash('1', 10);
  const users: Record<string, number> = {};

  for (const u of seedUsers) {
    const existing = await prisma.user.findFirst({ where: { email: u.email } });
    if (existing) {
      users[u.email] = existing.id;
      continue;
    }
    const created = await prisma.user.create({
      data: { email: u.email, passwordHash, role: u.role, tag: u.tag },
    });
    users[u.email] = created.id;
  }
  return users;
}

async function seedMasterData() {
  const existing = await prisma.masterPlant.count();
  if (existing > 0) return;

  const plants = [
    {
      name: 'Olefins', code: 'OLE',
      areas: [
        { name: 'Cracking', code: 'OLE-CRK', units: ['Furnace 1101', 'Furnace 1102', 'Furnace 1103', 'Quench Tower'] },
        { name: 'Separation', code: 'OLE-SEP', units: ['Demethaniser', 'Deethaniser', 'C3 Splitter'] },
        { name: 'Flare System', code: 'OLE-FLR', units: ['FGRU', 'Ground Flare'] },
      ],
    },
    {
      name: 'HDPE', code: 'HDP',
      areas: [
        { name: 'Polymerisation', code: 'HDP-POL', units: ['Reactor Train 1', 'Reactor Train 2'] },
        { name: 'Pelletising', code: 'HDP-PEL', units: ['Pelletiser A', 'Pelletiser B'] },
        { name: 'Bagging', code: 'HDP-BAG', units: ['Bagging Line 1', 'Bagging Line 2'] },
      ],
    },
    {
      name: 'PP', code: 'PPO',
      areas: [
        { name: 'Polymerisation', code: 'PPO-POL', units: ['Loop Reactor', 'Gas Phase Reactor'] },
        { name: 'Extrusion', code: 'PPO-EXT', units: ['Line 1', 'Line 2'] },
      ],
    },
    {
      name: 'LLDPE', code: 'LLD',
      areas: [
        { name: 'Polymerisation', code: 'LLD-POL', units: ['Reactor Train 1'] },
        { name: 'Extrusion', code: 'LLD-EXT', units: ['Line 1', 'Line 2'] },
      ],
    },
    {
      name: 'Utilities', code: 'UTL',
      areas: [
        { name: 'Nitrogen Plant', code: 'UTL-N2', units: ['N2 Header', 'ASU Train'] },
        { name: 'Steam & Power', code: 'UTL-STM', units: ['Boiler 1', 'Boiler 2', 'GTG'] },
      ],
    },
  ];

  for (const p of plants) {
    const plant = await prisma.masterPlant.create({ data: { name: p.name, code: p.code } });
    for (const a of p.areas) {
      const area = await prisma.masterArea.create({ data: { plantId: plant.id, name: a.name, code: a.code } });
      for (const unitName of a.units) {
        await prisma.masterUnit.create({ data: { areaId: area.id, name: unitName } });
      }
    }
  }
}

async function seedRequestTypes() {
  const existing = await prisma.requestType.count();
  if (existing > 0) return;

  const intakeForm = await prisma.formDefinition.create({
    data: { name: 'Intake form', versionNumber: 1, status: 'Published' },
  });
  await prisma.field.createMany({
    data: [
      { formDefinitionId: intakeForm.id, orderIndex: 0, label: 'Title', type: 'Text', required: true, width: 'Full' },
      { formDefinitionId: intakeForm.id, orderIndex: 1, label: 'Leave date', type: 'Date', required: true, width: 'Half' },
      { formDefinitionId: intakeForm.id, orderIndex: 2, label: 'Priority', type: 'Dropdown', required: true, width: 'Half', options: 'Low,Medium,High' },
      { formDefinitionId: intakeForm.id, orderIndex: 3, label: 'Reason', type: 'LongText', required: true, width: 'Full' },
    ],
  });

  // --- Leave request: Submit -> Review -> Approve ---
  const leaveType = await prisma.requestType.create({ data: { name: 'Leave request', code: 'LEAVE' } });
  const leaveWf = await prisma.workflowDefinition.create({
    data: { requestTypeId: leaveType.id, versionNumber: 1, status: 'Published', publishedAt: new Date() },
  });
  const leaveSubmit = await prisma.step.create({
    data: {
      workflowDefinitionId: leaveWf.id, orderIndex: 0, name: 'Submit', type: 'ActionTask',
      actorType: 'Role', actorRef: 'Requester', formDefinitionId: intakeForm.id,
    },
  });
  const leaveReview = await prisma.step.create({
    data: {
      workflowDefinitionId: leaveWf.id, orderIndex: 1, name: 'Review', type: 'ApprovalGate',
      actorType: 'Role', actorRef: 'Reviewer', slaValue: 2, slaUnit: 'WorkingDays', escalateTo: 'Manager',
    },
  });
  const leaveApprove = await prisma.step.create({
    data: {
      workflowDefinitionId: leaveWf.id, orderIndex: 2, name: 'Approve', type: 'ApprovalGate',
      actorType: 'Role', actorRef: 'Manager', slaValue: 1, slaUnit: 'WorkingDays',
    },
  });
  await prisma.transition.createMany({
    data: [
      { fromStepId: leaveSubmit.id, action: 'Submit', toStepId: leaveReview.id },
      { fromStepId: leaveReview.id, action: 'Approve', toStepId: leaveApprove.id },
      { fromStepId: leaveReview.id, action: 'Return', toStepId: leaveSubmit.id },
      { fromStepId: leaveReview.id, action: 'Reject', toStepId: null },
      { fromStepId: leaveApprove.id, action: 'Approve', toStepId: null },
      { fromStepId: leaveApprove.id, action: 'Reject', toStepId: null },
    ],
  });
  await prisma.requestType.update({ where: { id: leaveType.id }, data: { currentWorkflowDefinitionId: leaveWf.id } });

  // --- Purchase request: Submit -> Approve (shares Intake form) ---
  const purchaseType = await prisma.requestType.create({ data: { name: 'Purchase request', code: 'PURCHASE' } });
  const purchaseWf = await prisma.workflowDefinition.create({
    data: { requestTypeId: purchaseType.id, versionNumber: 1, status: 'Published', publishedAt: new Date() },
  });
  const purchaseSubmit = await prisma.step.create({
    data: {
      workflowDefinitionId: purchaseWf.id, orderIndex: 0, name: 'Submit', type: 'ActionTask',
      actorType: 'Role', actorRef: 'Requester', formDefinitionId: intakeForm.id,
    },
  });
  const purchaseApprove = await prisma.step.create({
    data: {
      workflowDefinitionId: purchaseWf.id, orderIndex: 1, name: 'Approve', type: 'ApprovalGate',
      actorType: 'Role', actorRef: 'Manager', slaValue: 1, slaUnit: 'WorkingDays',
    },
  });
  await prisma.transition.createMany({
    data: [
      { fromStepId: purchaseSubmit.id, action: 'Submit', toStepId: purchaseApprove.id },
      { fromStepId: purchaseApprove.id, action: 'Approve', toStepId: null },
      { fromStepId: purchaseApprove.id, action: 'Reject', toStepId: null },
    ],
  });
  await prisma.requestType.update({ where: { id: purchaseType.id }, data: { currentWorkflowDefinitionId: purchaseWf.id } });
}

async function main() {
  const users = await seedUsers();
  console.log('Seeded users:', users);
  await seedMasterData();
  console.log('Seeded master data (Plant/Area/Unit).');
  await seedRequestTypes();
  console.log('Seeded request types (Leave request, Purchase request).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
