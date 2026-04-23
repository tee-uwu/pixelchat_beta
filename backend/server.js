require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const db = require("./db");

const authRoutes = require("./routes/authRoutes");
const messageRoutes = require("./routes/messageRoutes");
const groupRoutes = require("./routes/groupRoutes");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

/* ---------------- MIDDLEWARE ---------------- */

app.use(cors({
  origin: ["http://localhost", "http://localhost/pixel-chat"],
  credentials: true
}));

app.use(express.json());

/* ---------------- ROUTES ---------------- */

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/groups", groupRoutes);

/* IMPORTANT: you were missing GET /api/messages */
app.get("/api/messages", (req, res) => {
  const sql = "SELECT * FROM messages ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

/* Seen message update */
app.put("/api/messages/seen/:id", (req, res) => {
  const sql = "UPDATE messages SET seen = TRUE WHERE id = ?";
  db.query(sql, [req.params.id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed" });
    }
    res.json({ message: "Seen updated" });
  });
});

app.get("/", (req, res) => {
  res.send("Chat server is running 🚀");
});

/* ---------------- SOCKET.IO ---------------- */

const io = new Server(server, {
  cors: {
    origin: ["http://localhost", "http://localhost/pixel-chat"],
    credentials: true
  }
});

const onlineUsers = new Map();

/* JWT AUTH FOR SOCKET */
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) return next(new Error("Authentication error"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

/* ---------------- CONNECTION ---------------- */

io.on("connection", (socket) => {
  const userId = socket.user.id;

  onlineUsers.set(userId, socket.id);

  console.log(`User connected: ${socket.user.username}`);

  socket.emit("online_users", Array.from(onlineUsers.keys()));

  io.emit("user_status", {
    userId,
    status: "online"
  });

  /* ---------------- PRIVATE MESSAGE ---------------- */

  socket.on("private_message", (data) => {
    const { receiver_id, message } = data;

    if (!receiver_id || !message) return;

    const sender_id = socket.user.id;

    const sql =
      "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)";

    db.query(sql, [sender_id, receiver_id, message], (err, result) => {
      if (err) {
        console.error(err);
        return socket.emit("message_error", { message: "DB error" });
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

        socket.emit("receive_message", newMessage);

        const receiverSocketId = onlineUsers.get(Number(receiver_id));

        if (receiverSocketId) {
          io.to(receiverSocketId).emit("receive_message", newMessage);
        }
      });
    });
  });

  /* ---------------- TYPING ---------------- */

  socket.on("typing", ({ receiver_id }) => {
    const receiverSocketId = onlineUsers.get(Number(receiver_id));

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", {
        sender_id: socket.user.id
      });
    }
  });

  /* ---------------- DELETE MESSAGE ---------------- */

  socket.on("delete_message", ({ id }) => {
    if (!id) return;

    const sql = "DELETE FROM messages WHERE id = ?";

    db.query(sql, [id], (err) => {
      if (err) return console.error(err);

      io.emit("message_deleted", { id });
    });
  });

  /* ---------------- EDIT MESSAGE ---------------- */

  socket.on("edit_message", ({ id, new_message }) => {
    if (!id || !new_message) return;

    const sql = "UPDATE messages SET message = ? WHERE id = ?";

    db.query(sql, [new_message, id], (err) => {
      if (err) return console.error(err);

      io.emit("message_edited", {
        id,
        message: new_message
      });
    });
  });

  /* ---------------- DISCONNECT ---------------- */

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);

    console.log(`User disconnected: ${socket.user.username}`);

    io.emit("user_status", {
      userId,
      status: "offline"
    });
  });
});

/* ---------------- START SERVER ---------------- */

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});