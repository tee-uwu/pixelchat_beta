require("dotenv").config();
const mysql = require("mysql2");

// TiDB requires SSL. Enable TLS with server cert verification.
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 4000,
  ssl: {
    rejectUnauthorized: true
  }
});

db.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:");
    console.error(err);
  } else {
    console.log("✅ MySQL connected successfully");
  }
});

module.exports = db;