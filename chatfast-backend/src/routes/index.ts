import { Router } from 'express';
import authRoutes       from '../routes/auth.routes';
import clientRoutes     from '../routes/client.routes';
import instancesRoutes  from '../routes/instances.routes';
import webhookRoutes    from '../routes/webhook.routes';
import messagesRoutes   from '../routes/messages.routes';
import chatRoutes       from '../routes/chat.routes';
import groupsRoutes     from '../routes/groups.routes';
import profileRoutes    from '../routes/profile.routes';
import fetchRoutes      from '../routes/fetch.routes';
import adminRoutes      from '../routes/admin.routes';
import infraRoutes      from '../routes/infra.routes';
import campaignRoutes   from '../routes/campaign.routes';
import contactsRoutes   from '../routes/contacts.routes';
import { requireOwnership } from '../middleware/ownership';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// ─── Auth ─────────────────────────────────────────────────────
router.use('/auth',    authRoutes);

// ─── Clientes ─────────────────────────────────────────────────
router.use('/clients', clientRoutes);

// ─── Admin Dashboard ─────────────────────────────────────────
router.use('/admin', adminRoutes);

// ─── Infra (métricas + Docker) ────────────────────────────────
router.use('/infra', infraRoutes);

// ─── Core ────────────────────────────────────────────────────
router.use('/instances',  instancesRoutes);
router.use('/webhooks',   webhookRoutes);

// ─── Módulos con :instanceId ─────────────────────────────────
// mergeParams: true en cada sub-router hace que :instanceId
// esté disponible en req.params dentro de cada controller.
// requireOwnership() verifica que la instancia pertenece al
// usuario autenticado. ADMIN siempre hace bypass.

// Mensajes: text, media, audio, location, reaction, poll, contact
router.use('/instances/:instanceId/messages', authenticate, requireOwnership(), messagesRoutes);

// Chat CRM: presence, mark-read, profile-picture
router.use('/instances/:instanceId/chat',     authenticate, requireOwnership(), chatRoutes);

// Grupos: crear, miembros, links, ajustes
router.use('/instances/:instanceId/groups',   authenticate, requireOwnership(), groupsRoutes);

// Perfil del bot: foto, nombre, estado + revoke de mensajes
router.use('/instances/:instanceId/profile',  authenticate, requireOwnership(), profileRoutes);

// Sincronización: contactos, chats, historial
router.use('/instances/:instanceId/sync',     authenticate, requireOwnership(), fetchRoutes);

// Contactos + historial de mensajes del CRM
router.use('/instances/:instanceId/contacts', authenticate, requireOwnership(), contactsRoutes);

// Campañas de mensajería masiva
router.use('/campaigns', campaignRoutes);

export default router;