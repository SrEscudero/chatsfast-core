/**
 * Tests: webhook.service.ts
 *
 * Valida el procesamiento de eventos de Evolution API:
 * 1. Extracción de texto de diferentes tipos de mensaje
 * 2. Detección de votos de encuesta (isPollVote)
 * 3. Normalización de formatos de evento
 * 4. Manejo de connection.update (cambios de estado de instancia)
 */

// Mock Prisma and logger before importing the service
jest.mock('../lib/prisma', () => ({
  prisma: {
    instance: {
      findFirst: jest.fn(),
    },
    contact: {
      upsert: jest.fn(),
    },
    message: {
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../repositories/instances.repository', () => ({
  __esModule: true,
  default: {
    findByName:   jest.fn(),
    updateStatus: jest.fn(),
  },
}));

import { prisma } from '../lib/prisma';
import { WebhookService } from '../services/webhook.service';
import instanceRepository from '../repositories/instances.repository';

const mockedPrisma     = prisma as jest.Mocked<typeof prisma>;
const mockedRepository = instanceRepository as jest.Mocked<typeof instanceRepository>;

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(() => {
    service = new WebhookService();
    jest.clearAllMocks();

    // Default mock: instance found in DB
    (mockedPrisma.instance.findFirst as jest.Mock).mockResolvedValue({
      id: 'instance-uuid-123',
    });

    // Default mocks for DB writes
    (mockedPrisma.contact.upsert as jest.Mock).mockResolvedValue({
      id: 'contact-uuid-456',
    });
    (mockedPrisma.message.upsert as jest.Mock).mockResolvedValue({
      id: 'message-uuid-789',
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // processEvent — routing
  // ──────────────────────────────────────────────────────────────────────────

  describe('processEvent', () => {
    it('processes messages.upsert (lowercase)', async () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          messages: [{
            key: { remoteJid: '521234567890@s.whatsapp.net', fromMe: false, id: 'MSG001' },
            pushName: 'Juan',
            message: { conversation: 'Hola' },
            messageTimestamp: 1700000000,
          }],
        },
      };

      await service.processEvent(payload);

      expect(mockedPrisma.contact.upsert).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.message.upsert).toHaveBeenCalledTimes(1);
    });

    it('processes MESSAGES_UPSERT (uppercase)', async () => {
      const payload = {
        event: 'MESSAGES_UPSERT',
        instance: 'test-instance',
        data: [{
          key: { remoteJid: '521234567890@s.whatsapp.net', fromMe: false, id: 'MSG002' },
          pushName: 'Ana',
          message: { conversation: 'Hola desde uppercase' },
          messageTimestamp: 1700000001,
        }],
      };

      await service.processEvent(payload);

      expect(mockedPrisma.contact.upsert).toHaveBeenCalledTimes(1);
    });

    it('ignores send.message events (delivery confirmations)', async () => {
      const payload = { event: 'send.message', instance: 'test-instance', data: {} };
      await service.processEvent(payload);
      expect(mockedPrisma.contact.upsert).not.toHaveBeenCalled();
    });

    it('ignores unknown events without throwing', async () => {
      const payload = { event: 'unknown.event', instance: 'test-instance', data: {} };
      await expect(service.processEvent(payload)).resolves.not.toThrow();
    });

    it('handles instance not in DB gracefully', async () => {
      (mockedPrisma.instance.findFirst as jest.Mock).mockResolvedValue(null);

      const payload = {
        event: 'messages.upsert',
        instance: 'nonexistent-instance',
        data: {
          messages: [{
            key: { remoteJid: '521234567890@s.whatsapp.net', fromMe: false, id: 'MSG003' },
            message: { conversation: 'Mensaje' },
          }],
        },
      };

      await expect(service.processEvent(payload)).resolves.not.toThrow();
      expect(mockedPrisma.contact.upsert).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Incoming message: text extraction
  // ──────────────────────────────────────────────────────────────────────────

  describe('message text extraction and contact upsert', () => {
    const makePayload = (messageContent: object, fromMe = false) => ({
      event: 'messages.upsert',
      instance: 'test-instance',
      data: {
        messages: [{
          key: { remoteJid: '521234567890@s.whatsapp.net', fromMe, id: 'MSGX' },
          pushName: 'Contacto',
          message: messageContent,
          messageTimestamp: 1700000000,
        }],
      },
    });

    it('saves plain text message', async () => {
      await service.processEvent(makePayload({ conversation: 'Texto plano' }));

      expect(mockedPrisma.message.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ content: 'Texto plano', type: 'conversation' }),
      }));
    });

    it('saves extendedTextMessage', async () => {
      await service.processEvent(makePayload({ extendedTextMessage: { text: 'Texto con formato' } }));

      expect(mockedPrisma.message.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ content: 'Texto con formato' }),
      }));
    });

    it('saves imageMessage with caption', async () => {
      await service.processEvent(makePayload({ imageMessage: { caption: 'Mi foto' } }));

      expect(mockedPrisma.message.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ content: '🖼️ Imagen: Mi foto' }),
      }));
    });

    it('saves imageMessage without caption', async () => {
      await service.processEvent(makePayload({ imageMessage: {} }));

      expect(mockedPrisma.message.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ content: '🖼️ Imagen' }),
      }));
    });

    it('saves audioMessage', async () => {
      await service.processEvent(makePayload({ audioMessage: {} }));

      expect(mockedPrisma.message.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ content: '🎵 Audio' }),
      }));
    });

    it('increments unreadCount only for received messages (fromMe=false)', async () => {
      await service.processEvent(makePayload({ conversation: 'Recibido' }, false));

      expect(mockedPrisma.contact.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ unreadCount: { increment: 1 } }),
      }));
    });

    it('does NOT increment unreadCount for sent messages (fromMe=true)', async () => {
      await service.processEvent(makePayload({ conversation: 'Enviado' }, true));

      const upsertCall = (mockedPrisma.contact.upsert as jest.Mock).mock.calls[0][0];
      expect(upsertCall.update).not.toHaveProperty('unreadCount');
    });

    it('uses upsert for duplicate message prevention', async () => {
      await service.processEvent(makePayload({ conversation: 'Duplicado' }));

      expect(mockedPrisma.message.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ instanceId_messageId: expect.any(Object) }),
        update: {},
      }));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Poll vote detection and handling
  // ──────────────────────────────────────────────────────────────────────────

  describe('poll vote handling', () => {
    const makePollPayload = (selectedOptions: any[]) => ({
      event: 'messages.upsert',
      instance: 'test-instance',
      data: {
        messages: [{
          key: { remoteJid: '521234567890@s.whatsapp.net', fromMe: false, id: 'POLL001' },
          pushName: 'Votante',
          message: {
            pollUpdateMessage: {
              pollCreationMessageKey: { id: 'POLL_CREATION_ID' },
              vote: { selectedOptions },
            },
          },
          messageTimestamp: 1700000000,
        }],
      },
    });

    it('detects poll vote and does NOT save as regular message', async () => {
      await service.processEvent(makePollPayload([{ name: 'Opción A' }]));
      // Poll votes are handled separately — no message upsert
      expect(mockedPrisma.message.upsert).not.toHaveBeenCalled();
    });

    it('ignores deselection events (empty selectedOptions)', async () => {
      await service.processEvent(makePollPayload([]));
      expect(mockedPrisma.message.upsert).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // connection.update
  // ──────────────────────────────────────────────────────────────────────────

  describe('handleConnectionUpdate', () => {
    it('updates instance status to CONNECTED on open', async () => {
      (mockedRepository.findByName as jest.Mock).mockResolvedValue({ id: 'inst-123', name: 'test' });
      (mockedRepository.updateStatus as jest.Mock).mockResolvedValue({});

      await service.processEvent({
        event: 'connection.update',
        instance: 'test-instance',
        data: { state: 'open' },
      });

      expect(mockedRepository.updateStatus).toHaveBeenCalledWith('inst-123', 'CONNECTED');
    });

    it('updates instance status to DISCONNECTED on close', async () => {
      (mockedRepository.findByName as jest.Mock).mockResolvedValue({ id: 'inst-123', name: 'test' });
      (mockedRepository.updateStatus as jest.Mock).mockResolvedValue({});

      await service.processEvent({
        event: 'connection.update',
        instance: 'test-instance',
        data: { state: 'close' },
      });

      expect(mockedRepository.updateStatus).toHaveBeenCalledWith('inst-123', 'DISCONNECTED');
    });

    it('handles instance not found in DB gracefully', async () => {
      (mockedRepository.findByName as jest.Mock).mockResolvedValue(null);

      await expect(service.processEvent({
        event: 'connection.update',
        instance: 'ghost-instance',
        data: { state: 'open' },
      })).resolves.not.toThrow();

      expect(mockedRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Message format normalization (3 different Evolution API formats)
  // ──────────────────────────────────────────────────────────────────────────

  describe('Evolution API format normalization', () => {
    it('handles data as array (format 1)', async () => {
      const payload = {
        event: 'MESSAGES_UPSERT',
        instance: 'test-instance',
        data: [{
          key: { remoteJid: '521234567890@s.whatsapp.net', fromMe: false, id: 'FORMAT1' },
          message: { conversation: 'Array format' },
          messageTimestamp: 1700000000,
        }],
      };

      await service.processEvent(payload);
      expect(mockedPrisma.contact.upsert).toHaveBeenCalledTimes(1);
    });

    it('handles data.messages as array (format 2)', async () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          messages: [{
            key: { remoteJid: '521234567890@s.whatsapp.net', fromMe: false, id: 'FORMAT2' },
            message: { conversation: 'Object with messages array' },
            messageTimestamp: 1700000000,
          }],
        },
      };

      await service.processEvent(payload);
      expect(mockedPrisma.contact.upsert).toHaveBeenCalledTimes(1);
    });

    it('handles data as single message object (format 3)', async () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: { remoteJid: '521234567890@s.whatsapp.net', fromMe: false, id: 'FORMAT3' },
          message: { conversation: 'Single object format' },
          messageTimestamp: 1700000000,
        },
      };

      await service.processEvent(payload);
      expect(mockedPrisma.contact.upsert).toHaveBeenCalledTimes(1);
    });

    it('ignores messages without remoteJid', async () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          messages: [{
            key: { fromMe: false, id: 'NOJID' },  // missing remoteJid
            message: { conversation: 'Sin remoteJid' },
          }],
        },
      };

      await service.processEvent(payload);
      expect(mockedPrisma.contact.upsert).not.toHaveBeenCalled();
    });
  });
});
