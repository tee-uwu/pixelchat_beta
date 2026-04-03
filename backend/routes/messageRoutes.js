const express = require("express");
const db = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

// Get conversation between logged-in user and another user
router.get("/:receiverId", verifyToken, (req, res) => {
  const senderId = req.user.id;
  const receiverId = req.params.receiverId;

  const sql = `
    SELECT 
      messages.*,
      u1.username AS sender_name,
      u2.username AS receiver_name
    FROM messages
    JOIN users u1 ON messages.sender_id = u1.id
    JOIN users u2 ON messages.receiver_id = u2.id
    WHERE (sender_id = ? AND receiver_id = ?)
       OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `;

  db.query(sql, [senderId, receiverId, receiverId, senderId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Failed to fetch messages" });
    }
    res.json(results);
  });
});

// Create message
router.post("/", verifyToken, (req, res) => {
  const senderId = req.user.id;
  const { receiver_id, message } = req.body;

  if (!receiver_id || !message) {
    return res.status(400).json({ message: "receiver_id and message are required" });
  }

  const sql = "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)";
  db.query(sql, [senderId, receiver_id, message], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Failed to send message" });
    }

    const getSql = `
      SELECT messages.*, u1.username AS sender_name, u2.username AS receiver_name
      FROM messages
      JOIN users u1 ON messages.sender_id = u1.id
      JOIN users u2 ON messages.receiver_id = u2.id
      WHERE messages.id = ?
    `;

    db.query(getSql, [result.insertId], (err2, results) => {
      if (err2) {
        return res.status(500).json({ message: "Message created but fetch failed" });
      }
      res.status(201).json(results[0]);
    });
  });
});

// Update own message
router.put("/:id", verifyToken, (req, res) => {
  const messageId = req.params.id;
  const userId = req.user.id;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ message: "Updated message required" });
  }

  const checkSql = "SELECT * FROM messages WHERE id = ?";
  db.query(checkSql, [messageId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: "Message not found" });
    }

    const foundMessage = results[0];

    if (foundMessage.sender_id !== userId) {
      return res.status(403).json({ message: "You can only edit your own message" });
    }

    const updateSql = "UPDATE messages SET message = ? WHERE id = ?";
    db.query(updateSql, [message, messageId], (err2) => {
      if (err2) {
        return res.status(500).json({ message: "Failed to update message" });
      }

      const getSql = "SELECT * FROM messages WHERE id = ?";
      db.query(getSql, [messageId], (err3, updated) => {
        if (err3) {
          return res.status(500).json({ message: "Updated but fetch failed" });
        }
        res.json(updated[0]);
      });
    });
  });
});

// Delete message
router.delete("/:id", verifyToken, (req, res) => {
  const messageId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  const checkSql = "SELECT * FROM messages WHERE id = ?";
  db.query(checkSql, [messageId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: "Message not found" });
    }

    const foundMessage = results[0];

    if (foundMessage.sender_id !== userId && role !== "admin") {
      return res.status(403).json({ message: "Not allowed to delete this message" });
    }

    const deleteSql = "DELETE FROM messages WHERE id = ?";
    db.query(deleteSql, [messageId], (err2) => {
      if (err2) {
        return res.status(500).json({ message: "Failed to delete message" });
      }
      res.json({ message: "Message deleted", id: Number(messageId) });
    });
  });
});

module.exports = router;