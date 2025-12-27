const express = require("express");
const { getOrCreateCurrentUser } = require("./users");
const ReminderPreference = require("../models/ReminderPreference");
const User = require("../models/User");
const Group = require("../models/Group");
const Expense = require("../models/Expense");
const Settlement = require("../models/Settlement");
const nodemailer = require("nodemailer");
const { buildSplitSmartEmail } = require("../email-templates/splitSmartTemplate");

const router = express.Router();

// Helper to compute net balance between two users (positive => other owes current)
async function computeUserNetBalance(userAId, userBId) {
  const [expenses, settlements] = await Promise.all([
    Expense.find({
      $or: [
        { paidByUserId: userAId },
        { paidByUserId: userBId },
        { "splits.userId": { $in: [userAId, userBId] } },
      ],
      $or: [{ groupId: { $exists: false } }, { groupId: null }],
    }),
    Settlement.find({
      $or: [
        { paidByUserId: userAId, receivedByUserId: userBId },
        { paidByUserId: userBId, receivedByUserId: userAId },
      ],
      $or: [{ groupId: { $exists: false } }, { groupId: null }],
    }),
  ]);

  let net = 0; // >0 means B owes A; <0 means A owes B

  for (const e of expenses) {
    const isA = String(e.paidByUserId) === String(userAId);
    const isB = String(e.paidByUserId) === String(userBId);
    if (!isA && !isB) continue;

    for (const s of e.splits || []) {
      if (
        (String(s.userId) === String(userAId) ||
          String(s.userId) === String(userBId)) &&
        !s.paid
      ) {
        if (isA && String(s.userId) === String(userBId)) {
          net += s.amount; // B owes A
        } else if (isB && String(s.userId) === String(userAId)) {
          net -= s.amount; // A owes B
        }
      }
    }
  }

  for (const s of settlements) {
    if (
      String(s.paidByUserId) === String(userAId) &&
      String(s.receivedByUserId) === String(userBId)
    ) {
      net -= s.amount;
    } else if (
      String(s.paidByUserId) === String(userBId) &&
      String(s.receivedByUserId) === String(userAId)
    ) {
      net += s.amount;
    }
  }

  return net;
}

