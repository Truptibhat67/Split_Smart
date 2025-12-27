const express = require("express");
const Group = require("../models/Group");
const { getOrCreateCurrentUser } = require("./users");
const User = require("../models/User");
const Expense = require("../models/Expense");
const Settlement = require("../models/Settlement");
const nodemailer = require("nodemailer");
const { buildSplitSmartEmail } = require("../email-templates/splitSmartTemplate");

const router = express.Router();

// POST /api/groups - create a new group
router.post("/", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    let { name, description = "", members = [] } = req.body || {};

    // Fallback: also allow name via query string if body parsing fails
    if ((!name || typeof name !== "string") && typeof req.query.name === "string") {
      name = req.query.name;
    }

    // Debug logging to inspect incoming payload
    console.log("[GROUPS] Create group request", {
      currentUserId: currentUser?._id,
      rawName: name,
      rawDescription: description,
      rawMembers: members,
    });

    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Group name is required" });
    }

    // Ensure creator is included
    const uniqueMemberIds = new Set(
      members.map((id) => String(id))
    );
    uniqueMemberIds.add(String(currentUser._id));

    // Validate all users exist
    const memberObjectIds = Array.from(uniqueMemberIds);
    const users = await User.find({ _id: { $in: memberObjectIds } });
    if (users.length !== memberObjectIds.length) {
      return res.status(400).json({ error: "One or more users not found" });
    }

    const membersDocs = memberObjectIds.map((id) => ({
      userId: id,
      role: String(id) === String(currentUser._id) ? "admin" : "member",
      joinedAt: Date.now(),
    }));

    const group = await Group.create({
      name: trimmedName,
      description: (description || "").trim(),
      createdBy: currentUser._id,
      members: membersDocs,
    });
    
    // Send notification emails to all non-creator members (best-effort)
    try {
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const fromEmail = process.env.EMAIL_FROM || smtpUser;
      const host = process.env.SMTP_HOST || "smtp.gmail.com";
      const port = Number(process.env.SMTP_PORT || 587);
      const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

      console.log("[GROUP EMAIL CONFIG]", {
        hasSmtpUser: !!smtpUser,
        hasSmtpPass: !!smtpPass,
        hasEmailFrom: !!fromEmail,
        host,
        port,
        secure,
      });

      if (!smtpUser || !smtpPass || !fromEmail) {
        console.warn("SMTP_USER / SMTP_PASS / EMAIL_FROM not set; skipping group invitation emails");
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

        const memberUsers = await User.find({
          _id: {
            $in: memberObjectIds.filter(
              (id) => String(id) !== String(currentUser._id)
            ),
          },
        });

        await Promise.all(
          memberUsers
            .filter((u) => u.email)
            .map((u) => {
              const toEmail = u.email;
              const subject = `You were added to the group "${trimmedName}"`;
              const text = `Hi ${u.name || "there"},\n\nYou have been added to a group called "${trimmedName}" in Split Smart.\n\nYou can sign in with this email to see the group and its expenses.\n\nThanks!`;

              const html = buildSplitSmartEmail({
                title: `You have been invited to ${trimmedName}`,
                subtitle: "Group invitation",
                greeting: `Hi ${u.email || "there"},`,
                intro: `${currentUser.name || "Someone"} added you to their Split Smart group so you can track and settle shared expenses together.`,
                highlightLabel: "Group",
                highlightValue: trimmedName,
                bodyLines: [
                  "Use the link below to open Split Smart and view this group.",
                ],
                ctaLabel: "Open group in Split Smart",
                ctaUrl: process.env.APP_BASE_URL
                  ? `${process.env.APP_BASE_URL}/groups/${group._id}`
                  : undefined,
                footerText:
                  "You're receiving this email because someone added you to a Split Smart group.",
              });

              return transporter.sendMail({
                from: fromEmail,
                to: toEmail,
                subject,
                text,
                html,
              });
            })
        );
      }
    } catch (emailErr) {
      console.error("Failed to send group invitation emails via Nodemailer", emailErr);
      // Do not fail the request just because email failed
    }

    return res.status(201).json({ id: group._id });
  } catch (err) {
    console.error("Error creating group", err);
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// POST /api/groups/:id/comments - add a comment to the group and notify all members
router.post("/:id/comments", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { id } = req.params;
    const { text } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Comment text is required" });
    }

    const group = await Group.findById(id).populate("members.userId");
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isMember = group.members.some(
      (m) => String(m.userId?._id || m.userId) === String(currentUser._id)
    );
    if (!isMember) {
      return res
        .status(403)
        .json({ error: "You must be a member of this group to comment" });
    }

    const newComment = {
      userId: currentUser._id,
      text: text.trim(),
      createdAt: Date.now(),
    };

    group.comments = group.comments || [];
    group.comments.push(newComment);
    await group.save();

    await group.populate("comments.userId", "name email imageUrl");

    const comments = (group.comments || []).map((c) => ({
      userId: c.userId?._id || c.userId,
      name: c.userId?.name,
      email: c.userId?.email,
      imageUrl: c.userId?.imageUrl,
      text: c.text,
      createdAt: c.createdAt,
    }));

    try {
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
          "SMTP_USER / SMTP_PASS / EMAIL_FROM not set; skipping group comment notification emails"
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

        const memberUsers = group.members
          .map((m) => m.userId)
          .filter(
            (u) =>
              u &&
              u.email &&
              String(u._id || u.id) !== String(currentUser._id)
          );

        await Promise.all(
          memberUsers.map((u) => {
            const toEmail = u.email;
            const subject = `New comment in group "${group.name}"`;
            const textLines = [
              `Hi ${u.name || "there"},`,
              "",
              `${currentUser.name || "Someone"} left a new comment in the group "${
                group.name
              }":`,
              `"${text.trim()}"`,
              "",
              "Open Split Smart to reply or view the latest expenses.",
              "",
              "Thanks!",
            ];

            const html = buildSplitSmartEmail({
              title: `New comment in ${group.name}`,
              subtitle: "Group update",
              greeting: `Hi ${u.name || "there"},`,
              intro: `${currentUser.name || "Someone"} just added a comment in your Split Smart group "${group.name}".`,
              highlightLabel: "Comment",
              highlightValue: `"${text.trim()}" — ${currentUser.name || "Someone"}`,
              bodyLines: [
                "Open Split Smart to reply or follow the latest activity.",
              ],
              ctaLabel: "Open group conversation",
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
        "Failed to send group comment notification emails via Nodemailer",
        emailErr
      );
    }

    res.status(201).json({ comments });
  } catch (err) {
    console.error("Error adding group comment", err);
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// GET /api/groups/:id/summary - group details, members, expenses, settlements, comments
router.get("/:id/summary", async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id)
      .populate("members.userId")
      .populate("comments.userId", "name email imageUrl");
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const expenses = await Expense.find({ groupId: id }).sort({ date: -1 });
    const settlements = await Settlement.find({ groupId: id }).sort({ date: -1 });

    // Build user lookup map for UI components
    const userIds = new Set();
    group.members.forEach((m) => {
      if (m.userId) userIds.add(String(m.userId._id || m.userId));
    });
    expenses.forEach((e) => {
      if (e.paidByUserId) userIds.add(String(e.paidByUserId));
      (e.splits || []).forEach((s) => {
        if (s.userId) userIds.add(String(s.userId));
      });
    });
    settlements.forEach((s) => {
      if (s.paidByUserId) userIds.add(String(s.paidByUserId));
      if (s.receivedByUserId) userIds.add(String(s.receivedByUserId));
    });

    const users = await User.find({ _id: { $in: Array.from(userIds) } });
    const userLookupMap = users.reduce((acc, u) => {
      acc[String(u._id)] = {
        name: u.name,
        email: u.email,
        imageUrl: u.imageUrl,
      };
      return acc;
    }, {});

    // Compute per-member group balances (net position within this group)
    // Positive totalBalance => member is owed money by the group
    // Negative totalBalance => member owes money to the group
    const balanceByUser = {}; // { userId: net }

    // 1) Apply all group expenses
    for (const e of expenses) {
      const payerId = e.paidByUserId ? String(e.paidByUserId) : null;
      if (!payerId) continue;

      for (const s of e.splits || []) {
        const splitUserId = s.userId ? String(s.userId) : null;
        if (!splitUserId || s.paid) continue; // already settled in this expense

        // Payer is owed this split amount, split user owes it
        if (!balanceByUser[payerId]) balanceByUser[payerId] = 0;
        if (!balanceByUser[splitUserId]) balanceByUser[splitUserId] = 0;

        balanceByUser[payerId] += s.amount;
        balanceByUser[splitUserId] -= s.amount;
      }
    }

    // 2) Apply group settlements
    for (const s of settlements) {
      const paidById = s.paidByUserId ? String(s.paidByUserId) : null;
      const receivedById = s.receivedByUserId ? String(s.receivedByUserId) : null;
      if (!paidById || !receivedById) continue;

      if (!balanceByUser[paidById]) balanceByUser[paidById] = 0;
      if (!balanceByUser[receivedById]) balanceByUser[receivedById] = 0;

      // When someone pays another member, their net position moves towards zero
      balanceByUser[paidById] -= s.amount;
      balanceByUser[receivedById] += s.amount;
    }

    // 3) Build balances array for all group members so the UI has stable rows
    const balances = group.members.map((m) => {
      const uid = String(m.userId?._id || m.userId);
      const net = balanceByUser[uid] || 0;
      const lookup = userLookupMap[uid] || {};
      return {
        id: uid,
        name: lookup.name || m.userId?.name || "Unknown",
        imageUrl: lookup.imageUrl || m.userId?.imageUrl,
        totalBalance: net,
        owes: [],
        owedBy: [],
      };
    });

    const comments = (group.comments || []).map((c) => ({
      userId: c.userId?._id || c.userId,
      name: c.userId?.name,
      email: c.userId?.email,
      imageUrl: c.userId?.imageUrl,
      text: c.text,
      createdAt: c.createdAt,
    }));

    res.json({
      group: {
        id: group._id,
        name: group.name,
        description: group.description,
      },
      members: group.members.map((m) => ({
        userId: m.userId?._id || m.userId,
        name: m.userId?.name,
        email: m.userId?.email,
        imageUrl: m.userId?.imageUrl,
        role: m.role,
      })),
      expenses,
      settlements,
      balances,
      userLookupMap,
      comments,
    });
  } catch (err) {
    console.error("Error fetching group summary", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

// POST /api/groups/:id/remind - send reminder email to a member who owes money
router.post("/:id/remind", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { id } = req.params;
    const { toUserId, amount } = req.body || {};

    if (!toUserId || typeof amount !== "number" || amount <= 0) {
      return res
        .status(400)
        .json({ error: "toUserId and positive amount are required" });
    }

    const group = await Group.findById(id).populate("members.userId");
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isMember = group.members.some(
      (m) => String(m.userId?._id || m.userId) === String(currentUser._id)
    );
    if (!isMember) {
      return res
        .status(403)
        .json({ error: "You must be a member of this group to send reminders" });
    }

    const targetMember = group.members.find(
      (m) => String(m.userId?._id || m.userId) === String(toUserId)
    );

    if (!targetMember || !targetMember.userId?.email) {
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
        "SMTP_USER / SMTP_PASS / EMAIL_FROM not set; skipping group reminder email"
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

    const toUser = targetMember.userId;
    const subject = `Reminder: You owe ₹${amount.toFixed(2)} in group "${
      group.name
    }"`;
    const text = `Hi ${
      toUser.name || "there"
    },\n\nThis is a friendly reminder from Split Smart.\n\nYou currently owe ₹${amount.toFixed(
      2
    )} to ${
      currentUser.name || "a group member"
    } in the group "${group.name}".\n\nPlease settle this amount at your earliest convenience.\n\nThanks!`;

    const html = buildSplitSmartEmail({
      title: `You owe ₹${amount.toFixed(2)} in ${group.name}`,
      subtitle: "Group reminder",
      greeting: `Hi ${toUser.name || "there"},`,
      intro: `${currentUser.name || "A group member"} has reminded you about a pending balance in the group "${group.name}".`,
      highlightLabel: "You owe",
      highlightValue: `₹${amount.toFixed(2)} to ${currentUser.name || "a group member"}`,
      bodyLines: [
        `This is what you owe ${currentUser.name || "a group member"} in the group "${group.name}".`,
        "Please settle this amount at your earliest convenience.",
      ],
      ctaLabel: "Review group balances",
      ctaUrl: process.env.APP_BASE_URL
        ? `${process.env.APP_BASE_URL}/groups/${group._id}`
        : undefined,
    });

    await transporter.sendMail({
      from: fromEmail,
      to: toUser.email,
      subject,
      text,
      html,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error sending group reminder email", err);
    res
      .status(err.status || 500)
      .json({ error: err.message || "Failed to send reminder" });
  }
});

// DELETE /api/groups/:id - delete a group and its related expenses/settlements
router.delete("/:id", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { id } = req.params;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isAdmin = group.members.some(
      (m) => String(m.userId) === String(currentUser._id) && m.role === "admin"
    );

    if (!isAdmin) {
      return res
        .status(403)
        .json({ error: "Only group admin can delete this group" });
    }

    await Expense.deleteMany({ groupId: id });
    await Settlement.deleteMany({ groupId: id });
    await Group.findByIdAndDelete(id);

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting group", err);
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

module.exports = { router };
