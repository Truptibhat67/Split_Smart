const express = require("express");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const { buildSplitSmartEmail } = require("../email-templates/splitSmartTemplate");
const { getOrCreateCurrentUser } = require("./users");

const router = express.Router();

// POST /api/expenses - create a new expense
router.post("/", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const {
      description,
      amount,
      category,
      date,
      paidByUserId,
      splitType,
      splits,
      groupId,
    } = req.body || {};

    if (!description || typeof description !== "string") {
      return res.status(400).json({ error: "Description is required" });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
    if (!date || !Number.isFinite(Number(date))) {
      return res.status(400).json({ error: "Valid date timestamp is required" });
    }
    if (!paidByUserId) {
      return res.status(400).json({ error: "paidByUserId is required" });
    }
    if (!Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({ error: "At least one split is required" });
    }

    // Optional: verify group membership if groupId is provided
    let group = null;
    if (groupId) {
      group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      const isMember = group.members.some(
        (m) => String(m.userId) === String(currentUser._id)
      );
      if (!isMember) {
        return res.status(403).json({ error: "You are not a member of this group" });
      }
    }

    // Validate splits add up to total
    const totalSplitAmount = splits.reduce(
      (sum, s) => sum + Number(s.amount || 0),
      0
    );
    const tolerance = 0.01;
    if (Math.abs(totalSplitAmount - numericAmount) > tolerance) {
      return res.status(400).json({
        error: "Split amounts must add up to the total expense amount",
      });
    }

    const normalizedSplits = splits.map((s) => ({
      userId: s.userId,
      amount: Number(s.amount),
      paid: !!s.paid,
    }));

    const expense = await Expense.create({
      description,
      amount: numericAmount,
      category: category || "Other",
      date: Number(date),
      paidByUserId,
      splitType,
      splits: normalizedSplits,
      groupId: groupId || undefined,
      createdBy: currentUser._id,
    });

    // If this is a group expense, send notification emails to all group members (best-effort).
    if (group && group.members && group.members.length > 0) {
      try {
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const fromEmail = process.env.EMAIL_FROM || smtpUser;
        const host = process.env.SMTP_HOST || "smtp.gmail.com";
        const port = Number(process.env.SMTP_PORT || 587);
        const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

        if (!smtpUser || !smtpPass || !fromEmail) {
          console.warn(
            "SMTP_USER / SMTP_PASS / EMAIL_FROM not set; skipping group expense notification emails"
          );
        } else {
          const transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });

          // Only notify members who are actually involved in this expense
          // (payer or included in splits), and skip the user who created it.
          const involvedUserIds = new Set();

          if (paidByUserId) {
            involvedUserIds.add(String(paidByUserId));
          }

          for (const s of normalizedSplits) {
            if (s.userId) {
              involvedUserIds.add(String(s.userId));
            }
          }

          const memberUsers = group.members
            .map((m) => m.userId)
            .filter((u) => {
              if (!u || !u.email) return false;
              const uid = String(u._id || u.id);
              if (!involvedUserIds.has(uid)) return false;
              if (uid === String(currentUser._id)) return false;
              return true;
            });

          await Promise.all(
            memberUsers.map((u) => {
              const toEmail = u.email;
              const subject = `New expense in group "${group.name}": ${description}`;
              const textLines = [
                `Hi ${u.name || "there"},`,
                "",
                `${currentUser.name || "Someone"} added a new expense in the group "${
                  group.name
                }":`,
                `Description: ${description}`,
                `Amount: $${numericAmount.toFixed(2)}`,
                category ? `Category: ${category}` : null,
                "",
                "You can open Split Smart to see details, comments, and your share.",
                "",
                "Thanks!",
              ].filter(Boolean);

              const html = buildSplitSmartEmail({
                title: `New expense in ${group.name}`,
                subtitle: "Group expense",
                greeting: `Hi ${u.name || "there"},`,
                intro: `${currentUser.name || "Someone"} added a new shared expense in your Split Smart group "${group.name}".`,
                highlightLabel: "Expense",
                highlightValue: `${description} • $${numericAmount.toFixed(2)}`,
                bodyLines: [
                  category ? `Category: ${category}` : "",
                  "Open Split Smart to see the breakdown and your share.",
                ].filter(Boolean),
                ctaLabel: "View expense in group",
                ctaUrl: process.env.APP_BASE_URL
                  ? `${process.env.APP_BASE_URL}/groups/${group._id}`
                  : undefined,
              });

              return transporter.sendMail({
                from: fromEmail,
                to: toEmail,
                subject,
                text: textLines.join("\n"),
                html,
              });
            })
          );
        }
      } catch (emailErr) {
        console.error(
          "Failed to send group expense notification emails via Nodemailer",
          emailErr
        );
      }
    }

    res.status(201).json({ id: expense._id });
  } catch (err) {
    console.error("Error creating expense", err);
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// POST /api/expenses/:id/comments - add a comment to an expense
router.post("/:id/comments", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { id } = req.params;
    const { text } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Comment text is required" });
    }

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Optional permission check: if expense belongs to a group, ensure user is in that group.
    if (expense.groupId) {
      const group = await Group.findById(expense.groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      const isMember = group.members.some(
        (m) => String(m.userId) === String(currentUser._id)
      );
      if (!isMember) {
        return res.status(403).json({ error: "You are not a member of this group" });
      }
    }

    const newComment = {
      userId: currentUser._id,
      text: text.trim(),
      createdAt: Date.now(),
    };

    expense.comments = expense.comments || [];
    expense.comments.push(newComment);
    await expense.save();

    await expense.populate("comments.userId", "name email imageUrl");

    const comments = (expense.comments || []).map((c) => ({
      userId: c.userId?._id || c.userId,
      name: c.userId?.name,
      email: c.userId?.email,
      imageUrl: c.userId?.imageUrl,
      text: c.text,
      createdAt: c.createdAt,
    }));

    res.status(201).json({ comments });
  } catch (err) {
    console.error("Error adding expense comment", err);
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// GET /api/expenses/:id/comments - fetch comments for an expense
router.get("/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id).populate(
      "comments.userId",
      "name email imageUrl"
    );

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const comments = (expense.comments || []).map((c) => ({
      userId: c.userId?._id || c.userId,
      name: c.userId?.name,
      email: c.userId?.email,
      imageUrl: c.userId?.imageUrl,
      text: c.text,
      createdAt: c.createdAt,
    }));

    res.json({ comments });
  } catch (err) {
    console.error("Error fetching expense comments", err);
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

module.exports = { router };
