import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Limpiando base de datos...');

  // Delete in dependency order (children first)
  await prisma.session.deleteMany();
  await prisma.instance.deleteMany();
  await prisma.client.deleteMany();

  console.log('Base de datos limpia.');

  const passwordHash = await bcrypt.hash('Lipa.15250821', 12);

  const admin = await prisma.client.create({
    data: {
      name:  'Kelvis Alejandro Escudero Fajardo',
      email: 'kelvis@chatfast.com',
      password: passwordHash,
      role: 'ADMIN',
      plan: 'ENTERPRISE',
      active: true,
      suspended: false,
    },
  });

  console.log('Cuenta CEO creada:');
  console.log(`  Nombre: ${admin.name}`);
  console.log(`  Email:  ${admin.email}`);
  console.log(`  Rol:    ${admin.role}`);
  console.log(`  Plan:   ${admin.plan}`);
  console.log(`  ID:     ${admin.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
