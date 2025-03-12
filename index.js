const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cloudinary = require("cloudinary").v2;

const authRoutes = require("./routes/authRoutes");
const blogRoutes = require("./routes/blogRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const mongo_URI = process.env.MONGO_URI;
const origin = process.env.REQ_ORIGIN;

app.use(cors({ credentials: true, origin: origin }));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));

mongoose.connect(mongo_URI);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(authRoutes);
app.use(blogRoutes);
app.use(adminRoutes);

app.listen(4000);
