require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const db = require("./db");

const authRoutes = require("./routes/authRoutes");
const messageRoutes = require("./routes/messageRoutes");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

app.put("/api/messages/seen/:id", (req, res) => {
  const sql = "UPDATE messages SET seen = TRUE WHERE id = ?";
  db.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: "Failed" });
    res.json({ message: "Seen updated" });
  });
});

app.get("/", (req, res) => {
  res.send("Chat server is running");
});

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error"));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (error) {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);

  // Send all online users to newly connected client
  socket.emit("online_users", Array.from(onlineUsers.keys()));

  console.log(`User connected: ${socket.user.username}`);

  io.emit("user_status", {
    userId: socket.user.id,
    status: "online"
  });

  // --- Message Editing Logic ---
  socket.on("edit_message", ({ id, message, new_message }) => {
    const text = message || new_message;

    if (!id || !text) return;

    const sql = "UPDATE messages SET message = ? WHERE id = ?";
    db.query(sql, [text, id], (err) => {
      if (err) {
        console.error("Edit error:", err);
        return;
      }

      io.emit("message_edited", {
        id,
        message: text
      });
    });
  });

  // --- DELETE MESSAGE ---
  socket.on("delete_message", ({ id }) => {
    if (!id) return;

    const sql = "DELETE FROM messages WHERE id = ?";
    db.query(sql, [id], (err) => {
      if (err) {
        console.error("Delete error:", err);
        return;
      }

      io.emit("message_deleted", { id });
    });
  });

  // --- Group Logic ---
  socket.on("join_group", (groupId) => {
    socket.join("group_" + groupId);
    console.log(`User ${socket.user.username} joined group: ${groupId}`);
  });

  socket.on("group_message", ({ group_id, message }) => {
    const sender_id = socket.user.id;

    const sql = "INSERT INTO messages (sender_id, group_id, message) VALUES (?, ?, ?)";
    db.query(sql, [sender_id, group_id, message], (err, result) => {
      if (err) {
        console.error("Group message error:", err);
        return;
      }

      const msg = {
        sender_id,
        group_id,
        message,
        id: result.insertId,
        sender_name: socket.user.username
      };

      io.to("group_" + group_id).emit("group_message", msg);
    });
  });

  // --- Private Messaging Logic ---
  socket.on("message_seen", ({ message_id, sender_id }) => {
    const sql = "UPDATE messages SET seen = TRUE WHERE id = ?";
    db.query(sql, [message_id], (err) => {
      if (!err) {
        const senderSocketId = onlineUsers.get(Number(sender_id));
        if (senderSocketId) {
          io.to(senderSocketId).emit("message_seen", { message_id });
        }
      }
    });
  });

  socket.on("typing", ({ receiver_id }) => {
    const receiverSocketId = onlineUsers.get(receiver_id);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", {
        sender_id: socket.user.id
      });
    }
  });

  socket.on("private_message", (data) => {
    const { receiver_id, message } = data;
    const sender_id = socket.user.id;

    if (!receiver_id || !message) return;

    const sql = "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)";
    db.query(sql, [sender_id, receiver_id, message], (err, result) => {
      if (err) {
        socket.emit("message_error", { message: "Failed to save message" });
        return;
      }

      const getSql = `
        SELECT messages.*, u1.username AS sender_name, u2.username AS receiver_name
        FROM messages
        JOIN users u1 ON messages.sender_id = u1.id
        JOIN users u2 ON messages.receiver_id = u2.id
        WHERE messages.id = ?
      `;

      db.query(getSql, [result.insertId], (err2, results) => {
        if (err2 || results.length === 0) return;

        const newMessage = results[0];
        const receiverSocketId = onlineUsers.get(Number(receiver_id));

        socket.emit("receive_message", newMessage);

        if (receiverSocketId) {
          io.to(receiverSocketId).emit("receive_message", newMessage);
        }
      });
    });
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    console.log(`User disconnected: ${socket.user.username}`);

    io.emit("user_status", {
      userId,
      status: "offline"
    });
  });
});

server.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