// POST /api/reminders/preferences
// body: { scopeType: 'group'|'contact', scopeId, frequency: 'weekly'|'monthly' }
router.post("/preferences", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { scopeType, scopeId, frequency } = req.body || {};

    if (!scopeType || !scopeId || !frequency) {
      return res
        .status(400)
        .json({ error: "scopeType, scopeId and frequency are required" });
    }

    const allowedScope = ["group", "contact"]; 
    const allowedFrequency = ["weekly", "monthly"];

    if (!allowedScope.includes(scopeType) || !allowedFrequency.includes(frequency)) {
      return res.status(400).json({ error: "Invalid scopeType or frequency" });
    }

    const pref = await ReminderPreference.findOneAndUpdate(
      {
        userId: currentUser._id,
        scopeType,
        scopeId,
      },
      {
        userId: currentUser._id,
        scopeType,
        scopeId,
        frequency,
      },
      { new: true, upsert: true }
    );

    res.json({ preference: pref });
  } catch (err) {
    console.error("Error saving reminder preference", err);
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// POST /api/reminders/run
// This should be called from a scheduler (e.g. daily cron) to send due reminders.
router.post("/run", async (req, res) => {
  try {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sunday
    const dateOfMonth = now.getUTCDate();

    const prefs = await ReminderPreference.find({});

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromEmail = process.env.EMAIL_FROM || smtpUser;
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || "false")
      .toLowerCase()
      === "true";

    if (!smtpUser || !smtpPass || !fromEmail) {
      console.warn(
        "SMTP_USER / SMTP_PASS / EMAIL_FROM not set; skipping scheduled reminders"
      );
      return res
        .status(500)
        .json({ error: "Email configuration is not set on the server" });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    let sentCount = 0;

    for (const pref of prefs) {
      const last = pref.lastSentAt ? new Date(pref.lastSentAt) : null;

      const shouldRunWeekly =
        pref.frequency === "weekly" &&
        dayOfWeek === 0 &&
        (!last || now.getTime() - last.getTime() > 6 * 24 * 60 * 60 * 1000);

      const shouldRunMonthly =
        pref.frequency === "monthly" &&
        dateOfMonth === 1 &&
        (!last ||
          last.getUTCFullYear() !== now.getUTCFullYear() ||
          last.getUTCMonth() !== now.getUTCMonth());

      if (!shouldRunWeekly && !shouldRunMonthly) continue;

      const owner = await User.findById(pref.userId);
      if (!owner) continue;

      if (pref.scopeType === "contact") {
        const otherUser = await User.findById(pref.scopeId);
        if (!otherUser || !otherUser.email) continue;

        const net = await computeUserNetBalance(owner._id, otherUser._id);
        if (net <= 0.01) continue; // nothing owed

        const subject = `Reminder: You owe ₹${net.toFixed(2)} in Split Smart`;
        const text = `Hi ${
          otherUser.name || "there"
        },\n\nThis is an automatic reminder from Split Smart.\n\nYou currently owe ₹${net.toFixed(
          2
        )} to ${
          owner.name || "a contact"
        }.\n\nPlease settle this amount at your earliest convenience.\n\nThanks!`;

        const html = buildSplitSmartEmail({
          title: `You owe ₹${net.toFixed(2)} to ${owner.name || "a contact"}`,
          subtitle: "Scheduled reminder",
          greeting: `Hi ${otherUser.name || "there"},`,
          intro:
            "This is an automatic reminder from Split Smart about your outstanding balance.",
          highlightLabel: "Amount due",
          highlightValue: `₹${net.toFixed(2)}`,
          bodyLines: [
            `You currently owe this amount to ${owner.name || "a contact"}.`,
            "Open Split Smart to review your expenses and settle up.",
          ],
        });

        await transporter.sendMail({
          from: fromEmail,
          to: otherUser.email,
          subject,
          text,
          html,
        });

        pref.lastSentAt = Date.now();
        await pref.save();
        sentCount += 1;
      } else if (pref.scopeType === "group") {
        const group = await Group.findById(pref.scopeId).populate("members.userId");
        if (!group) continue;

        const memberUsers = group.members
          .map((m) => m.userId)
          .filter((u) => u && u.email && String(u._id) !== String(owner._id));

        if (!memberUsers.length) continue;

        const subject = `Reminder: You may have pending payments in group "${group.name}"`;
        const text = `Hi there,\n\nThis is an automatic reminder from Split Smart.\n\nYou may have pending payments in the group "${
          group.name
        }" with ${
          owner.name || "one of the members"
        }. Please open Split Smart to review your balances and settle up.\n\nThanks!`;

        await Promise.all(
          memberUsers.map((u) => {
            const html = buildSplitSmartEmail({
              title: `Pending balances in ${group.name}`,
              subtitle: "Scheduled group reminder",
              greeting: `Hi ${u.name || "there"},`,
              intro:
                "You may have outstanding balances in this Split Smart group.",
              highlightLabel: "Group",
              highlightValue: group.name,
              bodyLines: [
                `Some balances may be due with ${owner.name || "other members"}.`,
                "Open Split Smart to review what you owe or are owed.",
              ],
              ctaLabel: "Review group balances",
              ctaUrl: process.env.APP_BASE_URL
                ? `${process.env.APP_BASE_URL}/groups/${group._id}`
                : undefined,
            });

            return transporter.sendMail({
              from: fromEmail,
              to: u.email,
              subject,
              text,
              html,
            });
          })
        );

        pref.lastSentAt = Date.now();
        await pref.save();
        sentCount += memberUsers.length;
      }
    }

    res.json({ success: true, sent: sentCount });
  } catch (err) {
    console.error("Error running scheduled reminders", err);
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

module.exports = { router };
