const mongoose = require("mongoose");

const reminderPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scopeType: {
      type: String,
      enum: ["group", "contact"],
      required: true,
    },
    scopeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    frequency: {
      type: String,
      enum: ["weekly", "monthly"],
      required: true,
    },
    lastSentAt: { type: Number },
  },
  { timestamps: true }
);

reminderPreferenceSchema.index({ userId: 1, scopeType: 1, scopeId: 1 }, { unique: true });

module.exports = mongoose.model("ReminderPreference", reminderPreferenceSchema);
