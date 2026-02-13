/**
 * Service to extract structured data from call transcripts using AI
 * Specifically extracts doctor/clinic information
 */

const axios = require('axios');

class DataExtractionService {
    constructor() {
        this.useAI = !!process.env.OPENAI_API_KEY;
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.openaiModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    }

    /**
     * Extract doctor information from transcript using AI
     * Falls back to regex if AI is not available
     * @param {string} transcript - The call transcript text
     * @returns {Promise<Object>} Extracted doctor information
     */
    async extractDoctorInfo(transcript) {
        if (!transcript || typeof transcript !== 'string') {
            return this.getEmptyDoctorInfo();
        }

        // Use AI if available, otherwise fall back to regex
        if (this.useAI) {
            try {
                return await this.extractWithAI(transcript);
            } catch (error) {
                console.error('AI extraction failed, falling back to regex:', error.message);
                return this.extractWithRegex(transcript);
            }
        } else {
            return this.extractWithRegex(transcript);
        }
    }

    /**
     * Extract information using custom user-defined fields
     * @param {string} transcript - The call transcript text
     * @param {Array} customFields - Array of {field_name, description} objects
     * @returns {Promise<Object>} Extracted data with field names as keys
     */
    async extractWithCustomFields(transcript, customFields) {
        if (!transcript || typeof transcript !== 'string') {
            return this.getEmptyCustomFieldsData(customFields);
        }

        if (!Array.isArray(customFields) || customFields.length === 0) {
            return {};
        }

        // Use AI if available
        if (this.useAI) {
            try {
                return await this.extractWithCustomFieldsAI(transcript, customFields);
            } catch (error) {
                console.error('AI extraction with custom fields failed:', error.message);
                return this.getEmptyCustomFieldsData(customFields);
            }
        } else {
            // Without AI, just return "Not Found" for all fields
            return this.getEmptyCustomFieldsData(customFields);
        }
    }

