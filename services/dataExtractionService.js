/**
 * Service to extract structured data from call transcripts using OpenAI
 * Uses per-user API keys provided from the UI
 */

const axios = require('axios');
const { default: PQueue } = require('p-queue');

const aiQueue = new PQueue({ concurrency: 1 });

class DataExtractionService {
    constructor() {
        this.openaiModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    }

    /**
     * Extract information using custom user-defined fields
     * @param {string} transcript - The call transcript text
     * @param {Array} customFields - Array of {field_name, description} objects
     * @param {string} apiKey - User's OpenAI API key (decrypted)
     * @returns {Promise<Object>} Extracted data with field names as keys
     */
    async extractWithCustomFields(transcript, customFields, apiKey) {
        if (!transcript || typeof transcript !== 'string') {
            return this.getEmptyCustomFieldsData(customFields);
        }

        if (!Array.isArray(customFields) || customFields.length === 0) {
            return {};
        }

        if (!apiKey) {
            console.log('No OpenAI API key provided, skipping AI extraction');
            return this.getEmptyCustomFieldsData(customFields);
        }

        try {
            return await this.extractWithCustomFieldsAI(transcript, customFields, apiKey);
        } catch (error) {
            console.error('AI extraction with custom fields failed:', error.message);
            return this.getEmptyCustomFieldsData(customFields);
        }
    }

    /**
     * Extract information using OpenAI with custom fields
     */
    async extractWithCustomFieldsAI(transcript, customFields, apiKey) {
        // Build JSON structure for expected output
        const jsonStructure = {};
        const fieldInstructions = [];

        customFields.forEach(field => {
            jsonStructure[field.field_name] = "";
            fieldInstructions.push(`- ${field.field_name}: ${field.description}`);
        });

        const prompt = `Extract the following information from this call transcript. Return ONLY a valid JSON object with the exact keys shown below. If any information is not found in the transcript, use the exact string "Not Found".

Required JSON format:
${JSON.stringify(jsonStructure, null, 2)}

Field extraction instructions:
${fieldInstructions.join('\n')}

IMPORTANT:
- For each field, carefully read the transcript and extract the relevant information based on the description
- If the information is not present in the transcript, use exactly "Not Found" (not empty string, not null, but the string "Not Found")
- Return only the JSON object, no additional text or explanation

Transcript:
${transcript}

Return only the JSON object:`;

        try {
            const model = this.openaiModel;

            const requestPayload = {
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You extract structured data. Return ONLY valid JSON. Do not explain anything. If information is not found, use exactly "Not Found".'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 150
            };

            // Add JSON response format for supported models
            if (
                model.includes('gpt-3.5-turbo-1106') ||
                model.includes('gpt-4-turbo') ||
                model.includes('gpt-4o') ||
                model.includes('gpt-4-1106')) {
                requestPayload.response_format = { type: 'json_object' };
            }

            const response = await aiQueue.add(() =>
                axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    requestPayload,
                    {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    }
                )
            );

            const content = response.data.choices[0].message.content;

            // Parse JSON response
            let extractedData;
            try {
                let cleanedContent = content.trim();
                if (cleanedContent.startsWith('```json')) {
                    cleanedContent = cleanedContent.replace(/```json\n?/i, '').replace(/```\n?$/, '');
                } else if (cleanedContent.startsWith('```')) {
                    cleanedContent = cleanedContent.replace(/```\n?/i, '').replace(/```\n?$/, '');
                }

                extractedData = JSON.parse(cleanedContent);
            } catch (parseError) {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    extractedData = JSON.parse(jsonMatch[0]);
                } else {
                    console.error('Failed to parse AI response:', content);
                    throw new Error('Failed to parse AI response as JSON');
                }
            }

            // Validate and sanitize extracted data
            const result = {};
            customFields.forEach(field => {
                const value = extractedData[field.field_name];
                result[field.field_name] = this.sanitizeCustomValue(value);
            });

            return result;
        } catch (error) {
            console.error('AI API error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Sanitize extracted custom field values
     */
    sanitizeCustomValue(value) {
        if (!value || typeof value !== 'string') {
            return 'Not Found';
        }
        const trimmed = value.trim();
        return trimmed || 'Not Found';
    }

    /**
     * Get empty data structure for custom fields
     */
    getEmptyCustomFieldsData(customFields) {
        const result = {};
        customFields.forEach(field => {
            result[field.field_name] = 'Not Found';
        });
        return result;
    }
}

module.exports = new DataExtractionService();
