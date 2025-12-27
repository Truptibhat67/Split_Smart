const mongoose = require("mongoose");

const hiddenContactSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    contactUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

hiddenContactSchema.index({ ownerUserId: 1, contactUserId: 1 }, { unique: true });

module.exports = mongoose.model("HiddenContact", hiddenContactSchema);
