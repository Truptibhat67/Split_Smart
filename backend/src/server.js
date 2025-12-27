const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { router: usersRouter } = require("./routes/users");
const { router: contactsRouter } = require("./routes/contacts");
const { router: groupsRouter } = require("./routes/groups");
const dashboardRouter = require("./routes/dashboard");
const { router: expensesRouter } = require("./routes/expenses");
const { router: settlementsRouter } = require("./routes/settlements");
const { router: remindersRouter } = require("./routes/reminders");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/users", usersRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/settlements", settlementsRouter);
app.use("/api/reminders", remindersRouter);

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/splitsmart";

mongoose
  .connect(MONGODB_URI, { dbName: "SplitSmart" })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error", err);
    process.exit(1);
  });

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Split Smart API is running" });
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
