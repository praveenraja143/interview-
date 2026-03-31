// Elimination Engine - Smart round-by-round candidate elimination

class EliminationEngine {
    
    calculateKeepCount(totalApplicants, totalPositions, eliminationRatio, round) {
        // Calculate how many candidates to keep after this round
        const keepPercentage = eliminationRatio / 100;
        let keepCount = Math.ceil(totalApplicants * keepPercentage);
        
        // Never keep less than totalPositions, but keep at least 1 if there are applicants
        if (keepCount < totalPositions) {
            keepCount = totalPositions;
        }

        if (totalApplicants > 0 && keepCount === 0) {
            keepCount = 1;
        }
        
        return keepCount;
    }

    eliminateByScore(results, keepCount) {
        // Sort by score descending
        const sorted = [...results].sort((a, b) => b.score - a.score);
        
        return sorted.map((result, index) => ({
            ...result,
            rank: index + 1,
            passed: index < keepCount,
            eliminatedAt: index >= keepCount ? new Date() : null
        }));
    }

    calculateRoundProgression(totalApplicants, totalPositions, eliminationRatios) {
        const rounds = ['ats', 'aptitude', 'technical', 'gd', 'interview'];
        let remaining = totalApplicants;
        const progression = {};

        for (const round of rounds) {
            const ratio = eliminationRatios[round] || 50;
            const keepCount = this.calculateKeepCount(remaining, totalPositions, ratio, round);
            
            progression[round] = {
                entering: remaining,
                keepCount: Math.min(keepCount, remaining),
                eliminated: Math.max(0, remaining - keepCount)
            };
            
            remaining = Math.min(keepCount, remaining);
        }

        // Final round keeps only totalPositions
        progression.interview.keepCount = Math.min(totalPositions, progression.interview.entering);
        progression.interview.eliminated = progression.interview.entering - progression.interview.keepCount;

        return progression;
    }

    generateReport(roundResults, round) {
        const total = roundResults.length;
        const passed = roundResults.filter(r => r.passed).length;
        const failed = total - passed;
        const avgScore = total > 0 ? roundResults.reduce((sum, r) => sum + r.score, 0) / total : 0;
        const topScore = total > 0 ? Math.max(...roundResults.map(r => r.score)) : 0;
        const bottomScore = total > 0 ? Math.min(...roundResults.map(r => r.score)) : 0;

        return {
            round,
            total,
            passed,
            failed,
            avgScore: Math.round(avgScore),
            topScore,
            bottomScore,
            passRate: total > 0 ? Math.round((passed / total) * 100) : 0
        };
    }
}

module.exports = new EliminationEngine();
