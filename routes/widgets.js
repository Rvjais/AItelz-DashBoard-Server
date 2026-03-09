const express = require('express');
const router = express.Router();
const widgetController = require('../controllers/widgetController');

router.get('/', widgetController.getWidgets);
router.post('/', widgetController.createWidget);
router.put('/:id', widgetController.updateWidget);
router.delete('/:id', widgetController.deleteWidget);

module.exports = router;
