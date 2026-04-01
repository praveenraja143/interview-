// AI Service - Multi-Provider (Groq FREE / Gemini)
// Generates unique interview questions from resume & evaluates answers
// Groq: 14,400 requests/day FREE | Gemini: 1,500 requests/day FREE

const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
    constructor() {
        this.provider = null;
        this.geminiModel = null;
        this.groqKey = process.env.GROQ_API_KEY;
        this.geminiKey = process.env.GEMINI_API_KEY;
        this.isAvailable = false;

        // Priority: Groq (more free) → Gemini
        if (this.groqKey && this.groqKey !== 'YOUR_API_KEY_HERE') {
            this.provider = 'groq';
            this.isAvailable = true;
            console.log('✅ AI Service: Groq (Llama 3.3 70B) — FREE tier active');
        } else if (this.geminiKey && this.geminiKey !== 'YOUR_API_KEY_HERE') {
            try {
                const genAI = new GoogleGenerativeAI(this.geminiKey);
                this.geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
                this.provider = 'gemini';
                this.isAvailable = true;
                console.log('✅ AI Service: Gemini Flash — FREE tier active');
            } catch (err) {
                console.log('⚠️ Gemini init failed:', err.message);
            }
        } else {
            console.log('⚠️ No AI API key set (GROQ_API_KEY or GEMINI_API_KEY). Using local fallback.');
            console.log('   Get FREE Groq key → https://console.groq.com/keys');
        }
    }

    // ==========================================
    // CORE: Send prompt to whichever provider is active
    // ==========================================
    async _ask(prompt) {
        if (!this.isAvailable) return null;

        try {
            if (this.provider === 'groq') {
                return await this._askGroq(prompt);
            } else if (this.provider === 'gemini') {
                return await this._askGemini(prompt);
            }
        } catch (err) {
            console.error(`❌ AI (${this.provider}) error:`, err.message);
            return null;
        }
        return null;
    }

    async _askGroq(prompt) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.groqKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant. Always return valid JSON when asked. No markdown formatting around JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Groq ${response.status}: ${errText.substring(0, 200)}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
    }

    async _askGemini(prompt) {
        const result = await this.geminiModel.generateContent(prompt);
        return result.response.text().trim();
    }

    // ==========================================
    // PARSE JSON from AI response
    // ==========================================
    _parseJSON(text, type = 'array') {
        if (!text) return null;
        try {
            // Try direct parse first
            const parsed = JSON.parse(text);
            return parsed;
        } catch {
            // Extract JSON from text
            const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
            const match = text.match(pattern);
            if (match) {
                try {
                    return JSON.parse(match[0]);
                } catch {
                    return null;
                }
            }
        }
        return null;
    }

    // ==========================================
    // GENERATE UNIQUE INTERVIEW QUESTIONS
    // ==========================================
    async generateInterviewQuestions(candidateSkills, jobTitle, jobSkills, count = 5) {
        if (!this.isAvailable) return null;

        const prompt = `You are an expert HR interviewer. Generate exactly ${count} unique interview questions for a candidate.

Job Title: ${jobTitle}
Job Required Skills: ${jobSkills.join(', ')}
Candidate's Resume Skills: ${candidateSkills.join(', ')}

Rules:
- Generate questions SPECIFIC to the candidate's skills and the job role
- Mix behavioral, technical, and situational questions
- Questions should test real knowledge, not just definitions
- Make each question unique - never repeat common generic questions
- Questions should be conversational (AI will speak them aloud to the candidate)

Return ONLY a JSON array of strings (questions). No explanation, no markdown.
Example: ["Question 1?", "Question 2?"]`;

        const text = await this._ask(prompt);
        const questions = this._parseJSON(text, 'array');

        if (Array.isArray(questions) && questions.length > 0) {
            console.log(`🤖 AI generated ${questions.length} unique interview questions`);
            return questions;
        }
        return null;
    }

    // ==========================================
    // GENERATE UNIQUE TECHNICAL MCQ QUESTIONS
    // ==========================================
    async generateTechnicalMCQs(skills, count = 7) {
        if (!this.isAvailable) return null;

        const prompt = `Generate exactly ${count} unique multiple-choice technical questions for a candidate with these skills: ${skills.join(', ')}.

Rules:
- Each question must be SPECIFIC to one of the listed skills
- 4 options per question, only 1 correct
- Mix easy, medium, and hard difficulty
- Questions should test practical knowledge, not just theory
- NEVER repeat common textbook questions

Return ONLY valid JSON array. No markdown, no explanation.
Format:
[{
  "question": "...",
  "options": ["A", "B", "C", "D"],
  "correctAnswer": 0,
  "difficulty": "medium",
  "topic": "React",
  "type": "mcq"
}]`;

        const text = await this._ask(prompt);
        const questions = this._parseJSON(text, 'array');

        if (Array.isArray(questions) && questions.length > 0) {
            const valid = questions.filter(q =>
                q.question && q.options && q.options.length === 4 &&
                typeof q.correctAnswer === 'number'
            );
            if (valid.length > 0) {
                console.log(`🤖 AI generated ${valid.length} unique MCQ questions`);
                return valid.map(q => ({ ...q, type: 'mcq' }));
            }
        }
        return null;
    }

    // ==========================================
    // GENERATE UNIQUE CODING QUESTIONS
    // ==========================================
    async generateCodingQuestions(skills, count = 3) {
        if (!this.isAvailable) return null;

        const prompt = `Generate exactly ${count} unique coding/programming questions for a candidate with these skills: ${skills.join(', ')}.

Rules:
- Each question should require writing actual code
- Provide starter code that the candidate can build upon
- Include a list of keywords that a correct solution would contain
- Questions should test practical problem-solving
- Mix difficulty levels

Return ONLY valid JSON array. No markdown, no explanation.
Format:
[{
  "question": "Write a function that...",
  "type": "coding",
  "language": "javascript",
  "topic": "React",
  "difficulty": "medium",
  "starterCode": "function solution() {\\n  // Your code here\\n}",
  "requiredKeywords": ["function", "return", "map"],
  "expectedOutput": "Description of expected behavior"
}]`;

        const text = await this._ask(prompt);
        const questions = this._parseJSON(text, 'array');

        if (Array.isArray(questions) && questions.length > 0) {
            const valid = questions.filter(q => q.question && q.type === 'coding');
            if (valid.length > 0) {
                console.log(`🤖 AI generated ${valid.length} unique coding questions`);
                return valid;
            }
        }
        return null;
    }

    // ==========================================
    // EVALUATE INTERVIEW ANSWER WITH AI
    // ==========================================
    async evaluateInterviewAnswer(question, answer, candidateSkills = []) {
        if (!this.isAvailable) return null;

        const prompt = `You are an expert interviewer evaluating a candidate's answer.

Question asked: "${question}"
Candidate's answer: "${answer}"
Candidate's skills: ${candidateSkills.join(', ')}

Evaluate the answer on these criteria (score each 0-100):
1. relevance - How relevant is the answer to the question?
2. depth - How detailed and insightful is the answer?
3. clarity - How clear and well-structured is the communication?
4. professionalLanguage - Does the candidate use professional vocabulary?
5. technicalAccuracy - Is the technical content correct?

Also provide brief 1-2 sentence feedback.

Return ONLY valid JSON. No markdown.
{
  "relevance": 80,
  "depth": 70,
  "clarity": 75,
  "professionalLanguage": 85,
  "technicalAccuracy": 90,
  "overallScore": 80,
  "feedback": "Brief feedback here"
}`;

        const text = await this._ask(prompt);
        const evaluation = this._parseJSON(text, 'object');

        if (evaluation && evaluation.overallScore !== undefined) {
            return evaluation;
        }
        return null;
    }

    // ==========================================
    // EVALUATE CODE WITH AI
    // ==========================================
    async evaluateCode(code, question, language = 'javascript') {
        if (!this.isAvailable) return null;

        const prompt = `You are an expert code reviewer. Evaluate this candidate's code submission.

Question: "${question}"
Language: ${language}
Code:
${code}

Evaluate on these criteria (score each 0-100):
1. correctness - Does the code solve the problem correctly?
2. efficiency - Is the solution efficient?
3. codeQuality - Is the code clean and readable?
4. completeness - Does it handle edge cases?

Also provide brief 1-2 sentence feedback.

Return ONLY valid JSON. No markdown.
{
  "correctness": 80,
  "efficiency": 70,
  "codeQuality": 75,
  "completeness": 60,
  "overallScore": 72,
  "feedback": "Brief feedback here"
}`;

        const text = await this._ask(prompt);
        const evaluation = this._parseJSON(text, 'object');

        if (evaluation && evaluation.overallScore !== undefined) {
            return evaluation;
        }
        return null;
    }

    // ==========================================
    // EVALUATE GD SPEECH WITH AI
    // ==========================================
    async evaluateGDSpeech(topic, speechText) {
        if (!this.isAvailable) return null;

        const prompt = `You are evaluating a candidate's speech in a Group Discussion.

Topic: "${topic}"
Speech: "${speechText}"

Evaluate (score each 0-100):
1. relevance - How relevant to the topic?
2. contentQuality - Depth of knowledge and arguments
3. communication - Clarity and fluency
4. leadership - Initiative and persuasiveness
5. confidence - Overall confidence level

Also provide brief 1-2 sentence feedback.

Return ONLY valid JSON. No markdown.
{
  "relevance": 80,
  "contentQuality": 70,
  "communication": 75,
  "leadership": 60,
  "confidence": 85,
  "overallScore": 74,
  "feedback": "Brief feedback here"
}`;

        const text = await this._ask(prompt);
        const evaluation = this._parseJSON(text, 'object');

        if (evaluation && evaluation.overallScore !== undefined) {
            return evaluation;
        }
        return null;
    }

    // ==========================================
    // EVALUATE RESUME WITH AI (High Accuracy ATS)
    // ==========================================
    async evaluateResume(resumeText, jobTitle, requiredSkills, requiredExperience) {
        if (!this.isAvailable) return null;

        const prompt = `You are an expert ATS (Applicant Tracking System) reviewer. 
Your task is to analyze the text of a document and determine if it is a valid resume, then score it against a job role.

Job Title: ${jobTitle}
Job Required Skills: ${requiredSkills.join(', ')}
Required Experience: ${requiredExperience} years

Candidate Document Text: 
"""
${resumeText.substring(0, 8000)}
"""

Analysis Phase:
1. Is this actually a resume/CV? Check for contact info, work history, education sections.
2. Does it contain candidate details or is it just a job description / task document?
3. If it is NOT a resume, give an extremely low overall score (0-5) and mark isResume as false.

Scoring Criteria (0-100):
- skillMatch: How well do the candidate's projects/skills match the job?
- experienceMatch: Years of experience found vs required.
- educationMatch: Degree relevance.
- keywordScore: Usage of professional and technical terminology.

Return ONLY valid JSON. No markdown.
{
  "isResume": true/false,
  "skillMatch": 80,
  "experienceMatch": 70,
  "educationMatch": 100,
  "keywordScore": 60,
  "overallScore": 75,
  "feedback": "Detailed feedback here..."
}`;

        const text = await this._ask(prompt);
        const evaluation = this._parseJSON(text, 'object');

        if (evaluation && evaluation.overallScore !== undefined) {
            return evaluation;
        }
        return null;
    }
}

module.exports = new AIService();
