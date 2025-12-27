const express = require("express");
const { getOrCreateCurrentUser } = require("./users");
const nodemailer = require("nodemailer");
const { buildSplitSmartEmail } = require("../email-templates/splitSmartTemplate");
const User = require("../models/User");
const Expense = require("../models/Expense");
const Settlement = require("../models/Settlement");
const Group = require("../models/Group");

const router = express.Router();

// Helper: compute net balance between two users (personal, non-group)
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

  // Apply settlements to the net balance.
  // Recall: net > 0 means B owes A; net < 0 means A owes B.
  // - If A pays B (A -> B), B now owes A *more* ⇒ net should INCREASE.
  // - If B pays A (B -> A), B reduces what they owe ⇒ net should DECREASE.
  for (const s of settlements) {
    const paidByA = String(s.paidByUserId) === String(userAId);
    const paidByB = String(s.paidByUserId) === String(userBId);
    const receivedByA = String(s.receivedByUserId) === String(userAId);
    const receivedByB = String(s.receivedByUserId) === String(userBId);

    if (paidByA && receivedByB) {
      // A paid B ⇒ B owes A more ⇒ increase net
      net += s.amount;
    } else if (paidByB && receivedByA) {
      // B paid A ⇒ B owes A less ⇒ decrease net
      net -= s.amount;
    }
  }

  // Snap very small residual balances to zero to avoid tiny rounding leftovers
  // (e.g. showing 0.03 after settling due to floating-point/rounding).
  const tolerance = 0.05; // amounts smaller than 5 paise are treated as settled
  if (Math.abs(net) < tolerance) {
    net = 0;
  }

  return net;
}

// GET /api/settlements/between-user?otherUserId=...
router.get("/between-user", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const otherUserId = req.query.otherUserId;

    if (!otherUserId) {
      return res.status(400).json({ error: "otherUserId query param is required" });
    }

    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Personal (non-group) expenses involving both users
    const expenses = await Expense.find({
      $or: [
        { paidByUserId: currentUser._id },
        { paidByUserId: otherUserId },
        { "splits.userId": { $in: [currentUser._id, otherUserId] } },
      ],
      $or: [{ groupId: { $exists: false } }, { groupId: null }],
    });

    // Filter to only those where both are involved
    const filteredExpenses = expenses.filter((e) => {
      const involvesCurrent =
        String(e.paidByUserId) === String(currentUser._id) ||
        (e.splits || []).some((s) => String(s.userId) === String(currentUser._id));
      const involvesOther =
        String(e.paidByUserId) === String(otherUserId) ||
        (e.splits || []).some((s) => String(s.userId) === String(otherUserId));
      return involvesCurrent && involvesOther;
    });

    // Personal settlements between the two users
    const settlements = await Settlement.find({
      $or: [
        { paidByUserId: currentUser._id, receivedByUserId: otherUserId },
        { paidByUserId: otherUserId, receivedByUserId: currentUser._id },
      ],
      $or: [{ groupId: { $exists: false } }, { groupId: null }],
    });

    const balance = await computeUserNetBalance(currentUser._id, otherUserId);

    res.json({
      otherUser: {
        id: otherUser._id,
        name: otherUser.name,
        email: otherUser.email,
        imageUrl: otherUser.imageUrl,
      },
      expenses: filteredExpenses,
      settlements,
      balance,
    });
  } catch (err) {
    console.error("Error fetching user-to-user settlements", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

// POST /api/settlements/remind-user - send a reminder email to a specific user about what they owe you personally (non-group)
router.post("/remind-user", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { otherUserId, amount } = req.body || {};

    const numericAmount = Number(amount);
    if (!otherUserId || !numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: "otherUserId and positive amount are required" });
    }

    const otherUser = await User.findById(otherUserId);
    if (!otherUser || !otherUser.email) {
      return res
        .status(400)
        .json({ error: "Target user not found or has no email" });
    }

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
        "SMTP_USER / SMTP_PASS / EMAIL_FROM not set; skipping personal reminder email"
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

    const subject = `Reminder: You owe ${numericAmount.toFixed(2)} in Split Smart`;
    const text = `Hi ${
      otherUser.name || "there"
    },\n\nThis is a friendly reminder from Split Smart.\n\nYou currently owe ${numericAmount.toFixed(
      2
    )} to ${
      currentUser.name || "a contact"
    }.\n\nPlease settle this amount at your earliest convenience.\n\nThanks!`;

    const html = buildSplitSmartEmail({
      title: `You owe ${numericAmount.toFixed(2)} to ${
        currentUser.name || "a contact"
      }`,
      subtitle: "Personal reminder",
      greeting: `Hi ${otherUser.name || "there"},`,
      intro:
        "This is a friendly reminder from Split Smart about what you currently owe.",
      highlightLabel: "Amount due",
      highlightValue: numericAmount.toFixed(2),
      bodyLines: [
        `You currently owe this amount to ${currentUser.name || "a contact"}.`,
        "Open Split Smart to review the details and settle up.",
      ],
    });

    await transporter.sendMail({
      from: fromEmail,
      to: otherUser.email,
      subject,
      text,
      html,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error sending personal reminder email", err);
    res
      .status(err.status || 500)
      .json({ error: err.message || "Failed to send reminder" });
  }
});

