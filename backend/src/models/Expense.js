const mongoose = require("mongoose");

const expenseCommentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    createdAt: { type: Number, required: true },
  },
  { _id: false }
);

const expenseSplitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    paid: { type: Boolean, default: false },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String },
    date: { type: Number, required: true },
    paidByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    splitType: { type: String, enum: ["equal", "percentage", "exact"], required: true },
    splits: [expenseSplitSchema],
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    comments: [expenseCommentSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
