// GD Engine - Group Discussion AI Analysis
// Evaluates voice confidence, response speed, content quality

const Sentiment = require('sentiment');
const sentiment = new Sentiment();
const natural = require('natural');

class GDEngine {
    constructor() {
        this.weights = {
            confidence: 0.30,
            responseSpeed: 0.20,
            contentQuality: 0.25,
            participation: 0.25
        };
    }

    analyzeSpeech(speechData) {
        // speechData: { text, duration, responseTime, totalSessionTime }
        const confidenceScore = this.analyzeConfidence(speechData);
        const responseSpeed = this.analyzeResponseSpeed(speechData);
        const contentQuality = this.analyzeContentQuality(speechData.text);
        const participation = this.analyzeParticipation(speechData);

        const totalScore = Math.round(
            (confidenceScore * this.weights.confidence) +
            (responseSpeed * this.weights.responseSpeed) +
            (contentQuality * this.weights.contentQuality) +
            (participation * this.weights.participation)
        );

        return {
            score: Math.min(Math.max(totalScore, 0), 100),
            details: {
                confidenceScore: Math.round(confidenceScore),
                responseSpeed: Math.round(responseSpeed),
                contentQuality: Math.round(contentQuality),
                participationLevel: Math.round(participation),
                speakingTime: speechData.duration || 0
            },
            feedback: this.generateFeedback(confidenceScore, responseSpeed, contentQuality, participation)
        };
    }

    analyzeConfidence(speechData) {
        let score = 50; // Base score

        // Longer, more coherent speech = more confident
        const wordCount = speechData.text ? speechData.text.split(/\s+/).length : 0;
        if (wordCount > 100) score += 20;
        else if (wordCount > 50) score += 15;
        else if (wordCount > 20) score += 10;
        else score -= 10;

        // Filler words reduce confidence score
        const fillerWords = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'right', 'so'];
        const text = (speechData.text || '').toLowerCase();
        let fillerCount = 0;
        for (const filler of fillerWords) {
            const regex = new RegExp(`\\b${filler}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) fillerCount += matches.length;
        }
        
        const fillerRatio = wordCount > 0 ? fillerCount / wordCount : 0;
        if (fillerRatio < 0.02) score += 15;
        else if (fillerRatio < 0.05) score += 5;
        else score -= 10;

        // Sentence structure — complete sentences indicate confidence
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
        if (sentences.length > 5) score += 10;
        else if (sentences.length > 2) score += 5;

        return Math.min(Math.max(score, 0), 100);
    }

    analyzeResponseSpeed(speechData) {
        // Response time in seconds. Faster = better (to a point)
        const responseTime = speechData.responseTime || 5;
        
        if (responseTime <= 2) return 95;
        if (responseTime <= 4) return 85;
        if (responseTime <= 6) return 70;
        if (responseTime <= 10) return 55;
        if (responseTime <= 15) return 40;
        return 25;
    }

    analyzeContentQuality(text) {
        if (!text || text.trim().length === 0) return 0;

        let score = 40; // Base score

        // Sentiment analysis
        const sentimentResult = sentiment.analyze(text);
        // Neutral or positive = better for professional discussion
        if (sentimentResult.score >= 0) score += 10;
        
        // Vocabulary richness
        const words = text.toLowerCase().split(/\s+/);
        const uniqueWords = new Set(words);
        const vocabularyRichness = uniqueWords.size / words.length;
        if (vocabularyRichness > 0.7) score += 20;
        else if (vocabularyRichness > 0.5) score += 10;

        // Professional keywords
        const professionalWords = ['therefore', 'however', 'moreover', 'furthermore', 'consequently', 
            'perspective', 'approach', 'strategy', 'implement', 'solution', 'analyze', 'evaluate',
            'consider', 'suggest', 'propose', 'recommend', 'believe', 'opinion', 'agree', 'disagree'];
        
        let profCount = 0;
        for (const word of professionalWords) {
            if (text.toLowerCase().includes(word)) profCount++;
        }
        score += Math.min(profCount * 5, 25);

        // Length check
        if (words.length > 50) score += 5;

        return Math.min(Math.max(score, 0), 100);
    }

    analyzeParticipation(speechData) {
        const totalTime = speechData.totalSessionTime || 900; // 15 min default
        const speakingTime = speechData.duration || 0;
        const participationRatio = speakingTime / totalTime;

        // Ideal participation: 15-30% of total time in a group
        if (participationRatio >= 0.15 && participationRatio <= 0.35) return 90;
        if (participationRatio >= 0.10 && participationRatio <= 0.40) return 70;
        if (participationRatio >= 0.05) return 50;
        return 25;
    }

    generateFeedback(confidence, speed, quality, participation) {
        const feedbacks = [];
        
        if (confidence >= 70) feedbacks.push("Strong confidence displayed.");
        else if (confidence >= 50) feedbacks.push("Moderate confidence level.");
        else feedbacks.push("Needs to improve confidence in group settings.");

        if (speed >= 70) feedbacks.push("Quick response times.");
        else feedbacks.push("Could improve response speed.");

        if (quality >= 70) feedbacks.push("High quality content and vocabulary.");
        else if (quality >= 50) feedbacks.push("Decent content quality.");
        else feedbacks.push("Content quality needs improvement.");

        if (participation >= 70) feedbacks.push("Good participation level.");
        else feedbacks.push("Needs to participate more actively.");

        return feedbacks.join(' ');
    }
}

module.exports = new GDEngine();
