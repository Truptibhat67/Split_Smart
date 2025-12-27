const mongoose = require("mongoose");

const groupMemberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    joinedAt: { type: Number, required: true },
  },
  { _id: false }
);

const groupCommentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    createdAt: { type: Number, required: true },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [groupMemberSchema],
    comments: [groupCommentSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Group", groupSchema);
