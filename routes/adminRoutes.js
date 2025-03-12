const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Blog = require("../models/Blog");

const router = express.Router();
const secret = process.env.JWT_SECRET;

const isAdmin = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res
        .status(401)
        .json({ message: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!user.isAdmin) {
      return res
        .status(403)
        .json({ message: "Access denied. Admin rights required." });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

router.get("/admin/users", isAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete("/admin/blogs/:id", isAdmin, async (req, res) => {
  try {
    const deletedBlog = await Blog.findByIdAndDelete(req.params.id);
    if (!deletedBlog) {
      return res.status(404).json({ message: "Blog not found" });
    }
    res.json({ message: "Blog deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