    /**
     * Extract information using OpenAI API with custom fields
     */
    async extractWithCustomFieldsAI(transcript, customFields) {
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
            // Build request payload
            const requestPayload = {
                model: this.openaiModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a data extraction assistant. Extract structured information from call transcripts and return only valid JSON. If information is not found, always use the exact string "Not Found".'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1000
            };

            // Add JSON mode for supported models
            if (this.openaiModel.includes('gpt-3.5-turbo-1106') ||
                this.openaiModel.includes('gpt-4-turbo') ||
                this.openaiModel.includes('gpt-4o') ||
                this.openaiModel.includes('gpt-4-1106')) {
                requestPayload.response_format = { type: 'json_object' };
            }

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                requestPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const content = response.data.choices[0].message.content;

            // Parse JSON response
            let extractedData;
            try {
                // Clean content - remove markdown code blocks if present
                let cleanedContent = content.trim();
                if (cleanedContent.startsWith('```json')) {
                    cleanedContent = cleanedContent.replace(/```json\n?/i, '').replace(/```\n?$/, '');
                } else if (cleanedContent.startsWith('```')) {
                    cleanedContent = cleanedContent.replace(/```\n?/i, '').replace(/```\n?$/, '');
                }

                extractedData = JSON.parse(cleanedContent);
            } catch (parseError) {
                // Try to extract JSON from response if it's wrapped in text
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
            console.error('OpenAI API error:', error.response?.data || error.message);
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

    /**
     * Extract information using OpenAI API
     */
    async extractWithAI(transcript) {
        const prompt = `Extract the following information from this call transcript. Return ONLY a valid JSON object with the exact keys shown below. If any information is not found, use an empty string "".

Required JSON format:
{
  "doctor_name": "",
  "clinic_hospital_name": "",
  "phone_number": "",
  "email_id": "",
  "city": ""
}

Instructions:
- doctor_name: Extract the full name of the doctor (e.g., "Dr. John Smith" or "John Smith")
- clinic_hospital_name: Extract the name of the clinic, hospital, or medical center
- phone_number: Extract any phone number mentioned (include country code if present)
- email_id: Extract any email address mentioned
- city: Extract the city name where the clinic/hospital is located

Transcript:
${transcript}

Return only the JSON object, no additional text or explanation:`;

        try {
            // Build request payload
            const requestPayload = {
                model: this.openaiModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a data extraction assistant. Extract structured information from call transcripts and return only valid JSON. Always return a JSON object with the exact keys: doctor_name, clinic_hospital_name, phone_number, email_id, city.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 500
            };

            // Add JSON mode for supported models (gpt-3.5-turbo-1106 and newer, gpt-4-turbo and newer)
            if (this.openaiModel.includes('gpt-3.5-turbo-1106') ||
                this.openaiModel.includes('gpt-4-turbo') ||
                this.openaiModel.includes('gpt-4o') ||
                this.openaiModel.includes('gpt-4-1106')) {
                requestPayload.response_format = { type: 'json_object' };
            }

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                requestPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const content = response.data.choices[0].message.content;

            // Parse JSON response
            let extractedData;
            try {
                // Clean content - remove markdown code blocks if present
                let cleanedContent = content.trim();
                if (cleanedContent.startsWith('```json')) {
                    cleanedContent = cleanedContent.replace(/```json\n?/i, '').replace(/```\n?$/, '');
                } else if (cleanedContent.startsWith('```')) {
                    cleanedContent = cleanedContent.replace(/```\n?/i, '').replace(/```\n?$/, '');
                }

                extractedData = JSON.parse(cleanedContent);
            } catch (parseError) {
                // Try to extract JSON from response if it's wrapped in text
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    extractedData = JSON.parse(jsonMatch[0]);
                } else {
                    console.error('Failed to parse AI response:', content);
                    throw new Error('Failed to parse AI response as JSON');
                }
            }

            // Validate and return extracted data
            return {
                doctor_name: this.sanitizeValue(extractedData.doctor_name),
                clinic_hospital_name: this.sanitizeValue(extractedData.clinic_hospital_name),
                phone_number: this.sanitizeValue(extractedData.phone_number),
                email_id: this.sanitizeValue(extractedData.email_id),
                city: this.sanitizeValue(extractedData.city),
            };
        } catch (error) {
            console.error('OpenAI API error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Extract information using regex patterns (fallback method)
     */
    extractWithRegex(transcript) {
        const text = transcript.toLowerCase();

        return {
            doctor_name: this.extractDoctorName(transcript, text),
            clinic_hospital_name: this.extractClinicName(transcript, text),
            phone_number: this.extractPhoneNumber(transcript, text),
            email_id: this.extractEmail(transcript, text),
            city: this.extractCity(transcript, text),
        };
    }

    /**
     * Sanitize extracted values
     */
    sanitizeValue(value) {
        if (!value || typeof value !== 'string') {
            return '';
        }
        return value.trim();
    }

    /**
     * Extract doctor's name from transcript (regex fallback)
     */
    extractDoctorName(originalText, lowerText) {
        const patterns = [
            /(?:doctor|dr\.?|dr\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
            /(?:i am|my name is|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
            /(?:name[:\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        ];

        for (const pattern of patterns) {
            const matches = originalText.match(pattern);
            if (matches && matches.length > 0) {
                const name = matches[0]
                    .replace(/^(?:doctor|dr\.?|dr)\s*/i, '')
                    .replace(/^(?:i am|my name is|this is)\s*/i, '')
                    .replace(/^name[:\s]+/i, '')
                    .trim();

                if (name && name.length > 2) {
                    return name;
                }
            }
        }
        return '';
    }

    /**
     * Extract clinic/hospital name (regex fallback)
     */
    extractClinicName(originalText, lowerText) {
        const patterns = [
            /(?:clinic|hospital|medical center|health center|healthcare center)[:\s]+([A-Z][a-zA-Z\s&]+)/gi,
            /(?:at|from)\s+([A-Z][a-zA-Z\s&]+)\s+(?:clinic|hospital|medical center)/gi,
            /([A-Z][a-zA-Z\s&]+)\s+(?:clinic|hospital|medical center|health center)/gi,
        ];

        for (const pattern of patterns) {
            const matches = originalText.match(pattern);
            if (matches && matches.length > 0) {
                const name = matches[0]
                    .replace(/^(?:clinic|hospital|medical center|health center|healthcare center)[:\s]+/i, '')
                    .replace(/^(?:at|from)\s+/i, '')
                    .replace(/\s+(?:clinic|hospital|medical center|health center)$/i, '')
                    .trim();

                if (name && name.length > 2) {
                    return name;
                }
            }
        }
        return '';
    }

    /**
     * Extract phone number (regex fallback)
     */
    extractPhoneNumber(originalText, lowerText) {
        const patterns = [
            /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
            /(?:\+91[-.\s]?)?[6-9]\d{9}/g,
            /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
            /(?:phone|mobile|contact|number)[:\s]+([+\d\s\-\(\)\.]+)/gi,
        ];

        for (const pattern of patterns) {
            const matches = originalText.match(pattern);
            if (matches && matches.length > 0) {
                let phone = matches[0]
                    .replace(/^(?:phone|mobile|contact|number)[:\s]+/i, '')
                    .trim();
                phone = phone.replace(/\s*(?:is|are|:)\s*/gi, '').trim();

                if (phone && phone.length >= 10) {
                    return phone;
                }
            }
        }
        return '';
    }

    /**
     * Extract email address (regex fallback)
     */
    extractEmail(originalText, lowerText) {
        const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const matches = originalText.match(emailPattern);

        if (matches && matches.length > 0) {
            return matches[0].trim();
        }

        const emailWithLabel = /(?:email|e-mail|email id|email address)[:\s]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
        const labeledMatches = originalText.match(emailWithLabel);
        if (labeledMatches && labeledMatches.length > 0) {
            return labeledMatches[0]
                .replace(/^(?:email|e-mail|email id|email address)[:\s]+/i, '')
                .trim();
        }
        return '';
    }

    /**
     * Extract city name (regex fallback)
     */
    extractCity(originalText, lowerText) {
        const patterns = [
            /(?:city|location|located in|based in)[:\s]+([A-Z][a-zA-Z\s]+)/g,
            /(?:in|at)\s+([A-Z][a-zA-Z\s]+)(?:,|\s+city|\s+state)/g,
            /([A-Z][a-zA-Z\s]+),\s*(?:[A-Z]{2}|india|usa|united states)/gi,
        ];

        const commonCities = [
            'mumbai', 'delhi', 'bangalore', 'hyderabad', 'chennai', 'kolkata',
            'pune', 'ahmedabad', 'jaipur', 'surat', 'lucknow', 'kanpur',
            'nagpur', 'indore', 'thane', 'bhopal', 'visakhapatnam', 'patna',
            'vadodara', 'ghaziabad', 'ludhiana', 'agra', 'nashik', 'faridabad',
            'meerut', 'rajkot', 'varanasi', 'srinagar', 'amritsar', 'new york',
            'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia',
            'san antonio', 'san diego', 'dallas', 'san jose', 'austin'
        ];

        for (const pattern of patterns) {
            const matches = originalText.match(pattern);
            if (matches && matches.length > 0) {
                let city = matches[0]
                    .replace(/^(?:city|location|located in|based in)[:\s]+/i, '')
                    .replace(/^(?:in|at)\s+/i, '')
                    .replace(/,\s*(?:[A-Z]{2}|india|usa|united states).*$/i, '')
                    .trim();

                const cityLower = city.toLowerCase();
                if (city && city.length > 2 && (
                    commonCities.some(c => cityLower.includes(c)) ||
                    city.split(' ').length <= 3
                )) {
                    return city;
                }
            }
        }
        return '';
    }

    /**
     * Get empty doctor info structure
     */
    getEmptyDoctorInfo() {
        return {
            doctor_name: '',
            clinic_hospital_name: '',
            phone_number: '',
            email_id: '',
            city: '',
        };
    }

    /**
     * Check if extracted data has any meaningful information
     */
    hasValidData(extractedData) {
        return Object.values(extractedData).some(value => value && value.trim().length > 0);
    }
}

module.exports = new DataExtractionService();
