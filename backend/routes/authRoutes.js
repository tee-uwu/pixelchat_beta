const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// Allowed roles
const allowedRoles = ["user", "admin"];

// Helper: run queries with promises
const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

// Register
router.post("/register", async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Check duplicate email
    const existing = await queryAsync("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = allowedRoles.includes(role) ? role : "user";

    await queryAsync(
      "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, userRole]
    );

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const results = await queryAsync("SELECT * FROM users WHERE email = ?", [email]);
    if (results.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all users except current logged-in user
router.get("/users", verifyToken, async (req, res) => {
  try {
    const results = await queryAsync(
      "SELECT id, username, email, role FROM users WHERE id != ?",
      [req.user.id]
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: "Failed to get users", error: error.message });
  }
});

// Get current profile
router.get("/me", verifyToken, async (req, res) => {
  try {
    const results = await queryAsync(
      "SELECT id, username, email, role FROM users WHERE id = ?",
      [req.user.id]
    );
    if (results.length === 0) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json(results[0]);
  } catch (error) {
    res.status(500).json({ message: "Failed to get profile", error: error.message });
  }
});

// Update user role (Admin only)
router.put("/role/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { role } = req.body;

  if (!role || !allowedRoles.includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  try {
    await queryAsync("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id]);
    res.json({ message: "Role updated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update role", error: error.message });
  }
});

// Delete user (Admin only)
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    await queryAsync("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user", error: error.message });
  }
});

module.exports = router;
