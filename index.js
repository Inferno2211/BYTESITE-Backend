const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const Blog = require("./models/Blog");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const fs = require("fs");
const dotenv = require("dotenv");
const cloudinary = require("cloudinary").v2;

const app = express();
const salt = bcrypt.genSaltSync(10);
const secret = "wijiDSRS%y32hjh35b&%^&566#%7&h";
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

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const mongo_URI = process.env.MONGO_URI;
const origin = process.env.REQ_ORIGIN;

app.use(cors({ credentials: true, origin: origin }));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));

mongoose.connect(mongo_URI);

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

// Registration
app.post("/register", async (req, res) => {
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
app.post("/login", async (req, res) => {
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
app.get("/profile", (req, res) => {
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
app.post("/logout", (req, res) => {
  res.cookie("token", "").json("deleted");
});

// Create blog post
app.post("/create", uploadMiddlerware.single("file"), async (req, res) => {
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
app.get("/blogs", async (req, res) => {
  res.json(
    await Blog.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(18)
  );
});

// Get single blog
app.get("/blog/:id", async (req, res) => {
  const { id } = req.params;
  const blogDoc = await Blog.findById(id).populate("author", ["username"]);
  res.json(blogDoc);
});

// Update blog
app.put("/create", uploadMiddlerware.single("file"), async (req, res) => {
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

// Helper function to replace local image paths with Cloudinary URLs
async function replaceLocalImagesWithCloudinary(content) {
  const imgTagRegex = /<img src="([^"]+)"/g;
  let match;
  let updatedContent = content;

  while ((match = imgTagRegex.exec(content)) !== null) {
    const localPath = match[1];
    if (localPath.startsWith("data:image/")) {
      const uploadResult = await cloudinary.uploader.upload(localPath, {
        folder: "blog_images",
      });
      const cloudinaryUrl = uploadResult.secure_url;
      updatedContent = updatedContent.replace(localPath, cloudinaryUrl);
    }
  }

  return updatedContent;
}

app.get("/admin/users", isAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/admin/blogs/:id", isAdmin, async (req, res) => {
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

app.listen(4000);
