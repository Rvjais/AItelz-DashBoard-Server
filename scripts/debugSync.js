const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// Load Models
const Agent = require('../models/Agent');
const Execution = require('../models/Execution');
const Client = require('../models/Client');

async function debugSync() {
    console.log('🔍 Starting AItelz Sync Diagnostic...\n');

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const apiUrl = process.env.BOLNA_API_URL || 'https://api.bolna.ai';
        const token = process.env.BOLNA_BEARER_TOKEN;

        if (!token) {
            console.error('❌ BOLNA_BEARER_TOKEN is missing in .env');
            return;
        }

        // 1. Check Local Agents
        const localAgents = await Agent.find();
        console.log(`\n📋 Local Database Agents (${localAgents.length}):`);
        for (const agent of localAgents) {
            const latestExec = await Execution.findOne({ agent_id: agent._id }).sort({ created_at: -1 });
            console.log(`- ${agent.name} (${agent.bolna_agent_id})`);
            const latestSyncStr = latestExec ? (latestExec.created_at ? latestExec.created_at.toISOString() : 'Date missing') : 'Never (No excavations found)';
            console.log(`  └─ Latest Sync: ${latestSyncStr}`);
        }

        // 2. Check Bolna API Agents
        console.log('\n📡 Fetching All Agents from Bolna API...');
        const bolnaRes = await axios.get(`${apiUrl}/agent/all`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const bolnaAgents = bolnaRes.data;
        console.log(`✅ Found ${bolnaAgents.length} agents on Bolna.`);

        const localIds = localAgents.map(a => a.bolna_agent_id);
        const untracked = bolnaAgents.filter(a => !localIds.includes(a.agent_id || a.id));

        if (untracked.length > 0) {
            console.log('\n⚠️  Untracked Agents (In Bolna but not in Dashboard):');
            for (const a of untracked) {
                console.log(`- ${a.agent_name || a.name} (${a.agent_id || a.id})`);
            }
        } else {
            console.log('\n✅ All Bolna agents are tracked in the local DB.');
        }

        // 3. Check Sync Queue
        const unsyncedCount = await Execution.countDocuments({
            transcript: { $exists: true, $ne: '' },
            'extracted_data.google_sheet_synced': { $ne: true }
        });
        console.log(`\n📥 Unsynced Conversations: ${unsyncedCount} (In DB but not in Google Sheets)`);

        // 4. Check for conversations from last 14 days
        console.log('\n🕒 Checking Bolna for conversations from last 14 days...');
        let recentFound = 0;
        for (const agent of localAgents) {
            try {
                const res = await axios.get(`${apiUrl}/v2/agent/${agent.bolna_agent_id}/executions`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { page_size: 20 } // Check more results
                });
                const executions = res.data.data || [];
                for (const ex of executions) {
                    const createdDate = new Date(ex.created_at);
                    const isWithin14Days = (new Date() - createdDate) < 14 * 24 * 60 * 60 * 1000;

                    if (isWithin14Days) {
                        const existsLocally = await Execution.findOne({ bolna_execution_id: ex.id });
                        if (!existsLocally) {
                            console.log(`🆕 Found new execution on Bolna: ${ex.id} (${ex.created_at}) for agent ${agent.name}`);
                            recentFound++;
                        }
                    }
                }
            } catch (e) {
                console.error(`❌ Error checking agent ${agent.name}:`, e.message);
            }
        }

        if (recentFound === 0) {
            console.log('ℹ️  No new conversations found on Bolna that aren\'t already in the local DB.');
        }

        console.log('\n✅ Diagnostic Complete.');
    } catch (error) {
        console.error('\n❌ Diagnostic Error:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

debugSync();
