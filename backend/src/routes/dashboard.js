const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const Settlement = require("../models/Settlement");

// Helper function to get current user from headers
const getCurrentUser = async (headers) => {
  const email = headers["x-user-email"];
  const name = headers["x-user-name"];
  const imageUrl = headers["x-user-image"];
  
  if (!email) {
    throw new Error("User email not provided");
  }

  // Find or create user
  let user = await User.findOne({ email });
  if (!user) {
    user = new User({
      name: name || "Anonymous",
      email,
      imageUrl,
      tokenIdentifier: email, // Using email as token identifier for now
    });
    await user.save();
  } else if (name && user.name !== name) {
    // Update name if changed
    user.name = name;
    await user.save();
  }

  return user;
};

// Get user balances – mirror Convex getUserBalances shape
router.get("/balances", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.headers);

    // 1: all expenses (personal and group) involving the user
    const expenses = await Expense.find({
      $or: [
        { paidByUserId: currentUser._id },
        { "splits.userId": currentUser._id },
      ],
    });

    let youOwe = 0;
    let youAreOwed = 0;
    const balanceByUser = {}; // { userId: { owed, owing } }

    for (const e of expenses) {
      const isPayer = String(e.paidByUserId) === String(currentUser._id);
      const mySplit = (e.splits || []).find(
        (s) => String(s.userId) === String(currentUser._id)
      );

      if (isPayer) {
        for (const s of e.splits || []) {
          if (String(s.userId) === String(currentUser._id) || s.paid) continue;
          youAreOwed += s.amount;
          const uid = String(s.userId);
          if (!balanceByUser[uid]) balanceByUser[uid] = { owed: 0, owing: 0 };
          balanceByUser[uid].owed += s.amount;
        }
      } else if (mySplit && !mySplit.paid) {
        youOwe += mySplit.amount;
        const uid = String(e.paidByUserId);
        if (!balanceByUser[uid]) balanceByUser[uid] = { owed: 0, owing: 0 };
        balanceByUser[uid].owing += mySplit.amount;
      }
    }

    // 2: all settlements (personal and group) involving the user
    const settlements = await Settlement.find({
      $or: [
        { paidByUserId: currentUser._id },
        { receivedByUserId: currentUser._id },
      ],
    });

    for (const s of settlements) {
      if (String(s.paidByUserId) === String(currentUser._id)) {
        // you paid someone back
        youOwe -= s.amount;
        const uid = String(s.receivedByUserId);
        if (!balanceByUser[uid]) balanceByUser[uid] = { owed: 0, owing: 0 };
        balanceByUser[uid].owing -= s.amount;
      } else {
        // they paid you back
        youAreOwed -= s.amount;
        const uid = String(s.paidByUserId);
        if (!balanceByUser[uid]) balanceByUser[uid] = { owed: 0, owing: 0 };
        balanceByUser[uid].owed -= s.amount;
      }
    }

    // 3: build lists for UI
    const youOweList = [];
    const youAreOwedByList = [];

    const userIds = Object.keys(balanceByUser);
    const users = await User.find({ _id: { $in: userIds } });
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    for (const [uid, { owed, owing }] of Object.entries(balanceByUser)) {
      const net = owed - owing; // positive => they owe you
      if (Math.abs(net) < 0.01) continue;
      const counterpart = userMap.get(uid);
      const base = {
        userId: uid,
        name: counterpart?.name || "Unknown",
        imageUrl: counterpart?.imageUrl,
        amount: Math.abs(net),
      };
      if (net > 0) {
        youAreOwedByList.push(base);
      } else {
        youOweList.push(base);
      }
    }

    youOweList.sort((a, b) => b.amount - a.amount);
    youAreOwedByList.sort((a, b) => b.amount - a.amount);

    // Recompute aggregate amounts from the final per-user nets so that
    // the header cards and the per-person lists always stay in sync.
    const aggregatedYouAreOwed = youAreOwedByList.reduce(
      (sum, item) => sum + (item.amount || 0),
      0
    );
    const aggregatedYouOwe = youOweList.reduce(
      (sum, item) => sum + (item.amount || 0),
      0
    );

    const result = {
      youOwe: aggregatedYouOwe,
      youAreOwed: aggregatedYouAreOwed,
      totalBalance: aggregatedYouAreOwed - aggregatedYouOwe,
      oweDetails: {
        youOwe: youOweList,
        youAreOwedBy: youAreOwedByList,
      },
    };

    res.json(result);
  } catch (error) {
    console.error("Error fetching balances:", error);
    res.status(500).json({ error: "Failed to fetch balances" });
  }
});

