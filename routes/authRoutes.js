const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();
const salt = bcrypt.genSaltSync(parseInt(process.env.SALT_ROUNDS));
const secret = process.env.JWT_SECRET;

// Registration
router.post("/register", async (req, res) => {
  const { username, password, adminCode } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
      isAdmin: adminCode === process.env.ADMIN_CREATION_SECRET || false,
    });
    res.json(userDoc);
  } catch (e) {
    res.status(400).json(e);
  }
});

// Login route
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const userDoc = await User.findOne({ username });
  const passOk = bcrypt.compareSync(password, userDoc.password);

  if (passOk) {
    jwt.sign(
      { username, id: userDoc.id, isAdmin: userDoc.isAdmin },
      secret,
      {},
      (err, token) => {
        if (err) throw err;
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
          })
          .json({
            id: userDoc._id,
            username,
            isAdmin: userDoc.isAdmin,
          });
      }
    );
  } else {
    res.status(400).json("Wrong Credentials");
  }
});

// Get profile
router.get("/profile", (req, res) => {
  const { token } = req.cookies;

  if (!token) {
    return res
      .status(401)
      .json({ message: "No token provided, authentication required." });
  }

  jwt.verify(token, secret, {}, (err, info) => {
    if (err) throw err;
    res.json(info);
  });
});

// Logout
router.post("/logout", (req, res) => {
  res.cookie("token", "").json("deleted");
});

module.exports = router;
