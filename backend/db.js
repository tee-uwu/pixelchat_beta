require("dotenv").config();
const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,

  ssl: false // ✅ important for localhost
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