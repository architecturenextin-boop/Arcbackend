import { sendEmail } from "../utils/mailer.js";

/**
 * Branded HTML Email Template Generator
 */
function renderEmailTemplate({ title, subtitle, otp, expiryMinutes = 5, note }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="540px" style="max-width: 540px; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                Architecture<span style="color: #10b981;">Next</span>
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase;">
                School of Internship
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #ffffff;">
                ${title}
              </h2>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                ${subtitle}
              </p>

              <!-- OTP Code Display Card -->
              <div style="margin: 28px 0; padding: 24px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; text-align: center;">
                <div style="font-size: 12px; font-weight: 700; color: #10b981; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">
                  Your Verification Code
                </div>
                <div style="font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #ffffff; font-family: monospace; padding: 4px 0;">
                  ${otp}
                </div>
                <div style="font-size: 12px; color: #94a3b8; margin-top: 8px;">
                  Valid for <strong>${expiryMinutes} minutes</strong>
                </div>
              </div>

              ${note ? `<p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">${note}</p>` : ""}

              <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.5; color: #64748b; border-top: 1px solid #334155; padding-top: 20px;">
                If you did not request this verification code, you can safely ignore this email. Never share this code with anyone.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0f172a; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                © ${new Date().getFullYear()} ArchitectureNext Education. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export class EmailService {
  /**
   * Signup Verification OTP email
   */
  static async sendSignupOtpEmail(email, rawOtp, name = "Learner") {
    try {
      const subject = `Your verification code is ${rawOtp} — ArchitectureNext`;
      const html = renderEmailTemplate({
        title: `Verify your email, ${name}!`,
        subtitle: `Thank you for creating an account with ArchitectureNext. Please enter the 6-digit verification code below to complete your registration.`,
        otp: rawOtp,
        expiryMinutes: 5,
        note: `Enter this code on the verification screen to activate your account and start learning.`,
      });

      return await sendEmail({
        to: email,
        subject,
        html,
        text: `Your ArchitectureNext verification code is: ${rawOtp} (valid for 5 minutes).`,
      });
    } catch (err) {
      console.error(`[EMAIL ERROR] Failed to send signup OTP to ${email}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Password Reset OTP email
   */
  static async sendPasswordResetOtpEmail(email, rawOtp, name = "Learner") {
    try {
      const subject = `Password reset code: ${rawOtp} — ArchitectureNext`;
      const html = renderEmailTemplate({
        title: `Reset your password`,
        subtitle: `Hello ${name}, we received a request to reset the password for your ArchitectureNext account. Use the code below to proceed with resetting your password.`,
        otp: rawOtp,
        expiryMinutes: 5,
        note: `This code will expire in 5 minutes. If you did not make this request, please change your password immediately or contact support.`,
      });

      return await sendEmail({
        to: email,
        subject,
        html,
        text: `Your ArchitectureNext password reset code is: ${rawOtp} (valid for 5 minutes).`,
      });
    } catch (err) {
      console.error(`[EMAIL ERROR] Failed to send password reset OTP to ${email}:`, err.message);
      return { success: false, error: err.message };
    }
  }
}