// GET /api/settlements/data?entityType=user|group&entityId=...
router.get("/data", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const entityType = req.query.entityType;
    const entityId = req.query.entityId;

    if (!entityType || !entityId) {
      return res
        .status(400)
        .json({ error: "entityType and entityId query params are required" });
    }

    if (entityType === "user") {
      const counterpart = await User.findById(entityId);
      if (!counterpart) {
        return res.status(404).json({ error: "User not found" });
      }

      const netBalance = await computeUserNetBalance(currentUser._id, entityId);

      return res.json({
        type: "user",
        currentUser: {
          id: currentUser._id,
          name: currentUser.name,
          email: currentUser.email,
          imageUrl: currentUser.imageUrl,
        },
        counterpart: {
          userId: counterpart._id,
          name: counterpart.name,
          email: counterpart.email,
          imageUrl: counterpart.imageUrl,
        },
        netBalance,
      });
    }

    // Group settlement data: return group info and member list
    if (entityType === "group") {
      const group = await Group.findById(entityId).populate("members.userId");
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      const members = group.members.map((m) => ({
        userId: m.userId?._id || m.userId,
        name: m.userId?.name,
        email: m.userId?.email,
        imageUrl: m.userId?.imageUrl,
        role: m.role,
      }));

      return res.json({
        type: "group",
        group: {
          id: group._id,
          name: group.name,
          description: group.description,
        },
        members,
      });
    }

    return res.status(400).json({ error: "Invalid entityType" });
  } catch (err) {
    console.error("Error fetching settlement data", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

// POST /api/settlements - create a new settlement
router.post("/", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { amount, note = "", paidByUserId, receivedByUserId, groupId } =
      req.body || {};

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    if (!paidByUserId || !receivedByUserId) {
      return res
        .status(400)
        .json({ error: "paidByUserId and receivedByUserId are required" });
    }

    // Ensure current user is part of the settlement
    if (
      String(paidByUserId) !== String(currentUser._id) &&
      String(receivedByUserId) !== String(currentUser._id)
    ) {
      return res
        .status(403)
        .json({ error: "You must be part of the settlement" });
    }

    const settlement = await Settlement.create({
      amount: numericAmount,
      note: note.trim(),
      date: Date.now(),
      paidByUserId,
      receivedByUserId,
      groupId: groupId || undefined,
      createdBy: currentUser._id,
    });

    res.status(201).json({ id: settlement._id });
  } catch (err) {
    console.error("Error creating settlement", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

module.exports = { router };
