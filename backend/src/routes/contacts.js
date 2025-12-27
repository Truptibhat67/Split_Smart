const express = require("express");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const ContactConversation = require("../models/ContactConversation");
const User = require("../models/User");
const HiddenContact = require("../models/HiddenContact");
const nodemailer = require("nodemailer");
const { buildSplitSmartEmail } = require("../email-templates/splitSmartTemplate");
const { getOrCreateCurrentUser } = require("./users");

const router = express.Router();

// GET /api/contacts
router.get("/", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);

    // personal expenses where YOU are the payer (no group)
    const expensesYouPaid = await Expense.find({
      paidByUserId: currentUser._id,
      groupId: { $exists: false },
    });

    // personal expenses where YOU are not the payer (no group)
    const expensesNotPaidByYou = await Expense.find({
      groupId: { $exists: false },
      paidByUserId: { $ne: currentUser._id },
      "splits.userId": currentUser._id,
    });

    const personalExpenses = [...expensesYouPaid, ...expensesNotPaidByYou];

    const contactIds = new Set();
    personalExpenses.forEach((exp) => {
      if (String(exp.paidByUserId) !== String(currentUser._id)) {
        contactIds.add(String(exp.paidByUserId));
      }
      exp.splits.forEach((s) => {
        if (String(s.userId) !== String(currentUser._id)) {
          contactIds.add(String(s.userId));
        }
      });
    });

    const users = await Promise.all(
      [...contactIds].map(async (id) => {
        const u = await currentUser.model("User").findById(id);
        if (!u) return null;
        return {
          id: u._id,
          name: u.name,
          email: u.email,
          imageUrl: u.imageUrl,
        };
      })
    );

    const allGroups = await Group.find({
      "members.userId": currentUser._id,
    });

    const groups = allGroups.map((g) => ({
      id: g._id,
      name: g.name,
      description: g.description,
      memberCount: g.members.length,
    }));

    // Filter out contacts that the current user has chosen to hide
    const hidden = await HiddenContact.find({ ownerUserId: currentUser._id });
    const hiddenSet = new Set(hidden.map((h) => String(h.contactUserId)));

    const visibleUsers = users
      .filter(Boolean)
      .filter((u) => !hiddenSet.has(String(u.id)));

    visibleUsers.sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
    groups.sort((a, b) => a.name.localeCompare(b.name));

    res.json({ users: visibleUsers, groups });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// DELETE /api/contacts/:contactId
// Soft-delete: hide this contact from the current user's Contacts list
router.delete("/:contactId", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { contactId } = req.params;

    if (!contactId) {
      return res.status(400).json({ error: "contactId is required" });
    }

    await HiddenContact.findOneAndUpdate(
      { ownerUserId: currentUser._id, contactUserId: contactId },
      { ownerUserId: currentUser._id, contactUserId: contactId },
      { upsert: true, new: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Error hiding contact", err);
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// GET /api/contacts/chat?otherUserId=...
// Fetch or create (empty) one-to-one conversation between current user and other user
router.get("/chat", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { otherUserId } = req.query || {};

    if (!otherUserId) {
      return res.status(400).json({ error: "otherUserId is required" });
    }

    const participants = [String(currentUser._id), String(otherUserId)].sort();

    let convo = await ContactConversation.findOne({
      participants,
    }).populate("messages.userId", "name email imageUrl");

    if (!convo) {
      convo = await ContactConversation.create({
        participants,
        messages: [],
      });
    }

    const messages = (convo.messages || []).map((m) => ({
      userId: m.userId?._id || m.userId,
      name: m.userId?.name,
      email: m.userId?.email,
      imageUrl: m.userId?.imageUrl,
      text: m.text,
      createdAt: m.createdAt,
    }));

    res.json({ messages });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// POST /api/contacts/chat - add a message to the one-to-one conversation
router.post("/chat", async (req, res) => {
  try {
    const currentUser = await getOrCreateCurrentUser(req);
    const { otherUserId, text } = req.body || {};

    if (!otherUserId) {
      return res.status(400).json({ error: "otherUserId is required" });
    }
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Message text is required" });
    }

    const participants = [String(currentUser._id), String(otherUserId)].sort();

    let convo = await ContactConversation.findOne({ participants });
    if (!convo) {
      convo = await ContactConversation.create({
        participants,
        messages: [],
      });
    }

    const message = {
      userId: currentUser._id,
      text: text.trim(),
      createdAt: Date.now(),
    };

    convo.messages = convo.messages || [];
    convo.messages.push(message);
    await convo.save();

    await convo.populate("messages.userId", "name email imageUrl");

    const messages = (convo.messages || []).map((m) => ({
      userId: m.userId?._id || m.userId,
      name: m.userId?.name,
      email: m.userId?.email,
      imageUrl: m.userId?.imageUrl,
      text: m.text,
      createdAt: m.createdAt,
    }));

    // Send an email notification to the other participant (not the sender)
    try {
      const otherUser = await User.findById(otherUserId);
      if (otherUser && otherUser.email) {
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
            "SMTP_USER / SMTP_PASS / EMAIL_FROM not set; skipping contact chat notification email"
          );
        } else if (String(otherUser._id) !== String(currentUser._id)) {
          const transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });

          const subject = `New message from ${
            currentUser.name || "a contact"
          } in Split Smart`;
          const textLines = [
            `Hi ${otherUser.name || "there"},`,
            "",
            `${currentUser.name || "Someone"} just sent you a message:`,
            `"${text.trim()}"`,
            "",
            "Open Split Smart to reply or review your shared expenses.",
            "",
            "Thanks!",
          ];

          const html = buildSplitSmartEmail({
            title: `New message from ${currentUser.name || "a contact"}`,
            subtitle: "Chat update",
            greeting: `Hi ${otherUser.name || "there"},`,
            intro: `${currentUser.name || "Someone"} just sent you a new message in Split Smart.`,
            bodyLines: [
              `"${text.trim()}"`,
              "Open Split Smart to reply or review your shared expenses.",
            ],
          });

          await transporter.sendMail({
            from: fromEmail,
            to: otherUser.email,
            subject,
            text: textLines.join("\n"),
            html,
          });
        }
      }
    } catch (emailErr) {
      console.error(
        "Failed to send contact chat notification email via Nodemailer",
        emailErr
      );
    }

    res.status(201).json({ messages });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

module.exports = { router };
