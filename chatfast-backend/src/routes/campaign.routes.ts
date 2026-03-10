import { Router } from 'express';
import { campaignController } from '../controllers/campaign.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/',            campaignController.list.bind(campaignController));
router.post('/',           campaignController.create.bind(campaignController));
router.get('/:id',         campaignController.getById.bind(campaignController));
router.post('/:id/launch', campaignController.launch.bind(campaignController));
router.post('/:id/pause',  campaignController.pause.bind(campaignController));
router.post('/:id/cancel', campaignController.cancel.bind(campaignController));
router.delete('/:id',      campaignController.delete.bind(campaignController));

export default router;
