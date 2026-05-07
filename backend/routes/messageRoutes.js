const express = require("express");
const db = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF allowed'));
    }
  }
});

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

// Create message or attachment
router.post("/", verifyToken, (req, res) => {
  const senderId = req.user.id;
  const { receiver_id, message, attachment_url, attachment_type } = req.body;

  if (!receiver_id || (!message && !attachment_url)) {
    return res.status(400).json({ message: "receiver_id and (message OR attachment) required" });
  }

  const sql = `INSERT INTO messages (sender_id, receiver_id, message, attachment_url, attachment_type) 
               VALUES (?, ?, ?, ?, ?)`;
  db.query(sql, [senderId, receiver_id, message || null, attachment_url || null, attachment_type || null], (err, result) => {
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

// Update own message - emit socket event
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

      const getSql = "SELECT messages.*, u1.username AS sender_name, u2.username AS receiver_name FROM messages JOIN users u1 ON messages.sender_id = u1.id JOIN users u2 ON messages.receiver_id = u2.id WHERE messages.id = ?";
      db.query(getSql, [messageId], (err3, updated) => {
        if (err3) {
          return res.status(500).json({ message: "Updated but fetch failed" });
        }
        
        // Emit socket event for real-time update
        req.app.get('io').to(`chat_${Math.min(foundMessage.sender_id, foundMessage.receiver_id)}_${Math.max(foundMessage.sender_id, foundMessage.receiver_id)}`).emit('message_edited', {
          id: messageId,
          message: message
        });
        
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

// POST /api/messages/upload - File attachment (consolidated)
router.post("/upload", verifyToken, upload.single('file'), (req, res) => {
  const senderId = req.user.id;
  const { receiver_id, message } = req.body;
  
  if (!receiver_id) {
    return res.status(400).json({ error: 'receiver_id required' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Determine type
 // NEW FIXED PORTION
const mimetype = req.file.mimetype;
// Logic: If it starts with image/, it is an 'image'. Otherwise, it is a 'file'.
const attachment_type = mimetype.startsWith('image/') ? 'image' : 'file';
const attachment_url = `/uploads/${req.file.filename}`;
const filename = req.file.originalname;

// Ensure messageText is not empty. For files/images, use the original filename if no caption is provided.
let messageText = message && message.trim() !== "" ? message : filename;

  const sql = `INSERT INTO messages (sender_id, receiver_id, message, attachment_url, attachment_type, seen)
             VALUES (?, ?, ?, ?, ?, FALSE)`;
 db.query(sql, [senderId, receiver_id, messageText, attachment_url, attachment_type], (err, result) => {
    if (err) {
      console.error('DB insert error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    // Return message data for frontend
    const getSql = `
      SELECT messages.*, u1.username AS sender_name, u2.username AS receiver_name
      FROM messages
      JOIN users u1 ON messages.sender_id = u1.id
      JOIN users u2 ON messages.receiver_id = u2.id
      WHERE messages.id = ?
    `;

    db.query(getSql, [result.insertId], (err2, results) => {
      if (err2) {
        console.error('Fetch error:', err2);
        return res.status(500).json({ error: 'Message saved but fetch failed' });
      }
      res.json(results[0]);
    });
  });
});


module.exports = router;
