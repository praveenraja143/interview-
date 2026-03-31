// Elimination Engine - Smart round-by-round candidate elimination

class EliminationEngine {
    
    calculateKeepCount(totalApplicants, totalPositions, eliminationRatio, round) {
        // Calculate how many candidates to keep after this round
        const keepPercentage = eliminationRatio / 100;
        // Keep at least totalPositions, or all applicants if there are fewer than totalPositions.
        // We'll also use the ratio as the baseline to filter out excessive applicants early.
        let targetKeep = Math.ceil(totalApplicants * keepPercentage);
        
        // Ensure we never keep less than we have positions for, but also don't "invent" people
        let finalKeep = Math.max(targetKeep, totalPositions);
        
        // Final sanity check: cannot keep more than total applicants
        finalKeep = Math.min(finalKeep, totalApplicants);
        
        // If there are people, at least one MUST stay (provided their score is not terrible)
        if (totalApplicants > 0 && finalKeep === 0) finalKeep = 1;

        return finalKeep;
    }

    eliminateByScore(results, keepCount) {
        // Sort by score descending
        const sorted = [...results].sort((a, b) => b.score - a.score);
        
        return sorted.map((result, index) => {
            // Strictly base passing on the rank (top N as defined by keepCount)
            const passed = index < keepCount;

            return {
                ...result,
                rank: index + 1,
                passed: passed,
                eliminatedAt: !passed ? new Date() : null
            };
        });
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
