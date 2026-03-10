/**
 * Elevates a user to ADMIN role.
 * Usage: npx tsx scripts/make-admin.ts <email>
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const email = process.argv[2];

if (!email) {
  console.error('Usage: npx tsx scripts/make-admin.ts <email>');
  process.exit(1);
}

async function main() {
  const client = await prisma.client.findUnique({ where: { email } });

  if (!client) {
    console.error(`No se encontró ningún usuario con email: ${email}`);
    process.exit(1);
  }

  await prisma.client.update({
    where: { email },
    data: { role: 'ADMIN', plan: 'ENTERPRISE' },
  });

  console.log(`✓ ${client.name} (${email}) ahora es ADMIN con plan ENTERPRISE.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
