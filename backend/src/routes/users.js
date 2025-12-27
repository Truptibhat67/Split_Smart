const express = require("express");
const User = require("../models/User");

const router = express.Router();

// Helper to get or create the current user from auth header (simplified)
async function getOrCreateCurrentUser(req) {
  // For now we look for x-user-email and x-user-name headers.
                                                                                                                          
  const email = req.header("x-user-email");
  const name = req.header("x-user-name") || "Anonymous";
  const imageUrl = req.header("x-user-image") || undefined;
  const tokenIdentifier = email; // simple mapping

  if (!email) {
    const err = new Error("Not authenticated: x-user-email header missing");
    err.status = 401;
    throw err;
  }

  let user = await User.findOne({ tokenIdentifier });
  if (!user) {
    user = await User.create({ name, email, imageUrl, tokenIdentifier });
  } else if (user.name !== name) {
    user.name = name;
    await user.save();
  }

  return user;
}

router.get("/me", async (req, res) => {
  try {
    const user = await getOrCreateCurrentUser(req);
    res.json(user);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// Simple search users by name/email (for participant search)
router.get("/search", async (req, res) => {
  try {
    const user = await getOrCreateCurrentUser(req);
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.json([]);

    const regex = new RegExp(q, "i");
    const users = await User.find({
      _id: { $ne: user._id },
      $or: [{ name: regex }, { email: regex }],
    }).select("name email imageUrl");

    res.json(
      users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        imageUrl: u.imageUrl,
      }))
    );
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  }
});

// POST /api/users/ensure - create or fetch a user by email (for invitations/manual add)
router.post("/ensure", async (req, res) => {
  try {
    let { email, name, imageUrl } = req.body || {};

    // Fallback: also allow email/name via query string, in case JSON body parsing fails
    if ((!email || typeof email !== "string") && typeof req.query.email === "string") {
      email = req.query.email;
      if (!name && typeof req.query.name === "string") {
        name = req.query.name;
      }
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const displayName = (name || "Anonymous").trim();

    let user = await User.findOne({ email: trimmedEmail });
    if (!user) {
      user = await User.create({
        email: trimmedEmail,
        name: displayName,
        imageUrl,
        tokenIdentifier: trimmedEmail,
      });
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      imageUrl: user.imageUrl,
    });
  } catch (err) {
    console.error("Error ensuring user", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

module.exports = { router, getOrCreateCurrentUser };
