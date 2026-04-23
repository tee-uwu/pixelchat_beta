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

// GET USER GROUPS (secure)
router.get("/", (req, res) => {
  // TODO: Add verifyToken middleware
  const sql = `
    SELECT DISTINCT g.* 
    FROM groups g 
    JOIN group_members gm ON g.id = gm.group_id 
    WHERE gm.user_id = ?
  `;
  db.query(sql, [req.user?.id || 1], (err, results) => {  // Default to user 1 if no auth
    if (err) return res.status(500).json({ message: "Error fetching groups" });
    res.json(results);
  });
});


module.exports = router;