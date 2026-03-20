const express = require('express');
const router = express.Router();
const Widget = require('../../models/Widget');
const Agent = require('../../models/Agent');
const bolnaService = require('../../services/bolnaService');

// POST /api/public/widget/request-call
router.post('/request-call', async (req, res) => {
    try {
        const { widget_id, phone_number } = req.body;
        const origin = req.headers.origin || req.headers.referer;

        if (!widget_id || !phone_number) {
            return res.status(400).json({ success: false, error: 'Widget ID and Phone Number are required' });
        }

        // 1. Find the widget and ensure it's active
        const widget = await Widget.findById(widget_id);
        if (!widget || !widget.is_active) {
            return res.status(404).json({ success: false, error: 'Widget not found or disabled' });
        }

        // 2. Security Check: Validate Origin
        const validDomains = widget.allowed_domains ? widget.allowed_domains.filter(domain => domain.trim() !== '') : [];
        if (validDomains.length > 0) {
            if (!origin || origin === 'null') {
                return res.status(403).json({ success: false, error: 'Direct API access forbidden. Origin header required.' });
            }

            try {
                const originUrl = new URL(origin);
                const isAllowed = validDomains.some(domain => {
                    return domain.includes(originUrl.hostname) || originUrl.hostname.includes(domain);
                });

                if (!isAllowed) {
                    return res.status(403).json({ success: false, error: 'Domain not authorized for this widget.' });
                }
            } catch (e) {
                return res.status(403).json({ success: false, error: 'Invalid origin.' });
            }
        }

        // 3. Find the associated Agent to get the Bolna ID
        const agent = await Agent.findById(widget.agent_id);
        if (!agent || !agent.bolna_agent_id) {
            return res.status(500).json({ success: false, error: 'Agent configuration error.' });
        }

        // 4. Clean the phone number (basic validation)
        let cleanPhone = phone_number.replace(/\D/g, '');
        if (cleanPhone.length >= 10 && !cleanPhone.startsWith('91')) {
            cleanPhone = '91' + cleanPhone.slice(-10); // Standardize to indian number if needed, or leave as is.
        }
        if (!cleanPhone.startsWith('+')) {
            cleanPhone = '+' + cleanPhone;
        }

        // 5. Initiate the call securely on the server side
        console.log(`📞 Widget ${widget_id} initiating call to ${cleanPhone} via agent ${agent.bolna_agent_id}`);
        const bolnaResponse = await bolnaService.initiateCall(agent.bolna_agent_id, cleanPhone);

        // 6. Proactively create/upsert the Execution record with source: 'widget'
        try {
            // Bolna can return the execution ID in various fields — check all common locations
            const findId = (obj) => {
                if (!obj || typeof obj !== 'object') return null;
                const keys = ['id', 'execution_id', 'call_id', 'bolna_execution_id'];
                for (const k of keys) {
                    if (obj[k] && typeof obj[k] === 'string') return obj[k];
                }
                // Search one level deeper (e.g., bolnaResponse.data.id)
                for (const v of Object.values(obj)) {
                    if (v && typeof v === 'object') {
                        const found = findId(v);
                        if (found) return found;
                    }
                }
                return null;
            };
            const executionId = findId(bolnaResponse);
            if (executionId) {
                const Execution = require('../../models/Execution');
                await Execution.findOneAndUpdate(
                    { bolna_execution_id: executionId },
                    {
                        bolna_execution_id: executionId,
                        agent_id: agent._id,
                        status: 'pending',
                        to_number: cleanPhone,
                        source: 'widget',
                        started_at: new Date()
                    },
                    { upsert: true, new: true }
                );
                console.log(`📝 Registered Execution ${executionId} as Widget call.`);
            } else {
                console.warn('⚠️ Widget call initiated but no execution ID found in Bolna response. Will be tagged when synced.', bolnaResponse);
            }
        } catch (execError) {
            console.error('Error logging widget execution source:', execError);
            // Don't fail the request if logging fails
        }

        res.json({
            success: true,
            message: 'Call initiated successfully.',
            // Optionally return an ID if frontend needs to poll status, 
            // but for security, return minimal info to public endpoint.
        });

    } catch (error) {
        console.error('Widget call request error:', error);
        res.status(500).json({ success: false, error: 'Failed to initiate call. Please try again later.' });
    }
});

// GET /api/public/widget/config/:id
// Fetches the UI configuration for the widget script to render
router.get('/config/:id', async (req, res) => {
    try {
        const widgetId = req.params.id;
        const widget = await Widget.findById(widgetId).select('name theme_color text_color bg_color button_text modal_title modal_subtitle success_message position border_radius is_active allowed_domains');

        if (!widget || !widget.is_active) {
            return res.status(404).json({ success: false, error: 'Widget not found' });
        }

        // Check origin for config fetch too
        const origin = req.headers.origin || req.headers.referer;
        const validDomains = widget.allowed_domains ? widget.allowed_domains.filter(domain => domain.trim() !== '') : [];
        if (validDomains.length > 0 && origin) {
            try {
                const originUrl = new URL(origin);
                const isAllowed = validDomains.some(domain =>
                    domain.includes(originUrl.hostname) || originUrl.hostname.includes(domain)
                );
                if (!isAllowed) {
                    return res.status(403).json({ success: false, error: 'Domain not authorized' });
                }
            } catch (e) {
                // Ignore parsing errors for config fetch, let it pass if origin is malformed but exists
            }
        }

        // Return safe config data (NO AGENT IDs, NO CLIENT IDs)
        res.json({
            success: true,
            config: {
                theme_color: widget.theme_color,
                text_color: widget.text_color,
                bg_color: widget.bg_color,
                button_text: widget.button_text,
                modal_title: widget.modal_title,
                modal_subtitle: widget.modal_subtitle,
                success_message: widget.success_message,
                position: widget.position,
                border_radius: widget.border_radius
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load widget configuration' });
    }
});

module.exports = router;
