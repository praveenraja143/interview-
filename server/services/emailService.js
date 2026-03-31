const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    async sendMail(to, subject, html) {
        try {
            const info = await this.transporter.sendMail({
                from: `"AI Interview Platform" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                html
            });
            console.log(`📧 Email sent to ${to}: ${info.messageId}`);
            return true;
        } catch (error) {
            console.error(`❌ Email failed to ${to}:`, error.message);
            return false;
        }
    }

    async sendRoundResult(candidate, jobTitle, round, passed, score, feedback) {
        const roundNames = {
            ats: 'Resume Screening (ATS)',
            aptitude: 'Aptitude Test',
            technical: 'Technical Round',
            gd: 'Group Discussion',
            interview: 'One-on-One Interview'
        };

        const status = passed ? '✅ PASSED' : '❌ NOT SELECTED';
        const statusColor = passed ? '#10b981' : '#ef4444';

        const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #818cf8; margin: 0;">🤖 AI Interview Platform</h1>
                <p style="color: #94a3b8;">Automated Interview Results</p>
            </div>
            
            <div style="background: #1e293b; padding: 24px; border-radius: 12px; margin-bottom: 20px;">
                <h2 style="color: #f8fafc; margin-top: 0;">Hello ${candidate.name},</h2>
                <p>Your results for <strong style="color: #818cf8;">${jobTitle}</strong> - <strong>${roundNames[round]}</strong> are ready.</p>
            </div>

            <div style="background: linear-gradient(135deg, #1e293b, #334155); padding: 24px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid ${statusColor};">
                <h3 style="margin-top: 0; color: ${statusColor};">${status}</h3>
                <p><strong>Score:</strong> ${score}/100</p>
                ${feedback ? `<p><strong>Feedback:</strong> ${feedback}</p>` : ''}
            </div>

            ${passed ? `
            <div style="background: #064e3b; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0;">🎉 Congratulations! You have qualified for the next round. Stay tuned for further instructions.</p>
            </div>` : `
            <div style="background: #7f1d1d; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0;">Thank you for participating. We encourage you to apply again in the future.</p>
            </div>`}
            
            <p style="color: #64748b; font-size: 12px; text-align: center;">This is an automated message from AI Interview Platform.</p>
        </div>`;

        return this.sendMail(candidate.email, `${roundNames[round]} Results - ${jobTitle}`, html);
    }

    async sendAdminReport(adminEmail, jobTitle, round, results) {
        const roundNames = {
            ats: 'Resume Screening (ATS)',
            aptitude: 'Aptitude Test',
            technical: 'Technical Round',
            gd: 'Group Discussion',
            interview: 'One-on-One Interview'
        };

        const passed = results.filter(r => r.passed);
        const failed = results.filter(r => !r.passed);

        let tableRows = results.map(r => `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #334155;">${r.candidateName}</td>
                <td style="padding: 8px; border-bottom: 1px solid #334155;">${r.email}</td>
                <td style="padding: 8px; border-bottom: 1px solid #334155;">${r.score}/100</td>
                <td style="padding: 8px; border-bottom: 1px solid #334155; color: ${r.passed ? '#10b981' : '#ef4444'};">${r.passed ? 'PASSED' : 'FAILED'}</td>
            </tr>
        `).join('');

        const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
            <h1 style="color: #818cf8;">📊 Round Report: ${roundNames[round]}</h1>
            <h2 style="color: #94a3b8;">Job: ${jobTitle}</h2>
            
            <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                <div style="background: #1e293b; padding: 16px; border-radius: 8px; flex: 1; text-align: center;">
                    <h3 style="color: #818cf8; margin: 0;">${results.length}</h3>
                    <p style="margin: 4px 0 0;">Total</p>
                </div>
                <div style="background: #064e3b; padding: 16px; border-radius: 8px; flex: 1; text-align: center;">
                    <h3 style="color: #10b981; margin: 0;">${passed.length}</h3>
                    <p style="margin: 4px 0 0;">Passed</p>
                </div>
                <div style="background: #7f1d1d; padding: 16px; border-radius: 8px; flex: 1; text-align: center;">
                    <h3 style="color: #ef4444; margin: 0;">${failed.length}</h3>
                    <p style="margin: 4px 0 0;">Failed</p>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden;">
                <thead>
                    <tr style="background: #334155;">
                        <th style="padding: 12px; text-align: left;">Name</th>
                        <th style="padding: 12px; text-align: left;">Email</th>
                        <th style="padding: 12px; text-align: left;">Score</th>
                        <th style="padding: 12px; text-align: left;">Status</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>`;

        return this.sendMail(adminEmail, `📊 ${roundNames[round]} Report - ${jobTitle}`, html);
    }

    async sendWelcome(candidate, jobTitle) {
        const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
            <h1 style="color: #818cf8; text-align: center;">🤖 AI Interview Platform</h1>
            <div style="background: #1e293b; padding: 24px; border-radius: 12px;">
                <h2 style="color: #f8fafc;">Welcome ${candidate.name}!</h2>
                <p>Your application for <strong style="color: #818cf8;">${jobTitle}</strong> has been received.</p>
                <p>Your resume will be screened by our AI system. You will receive results shortly.</p>
                <div style="background: #334155; padding: 16px; border-radius: 8px; margin-top: 16px;">
                    <h4 style="margin-top: 0; color: #818cf8;">📋 Interview Process:</h4>
                    <ol style="padding-left: 20px;">
                        <li>Resume Screening (ATS) - AI Analysis</li>
                        <li>Aptitude Test - Online MCQ</li>
                        <li>Technical Round - Skills Assessment</li>
                        <li>Group Discussion - Voice Analysis</li>
                        <li>One-on-One Interview - Video Analysis</li>
                    </ol>
                </div>
            </div>
        </div>`;

        return this.sendMail(candidate.email, `Application Received - ${jobTitle}`, html);
    }
}

module.exports = new EmailService();
