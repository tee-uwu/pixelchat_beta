const express = require("express");
const router = express.Router();
const db = require("../db");

// CREATE GROUP
router.post("/", (req, res) => {
  const { name, user_id } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Group name required" });
  }

  const sql = "INSERT INTO groups (name, created_by) VALUES (?, ?)";

  db.query(sql, [name, user_id], (err, result) => {
    if (err) return res.status(500).json({ message: "Error creating group" });

    const groupId = result.insertId;

    // add creator to group
    db.query(
      "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)",
      [groupId, user_id]
    );

    res.json({
      id: groupId,
      name
    });
  });
});

// GET GROUPS
router.get("/", (req, res) => {
  const sql = "SELECT * FROM groups";

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Error" });
    res.json(results);
  });
});

module.exports = router;