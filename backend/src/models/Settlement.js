const mongoose = require("mongoose");

const settlementSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    note: { type: String },
    date: { type: Number, required: true },
    paidByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receivedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
    relatedExpenseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Expense" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settlement", settlementSchema);
