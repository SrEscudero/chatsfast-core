import { CampaignStatus, CampaignItemStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { evolutionApi } from '../config/evolution';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';

class CampaignService {

  // ─── List campaigns ───────────────────────────────────────
  async list(clientId: string, opts: { page: number; limit: number; status?: string; instanceId?: string }) {
    const where: any = { clientId };
    if (opts.status) where.status = opts.status;
    if (opts.instanceId) where.instanceId = opts.instanceId;

    const [items, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        include: { instance: { select: { id: true, name: true, phoneNumber: true } }, _count: { select: { items: true } } },
      }),
      prisma.campaign.count({ where }),
    ]);

    return { items, total };
  }

  // ─── Get single campaign ──────────────────────────────────
  async getById(id: string, clientId?: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        instance: { select: { id: true, name: true, phoneNumber: true } },
        items: { orderBy: { status: 'asc' }, take: 100 },
        _count: { select: { items: true } },
      },
    });
    if (!campaign) throw AppError.notFound('Campaña no encontrada');
    if (clientId && campaign.clientId !== clientId) throw AppError.forbidden();
    return campaign;
  }

  // ─── Create campaign ──────────────────────────────────────
  async create(data: {
    clientId: string;
    instanceId: string;
    name: string;
    message: string;
    mediaUrl?: string;
    scheduledAt?: string;
    delayMs?: number;
    phones: Array<{ phone: string; name?: string }>;
  }) {
    // Verify instance belongs to client (or user is ADMIN — caller checks)
    const instance = await prisma.instance.findUnique({ where: { id: data.instanceId } });
    if (!instance) throw AppError.notFound('Instancia no encontrada');

    const campaign = await prisma.campaign.create({
      data: {
        clientId: data.clientId,
        instanceId: data.instanceId,
        name: data.name,
        message: data.message,
        mediaUrl: data.mediaUrl,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        delayMs: data.delayMs ?? 1500,
        totalCount: data.phones.length,
        items: {
          create: data.phones.map(p => ({ phone: p.phone, name: p.name })),
        },
      },
      include: { instance: { select: { id: true, name: true } }, _count: { select: { items: true } } },
    });

    return campaign;
  }

  // ─── Launch campaign ──────────────────────────────────────
  async launch(id: string, clientId?: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { items: { where: { status: 'PENDING' } }, instance: true },
    });
    if (!campaign) throw AppError.notFound('Campaña no encontrada');
    if (clientId && campaign.clientId !== clientId) throw AppError.forbidden();
    if (campaign.status === 'RUNNING') throw AppError.badRequest('La campaña ya está en ejecución');
    if (campaign.status === 'COMPLETED') throw AppError.badRequest('La campaña ya está completada');
    if (campaign.instance.status !== 'CONNECTED') throw AppError.badRequest('La instancia no está conectada');

    await prisma.campaign.update({ where: { id }, data: { status: 'RUNNING', startedAt: new Date() } });

    // Run in background — don't await
    this.runCampaign(campaign.id, campaign.instance.name, campaign.message, campaign.items, campaign.delayMs).catch(err => {
      logger.error('Campaign run error', { campaignId: id, err });
    });

    return { message: 'Campaña iniciada', campaignId: id };
  }

  // ─── Pause / cancel campaign ──────────────────────────────
  async updateStatus(id: string, status: 'PAUSED' | 'CANCELLED', clientId?: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw AppError.notFound('Campaña no encontrada');
    if (clientId && campaign.clientId !== clientId) throw AppError.forbidden();
    return prisma.campaign.update({ where: { id }, data: { status } });
  }

  // ─── Delete campaign ──────────────────────────────────────
  async delete(id: string, clientId?: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw AppError.notFound('Campaña no encontrada');
    if (clientId && campaign.clientId !== clientId) throw AppError.forbidden();
    if (campaign.status === 'RUNNING') throw AppError.badRequest('No se puede eliminar una campaña en ejecución');
    await prisma.campaign.delete({ where: { id } });
  }

  // ─── PRIVATE: run campaign in background ──────────────────
  private async runCampaign(
    campaignId: string,
    instanceName: string,
    message: string,
    items: Array<{ id: string; phone: string; name?: string | null }>,
    delayMs: number,
  ) {
    let sent = 0;
    let failed = 0;

    for (const item of items) {
      // Check if campaign was paused/cancelled
      const current = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (!current || current.status === 'PAUSED' || current.status === 'CANCELLED') break;

      try {
        await evolutionApi.getInstance().post(`/message/sendText/${instanceName}`, {
          number: `${item.phone}@s.whatsapp.net`,
          text: message,
        });

        await prisma.campaignItem.update({
          where: { id: item.id },
          data: { status: 'SENT', sentAt: new Date() },
        });
        sent++;
      } catch (err: any) {
        await prisma.campaignItem.update({
          where: { id: item.id },
          data: { status: 'FAILED', error: err.message ?? 'Error desconocido' },
        });
        failed++;
        logger.warn('Campaign item failed', { campaignId, phone: item.phone, err: err.message });
      }

      await prisma.campaign.update({ where: { id: campaignId }, data: { sentCount: sent, failedCount: failed } });

      // Delay between messages
      await new Promise(r => setTimeout(r, delayMs));
    }

    const final = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (final?.status === 'RUNNING') {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', completedAt: new Date(), sentCount: sent, failedCount: failed },
      });
    }

    logger.info('Campaign completed', { campaignId, sent, failed });
  }
}

export const campaignService = new CampaignService();
