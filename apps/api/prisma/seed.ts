import { PrismaClient, Role, TenantRequestStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  await prisma.user.upsert({
    where: { email: 'superadmin@quiz-platform.test' },
    update: {},
    create: {
      email: 'superadmin@quiz-platform.test',
      name: 'Sam Superadmin',
      passwordHash,
      isSuperAdmin: true,
    },
  });

  const acme = await prisma.tenant.upsert({
    where: { slug: 'acme-school' },
    update: {},
    create: { name: 'Acme School', slug: 'acme-school' },
  });

  const seedMembership = async (email: string, name: string, role: Role) => {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, passwordHash },
    });

    await prisma.membership.upsert({
      where: { userId: user.id },
      update: { tenantId: acme.id, role },
      create: { userId: user.id, tenantId: acme.id, role },
    });

    return user;
  };

  await seedMembership('admin@acme.test', 'Ada Admin', Role.ADMIN);
  await seedMembership('student@acme.test', 'Sam Student', Role.STUDENT);

  await prisma.tenantRequest.upsert({
    where: { slug: 'beta-academy' },
    update: {},
    create: {
      workspaceName: 'Beta Academy',
      slug: 'beta-academy',
      requesterName: 'Terry Teacher',
      requesterEmail: 'teacher@beta.test',
      passwordHash,
      status: TenantRequestStatus.PENDING,
    },
  });

  console.log('Seed complete. Tenant:', acme.slug);
  console.log('Login with password "password123" as:');
  console.log('  superadmin@quiz-platform.test -> platform Super Admin');
  console.log('  admin@acme.test               -> ADMIN in acme-school');
  console.log('  student@acme.test             -> STUDENT in acme-school');
  console.log(
    '  A pending "Beta Academy" workspace request is waiting for the super admin to approve.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