// Get user groups
router.get("/groups", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.headers);
    
    const groups = await Group.find({
      "members.userId": currentUser._id
    }).populate("members.userId");

    const groupData = groups.map(group => ({
      id: group._id,
      name: group.name,
      description: group.description,
      memberCount: group.members.length,
      createdAt: group.createdAt,
      members: group.members.map(member => ({
        userId: member.userId,
        role: member.role,
        name: member.userId.name,
        email: member.userId.email
      }))
    }));

    res.json(groupData);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// Get total spent
router.get("/total-spent", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.headers);
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1); // January 1st of current year
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59); // December 31st of current year

    // Consider only the current user's share (their splits) across expenses from current year
    const expenses = await Expense.find({
      "splits.userId": currentUser._id,
      date: {
        $gte: startOfYear,
        $lte: endOfYear
      }
    });

    let totalSpent = 0;

    expenses.forEach((expense) => {
      const mySplit = (expense.splits || []).find(
        (s) => String(s.userId) === String(currentUser._id)
      );

      if (!mySplit || typeof mySplit.amount !== "number") return;

      totalSpent += mySplit.amount;
    });

    res.json({ totalSpent });
  } catch (error) {
    console.error("Error fetching total spent:", error);
    res.status(500).json({ error: "Failed to fetch total spent" });
  }
});

// Get monthly spending
router.get("/monthly-spending", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.headers);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // For current month's expenses
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    
    // For monthly aggregation (last 12 months)
    const startOfYear = new Date(currentYear - 1, currentMonth + 1, 1); // 12 months back from current month
    const endOfYear = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59); // End of current month

    // Get all expenses for the last 12 months
    const expenses = await Expense.find({
      "splits.userId": currentUser._id,
      $or: [
        { 
          $and: [
            { date: { $gte: startOfYear, $lte: endOfYear } },
            { date: { $exists: true } }
          ]
        },
        { 
          $and: [
            { date: { $exists: false } },
            { createdAt: { $gte: startOfYear, $lte: endOfYear } }
          ]
        }
      ]
    });

    // Group by month (timestamp for month start)
    const monthlyTotals = {};

    expenses.forEach((expense) => {
      const ts =
        typeof expense.date === "number"
          ? expense.date
          : expense.createdAt instanceof Date
            ? expense.createdAt.getTime()
            : null;
      if (!ts) return;

      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return;

      const mySplit = (expense.splits || []).find(
        (s) => String(s.userId) === String(currentUser._id)
      );
      if (!mySplit || typeof mySplit.amount !== "number") return;

      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      monthlyTotals[monthStart] =
        (monthlyTotals[monthStart] || 0) + mySplit.amount;
    });

    // Convert the monthly totals to an array and sort by month
    let spendingArray = Object.entries(monthlyTotals)
      .map(([month, amount]) => ({
        month: Number(month),
        amount: parseFloat(amount.toFixed(2)) // Ensure consistent decimal places
      }))
      .sort((a, b) => a.month - b.month);

    // Only return the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    spendingArray = spendingArray.filter(
      item => new Date(item.month) >= twelveMonthsAgo
    );

    res.json(spendingArray);
  } catch (error) {
    console.error("Error fetching monthly spending:", error);
    res.status(500).json({ error: "Failed to fetch monthly spending" });
  }
});

// Get category-wise spending
router.get("/category-spending", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.headers);

    const expenses = await Expense.find({
      "splits.userId": currentUser._id,
    });

    const categoryTotals = {};

    expenses.forEach((expense) => {
      const category = expense.category || "Other";
      const mySplit = (expense.splits || []).find(
        (s) => String(s.userId) === String(currentUser._id)
      );

      if (!mySplit || typeof mySplit.amount !== "number") return;

      // Use only the current user's share for this category
      categoryTotals[category] =
        (categoryTotals[category] || 0) + mySplit.amount;
    });

    const categoryArray = Object.entries(categoryTotals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    res.json(categoryArray);
  } catch (error) {
    console.error("Error fetching category spending:", error);
    res.status(500).json({ error: "Failed to fetch category spending" });
  }
});

module.exports = router;
