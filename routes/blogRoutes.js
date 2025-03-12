const express = require("express");
const multer = require("multer");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const Blog = require("../models/Blog");
const User = require("../models/User");
const { replaceLocalImagesWithCloudinary } = require("../utils");

const router = express.Router();
const secret = process.env.JWT_SECRET;

const uploadMiddlerware = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type, only images are allowed."));
    }
  },
});

// Create blog post
router.post("/create", uploadMiddlerware.single("file"), async (req, res) => {
  const { originalname, path } = req.file;
  const { title, summary, content } = req.body;
  const { token } = req.cookies;

  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;

    // Upload cover image to Cloudinary
    const coverUploadResult = await cloudinary.uploader.upload(path, {
      folder: "blog_covers",
    });
    const coverUrl = coverUploadResult.secure_url;

    // Delete file from uploads folder
    fs.unlinkSync(path);

    // Replace local image paths in content with Cloudinary URLs
    const updatedContent = await replaceLocalImagesWithCloudinary(content);

    const blogDoc = await Blog.create({
      title,
      summary,
      content: updatedContent,
      cover: coverUrl,
      author: info.id,
    });
    res.json(blogDoc);
  });
});

// Get all blogs
router.get("/blogs", async (req, res) => {
  res.json(
    await Blog.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(18)
  );
});

// Get single blog
router.get("/blog/:id", async (req, res) => {
  const { id } = req.params;
  const blogDoc = await Blog.findById(id).populate("author", ["username"]);
  res.json(blogDoc);
});

// Update blog
router.put("/create", uploadMiddlerware.single("file"), async (req, res) => {
  let newCoverUrl = null;

  if (req.file) {
    const { path } = req.file;
    // Upload new cover image to Cloudinary
    const coverUploadResult = await cloudinary.uploader.upload(path, {
      folder: "blog_covers",
    });
    newCoverUrl = coverUploadResult.secure_url;

    // Delete file from uploads folder
    fs.unlinkSync(path);
  }

  const { token } = req.cookies;

  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;
    const { id, title, summary, content } = req.body;
    const blogDoc = await Blog.findById(id);
    const user = await User.findById(info.id);

    // Check if user is author OR admin
    const isAuthorOrAdmin =
      JSON.stringify(blogDoc.author) === JSON.stringify(info.id) ||
      user.isAdmin;

    if (!isAuthorOrAdmin) {
      return res.status(403).json("You are not authorized to edit this post");
    }

    // Replace local image paths in content with Cloudinary URLs
    const updatedContent = await replaceLocalImagesWithCloudinary(content);

    blogDoc.title = title;
    blogDoc.summary = summary;
    blogDoc.content = updatedContent;

    if (newCoverUrl) {
      blogDoc.cover = newCoverUrl;
    }

    const updatedBlogDoc = await blogDoc.save();

    res.json(updatedBlogDoc);
  });
});

module.exports = router;
