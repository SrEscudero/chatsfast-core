/**
 * Tests: contacts.routes.ts
 *
 * Valida los endpoints del CRM de contactos:
 * 1. GET /contacts — paginación, búsqueda, orden por unread+lastMessage
 * 2. GET /contacts/:contactId/messages — historial, mark-as-read seguro
 * 3. POST /contacts/sync — sincronización desde Evolution API
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    contact: {
      findMany:   jest.fn(),
      count:      jest.fn(),
      upsert:     jest.fn(),
      update:     jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
      deleteMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      count:    jest.fn(),
    },
  },
}));

jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/fetch.service', () => ({
  fetchService: {
    fetchChats:    jest.fn(),
    fetchContacts: jest.fn(),
  },
}));

jest.mock('../middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));

import request from 'supertest';
import express from 'express';
import contactsRouter from '../routes/contacts.routes';
import { prisma } from '../lib/prisma';

const app = express();
app.use(express.json());
// Simulate mergeParams by adding instanceId to req.params via a wrapper
app.use('/instances/:instanceId/contacts', (req: any, _res: any, next: any) => {
  req.params.instanceId = req.params.instanceId;
  next();
}, contactsRouter);

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const INSTANCE_ID = 'inst-uuid-001';
const CONTACT_ID  = 'cont-uuid-001';

const mockContact = {
  id:            CONTACT_ID,
  instanceId:    INSTANCE_ID,
  remoteJid:     '521234567890@s.whatsapp.net',
  name:          'Juan García',
  phone:         '521234567890',
  profilePic:    null,
  isGroup:       false,
  lastMessage:   'Hola',
  lastMessageAt: new Date('2026-01-01T10:00:00Z'),
  unreadCount:   3,
  createdAt:     new Date(),
};

const mockMessage = {
  id:         'msg-uuid-001',
  instanceId: INSTANCE_ID,
  contactId:  CONTACT_ID,
  remoteJid:  '521234567890@s.whatsapp.net',
  messageId:  'WAE001',
  fromMe:     false,
  type:       'conversation',
  content:    'Hola, ¿me puedes ayudar?',
  mediaUrl:   null,
  caption:    null,
  status:     'DELIVERED',
  timestamp:  new Date('2026-01-01T10:00:00Z'),
  createdAt:  new Date(),
};

describe('GET /instances/:instanceId/contacts', () => {
  beforeEach(() => {
    (mockedPrisma.contact.findMany as jest.Mock).mockResolvedValue([mockContact]);
    (mockedPrisma.contact.count as jest.Mock).mockResolvedValue(1);
  });

  it('returns contacts list with pagination', async () => {
    const res = await request(app)
      .get(`/instances/${INSTANCE_ID}/contacts`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe('Juan García');
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      limit: 30,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('filters by search term', async () => {
    (mockedPrisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.contact.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app)
      .get(`/instances/${INSTANCE_ID}/contacts?search=xyz`)
      .expect(200);

    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.pagination.total).toBe(0);

    // Verify search was passed to Prisma query
    const findManyCall = (mockedPrisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.OR).toBeDefined();
    expect(findManyCall.where.OR[0].name.contains).toBe('xyz');
  });

  it('orders by unreadCount desc then lastMessageAt desc', async () => {
    await request(app).get(`/instances/${INSTANCE_ID}/contacts`).expect(200);

    const findManyCall = (mockedPrisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.orderBy).toEqual([
      { unreadCount: 'desc' },
      { lastMessageAt: 'desc' },
    ]);
  });

  it('respects page and limit query params', async () => {
    await request(app)
      .get(`/instances/${INSTANCE_ID}/contacts?page=2&limit=10`)
      .expect(200);

    const findManyCall = (mockedPrisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.skip).toBe(10);  // (2-1) * 10
    expect(findManyCall.take).toBe(10);
  });

  it('returns hasNextPage=true when more pages exist', async () => {
    (mockedPrisma.contact.count as jest.Mock).mockResolvedValue(50);
    (mockedPrisma.contact.findMany as jest.Mock).mockResolvedValue(
      Array(30).fill(mockContact)
    );

    const res = await request(app)
      .get(`/instances/${INSTANCE_ID}/contacts?limit=30`)
      .expect(200);

    expect(res.body.data.pagination.hasNextPage).toBe(true);
    expect(res.body.data.pagination.hasPrevPage).toBe(false);
  });
});

describe('GET /instances/:instanceId/contacts/:contactId/messages', () => {
  beforeEach(() => {
    (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([mockMessage]);
    (mockedPrisma.message.count as jest.Mock).mockResolvedValue(1);
    (mockedPrisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('returns messages in chronological order (oldest first)', async () => {
    const olderMsg = { ...mockMessage, id: 'msg-002', timestamp: new Date('2026-01-01T09:00:00Z') };
    const newerMsg = { ...mockMessage, id: 'msg-003', timestamp: new Date('2026-01-01T11:00:00Z') };

    // Prisma returns desc (newest first), then we .reverse() to get asc (oldest first)
    (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([newerMsg, olderMsg]);

    const res = await request(app)
      .get(`/instances/${INSTANCE_ID}/contacts/${CONTACT_ID}/messages`)
      .expect(200);

    // Prisma returns [newerMsg, olderMsg] (desc), then .reverse() → [olderMsg, newerMsg] (asc)
    expect(res.body.data.items[0].id).toBe('msg-002');  // olderMsg (older timestamp)
    expect(res.body.data.items[1].id).toBe('msg-003');  // newerMsg (newer timestamp)
  });

  it('marks contact as read using instanceId+contactId (secure updateMany)', async () => {
    await request(app)
      .get(`/instances/${INSTANCE_ID}/contacts/${CONTACT_ID}/messages`)
      .expect(200);

    expect(mockedPrisma.contact.updateMany).toHaveBeenCalledWith({
      where: { id: CONTACT_ID, instanceId: INSTANCE_ID },
      data: { unreadCount: 0 },
    });
  });

  it('returns empty items when no messages', async () => {
    (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.message.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app)
      .get(`/instances/${INSTANCE_ID}/contacts/${CONTACT_ID}/messages`)
      .expect(200);

    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });

  it('queries by instanceId AND contactId (not just one)', async () => {
    await request(app)
      .get(`/instances/${INSTANCE_ID}/contacts/${CONTACT_ID}/messages`)
      .expect(200);

    const findManyCall = (mockedPrisma.message.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.instanceId).toBe(INSTANCE_ID);
    expect(findManyCall.where.contactId).toBe(CONTACT_ID);
  });
});
