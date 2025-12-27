const mongoose = require("mongoose");

const contactMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    createdAt: { type: Number, required: true },
  },
  { _id: false }
);

const contactConversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [
        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      ],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length === 2;
        },
        message: "Contact conversation must have exactly 2 participants",
      },
    },
    messages: [contactMessageSchema],
  },
  { timestamps: true }
);

contactConversationSchema.index({ participants: 1 });

module.exports = mongoose.model("ContactConversation", contactConversationSchema);
