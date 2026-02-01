const express = require('express');
const router = express.Router();
const toolDetector = require('../services/tool-detector');

// Get all tools with availability status
router.get('/', (req, res) => {
  try {
    const tools = toolDetector.detectTools();
    const defaultTool = toolDetector.getDefaultTool();
    res.json({
      ...tools,
      defaultTool
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if specific tool is available
router.get('/:id', (req, res) => {
  try {
    const toolId = req.params.id;
    const available = toolDetector.isToolAvailable(toolId);
    const info = toolDetector.getToolInfo(toolId);

    if (!info) {
      return res.status(404).json({ error: 'Unknown tool' });
    }

    res.json({
      id: toolId,
      name: info.name,
      description: info.description,
      available,
      installCmd: info.installCmd
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
