const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

router.get('/', agentController.getMyAgents);
router.get('/:agentId', agentController.getAgentById);
router.post('/', agentController.createAgent);
router.put('/:agentId', agentController.updateAgent);
router.delete('/:agentId', agentController.deleteAgent);

module.exports = router;
