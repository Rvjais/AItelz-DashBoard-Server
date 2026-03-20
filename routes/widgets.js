const express = require('express');
const router = express.Router();
const widgetController = require('../controllers/widgetController');
const auth = require('../middleware/auth');

router.get('/', auth, widgetController.getWidgets);
router.post('/', auth, widgetController.createWidget);
router.put('/:id', auth, widgetController.updateWidget);
router.delete('/:id', auth, widgetController.deleteWidget);

module.exports = router;
