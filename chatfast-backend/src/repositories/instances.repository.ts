import { Prisma, Instance, InstanceStatus } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../config/logger';

export interface InstanceFilters {
  clientId?: string;
  status?: InstanceStatus;
  connectionType?: 'BAILEYS' | 'WHATSAPP_CLOUD';
  search?: string;
  page?: number;
  limit?: number;
}

class InstanceRepository {
  async create(data: Prisma.InstanceCreateInput): Promise<Instance> {
    try {
      const instance = await prisma.instance.create({ data });
      logger.info('Instance created in database', { instanceId: instance.id, name: instance.name });
      return instance;
    } catch (error) {
      logger.error('Failed to create instance in database', { error, data });
      throw error;
    }
  }

  async findById(id: string): Promise<Instance | null> {
    return prisma.instance.findUnique({
      where: { id },
      include: { client: { select: { id: true, name: true, email: true } } },
    });
  }

  async findByName(name: string): Promise<Instance | null> {
    return prisma.instance.findUnique({ where: { name } });
  }

  async findMany(filters: InstanceFilters): Promise<{ instances: Instance[]; total: number }> {
    const { clientId, status, connectionType, search, page = 1, limit = 10 } = filters;
    const where: Prisma.InstanceWhereInput = {};

    if (clientId) where.clientId = clientId;
    if (status) where.status = status;
    if (connectionType) where.connectionType = connectionType;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [instances, total] = await Promise.all([
      prisma.instance.findMany({
        where,
        include: { client: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.instance.count({ where }),
    ]);
    return { instances, total };
  }

  async update(id: string, data: Prisma.InstanceUpdateInput): Promise<Instance> {
    try {
      const instance = await prisma.instance.update({
        where: { id },
        data,
      });
      logger.info('Instance updated in database', { instanceId: id, ...data });
      return instance;
    } catch (error) {
      logger.error('Failed to update instance in database', { instanceId: id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    await prisma.instance.delete({ where: { id } });
    logger.info('Instance deleted from database', { instanceId: id });
  }

  async updateStatus(id: string, status: InstanceStatus): Promise<Instance> {
    return this.update(id, { 
      status, 
      lastSeen: status === 'CONNECTED' ? new Date() : undefined 
    });
  }

  async count(): Promise<number> {
    return prisma.instance.count();
  }
}

export const instanceRepository = new InstanceRepository();
export default instanceRepository;