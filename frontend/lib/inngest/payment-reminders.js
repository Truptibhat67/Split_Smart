import { Resend } from 'resend';
import { inngest } from "./client";

const resend = new Resend(process.env.RESEND_API_KEY);

export const paymentReminders = inngest.createFunction(
  { id: "send-payment-reminders" },
  { cron: "0 10 * * *" }, // daily at 10 AM UTC
  async ({ step }) => {
    /* 1. fetch all users that still owe money */
    const users = await step.run("fetch-debts", async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/inngest/users-with-debts`);
      if (!response.ok) {
        throw new Error(`Failed to fetch users with debts: ${response.statusText}`);
      }
      return response.json();
    });

    /* 2. build & send one e‑mail per user */
    const results = await step.run("send-emails", async () => {
      return Promise.all(
        users.map(async (u) => {
          const rows = u.debts
            .map(
              (d) => `
                <tr>
                  <td style="padding:4px 8px;">${d.name}</td>
                  <td style="padding:4px 8px;">₹${d.amount.toFixed(2)}</td>
                </tr>
              `
            )
            .join("");

          if (!rows) return { userId: u._id, skipped: true };

          const html = `
            <h2>Splitr – Payment Reminder</h2>
            <p>Hi ${u.name}, you have the following outstanding balances:</p>
            <table cellspacing="0" cellpadding="0" border="1" style="border-collapse:collapse;">
              <thead>
                <tr><th>To</th><th>Amount</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <p>Please settle up soon. Thanks!</p>
          `;

          try {
            await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL || 'Splitr <noreply@splitr.example.com>',
              to: u.email,
              subject: "You have pending payments on Splitr",
              html,
            });
            return { userId: u._id, success: true };
          } catch (err) {
            console.error(`Failed to send email to ${u.email}:`, err);
            return { userId: u._id, success: false, error: err.message };
          }
        })
      );
    });

    return {
      processed: results.length,
      successes: results.filter((r) => r.success).length,
      failures: results.filter((r) => r.success === false).length,
    };
  }
);
